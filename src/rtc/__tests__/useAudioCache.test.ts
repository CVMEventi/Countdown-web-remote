import {beforeEach, describe, expect, it, vi} from 'vitest'
import {defineComponent, h} from 'vue'
import {mount} from '@vue/test-utils'
import {useAudioCache} from '../useAudioCache.ts'
import {AUDIO_CHUNK_BYTES} from '../../protocol/protocol.ts'

function withCache() {
  const send = vi.fn()
  let cache: ReturnType<typeof useAudioCache>
  const wrapper = mount(defineComponent({
    setup() {
      cache = useAudioCache(send)
      return () => h('div')
    },
  }))
  return {cache: cache!, send, wrapper}
}

// happy-dom has no object URL support, so stand one in that we can assert on
let created: string[] = []
let revoked: string[] = []

beforeEach(() => {
  created = []
  revoked = []
  let counter = 0
  globalThis.URL.createObjectURL = vi.fn(() => {
    const url = `blob:fake-${counter++}`
    created.push(url)
    return url
  })
  globalThis.URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  })
})

function deliver(cache: ReturnType<typeof useAudioCache>, timerId: string, base64: string, revision = 'r1') {
  const chunks: string[] = []
  for (let i = 0; i < base64.length; i += AUDIO_CHUNK_BYTES) {
    chunks.push(base64.slice(i, i + AUDIO_CHUNK_BYTES))
  }
  cache.onMeta({timerId, revision, mimeType: 'audio/mpeg', size: 10, totalChunks: chunks.length})
  chunks.forEach((data, seq) => cache.onChunk({timerId, revision, seq, data}))
  return chunks
}

describe('useAudioCache', () => {
  describe('requesting', () => {
    it('asks for audio with no revision the first time', () => {
      const {cache, send} = withCache()
      cache.request('t1')
      expect(send).toHaveBeenCalledWith({type: 'audioRequest', update: {timerId: 't1', haveRevision: null}})
    })

    it('asks for every timer given', () => {
      const {cache, send} = withCache()
      cache.requestAll(['t1', 't2'])
      expect(send).toHaveBeenCalledTimes(2)
    })

    // The host answers "unchanged" and sends no bytes, which is the point of the revision
    it('sends the cached revision on a later request', () => {
      const {cache, send} = withCache()
      deliver(cache, 't1', btoa('hello'), 'rev-9')
      send.mockClear()

      cache.request('t1')
      expect(send).toHaveBeenCalledWith({type: 'audioRequest', update: {timerId: 't1', haveRevision: 'rev-9'}})
    })
  })

  describe('reassembly', () => {
    it('has nothing before anything arrives', () => {
      const {cache} = withCache()
      expect(cache.urlFor('t1')).toBeNull()
    })

    it('produces a url once every chunk has arrived', () => {
      const {cache} = withCache()
      deliver(cache, 't1', btoa('hello world'))

      expect(cache.urlFor('t1')).toBe(created[0])
      expect(cache.ready.value.t1).toBe(true)
    })

    it('stays empty until the last chunk', () => {
      const {cache} = withCache()
      const big = btoa('x'.repeat(AUDIO_CHUNK_BYTES * 2))
      cache.onMeta({timerId: 't1', revision: 'r1', mimeType: 'audio/mpeg', size: 1, totalChunks: 3})
      cache.onChunk({timerId: 't1', revision: 'r1', seq: 0, data: big.slice(0, AUDIO_CHUNK_BYTES)})

      expect(cache.urlFor('t1')).toBeNull()
    })

    it('reassembles a multi-chunk file', () => {
      const {cache} = withCache()
      const payload = btoa('y'.repeat(AUDIO_CHUNK_BYTES * 2))
      const chunks = deliver(cache, 't1', payload)

      expect(chunks.length).toBeGreaterThan(1)
      expect(cache.urlFor('t1')).toBe(created[0])
    })

    it('ignores a duplicate chunk', () => {
      const {cache} = withCache()
      cache.onMeta({timerId: 't1', revision: 'r1', mimeType: 'audio/mpeg', size: 1, totalChunks: 2})
      cache.onChunk({timerId: 't1', revision: 'r1', seq: 0, data: 'aGVs'})
      cache.onChunk({timerId: 't1', revision: 'r1', seq: 0, data: 'aGVs'})

      expect(cache.urlFor('t1')).toBeNull()
    })

    // A chunk from a superseded transfer would corrupt the file being assembled
    it('discards a chunk from a stale revision', () => {
      const {cache} = withCache()
      cache.onMeta({timerId: 't1', revision: 'r2', mimeType: 'audio/mpeg', size: 1, totalChunks: 1})
      cache.onChunk({timerId: 't1', revision: 'r1', seq: 0, data: btoa('old')})

      expect(cache.urlFor('t1')).toBeNull()
    })

    it('ignores a chunk with no meta before it', () => {
      const {cache} = withCache()
      expect(() => cache.onChunk({timerId: 't1', revision: 'r1', seq: 0, data: btoa('x')})).not.toThrow()
      expect(cache.urlFor('t1')).toBeNull()
    })

    it('keeps timers apart', () => {
      const {cache} = withCache()
      deliver(cache, 't1', btoa('one'))
      deliver(cache, 't2', btoa('two'))

      expect(cache.urlFor('t1')).not.toBe(cache.urlFor('t2'))
    })
  })

  describe('replacement', () => {
    it('revokes the old url when the file changes', () => {
      const {cache} = withCache()
      deliver(cache, 't1', btoa('first'), 'r1')
      const first = cache.urlFor('t1')

      deliver(cache, 't1', btoa('second'), 'r2')

      expect(revoked).toContain(first)
      expect(cache.urlFor('t1')).not.toBe(first)
    })

    it('keeps what it has when the host says unchanged', () => {
      const {cache} = withCache()
      deliver(cache, 't1', btoa('same'), 'r1')
      const url = cache.urlFor('t1')

      cache.onUnavailable({timerId: 't1', reason: 'unchanged'})

      expect(cache.urlFor('t1')).toBe(url)
      expect(revoked).not.toContain(url)
    })

    it('drops what it has when the audio is gone', () => {
      const {cache} = withCache()
      deliver(cache, 't1', btoa('gone'), 'r1')
      const url = cache.urlFor('t1')

      cache.onUnavailable({timerId: 't1', reason: 'none'})

      expect(cache.urlFor('t1')).toBeNull()
      expect(revoked).toContain(url)
      expect(cache.ready.value.t1).toBe(false)
    })

    it('releases every url on clear', () => {
      const {cache} = withCache()
      deliver(cache, 't1', btoa('a'), 'r1')
      deliver(cache, 't2', btoa('b'), 'r1')

      cache.clear()

      expect(revoked).toHaveLength(2)
      expect(cache.urlFor('t1')).toBeNull()
    })
  })
})
