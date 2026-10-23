/**
 * Pure Whoop matching and heart-rate display.
 * Network calls live in api.ts. This module stays free of the browser and Supabase.
 *
 * Whoop zone totals are 10% of max heart rate (zone 4 is 80–90%). Time in the
 * Bristol Method's 80–85% band is returned only when a zone sits entirely inside
 * that band, or when heart-rate samples and a known max heart rate can be counted.
 */

export const WHOOP_REDIRECT_URI = 'https://wickert99.github.io/fit-friend/whoop-callback.html'
export const WHOOP_NOTICE_KEY = 'ff-whoop-notice'
export const WHOOP_NOTICE_EVENT = 'ff-whoop-notice'
export const BRISTOL_PROGRAM_ID = 'prog-bristol-method'

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface WhoopCallback {
  code?: string
  state?: string
  error?: string
  errorDescription?: string
}

export interface HrSample {
  /** Epoch milliseconds. */
  at: number
  bpm: number
}

export interface ZoneDurations {
  zoneZeroMilli: number
  zoneOneMilli: number
  zoneTwoMilli: number
  zoneThreeMilli: number
  zoneFourMilli: number
  zoneFiveMilli: number
}

export interface PercentRange {
  /** Inclusive lower bound, exclusive upper bound, as a percent of max heart rate. */
  low: number
  high: number
}

export const DEFAULT_ZONE_RANGES: Record<keyof ZoneDurations, PercentRange> = {
  zoneZeroMilli: { low: 0, high: 50 },
  zoneOneMilli: { low: 50, high: 60 },
  zoneTwoMilli: { low: 60, high: 70 },
  zoneThreeMilli: { low: 70, high: 80 },
  zoneFourMilli: { low: 80, high: 90 },
  zoneFiveMilli: { low: 90, high: 100 },
}

const ZONE_META: { key: keyof ZoneDurations; label: string; range: string }[] = [
  { key: 'zoneZeroMilli', label: 'Zone 0', range: 'Under 50%' },
  { key: 'zoneOneMilli', label: 'Zone 1', range: '50–60%' },
  { key: 'zoneTwoMilli', label: 'Zone 2', range: '60–70%' },
  { key: 'zoneThreeMilli', label: 'Zone 3', range: '70–80%' },
  { key: 'zoneFourMilli', label: 'Zone 4', range: '80–90%' },
  { key: 'zoneFiveMilli', label: 'Zone 5', range: '90–100%' },
]

export interface WhoopWorkout {
  id: string
  start: string
  end: string
  sportName: string | null
  scoreState: string | null
  strain: number | null
  averageHeartRate: number | null
  maxHeartRate: number | null
  zoneDurations: ZoneDurations | null
  heartRateSamples: HrSample[] | null
  /** The person's max heart rate, when a payload includes it. Not the workout peak. */
  userMaxHeartRate: number | null
}

export interface TimeWindow {
  startMs: number
  endMs: number
}

export interface ZoneRow {
  id: string
  label: string
  range: string
  milliseconds: number
  duration: string
  share: number
}

export type BristolNote =
  | { kind: 'band'; label: string; duration: string }
  | { kind: 'unavailable'; text: string }

export interface HeartRateMetrics {
  sportName: string | null
  average: string
  max: string
  strain: string | null
  zones: ZoneRow[]
  zonesMissing: boolean
  bristol: BristolNote | null
  /** The person's max heart rate from the Whoop payload, when present. */
  userMaxHeartRate: number | null
}

export type HeartRatePhase =
  | 'signed_out'
  | 'unavailable'
  | 'disconnected'
  | 'error'
  | 'no_window'
  | 'no_match'
  | 'matched'

export type HeartRateView =
  | { kind: 'empty'; title: string; body: string }
  | { kind: 'metrics'; metrics: HeartRateMetrics }

export interface SessionHeartRateInput {
  programId?: string
  name?: string
  startedAt?: string
  completedAt?: string
}

export function whoopRedirectUri(origin: string, base: string): string {
  const normalized = base.endsWith('/') ? base : `${base}/`
  const root = new URL(normalized, origin)
  return new URL('whoop-callback.html', root).href
}

