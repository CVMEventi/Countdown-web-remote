import {computed, onUnmounted, reactive, ref} from 'vue'
import {mapUpdate} from '../protocol/mapUpdate.ts'
import type {
  AudioStateWebSocketUpdate,
  AudioWebSocketUpdate,
  ConfigWebSocketUpdate,
  MessageWebSocketUpdate,
  TimerEngineUpdate,
  TimerEngineUpdates,
  TimerEngineWebSocketUpdate,
  TimerSnapshot,
} from '../protocol/TimerInterfaces.ts'
import type {Timers} from '../protocol/config.ts'
import type {RtcSession} from './RtcSession.ts'
import {useAudioCache} from './useAudioCache.ts'
import type {AudioChunkUpdate, AudioMetaUpdate, AudioUnavailableUpdate} from '../protocol/protocol.ts'

export interface Messages {
  [key: string]: string | null
}

// Returns the same shape as the desktop app's useWebSocketTimerState so ControlPanel is unchanged
export function useRtcTimerState(session: RtcSession) {
  const timers = ref<Timers>({})
  const updates = reactive<TimerEngineUpdates>({})
  const messages = reactive<Messages>({})
  const currentTimerId = ref<string | null>(null)
  const playingSounds = ref<string[]>([])

  const connectionState = ref(session.state)
  const iceCandidateType = ref(session.iceCandidateType)
  const lastError = ref(session.lastError)
  const timeZone = ref<string | null>(null)
  const role = ref<'control' | 'view'>('view')

  const connected = computed(() => connectionState.value === 'connected')

  const audio = useAudioCache(frame => session.sendFrame(frame))

  // Prefetch for every timer that has audio, so a cue can play from cache the instant it fires
  function prefetchAudio(current: Timers) {
    audio.requestAll(Object.entries(current)
      .filter(([, timer]) => !!timer.audioFile)
      .map(([timerId]) => timerId))
  }

  const audioListeners: ((timerId: string) => void)[] = []
  const audioStopListeners: ((timerId: string) => void)[] = []

  function onAudio(listener: (timerId: string) => void) {
    audioListeners.push(listener)
  }

  function onAudioStop(listener: (timerId: string) => void) {
    audioStopListeners.push(listener)
  }

  function selectTimer(newTimers: Timers) {
    const ids = Object.keys(newTimers)
    if (currentTimerId.value && ids.includes(currentTimerId.value)) return
    currentTimerId.value = ids[0] ?? null
  }

  session.onState = (state) => {
    connectionState.value = state
    lastError.value = session.lastError
    if (session.welcome) {
      role.value = session.welcome.role
      timeZone.value = session.welcome.timeZone
    }
  }

  session.onStats = () => {
    iceCandidateType.value = session.iceCandidateType
  }

  session.onFrame = (frame) => {
    if (frame.type === 'snapshot') {
      const update = frame.update as TimerSnapshot
      timers.value = update.timers
      Object.entries(update.timerEngine).forEach(([timerId, engineUpdate]) => {
        updates[timerId] = mapUpdate(engineUpdate)
      })
      Object.entries(update.messages).forEach(([timerId, message]) => {
        messages[timerId] = message
      })
      playingSounds.value = update.playingTimerIds
      selectTimer(timers.value)
      prefetchAudio(timers.value)
      return
    }

    if (frame.type === 'timerEngine') {
      const update = frame.update as TimerEngineWebSocketUpdate
      if (update.timerId) updates[update.timerId] = mapUpdate(update)
      return
    }

    if (frame.type === 'config') {
      timers.value = frame.update as ConfigWebSocketUpdate
      selectTimer(timers.value)
      // The audio file may have been swapped; the host replies "unchanged" when it has not
      prefetchAudio(timers.value)
      return
    }

    if (frame.type === 'message') {
      const update = frame.update as MessageWebSocketUpdate
      if (update.timerId) messages[update.timerId] = update.message || null
      return
    }

    if (frame.type === 'audio') {
      audioListeners.forEach(listener => listener((frame.update as AudioWebSocketUpdate).timerId))
      return
    }

    if (frame.type === 'audioStop') {
      audioStopListeners.forEach(listener => listener((frame.update as AudioWebSocketUpdate).timerId))
      return
    }

    if (frame.type === 'audioState') {
      playingSounds.value = (frame.update as AudioStateWebSocketUpdate).playingTimerIds
      return
    }

    if (frame.type === 'audioMeta') {
      audio.onMeta(frame.update as AudioMetaUpdate)
      return
    }

    if (frame.type === 'audioChunk') {
      audio.onChunk(frame.update as AudioChunkUpdate)
      return
    }

    if (frame.type === 'audioUnavailable') {
      audio.onUnavailable(frame.update as AudioUnavailableUpdate)
    }
  }

  const retryNow = () => session.retryNow()
  const onVisible = () => { if (document.visibilityState === 'visible') retryNow() }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', retryNow)

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', retryNow)
  })

  return {
    timers,
    updates,
    messages,
    currentTimerId,
    connected,
    playingSounds,
    onAudio,
    onAudioStop,
    connectionState,
    iceCandidateType,
    lastError,
    timeZone,
    role,
    audioUrlFor: audio.urlFor,
    audioReady: audio.ready,
  }
}

export type RtcTimerState = ReturnType<typeof useRtcTimerState>
export type {TimerEngineUpdate}
