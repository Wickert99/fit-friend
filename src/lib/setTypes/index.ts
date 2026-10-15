import type { Exercise, Prescription, SetScheme, SetType, WeightUnit } from '../../types.ts'
import { SET_TYPES } from '../../types.ts'
import { formatExactLoad, formatPlateLoad } from './units.ts'

export { SET_TYPES }
export {
  brzycki,
  epley,
  estimate1Rm,
  formatExactLoad,
  formatPlateLoad,
  kgToUnit,
  percentToLoadKg,
  roundLoadKg,
  spokenLoad,
  unitToKg,
} from './units.ts'

export const SET_TYPE_LABELS: Record<SetType, string> = {
  reps_load: 'Reps × load',
  time: 'Time',
  distance: 'Distance',
  amrap: 'AMRAP',
  emom: 'EMOM',
  each_side: 'Each side',
  per_leg: 'Per leg',
  for_time: 'For time',
}

export const SET_TYPE_DESCRIPTIONS: Record<SetType, string> = {
  reps_load: 'Sets × reps × load',
  time: 'Hold or work duration',
  distance: 'Metres or km',
  amrap: 'As many rounds/reps as possible in a time cap',
  emom: 'Every minute on the minute',
  each_side: 'Reps each side (L+R)',
  per_leg: 'Reps per leg',
  for_time: 'Count-up clock, log your finish time',
}

export const REST_CHOICES = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240] as const

const FOR_TIME = /for\s*time|time\s*trial|\btt\b/
const DURATION_REPS =
  /^\d+\s*s(ec)?(\s|\/|$)|\d+\s*s(ec)?\s*(\/|each|per)\s*(side|leg|arm)|^\d+\s*(-\s*\d+\s*)?s(ec|econds?)?$/
const PER_SIDE_REPS = /\/\s*(leg|side|arm)|per\s+(leg|side|arm)|each\s+(side|leg|arm)/
const BODYWEIGHT = new Set(['Bodyweight', 'None', 'Pull-up Bar', 'Box', 'Band'])

export type LoadFields = {
  targetPercent1RM?: number
  percent1RM?: number
  targetLoadKg?: number
  targetRpe?: number
  targetRir?: number
  rir?: number
}

export function readPercent(value: LoadFields | undefined): number | undefined {
  if (!value) return undefined
  return value.targetPercent1RM ?? value.percent1RM
}

export function readRir(value: LoadFields | undefined): number | undefined {
  if (!value) return undefined
  return value.targetRir ?? value.rir
}

export function readSchemes(value: { schemes?: SetScheme[]; waves?: SetScheme[] } | undefined): SetScheme[] | undefined {
  if (!value) return undefined
  if (value.schemes && value.schemes.length > 0) return value.schemes
  if (value.waves && value.waves.length > 0) return value.waves
  return undefined
}

/** Guess a set type from a reps string such as "45s", "8/side", or "AMRAP". */
export function inferSetType(reps?: string): SetType {
  const text = (reps ?? '').trim().toLowerCase()
  if (!text) return 'reps_load'
  if (text.includes('amrap')) return 'amrap'
  if (text.includes('emom')) return 'emom'
  if (FOR_TIME.test(text)) return 'for_time'
  if (DURATION_REPS.test(text) || (/\d+\s*min/.test(text) && !text.includes('×') && !/^\d+$/.test(text))) return 'time'
  if (/\d+\s*(m|metres?|meters?|km)\b/.test(text) && !/\d+\s*min/.test(text)) return 'distance'
  if (PER_SIDE_REPS.test(text)) return /leg/.test(text) ? 'per_leg' : 'each_side'
  return 'reps_load'
}

export function repsImplyPerSide(reps?: string): boolean {
  return PER_SIDE_REPS.test((reps ?? '').trim().toLowerCase())
}

/** Stored set type, corrected when the reps string clearly means something else. */
export function resolveSetType(setType: SetType | undefined, reps?: string, timeCapSec?: number): SetType {
  const text = (reps ?? '').trim().toLowerCase()
  const current = setType ?? inferSetType(reps)
  if (current === 'time' && (FOR_TIME.test(text) || (/^1$/.test(text) && !timeCapSec))) return 'for_time'
  if ((current === 'each_side' || current === 'per_leg') && (DURATION_REPS.test(text) || /\d+\s*min/.test(text))) return 'time'
  return current
}

