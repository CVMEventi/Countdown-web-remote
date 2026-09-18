import Peer, {DataConnection} from 'peerjs'
import {
  PROTOCOL_VERSION,
  isRtcFrame,
  roomCodeToPeerId,
} from '../protocol/protocol.ts'
import type {PairingCode, RtcCommand, RtcErrorUpdate, WelcomeUpdate} from '../protocol/protocol.ts'

export type ConnectionState =
  | 'idle'
  | 'signaling'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

export type IceCandidateType = 'host' | 'srflx' | 'relay' | null

export interface RtcSessionOptions {
  iceServers?: RTCIceServer[]
  clientName?: string
}

const ICE_DEADLINE_MS = 20000
const ACK_TIMEOUT_MS = 3000
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000]
const MAX_ATTEMPTS = 20

const DEFAULT_ICE: RTCIceServer[] = [
  {urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478']},
]

export class RtcSession {
  state: ConnectionState = 'idle'
  iceCandidateType: IceCandidateType = null
  welcome: WelcomeUpdate | null = null
  lastError: RtcErrorUpdate | null = null
  rttMs: number | null = null

  onState: (state: ConnectionState) => void = () => {}
  onFrame: (frame: {type: string, update: unknown}) => void = () => {}
  onStats: () => void = () => {}

  private _pairing: PairingCode | null = null
  private _options: RtcSessionOptions
  private _peer: Peer | null = null
  private _connection: DataConnection | null = null
  private _attempt = 0
  private _retryTimer: ReturnType<typeof setTimeout> | null = null
  private _iceTimer: ReturnType<typeof setTimeout> | null = null
  private _pendingAcks = new Map<string, {resolve: () => void, reject: (error: Error) => void, timer: ReturnType<typeof setTimeout>}>()
  private _clientId: string
  private _closedByUs = false

  constructor(options: RtcSessionOptions = {}) {
    this._options = options
    this._clientId = readOrCreateClientId()
  }

  get clientId() {
    return this._clientId
  }

  connect(pairing: PairingCode) {
    this._pairing = pairing
    this._attempt = 0
    this._closedByUs = false
    this._open()
  }

  disconnect() {
    this._closedByUs = true
    this._clearTimers()
    this._connection?.close()
    this._peer?.destroy()
    this._connection = null
    this._peer = null
    this._setState('idle')
  }

  // Non-command frames the client originates, such as asking for a timer's audio
  sendFrame(frame: {type: string, update: unknown}) {
    if (!this._connection?.open) return
    this._connection.send(frame)
  }

  async command(command: RtcCommand, options: {awaitAck?: boolean} = {}): Promise<void> {
    if (!this._connection?.open) throw new Error('Not connected')

    if (!options.awaitAck) {
      this._connection.send({type: 'command', update: command})
      return
    }

    const id = crypto.randomUUID()
    this._connection.send({type: 'command', update: {...command, id}})

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingAcks.delete(id)
        reject(new Error('Timed out'))
      }, ACK_TIMEOUT_MS)
      this._pendingAcks.set(id, {resolve, reject, timer})
    })
  }

  private _open() {
    if (!this._pairing) return

    this._clearTimers()
    this._peer?.destroy()
    this._setState(this._attempt === 0 ? 'signaling' : 'reconnecting')

    this._peer = new Peer({
      config: {iceServers: this._options.iceServers ?? DEFAULT_ICE},
    })

    this._peer.on('open', () => this._dial())
    this._peer.on('error', error => this._onPeerError(error as Error & {type?: string}))
  }

  private _dial() {
    if (!this._peer || !this._pairing) return

    this._setState('connecting')

    const connection = this._peer.connect(roomCodeToPeerId(this._pairing.sessionId), {reliable: true})
    this._connection = connection

    // Without a deadline a hopeless ICE attempt just spins on "connecting" forever
    this._iceTimer = setTimeout(() => {
      if (this.state !== 'connected') {
        this.lastError = {code: 'invalid-command', message: 'Could not establish a direct connection. This network may need a TURN relay.'}
        this._fail()
      }
    }, ICE_DEADLINE_MS)

    connection.on('open', () => {
      connection.send({
        type: 'hello',
        update: {
          protocolVersion: PROTOCOL_VERSION,
          clientId: this._clientId,
          key: this._pairing!.key,
          clientName: this._options.clientName ?? deviceName(),
        },
      })
    })

    connection.on('data', data => this._onData(data))
    connection.on('close', () => this._onClose())
    connection.on('error', () => this._onClose())
  }

  private _onData(data: unknown) {
    if (!isRtcFrame(data)) return

    if (data.type === 'welcome') {
      this.welcome = data.update as WelcomeUpdate
      this._attempt = 0
      if (this._iceTimer) clearTimeout(this._iceTimer)
      this._iceTimer = null
      this._setState('connected')
      void this._readCandidateType()
      return
    }

    if (data.type === 'ping') {
      this._connection?.send({type: 'pong', update: data.update})
      return
    }

    if (data.type === 'ack') {
      const ack = data.update as {id: string, ok: boolean, error?: string}
      const pending = this._pendingAcks.get(ack.id)
      if (pending) {
        clearTimeout(pending.timer)
        this._pendingAcks.delete(ack.id)
        ack.ok ? pending.resolve() : pending.reject(new Error(ack.error ?? 'Rejected'))
      }
      return
    }

    if (data.type === 'error') {
      this.lastError = data.update as RtcErrorUpdate
      // These are refusals, not glitches: retrying with the same code cannot help
      if (['unauthorised', 'revoked', 'unsupported-version'].includes(this.lastError.code)) {
        this._closedByUs = true
        this._fail()
        return
      }
    }

    this.onFrame(data as {type: string, update: unknown})
  }

  private _onPeerError(error: Error & {type?: string}) {
    this.lastError = {
      code: error.type === 'peer-unavailable' ? 'unauthorised' : 'invalid-command',
      message: error.type === 'peer-unavailable'
        ? 'No app is listening on that code. Check the code, and that Countdown is running with the web remote enabled.'
        : error.message,
    }

    if (error.type === 'peer-unavailable') {
      this._scheduleRetry()
      return
    }
    this._fail()
  }

  private _onClose() {
    this._connection = null
    if (this._closedByUs) return
    this._scheduleRetry()
  }

  private _scheduleRetry() {
    this._clearTimers()

    if (this._attempt >= MAX_ATTEMPTS) {
      this._fail()
      return
    }

    const base = BACKOFF_MS[Math.min(this._attempt, BACKOFF_MS.length - 1)]
    const jitter = Math.random() * base * 0.3
    this._attempt += 1
    this._setState('reconnecting')
    this._retryTimer = setTimeout(() => this._open(), base + jitter)
  }

  // A tab that was backgrounded for a while should come back immediately, not wait out a backoff
  retryNow() {
    if (this.state === 'connected' || this._closedByUs) return
    this._attempt = 0
    this._open()
  }

  private async _readCandidateType() {
    const pc = (this._connection as unknown as {peerConnection?: RTCPeerConnection})?.peerConnection
    if (!pc) return

    try {
      const stats = await pc.getStats()
      let pairId: string | null = null
      stats.forEach(report => {
        if (report.type === 'transport' && report.selectedCandidatePairId) pairId = report.selectedCandidatePairId
      })

      stats.forEach(report => {
        const selected = report.type === 'candidate-pair'
          && (report.id === pairId || (report.selected && !pairId))
        if (!selected) return
        const local = stats.get(report.localCandidateId)
        if (local?.candidateType) this.iceCandidateType = local.candidateType as IceCandidateType
      })
      this.onStats()
    } catch {
      // Stats are a diagnostic nicety; a browser that refuses them must not break the session
    }
  }

  private _fail() {
    this._clearTimers()
    this._connection?.close()
    this._peer?.destroy()
    this._connection = null
    this._peer = null
    this._setState('failed')
  }

  private _clearTimers() {
    if (this._retryTimer) clearTimeout(this._retryTimer)
    if (this._iceTimer) clearTimeout(this._iceTimer)
    this._retryTimer = null
    this._iceTimer = null
  }

  private _setState(state: ConnectionState) {
    this.state = state
    this.onState(state)
  }
}

function deviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'Browser'
}

// A stable id lets the desktop recognise and revoke this device across reconnects
function readOrCreateClientId(): string {
  try {
    const existing = localStorage.getItem('countdown.clientId')
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem('countdown.clientId', created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}
