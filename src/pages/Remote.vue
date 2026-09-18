<template>
  <div class="min-h-screen bg-zinc-900 text-white p-4">
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2 text-sm">
        <span class="w-2 h-2 rounded-full" :class="dotClass"></span>
        <span :class="state.connectionState.value === 'connected' ? 'text-zinc-400' : 'text-amber-300'">
          {{ statusText }}
        </span>
        <span v-if="linkKind" class="text-xs text-zinc-500">{{ linkKind }}</span>
        <span v-if="state.role.value === 'view'" class="text-xs uppercase text-zinc-400">View only</span>
        <div class="flex-1"></div>
        <SButton tiny type="info" @click="leave">Change code</SButton>
      </div>

      <p v-if="showError" class="text-sm text-red-300">{{ state.lastError.value?.message }}</p>

      <SButton v-if="state.connectionState.value === 'failed'" class="uppercase self-start" @click="retry">
        Retry
      </SButton>

      <ControlPanel
        v-if="state.connected.value"
        showNav
        :timers="state.timers.value"
        :updates="state.updates"
        v-model:currentTimerId="state.currentTimerId.value"
        :controller="controller"
        :read-only="state.role.value === 'view'"
        :playing-sounds="state.playingSounds.value"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, onUnmounted} from 'vue'
import {useRouter} from 'vue-router'
import ControlPanel from '../components/ControlPanel.vue'
import SButton from '../components/SButton.vue'
import {RtcSession} from '../rtc/RtcSession.ts'
import {RtcTimerController} from '../rtc/RtcTimerController.ts'
import {useRtcTimerState} from '../rtc/useRtcTimerState.ts'
import {parsePairingCode} from '../protocol/protocol.ts'
import {forgetCode, rememberCode} from '../rtc/rememberedCode.ts'

const props = defineProps<{code: string}>()

const router = useRouter()
const session = new RtcSession()
const controller = new RtcTimerController(session)
const state = useRtcTimerState(session)

const statusText = computed(() => {
  switch (state.connectionState.value) {
    case 'signaling': return 'Contacting signaling server…'
    case 'connecting': return 'Connecting directly to the app… this can take a few seconds'
    case 'connected': return 'Connected'
    case 'reconnecting': return 'Reconnecting…'
    case 'failed': return 'Not connected'
    default: return 'Idle'
  }
})

const dotClass = computed(() => {
  switch (state.connectionState.value) {
    case 'connected': return 'bg-emerald-400'
    case 'failed': return 'bg-red-400'
    default: return 'bg-amber-400'
  }
})

// Someone paying for a TURN relay wants to know whether they actually got a direct link
const linkKind = computed(() => {
  if (state.connectionState.value !== 'connected') return ''
  if (state.iceCandidateType.value === 'relay') return 'Relayed'
  if (state.iceCandidateType.value) return 'Direct'
  return ''
})

const showError = computed(() =>
  !!state.lastError.value && state.connectionState.value !== 'connected'
)

onMounted(() => {
  const pairing = parsePairingCode(props.code)
  if (!pairing) {
    router.replace('/')
    return
  }
  rememberCode(pairing)
  session.connect(pairing)
})

onUnmounted(() => session.disconnect())

function retry() {
  session.retryNow()
}

function leave() {
  forgetCode()
  session.disconnect()
  router.push('/')
}
</script>