export function prescriptionIsPerSide(prescription: {
  perSide?: boolean
  setType?: SetType
  reps?: string
}): boolean {
  if (prescription.perSide != null) return prescription.perSide
  const setType = resolveSetType(prescription.setType, prescription.reps)
  return (setType === 'time' || setType === 'distance') && repsImplyPerSide(prescription.reps)
}

export function parseLeadingCount(reps?: string, fallback = 8): number {
  const text = (reps ?? '').trim()
  if (!text || /amrap|emom/i.test(text)) return fallback
  const match = text.match(/^(\d+(?:\.\d+)?)/)
  if (!match) return fallback
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

export function parseDurationSec(reps?: string, fallback = 45): number {
  const text = (reps ?? '').trim().toLowerCase()
  const seconds = text.match(/(\d+)\s*s(ec)?/)
  if (seconds) return Number(seconds[1])
  const minutes = text.match(/(\d+)\s*min/)
  if (minutes) return Number(minutes[1]) * 60
  const bare = text.match(/^(\d+)$/)
  return bare ? Number(bare[1]) : fallback
}

export function parseDistanceM(reps?: string, fallback = 40): number {
  const text = (reps ?? '').trim().toLowerCase()
  const km = text.match(/(\d+(?:\.\d+)?)\s*km/)
  if (km) return Math.round(Number(km[1]) * 1000)
  const metres = text.match(/(\d+(?:\.\d+)?)\s*m(etre|eter)?s?\b/)
  if (metres) return Math.round(Number(metres[1]))
  const bare = text.match(/^(\d+)$/)
  return bare ? Number(bare[1]) : fallback
}

export function parseForTimeDistance(reps?: string): number {
  const text = (reps ?? '').trim().toLowerCase()
  if (!/\d\s*(m|km|k|metres?|meters?)\b/.test(text)) return 0
  const kilo = text.match(/(\d+(?:\.\d+)?)\s*k\b/)
  return kilo ? Math.round(Number(kilo[1]) * 1000) : parseDistanceM(text, 0)
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

export function formatDistance(metres: number): string {
  if (metres <= 0) return '—'
  if (metres >= 1000 && metres % 1000 === 0) return `${metres / 1000} km`
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`
  return `${metres} m`
}

export function formatLoad(target: LoadFields, unit: WeightUnit = 'kg'): string {
  const percent = readPercent(target)
  const rir = readRir(target)
  if (percent != null && percent > 0) {
    const label = String(percent)
    if (target.targetLoadKg != null && target.targetLoadKg > 0) return `${label}% (≈${formatPlateLoad(target.targetLoadKg, unit)})`
    if (target.targetRpe == null) return `${label}%`
    return `${label}% · RPE ${target.targetRpe}`
  }
  if (target.targetRpe != null) {
    const extra = rir == null ? '' : ` · RIR ${rir}`
    return `RPE ${target.targetRpe}${extra}`
  }
  if (target.targetLoadKg != null && target.targetLoadKg > 0) return formatExactLoad(target.targetLoadKg, unit)
  return ''
}

function atLoad(target: LoadFields, unit: WeightUnit): string {
  const text = formatLoad(target, unit)
  return text ? ` @ ${text}` : ''
}

function formatSchemeLine(scheme: SetScheme, suffix: string, unit: WeightUnit): string {
  return `${scheme.sets}×${scheme.reps || '?'}${atLoad(scheme, unit)}${suffix}`
}

export function freshScheme(partial: Partial<SetScheme> = {}, id?: string): SetScheme {
  return {
    id: partial.id ?? id,
    sets: Math.max(1, partial.sets ?? 3),
    reps: partial.reps ?? '8',
    restSec: partial.restSec ?? 90,
    targetLoadKg: partial.targetLoadKg,
    targetPercent1RM: readPercent(partial),
    ...(partial.targetRpe == null ? {} : { targetRpe: partial.targetRpe }),
    ...(readRir(partial) == null ? {} : { targetRir: readRir(partial) }),
  }
}

export function schemesOf(prescription: Pick<Prescription, 'sets' | 'reps' | 'restSec' | 'targetLoadKg' | 'targetPercent1RM' | 'percent1RM' | 'targetRpe' | 'targetRir' | 'rir' | 'schemes' | 'waves'>): SetScheme[] {
  const stored = readSchemes(prescription)
  if (stored && stored.length > 0) {
    return stored.map((scheme, index) => ({
      ...scheme,
      id: scheme.id || `sch-${index + 1}`,
      sets: Math.max(1, scheme.sets || 1),
      reps: scheme.reps ?? '8',
      restSec: scheme.restSec ?? 90,
      targetPercent1RM: readPercent(scheme),
      targetRir: readRir(scheme),
    }))
  }
  return [
    freshScheme({
      sets: prescription.sets,
      reps: prescription.reps,
      restSec: prescription.restSec,
      targetLoadKg: prescription.targetLoadKg,
      targetPercent1RM: readPercent(prescription),
      targetRpe: prescription.targetRpe,
      targetRir: readRir(prescription),
    }, 'sch-1'),
  ]
}

export function flattenSchemes(schemes: SetScheme[]): {
  sets: number
  reps: string
  restSec?: number
  targetLoadKg?: number
  targetPercent1RM?: number
  targetRpe?: number
  targetRir?: number
} {
  const first = schemes[0]
  if (!first) return { sets: 3, reps: '8', restSec: 90 }
  const sets = schemes.reduce((total, scheme) => total + Math.max(1, scheme.sets), 0)
  return {
    sets: schemes.length === 1 ? first.sets : sets,
    reps: first.reps,
    restSec: first.restSec,
    targetLoadKg: first.targetLoadKg,
    targetPercent1RM: readPercent(first),
    targetRpe: first.targetRpe,
    targetRir: readRir(first),
  }
}

export function formatPrescription(
  prescription: Pick<
    Prescription,
    | 'setType'
    | 'sets'
    | 'reps'
    | 'restSec'
    | 'targetLoadKg'
    | 'targetPercent1RM'
    | 'percent1RM'
    | 'targetRpe'
    | 'targetRir'
    | 'rir'
    | 'timeCapSec'
    | 'distanceM'
    | 'emomIntervalSec'
    | 'rounds'
    | 'perSide'
    | 'schemes'
    | 'waves'
  >,
  unit: WeightUnit = 'kg',
): string {
  const setType = prescription.setType ?? inferSetType(prescription.reps)
  const schemes = readSchemes(prescription)
  if (
    schemes &&
    schemes.length > 1 &&
    (setType === 'reps_load' || setType === 'each_side' || setType === 'per_leg' || setType === 'distance' || setType === 'time')
  ) {
    const suffix = setType === 'each_side' ? ' / side' : setType === 'per_leg' ? ' / leg' : ''
    return schemes
      .map((scheme) => {
        if (setType === 'time') return `${scheme.sets}×${formatDuration(parseDurationSec(scheme.reps, 45))}`
        if (setType === 'distance') return `${scheme.sets}×${formatDistance(parseDistanceM(scheme.reps, 40))}${atLoad(scheme, unit)}`
        return formatSchemeLine(scheme, suffix, unit)
      })
      .join(' → ')
  }
  const side = (setType === 'time' || setType === 'distance') && prescriptionIsPerSide({ ...prescription, setType }) ? ' / side' : ''
  switch (setType) {
    case 'time': {
      const seconds = prescription.timeCapSec ?? parseDurationSec(prescription.reps, 0)
      return seconds <= 0 ? `${prescription.sets} × ${prescription.reps || '?'}` : `${prescription.sets} × ${formatDuration(seconds)}${side}`
    }
    case 'distance': {
      const metres = prescription.distanceM ?? parseDistanceM(prescription.reps)
      return `${prescription.sets} × ${formatDistance(metres)}${side}${atLoad(prescription, unit)}`
    }
    case 'for_time': {
      const metres = prescription.distanceM ?? parseForTimeDistance(prescription.reps)
      const label = metres > 0 ? `${formatDistance(metres)} for time` : 'For time'
      const cap = prescription.timeCapSec ? ` (cap ${formatDuration(prescription.timeCapSec)})` : ''
      return prescription.sets > 1 ? `${prescription.sets} × ${label}${cap}` : `${label}${cap}`
    }
    case 'amrap': {
      const seconds = prescription.timeCapSec ?? parseDurationSec(prescription.reps, 0)
      if (seconds <= 0) return `${prescription.sets} × max reps${atLoad(prescription, unit)}`
      return prescription.sets > 1 ? `${prescription.sets} × AMRAP ${formatDuration(seconds)}` : `AMRAP ${formatDuration(seconds)}`
    }
    case 'emom': {
      const interval = prescription.emomIntervalSec ?? 60
      const rounds = prescription.rounds ?? prescription.sets
      const work = prescription.reps && !/emom/i.test(prescription.reps) ? prescription.reps : undefined
      return work ? `EMOM ${rounds} × ${formatDuration(interval)} · ${work}` : `EMOM ${rounds} × ${formatDuration(interval)}`
    }
    case 'each_side':
      return `${prescription.sets} × ${String(prescription.reps || '?').replace(/\s*\/\s*(side|leg)\s*$/i, '')} / side${atLoad(prescription, unit)}`
    case 'per_leg':
      return `${prescription.sets} × ${String(prescription.reps || '?').replace(/\s*\/\s*(side|leg)\s*$/i, '')} / leg${atLoad(prescription, unit)}`
    default:
      return `${prescription.sets} × ${prescription.reps || '?'}${atLoad(prescription, unit)}`
  }
}

export function defaultsForSetType(
  setType: SetType,
  current?: Partial<Prescription>,
): Pick<Prescription, 'setType' | 'sets' | 'reps' | 'restSec'> & Partial<Prescription> {
  const base = { setType }
  switch (setType) {
    case 'time':
      return {
        ...base,
        sets: current?.sets ?? 3,
        reps: current?.reps && /\d/.test(current.reps) ? current.reps : '45s',
        timeCapSec: current?.timeCapSec ?? parseDurationSec(current?.reps, 45),
        restSec: current?.restSec ?? 45,
      }
    case 'distance':
      return {
        ...base,
        sets: current?.sets ?? 4,
        reps: current?.reps ?? '40m',
        distanceM: current?.distanceM ?? parseDistanceM(current?.reps, 40),
        restSec: current?.restSec ?? 75,
      }
    case 'amrap':
      return {
        ...base,
        sets: 1,
        reps: 'AMRAP',
        timeCapSec: current?.timeCapSec ?? 600,
        rounds: current?.rounds,
        restSec: 0,
      }
    case 'for_time':
      return {
        ...base,
        sets: current?.sets ?? 1,
        reps: current?.reps && /\d/.test(current.reps) ? current.reps : 'for time',
        timeCapSec: current?.timeCapSec,
        distanceM: current?.distanceM,
        restSec: current?.restSec ?? 0,
      }
    case 'emom':
      return {
        ...base,
        sets: current?.rounds ?? current?.sets ?? 10,
        rounds: current?.rounds ?? current?.sets ?? 10,
        reps: current?.reps && !/emom/i.test(current.reps) ? current.reps : '5',
        emomIntervalSec: current?.emomIntervalSec ?? 60,
        restSec: 0,
      }
    case 'each_side':
      return {
        ...base,
        sets: current?.sets ?? 3,
        reps: current?.reps?.replace(/\/\s*(leg|arm).*/i, '') || '8',
        restSec: current?.restSec ?? 60,
      }
    case 'per_leg':
      return {
        ...base,
        sets: current?.sets ?? 3,
        reps: current?.reps?.replace(/\/\s*leg.*/i, '') || '8',
        restSec: current?.restSec ?? 90,
      }
    default:
      return {
        ...base,
        sets: current?.sets ?? 3,
        reps: current?.reps && !/amrap|emom/i.test(current.reps) ? current.reps : '8',
        restSec: current?.restSec ?? 90,
      }
  }
}

export function applySetType(prescription: Prescription, setType: SetType): Prescription {
  const next = defaultsForSetType(setType, prescription)
  const kept: Prescription = {
    ...prescription,
    ...next,
    exerciseId: prescription.exerciseId,
    id: prescription.id,
    notes: prescription.notes,
    targetLoadKg: prescription.targetLoadKg,
    targetPercent1RM: readPercent(prescription),
    targetRpe: prescription.targetRpe,
    targetRir: readRir(prescription),
    schemes: undefined,
    waves: undefined,
  }
  if (setType === 'reps_load' || setType === 'each_side' || setType === 'per_leg' || setType === 'distance' || setType === 'time') {
    const scheme = freshScheme(
      {
        sets: kept.sets,
        reps: kept.reps,
        restSec: kept.restSec,
        targetLoadKg: kept.targetLoadKg,
        targetPercent1RM: kept.targetPercent1RM,
      },
      'sch-1',
    )
    kept.schemes = [scheme]
    kept.waves = [scheme]
  }
  return kept
}

export function withSchemes(prescription: Prescription, schemes: SetScheme[]): Prescription {
  const flat = flattenSchemes(schemes)
  const next: Prescription = {
    ...prescription,
    sets: flat.sets,
    reps: flat.reps,
    restSec: flat.restSec ?? prescription.restSec,
    targetLoadKg: flat.targetLoadKg,
    targetPercent1RM: flat.targetPercent1RM,
    percent1RM: flat.targetPercent1RM,
    targetRpe: flat.targetRpe,
    targetRir: flat.targetRir,
    rir: flat.targetRir,
    schemes,
    waves: schemes,
  }
  return next
}

export type LogFieldKey = 'loadKg' | 'reps' | 'rounds' | 'durationSec' | 'distanceM'

export interface LogShape {
  setType: SetType
  fields: LogFieldKey[]
  repsLabel: string
  maxRepsPerSet: boolean
  bodyweight: boolean
}

export function logShape(
  source: {
    setType?: SetType
    reps?: string
    targetReps?: string
    timeCapSec?: number
    targetLoadKg?: number
    targetPercent1RM?: number
    percent1RM?: number
    sets?: { loadKg?: number }[] | number
  },
  exercise?: Pick<Exercise, 'equipment'> | null,
): LogShape {
  const reps = source.reps ?? source.targetReps
  const setType = resolveSetType(source.setType, reps, source.timeCapSec)
  const equipment = exercise?.equipment ?? []
  const loggedLoad = Array.isArray(source.sets) && source.sets.some((set) => (set.loadKg ?? 0) > 0)
  const prescribedLoad = (source.targetLoadKg ?? 0) > 0 || (readPercent(source) ?? 0) > 0
  const bodyweight = equipment.length > 0 && equipment.every((item) => BODYWEIGHT.has(item)) && !prescribedLoad && !loggedLoad
  const load: LogFieldKey[] = bodyweight ? [] : ['loadKg']
  const shape = (fields: LogFieldKey[], repsLabel: string, maxRepsPerSet = false): LogShape => ({
    setType,
    fields,
    repsLabel,
    maxRepsPerSet,
    bodyweight,
  })
  switch (setType) {
    case 'time':
    case 'for_time':
      return shape(['durationSec'], 'Reps')
    case 'distance':
      return shape(['distanceM', ...load], 'Reps')
    case 'amrap':
      return (source.timeCapSec ?? parseDurationSec(reps, 0)) > 0
        ? shape(['rounds', 'reps'], 'Extra reps')
        : shape([...load, 'reps'], 'Max reps', true)
    case 'emom':
      return shape([...load, 'reps'], 'Work reps')
    case 'each_side':
      return shape([...load, 'reps'], 'Reps / side')
    case 'per_leg':
      return shape([...load, 'reps'], 'Reps / leg')
    default:
      return shape([...load, 'reps'], 'Reps')
  }
}