export function readWhoopCallback(hash: string): WhoopCallback | null {
  const query = hash.indexOf('?')
  const path = query >= 0 ? hash.slice(0, query) : hash
  if (path !== '#/whoop-callback') return null
  const params = new URLSearchParams(query >= 0 ? hash.slice(query + 1) : '')
  const code = params.get('code')?.trim() || undefined
  const state = params.get('state')?.trim() || undefined
  const error = params.get('error')?.trim() || undefined
  const description = params.get('error_description')?.trim() || undefined
  return {
    code,
    state,
    error: error ?? (!code && !state ? 'missing' : undefined),
    errorDescription: description && description.length <= 180 ? description : undefined,
  }
}

export function writeWhoopNotice(storage: KeyValueStorage, message: string): void {
  try {
    storage.setItem(WHOOP_NOTICE_KEY, message)
  } catch {
    /* private mode */
  }
}

export function consumeWhoopNotice(storage: KeyValueStorage): string | null {
  try {
    const value = storage.getItem(WHOOP_NOTICE_KEY)
    if (!value) return null
    storage.removeItem(WHOOP_NOTICE_KEY)
    return value
  } catch {
    return null
  }
}

export function whoopCallbackMessage(input: {
  error?: string
  errorDescription?: string
  exchangeError?: string
  connected?: boolean
}): string {
  if (input.connected) return 'Whoop is connected. Completed workouts can show heart rate for the same time.'
  const error = input.exchangeError || input.error
  if (error === 'access_denied') return 'Whoop connection was cancelled.'
  if (error === 'state_mismatch' || error === 'missing_code' || error === 'missing') {
    return 'That Whoop link expired. Tap Connect Whoop to try again.'
  }
  if (error === 'not_signed_in') return 'Sign in on this page, then tap Connect Whoop again.'
  if (error === 'whoop_not_configured' || error === 'unavailable') {
    return "Whoop isn't set up on the server yet. The rest of Fit Friend still works."
  }
  if (input.errorDescription) return `Whoop didn't connect. ${input.errorDescription}`
  return "Whoop didn't connect. Tap Connect Whoop to try again."
}

export function isBristolSession(session: { programId?: string; name?: string }): boolean {
  if (session.programId === BRISTOL_PROGRAM_ID) return true
  return /bristol method/i.test(session.name ?? '')
}

export function sessionWindow(session: { startedAt?: string; completedAt?: string }): TimeWindow | null {
  const startMs = Date.parse(session.startedAt ?? '')
  const endMs = Date.parse(session.completedAt ?? '')
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  return { startMs, endMs }
}

export function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

export function matchWhoopWorkout(window: TimeWindow, workouts: WhoopWorkout[]): WhoopWorkout | null {
  let best: { workout: WhoopWorkout; overlap: number; startDelta: number } | null = null
  for (const workout of workouts) {
    const start = Date.parse(workout.start)
    const end = Date.parse(workout.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const overlap = overlapMs(window.startMs, window.endMs, start, end)
    if (overlap <= 0) continue
    const startDelta = Math.abs(start - window.startMs)
    if (isBetterMatch({ overlap, startDelta, id: workout.id }, best)) {
      best = { workout, overlap, startDelta }
    }
  }
  return best?.workout ?? null
}

function isBetterMatch(
  candidate: { overlap: number; startDelta: number; id: string },
  best: { overlap: number; startDelta: number; workout: WhoopWorkout } | null,
): boolean {
  if (!best) return true
  if (candidate.overlap !== best.overlap) return candidate.overlap > best.overlap
  if (candidate.startDelta !== best.startDelta) return candidate.startDelta < best.startDelta
  return candidate.id.localeCompare(best.workout.id) < 0
}

export function normalizeWhoopWorkout(raw: unknown): WhoopWorkout | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || row.id.length === 0) return null
  if (typeof row.start !== 'string' || typeof row.end !== 'string') return null
  const startMs = Date.parse(row.start)
  const endMs = Date.parse(row.end)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  const score = row.score && typeof row.score === 'object' ? (row.score as Record<string, unknown>) : null
  const zones = readZones(score?.zone_durations ?? score?.zone_duration)
  return {
    id: row.id,
    start: row.start,
    end: row.end,
    sportName: typeof row.sport_name === 'string' && row.sport_name.trim() ? row.sport_name.trim() : null,
    scoreState: typeof row.score_state === 'string' ? row.score_state : null,
    strain: readStrain(score?.strain),
    averageHeartRate: readBpm(score?.average_heart_rate),
    maxHeartRate: readBpm(score?.max_heart_rate),
    zoneDurations: zones,
    heartRateSamples: readSamples(score?.heart_rate_samples),
    userMaxHeartRate: readUserMax(row.user_max_heart_rate),
  }
}

