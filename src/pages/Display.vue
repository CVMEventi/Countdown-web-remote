<template>
  <div class="w-screen h-screen">
    <CountdownDisplay
      v-if="state.connected.value && resolvedTimerId"
      :update="resolvedUpdate"
      :settings="windowSettings"
      :timer-duration="timerDuration"
      :message="message"
    />
    <div v-else class="flex flex-col gap-3 items-center justify-center h-full bg-black text-white">
      <p class="text-xl">{{ statusText }}</p>
      <p v-if="state.lastError.value" class="text-sm text-red-300 max-w-sm text-center px-4">
        {{ state.lastError.value.message }}
      </p>
    </div>

    <!-- Any click unlocks sound, see unlockSound -->
    <button
      v-if="showSoundPrompt"
      class="fixed bottom-3 right-3 rounded-full bg-black/60 px-3 py-1.5 text-sm text-white"
    >
      Click to enable sound
    </button>
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, onUnmounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import CountdownDisplay from '../components/CountdownDisplay.vue'
import {RtcSession} from '../rtc/RtcSession.ts'
import {useRtcTimerState} from '../rtc/useRtcTimerState.ts'
import {parsePairingCode} from '../protocol/protocol.ts'
import {rememberCode} from '../rtc/rememberedCode.ts'
import {DEFAULT_TIMER_SETTINGS, DEFAULT_WINDOW_SETTINGS} from '../protocol/config.ts'
import type {TimerSettings} from '../protocol/config.ts'
import type {TimerEngineUpdate} from '../protocol/TimerInterfaces.ts'

const props = defineProps<{code: string, timerId?: string, windowId?: string}>()

const router = useRouter()
const session = new RtcSession()
const state = useRtcTimerState(session)

// Browsers block audio until the page is interacted with, and Safari only allows later playback
// on an element unlocked by that same click, so one element is reused
const sound = new Audio()
const soundUnlocked = ref(false)

const resolvedTimerId = computed(() => props.timerId || Object.keys(state.timers.value)[0] || '')

const statusText = computed(() => {
  switch (state.connectionState.value) {
    case 'connected': return 'Waiting for a timer…'
    case 'connecting': return 'Connecting…'
    case 'reconnecting': return 'Reconnecting…'
    case 'failed': return 'Not connected'
    default: return 'Contacting signaling server…'
  }
})

async function unlockSound() {
  soundUnlocked.value = true
  const url = state.audioUrlFor(resolvedTimerId.value)
  if (!url) return
  sound.muted = true
  sound.src = url
  try {
    await sound.play()
  } catch {
    // Autoplay refused; the click handler will have unlocked it for the real cue anyway
  }
  sound.pause()
  sound.muted = false
}

onMounted(() => {
  const pairing = parsePairingCode(props.code)
  if (!pairing) {
    router.replace('/')
    return
  }
  rememberCode(pairing)
  session.connect(pairing)

  // Some embedders (OBS browser sources) allow autoplay, so no click is needed
  const context = new AudioContext()
  soundUnlocked.value = context.state === 'running'
  context.close()
  document.addEventListener('pointerdown', unlockSound, {once: true})
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', unlockSound)
  sound.pause()
  session.disconnect()
})

state.onAudio((timerId) => {
  if (timerId !== resolvedTimerId.value) return
  // Already in memory from the prefetch, so the cue is immediate
  const url = state.audioUrlFor(timerId)
  if (!url) return
  sound.src = url
  sound.play().catch(() => {})
})

state.onAudioStop((timerId) => {
  if (timerId !== resolvedTimerId.value) return
  sound.pause()
})

const defaultUpdate: TimerEngineUpdate = {
  setSeconds: 0,
  countSeconds: 0,
  currentSeconds: 0,
  extraSeconds: 0,
  secondsSetOnCurrentTimer: 0,
  isCountingUp: false,
  isExpiring: false,
  isReset: true,
  isRunning: false,
  timerEndsAt: null,
}

const currentTimerSettings = computed<TimerSettings>(() =>
  state.timers.value[resolvedTimerId.value] ?? DEFAULT_TIMER_SETTINGS
)

const windowSettings = computed(() => {
  const windows = currentTimerSettings.value.windows ?? {}
  const resolvedWindowId = props.windowId || Object.keys(windows)[0]
  return resolvedWindowId ? (windows[resolvedWindowId] ?? DEFAULT_WINDOW_SETTINGS) : DEFAULT_WINDOW_SETTINGS
})

const showSoundPrompt = computed(() => !soundUnlocked.value && !!currentTimerSettings.value.audioFile)

const timerDuration = computed(() => currentTimerSettings.value.timerDuration ?? 1000)

// Messages belong to the window's own timer, even while it displays a followed one
const message = computed(() => state.messages[resolvedTimerId.value] ?? null)

const resolvedUpdate = computed<TimerEngineUpdate>(() => {
  const update = state.updates[resolvedTimerId.value]
  const followTimer = currentTimerSettings.value.followTimer
  if (update && (!update.isReset || followTimer === null)) return update
  if ((update?.isReset ?? true) && followTimer) return state.updates[followTimer] ?? defaultUpdate
  return defaultUpdate
})
</script>
