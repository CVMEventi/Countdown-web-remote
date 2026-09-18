import {describe, expect, it} from 'vitest'
import {defineComponent, h} from 'vue'
import {mount} from '@vue/test-utils'
import {useRtcTimerState} from '../useRtcTimerState.ts'
import type {RtcSession} from '../RtcSession.ts'

type Frame = {type: string, update: unknown}

function fakeSession() {
  const session = {
    state: 'idle' as string,
    iceCandidateType: null as string | null,
    welcome: null as {role: string, timeZone: string} | null,
    lastError: null as {code: string, message: string} | null,
    onState: (_state: string) => {},
    onFrame: (_frame: Frame) => {},
    onStats: () => {},
    retryNow: () => {},
  }
  return session as unknown as RtcSession & typeof session
}

// onUnmounted needs a component instance, so the composable is driven inside a real mount
function withState(session: ReturnType<typeof fakeSession>) {
  let state: ReturnType<typeof useRtcTimerState>
  const wrapper = mount(defineComponent({
    setup() {
      state = useRtcTimerState(session)
      return () => h('div')
    },
  }))
  return {state: state!, wrapper}
}

const timerSettings = (name: string) => ({
  name,
  timerDuration: 1000,
  setTimeLive: false,
  stopTimerAtZero: false,
  followTimer: '',
  audioFile: null as string | null,
  audioOutputDeviceId: null as string | null,
  windows: {},
})

const engineFrame = (timerId: string, overrides: Record<string, unknown> = {}) => ({
  type: 'timerEngine',
  update: {
    timerId,
    state: 'Running',
    setTime: 60,
    setTimeHms: '00:01:00',
    setTimeMs: '01:00',
    setTimeH: '00',
    setTimeM: '01',
    setTimeS: '00',
    currentTime: 30,
    timeSetOnCurrentTimer: 60,
    timerEndsAt: '12:34',
    ...overrides,
  },
})

const snapshot = {
  type: 'snapshot',
  update: {
    timers: {
      t1: timerSettings('Stage'),
      t2: timerSettings('Green room'),
    },
    timerEngine: {t1: engineFrame('t1').update, t2: engineFrame('t2', {state: 'Paused'}).update},
    messages: {t1: 'stand by', t2: null} as Record<string, string | null>,
    playingTimerIds: ['t2'],
  },
}

describe('useRtcTimerState', () => {
  it('exposes the same shape the desktop composable does', () => {
    const {state} = withState(fakeSession())

    for (const key of [
      'timers', 'updates', 'messages', 'currentTimerId',
      'connected', 'playingSounds', 'onAudio', 'onAudioStop',
    ]) {
      expect(state).toHaveProperty(key)
    }
  })

  describe('snapshot', () => {
    it('seeds every store at once', () => {
      const session = fakeSession()
      const {state} = withState(session)
      session.onFrame(snapshot)

      expect(Object.keys(state.timers.value)).toEqual(['t1', 't2'])
      expect(state.updates.t1.isRunning).toBe(true)
      expect(state.updates.t2.isRunning).toBe(false)
      expect(state.messages.t1).toBe('stand by')
      expect(state.playingSounds.value).toEqual(['t2'])
    })

    it('selects a current timer', () => {
      const session = fakeSession()
      const {state} = withState(session)
      session.onFrame(snapshot)
      expect(state.currentTimerId.value).toBe('t1')
    })
  })

  describe('incremental frames', () => {
    it('applies a timerEngine update', () => {
      const session = fakeSession()
      const {state} = withState(session)
      session.onFrame(engineFrame('t1', {currentTime: 12}))

      expect(state.updates.t1.countSeconds).toBe(12)
    })

    it('ignores a timerEngine frame with no timer id', () => {
      const session = fakeSession()
      const {state} = withState(session)
      session.onFrame({type: 'timerEngine', update: {...engineFrame('t1').update, timerId: undefined}})

      expect(Object.keys(state.updates)).toHaveLength(0)
    })

    it('replaces the timer list on config', () => {
      const session = fakeSession()
      const {state} = withState(session)
      session.onFrame(snapshot)
      session.onFrame({type: 'config', update: {t3: timerSettings('New')}})

      expect(Object.keys(state.timers.value)).toEqual(['t3'])
    })

    // A deleted timer must not leave the UI pointing at something gone
    it('reselects when the current timer disappears', () => {
      const session = fakeSession()
      const {state} = withState(session)
      session.onFrame(snapshot)
      expect(state.currentTimerId.value).toBe('t1')

      session.onFrame({type: 'config', update: {t2: timerSettings('Green room')}})
      expect(state.currentTimerId.value).toBe('t2')
    })

    it('records and clears a message', () => {
      const session = fakeSession()
      const {state} = withState(session)
      session.onFrame({type: 'message', update: {timerId: 't1', message: 'go'}})
      expect(state.messages.t1).toBe('go')

      session.onFrame({type: 'message', update: {timerId: 't1', message: ''}})
      expect(state.messages.t1).toBeNull()
    })

    it('tracks playing sounds', () => {
      const session = fakeSession()
      const {state} = withState(session)
      session.onFrame({type: 'audioState', update: {playingTimerIds: ['t1']}})
      expect(state.playingSounds.value).toEqual(['t1'])
    })

    it('fires audio listeners', () => {
      const session = fakeSession()
      const {state} = withState(session)
      const played: string[] = []
      const stopped: string[] = []
      state.onAudio(id => played.push(id))
      state.onAudioStop(id => stopped.push(id))

      session.onFrame({type: 'audio', update: {timerId: 't1'}})
      session.onFrame({type: 'audioStop', update: {timerId: 't1'}})

      expect(played).toEqual(['t1'])
      expect(stopped).toEqual(['t1'])
    })

    it('ignores a frame type it does not know', () => {
      const session = fakeSession()
      const {state} = withState(session)
      expect(() => session.onFrame({type: 'somethingNew', update: {}})).not.toThrow()
      expect(Object.keys(state.updates)).toHaveLength(0)
    })
  })

  describe('connection', () => {
    it('is only connected in the connected state', () => {
      const session = fakeSession()
      const {state} = withState(session)

      session.state = 'connecting'
      session.onState('connecting')
      expect(state.connected.value).toBe(false)

      session.state = 'connected'
      session.onState('connected')
      expect(state.connected.value).toBe(true)
    })

    it('picks up the role and timezone from welcome', () => {
      const session = fakeSession()
      const {state} = withState(session)

      session.welcome = {role: 'view', timeZone: 'Europe/Rome'} as never
      session.onState('connected')

      expect(state.role.value).toBe('view')
      expect(state.timeZone.value).toBe('Europe/Rome')
    })

    it('defaults to the view role until told otherwise', () => {
      const {state} = withState(fakeSession())
      expect(state.role.value).toBe('view')
    })
  })
})
