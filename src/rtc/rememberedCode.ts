import {parsePairingCode} from '../protocol/protocol.ts'
import type {PairingCode} from '../protocol/protocol.ts'

const KEY = 'countdown.pairingCode'

export function loadRememberedCode(): PairingCode | null {
  try {
    const stored = localStorage.getItem(KEY)
    return stored ? parsePairingCode(stored) : null
  } catch {
    return null
  }
}

export function rememberCode(pairing: PairingCode) {
  try {
    localStorage.setItem(KEY, `${pairing.sessionId}.${pairing.key}`)
  } catch {
    // Private browsing and blocked site data are both fine; the code just is not remembered
  }
}

export function forgetCode() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to do if storage is unavailable
  }
}