export function normalizeWhoopWorkouts(raw: unknown): WhoopWorkout[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { records?: unknown }).records)
      ? (raw as { records: unknown[] }).records
      : []
  return list.flatMap((item) => {
    const workout = normalizeWhoopWorkout(item)
    return workout ? [workout] : []
  })
}

export function formatZoneDuration(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) {
    if (minutes === 0 && seconds === 0) return `${hours}h`
    if (seconds === 0) return `${hours}h ${minutes}m`
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  return `${seconds}s`
}

export function formatStrain(value: number): string {
  return value.toFixed(1)
}

export function zoneRows(zones: ZoneDurations): ZoneRow[] {
  const peak = Math.max(...ZONE_META.map((zone) => zones[zone.key]))
  return ZONE_META.map((zone) => {
    const milliseconds = zones[zone.key]
    return {
      id: zone.key,
      label: zone.label,
      range: zone.range,
      milliseconds,
      duration: formatZoneDuration(milliseconds),
      share: peak > 0 ? milliseconds / peak : 0,
    }
  })
}

/**
 * Sum zone time that falls entirely inside [bandLow, bandHigh].
 * A wider zone that only overlaps the band makes the split unknowable.
 */
export function timeInPercentBandFromZones(
  zones: ZoneDurations,
  ranges: Record<keyof ZoneDurations, PercentRange>,
  bandLow: number,
  bandHigh: number,
): number | null {
  let total = 0
  for (const key of Object.keys(ranges) as (keyof ZoneDurations)[]) {
    const range = ranges[key]
    const milliseconds = zones[key]
    const overlaps = range.low < bandHigh && bandLow < range.high
    if (!overlaps) continue
    const inside = range.low >= bandLow && range.high <= bandHigh
    if (inside) {
      total += milliseconds
      continue
    }
    if (milliseconds > 0) return null
  }
  return total
}

/** Count sample intervals whose bpm is inside [low%, high%] of max heart rate, inclusive. */
export function timeInPercentBandFromSamples(
  samples: HrSample[],
  maxHeartRate: number,
  bandLowPct: number,
  bandHighPct: number,
): number | null {
  if (!Number.isFinite(maxHeartRate) || maxHeartRate <= 0 || samples.length < 2) return null
  const low = (bandLowPct / 100) * maxHeartRate
  const high = (bandHighPct / 100) * maxHeartRate
  const ordered = [...samples].sort((a, b) => a.at - b.at)
  let total = 0
  for (let index = 0; index < ordered.length - 1; index++) {
    const current = ordered[index]
    const next = ordered[index + 1]
    if (!current || !next) continue
    const span = next.at - current.at
    if (span <= 0 || !Number.isFinite(current.bpm)) continue
    if (current.bpm >= low && current.bpm <= high) total += span
  }
  return total
}

export function bristolBandMs(
  workout: WhoopWorkout,
  ranges: Record<keyof ZoneDurations, PercentRange> = DEFAULT_ZONE_RANGES,
): number | null {
  const max = workout.userMaxHeartRate
  const samples = workout.heartRateSamples
  if (max != null && max > 0 && samples != null && samples.length >= 2) {
    return timeInPercentBandFromSamples(samples, max, 80, 85)
  }
  if (!workout.zoneDurations) return null
  return timeInPercentBandFromZones(workout.zoneDurations, ranges, 80, 85)
}

