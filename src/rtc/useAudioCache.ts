import {onUnmounted, ref} from 'vue'
import type {AudioChunkUpdate, AudioMetaUpdate, AudioUnavailableUpdate} from '../protocol/protocol.ts'

interface Incoming {
  revision: string
  mimeType: string
  totalChunks: number
  chunks: string[]
  received: number
}

interface Cached {
  revision: string
  url: string
}

// Audio is fetched when a client connects, never when the cue fires: a cue has to be instant, and
// pulling a few megabytes over the data channel is not.
export function useAudioCache(send: (frame: {type: string, update: unknown}) => void) {
  const ready = ref<Record<string, boolean>>({})

  const cache = new Map<string, Cached>()
  const incoming = new Map<string, Incoming>()

  function urlFor(timerId: string): string | null {
    return cache.get(timerId)?.url ?? null
  }

  function request(timerId: string) {
    send({type: 'audioRequest', update: {timerId, haveRevision: cache.get(timerId)?.revision ?? null}})
  }

  function requestAll(timerIds: string[]) {
    timerIds.forEach(request)
  }

  function onMeta(update: AudioMetaUpdate) {
    incoming.set(update.timerId, {
      revision: update.revision,
      mimeType: update.mimeType,
      totalChunks: update.totalChunks,
      chunks: new Array(update.totalChunks).fill(''),
      received: 0,
    })
  }

  function onChunk(update: AudioChunkUpdate) {
    const pending = incoming.get(update.timerId)
    // A chunk from a superseded transfer would corrupt the file being assembled
    if (!pending || pending.revision !== update.revision) return
    if (pending.chunks[update.seq]) return

    pending.chunks[update.seq] = update.data
    pending.received += 1
    if (pending.received < pending.totalChunks) return

    incoming.delete(update.timerId)
    store(update.timerId, pending)
  }

  function onUnavailable(update: AudioUnavailableUpdate) {
    incoming.delete(update.timerId)
    if (update.reason === 'unchanged') return
    revoke(update.timerId)
    ready.value = {...ready.value, [update.timerId]: false}
  }

  function store(timerId: string, pending: Incoming) {
    try {
      const binary = atob(pending.chunks.join(''))
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      revoke(timerId)
      const url = URL.createObjectURL(new Blob([bytes], {type: pending.mimeType}))
      cache.set(timerId, {revision: pending.revision, url})
      ready.value = {...ready.value, [timerId]: true}
    } catch {
      ready.value = {...ready.value, [timerId]: false}
    }
  }

  function revoke(timerId: string) {
    const existing = cache.get(timerId)
    if (!existing) return
    URL.revokeObjectURL(existing.url)
    cache.delete(timerId)
  }

  function clear() {
    cache.forEach(entry => URL.revokeObjectURL(entry.url))
    cache.clear()
    incoming.clear()
    ready.value = {}
  }

  onUnmounted(clear)

  return {ready, urlFor, request, requestAll, onMeta, onChunk, onUnavailable, clear}
}
