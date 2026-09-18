<template>
  <div class="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-4">
    <div class="w-full max-w-sm flex flex-col gap-4">
      <h1 class="text-2xl">Countdown remote</h1>

      <p class="text-sm text-zinc-400">
        Enter the code shown in the Countdown app under Settings → Remote.
      </p>

      <input
        ref="input"
        v-model="typed"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        placeholder="XKTP-9QM2.4FHB-2WRD"
        class="input w-full text-center font-mono tracking-widest"
        @keyup.enter="go"
      />

      <p v-if="error" class="text-sm text-red-300">{{ error }}</p>

      <SButton :disabled="!parsed" class="uppercase" @click="go">Connect</SButton>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {computed, onMounted, ref, useTemplateRef} from 'vue'
import {useRouter} from 'vue-router'
import SButton from '../components/SButton.vue'
import {formatPairingCode, parsePairingCode} from '../protocol/protocol.ts'
import {loadRememberedCode} from '../rtc/rememberedCode.ts'

const router = useRouter()
const typed = ref('')
const error = ref('')
const input = useTemplateRef<HTMLInputElement>('input')

const parsed = computed(() => parsePairingCode(typed.value))

onMounted(() => {
  const remembered = loadRememberedCode()
  if (remembered) typed.value = formatPairingCode(remembered)
  input.value?.focus()
})

function go() {
  const pairing = parsed.value
  if (!pairing) {
    error.value = 'That code does not look right. It should be two groups separated by a dot.'
    return
  }
  router.push(`/r/${pairing.sessionId}.${pairing.key}`)
}
</script>