export function describeHeartRate(input: {
  phase: HeartRatePhase
  session?: SessionHeartRateInput
  workout?: WhoopWorkout | null
  errorMessage?: string
}): HeartRateView {
  const session = input.session ?? {}
  switch (input.phase) {
    case 'signed_out':
      return {
        kind: 'empty',
        title: "Whoop isn't connected",
        body: 'Sign in on Friends and tap Connect Whoop to see heart rate for this workout.',
      }
    case 'disconnected':
      return {
        kind: 'empty',
        title: "Whoop isn't connected",
        body: 'Tap Connect Whoop on Friends to add heart rate to this workout.',
      }
    case 'unavailable':
      return {
        kind: 'empty',
        title: 'Whoop heart rate',
        body: "Heart rate from Whoop isn't available right now. This workout is saved on this device.",
      }
    case 'no_window':
      return {
        kind: 'empty',
        title: 'Whoop heart rate',
        body: 'This session needs a start and finish time before it can be matched to a Whoop workout.',
      }
    case 'no_match':
      return {
        kind: 'empty',
        title: 'No Whoop workout for this session',
        body: 'Nothing on Whoop overlaps this start and finish. If the strap session is still processing, check again in a few minutes.',
      }
    case 'error':
      return {
        kind: 'empty',
        title: 'Whoop heart rate',
        body: input.errorMessage?.trim() || "Whoop heart rate didn't load. This workout is saved on this device.",
      }
    case 'matched':
      return describeMatch(session, input.workout ?? null)
    default:
      return {
        kind: 'empty',
        title: 'Whoop heart rate',
        body: "Heart rate from Whoop isn't available right now. This workout is saved on this device.",
      }
  }
}

function describeMatch(session: SessionHeartRateInput, workout: WhoopWorkout | null): HeartRateView {
  if (!workout) {
    return {
      kind: 'empty',
      title: 'No Whoop workout for this session',
      body: 'Nothing on Whoop overlaps this start and finish. If the strap session is still processing, check again in a few minutes.',
    }
  }
  const state = (workout.scoreState ?? '').toUpperCase()
  if (state === 'UNSCORABLE') {
    return {
      kind: 'empty',
      title: 'Whoop workout found',
      body: "Whoop couldn't score heart rate for this workout.",
    }
  }
  if (state !== 'SCORED') {
    return {
      kind: 'empty',
      title: 'Whoop workout found',
      body: "Heart rate isn't ready yet. Whoop is still scoring this workout.",
    }
  }
  const zones = workout.zoneDurations ? zoneRows(workout.zoneDurations) : []
  return {
    kind: 'metrics',
    metrics: {
      sportName: formatSportName(workout.sportName),
      average: formatBpm(workout.averageHeartRate),
      max: formatBpm(workout.maxHeartRate),
      strain: workout.strain == null ? null : formatStrain(workout.strain),
      zones,
      zonesMissing: zones.length === 0,
      bristol: bristolNote(session, workout),
      userMaxHeartRate: workout.userMaxHeartRate,
    },
  }
}

function bristolNote(session: SessionHeartRateInput, workout: WhoopWorkout): BristolNote | null {
  if (!isBristolSession(session)) return null
  const milliseconds = bristolBandMs(workout)
  if (milliseconds == null) {
    return {
      kind: 'unavailable',
      text: "Whoop zones are 10% wide, so this workout doesn't include time in the 80–85% band. Zone 4 is 80–90%.",
    }
  }
  return { kind: 'band', label: '80–85% max HR', duration: formatZoneDuration(milliseconds) }
}

function formatBpm(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)} bpm`
}

function formatSportName(name: string | null): string | null {
  if (!name) return null
  const cleaned = name.replace(/[_-]+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function readBpm(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number < 1 || number > 260) return null
  return number
}

function readUserMax(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number < 60 || number > 260) return null
  return number
}

function readStrain(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null
  return value
}

function readZones(value: unknown): ZoneDurations | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const read = (key: string) => {
    const number = Number(row[key])
    return Number.isFinite(number) && number > 0 ? number : 0
  }
  return {
    zoneZeroMilli: read('zone_zero_milli'),
    zoneOneMilli: read('zone_one_milli'),
    zoneTwoMilli: read('zone_two_milli'),
    zoneThreeMilli: read('zone_three_milli'),
    zoneFourMilli: read('zone_four_milli'),
    zoneFiveMilli: read('zone_five_milli'),
  }
}

function readSamples(value: unknown): HrSample[] | null {
  if (!Array.isArray(value)) return null
  const samples: HrSample[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const atRaw = row.at ?? row.time ?? row.timestamp
    const bpmRaw = row.bpm ?? row.heart_rate ?? row.hr
    const at = typeof atRaw === 'number' ? atRaw : Date.parse(String(atRaw ?? ''))
    const bpm = typeof bpmRaw === 'number' ? bpmRaw : Number(bpmRaw)
    if (!Number.isFinite(at) || !Number.isFinite(bpm) || bpm <= 0) continue
    samples.push({ at, bpm })
  }
  return samples.length >= 2 ? samples : null
}
