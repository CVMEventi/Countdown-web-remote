// The wire subset of the desktop app's config: the types and helpers a remote client needs,
// without the settings that never cross the wire and without the ulid/electron-store imports.
// Types and getActiveThreshold are copied verbatim from src/common/config.ts in the app repo.

export enum ContentAtReset {
  Empty = "EMPTY",
  Time = "TIME",
  Full = "FULL",
}

export interface ColorThreshold {
  id: string
  type: 'minutes' | 'percent'
  value: number
  background: string
  text: string
  progressBar?: string
  progressBarTrack?: string
  clock?: string
  clockText?: string
}

export interface WindowColors {
  background: string
  text: string
  progressBar: string
  progressBarTrack: string
  clock: string
  clockText: string
  resetBackground: string
  resetText: string
  resetProgressBar: string
  resetClock: string
  resetClockText: string
  expiredBackground: string
  expiredText: string
  expiredProgressBar: string
  expiredClock: string
  expiredClockText: string
  thresholds: ColorThreshold[]
}

export interface ShowSections {
  timer: boolean
  progress: boolean
  clock: boolean
  secondsOnClock: boolean
  hours: boolean
  minusSignOnExtra: boolean
}

// bounds is stripped before sending, so it is deliberately absent here
export interface WindowSettings {
  show: ShowSections
  messageBoxFixedHeight: boolean
  contentAtReset: ContentAtReset
  colors: WindowColors
  pulseAtZero: boolean
  use12HourClock: boolean
}

export interface Windows {
  [key: string]: WindowSettings
}

export interface TimerSettings {
  name: string
  timerDuration: number
  setTimeLive: boolean
  stopTimerAtZero: boolean
  followTimer: string
  audioFile: string | null
  audioOutputDeviceId: string | null
  windows: Windows
}

export interface Timers {
  [key: string]: TimerSettings
}

export function getActiveThreshold(
  thresholds: ColorThreshold[],
  currentSeconds: number,
  setSeconds: number,
): ColorThreshold | null {
  if (thresholds.length === 0) return null

  const matching = thresholds.filter(t => {
    if (t.type === 'minutes') return currentSeconds / 60 <= t.value
    return setSeconds > 0 && (currentSeconds * 100 / setSeconds) <= t.value
  })

  if (matching.length === 0) return null

  return matching.reduce((best, t) => {
    const bestSec = best.type === 'minutes' ? best.value * 60 : best.value * setSeconds / 100
    const tSec = t.type === 'minutes' ? t.value * 60 : t.value * setSeconds / 100
    return tSec < bestSec ? t : best
  })
}

// Structural fallbacks used only before the first snapshot arrives
export const DEFAULT_WINDOW_SETTINGS: WindowSettings = {
  show: {timer: true, progress: true, clock: true, secondsOnClock: false, hours: false, minusSignOnExtra: false},
  messageBoxFixedHeight: false,
  contentAtReset: ContentAtReset.Full,
  colors: {
    background: '#000000ff',
    text: '#ffffff',
    progressBar: '#22c55e',
    progressBarTrack: '#bbf7d0',
    clock: '#ffffff',
    clockText: '#ffffff',
    resetBackground: '#000000ff',
    resetText: '#ffffff',
    resetProgressBar: '#e5e7eb',
    resetClock: '#ffffff',
    resetClockText: '#ffffff',
    expiredBackground: '#000000ff',
    expiredText: '#ff0000',
    expiredProgressBar: '#b91c1c',
    expiredClock: '#ffffff',
    expiredClockText: '#ffffff',
    thresholds: [],
  },
  pulseAtZero: false,
  use12HourClock: false,
}

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  name: 'Timer',
  timerDuration: 1000,
  setTimeLive: false,
  stopTimerAtZero: false,
  followTimer: null,
  audioFile: null,
  audioOutputDeviceId: null,
  windows: {},
}
