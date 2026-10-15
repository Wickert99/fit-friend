import type { Exercise, LoggedSet, SessionExercise, SetScheme, SetType, WeightUnit } from '../../types.ts'
import {
  formatDistance,
  parseDistanceM,
  parseDurationSec,
  parseForTimeDistance,
  prescriptionIsPerSide,
  readPercent,
  readRir,
  readSchemes,
  resolveSetType,
} from '../setTypes/index.ts'
import { formatExactLoad, formatPlateLoad, percentToLoadKg, spokenLoad } from '../setTypes/units.ts'
import type { LiftFamily, LiftMax } from '../../types.ts'
import { resolveMax } from '../../features/session/families.ts'

export type FocusRole = 'strength_set' | 'time_interval' | 'distance_set' | 'amrap' | 'emom_interval' | 'for_time'
export type FocusClock = 'none' | 'countdown' | 'count_up'
export type FocusSide = 'left' | 'right'

export interface FocusStep {
  id: string
  role: FocusRole
  setType: SetType
  exerciseId: string
  exerciseName: string
  setNumber: number
  setCount: number
  headline: string
  detail: string
  workSec: number | null
  restSec: number
  figure: string
  figureUnit: string
  beforeWork: string[]
  countdown: boolean
  startWord: string
  intensity?: string
  finish?: string
  clock: FocusClock
  capSec?: number
  side?: FocusSide
  pairStepId?: string
  restStart?: string
  restWarning?: string
}

export interface CueExercise {
  exerciseId: string
  setType?: SetType
  sets: number
  reps: string
  restSec?: number
  targetLoadKg?: number
  targetPercent1RM?: number
  percent1RM?: number
  targetRpe?: number
  targetRir?: number
  rir?: number
  schemes?: SetScheme[]
  waves?: SetScheme[]
  timeCapSec?: number
  emomIntervalSec?: number
  rounds?: number
  distanceM?: number
  notes?: string
  perSide?: boolean
  loggedSets?: LoggedSet[]
  coachCue?: string
  plannedExerciseId?: string
}

export interface CueOptions {
  unit?: WeightUnit
  liftMaxes?: Record<string, LiftMax>
  families?: LiftFamily[]
  aliases?: Record<string, string>
  exercises?: Exercise[]
}

export function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/** Seconds remaining at which the rest warning is spoken. */
export function restWarningAt(total: number): number | null {
  if (total >= 20) return 10
  if (total >= 12) return 5
  if (total >= 5) return 3
  if (total >= 2) return 1
  return null
}

function positive(value: number | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value > 0 ? value : undefined
}

function spokenDuration(seconds: number): string {
  const total = Math.round(seconds)
  if (total <= 0) return ''
  if (total < 60) return total === 1 ? '1 second' : `${total} seconds`
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  const minuteLabel = minutes === 1 ? '1 minute' : `${minutes} minutes`
  if (!rest) return minuteLabel
  return `${minuteLabel} ${rest === 1 ? '1 second' : `${rest} seconds`}`
}

function spokenDistance(metres: number): string {
  if (metres >= 1000 && metres % 1000 === 0) {
    const km = metres / 1000
    return km === 1 ? '1 kilometre' : `${km} kilometres`
  }
  if (metres >= 1000) return `${Math.round((metres / 1000) * 10) / 10} kilometres`
  return metres === 1 ? '1 metre' : `${metres} metres`
}

function shortDistance(metres: number): string {
  if (metres >= 1000) {
    const km = metres / 1000
    return Number.isInteger(km) ? String(km) : km.toFixed(1)
  }
  return String(metres)
}

function distanceUnit(metres: number): string {
  return metres >= 1000 ? 'km' : 'm'
}

function displayDistance(metres: number): string {
  return metres >= 1000 ? `${shortDistance(metres)} km` : `${metres} m`
}

function numText(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(Number.isInteger(value) ? value : Math.round(value * 10) / 10)
}

function durationFrom(cap: number | undefined, reps: string | undefined, logged?: number): number | null {
  if (logged != null && logged > 0) return Math.round(logged)
  if (cap != null && cap > 0) return Math.round(cap)
  const text = (reps ?? '').trim().toLowerCase()
  if (!text || text === 'amrap') return null
  if (/(\d+)\s*(s|sec|min)/.test(text) || /^\d+$/.test(text)) {
    const parsed = parseDurationSec(text, 0)
    return parsed > 0 ? parsed : null
  }
  return null
}

function distanceFrom(stored: number | undefined, reps: string | undefined, logged?: number): number | null {
  if (logged != null && logged > 0) return Math.round(logged)
  if (stored != null && stored > 0) return Math.round(stored)
  const text = (reps ?? '').trim().toLowerCase()
  if (!text) return null
  if (/km|\dm|metre|meter|\bm\b/.test(text) || /^\d+$/.test(text)) {
    const parsed = parseDistanceM(text, 0)
    return parsed > 0 ? parsed : null
  }
  return null
}

interface PlannedSet {
  reps: string
  restSec: number
  loadKg?: number
  percent?: number
  rpe?: number
  rir?: number
  durationSec?: number
  distanceM?: number
  maxReps?: boolean
}

function schemeRpe(exercise: CueExercise): number | undefined {
  return readSchemes(exercise)?.find((scheme) => scheme.targetRpe != null)?.targetRpe ?? exercise.targetRpe
}

function schemeRir(exercise: CueExercise): number | undefined {
  return readSchemes(exercise)?.find((scheme) => readRir(scheme) != null)?.targetRir ?? readRir(exercise)
}

function plannedSet(exercise: CueExercise, setType: SetType, scheme?: SetScheme): PlannedSet {
  const reps = scheme?.reps || exercise.reps || ''
  const rest = setType === 'emom' || setType === 'amrap' ? 0 : (scheme?.restSec ?? exercise.restSec ?? 0)
  const duration =
    setType === 'time'
      ? (durationFrom(exercise.timeCapSec, reps) ?? undefined)
      : setType === 'emom'
        ? exercise.emomIntervalSec && exercise.emomIntervalSec > 0
          ? exercise.emomIntervalSec
          : 60
        : undefined
  const distance =
    setType === 'distance'
      ? (distanceFrom(exercise.distanceM, reps) ?? undefined)
      : setType === 'for_time'
        ? (positive(exercise.distanceM) ?? (parseForTimeDistance(reps) || undefined))
        : undefined
  return {
    reps,
    restSec: Math.max(0, rest),
    loadKg: positive(scheme?.targetLoadKg ?? exercise.targetLoadKg),
    percent: positive(readPercent(scheme ?? {}) ?? readPercent(exercise)),
    rpe: scheme?.targetRpe ?? exercise.targetRpe,
    rir: readRir(scheme ?? {}) ?? readRir(exercise),
    durationSec: duration,
    distanceM: distance,
  }
}

function expandSets(exercise: CueExercise, setType: SetType): PlannedSet[] {
  if (setType === 'amrap') {
    const cap = durationFrom(exercise.timeCapSec, exercise.reps)
    if (!cap) {
      const count = Math.max(1, exercise.loggedSets?.length || exercise.sets || 1)
      return Array.from({ length: count }, (_, index) => ({
        reps: 'max reps',
        restSec: Math.max(0, exercise.loggedSets?.[index]?.restSec ?? exercise.restSec ?? 0),
        loadKg: positive(exercise.loggedSets?.[index]?.loadKg ?? exercise.targetLoadKg),
        rpe: schemeRpe(exercise),
        rir: schemeRir(exercise),
        maxReps: true,
      }))
    }
    return [{ reps: 'AMRAP', restSec: 0, rpe: schemeRpe(exercise), rir: schemeRir(exercise), durationSec: cap }]
  }
  const schemes =
    readSchemes(exercise) && (readSchemes(exercise)?.length ?? 0) > 0
      ? readSchemes(exercise)!
      : [
          {
            id: 'flat',
            sets: setType === 'emom' ? Math.max(1, exercise.rounds ?? exercise.sets ?? 1) : Math.max(0, exercise.sets ?? 0),
            reps: exercise.reps,
            restSec: exercise.restSec ?? 0,
            targetLoadKg: exercise.targetLoadKg,
            targetPercent1RM: readPercent(exercise),
            targetRpe: exercise.targetRpe,
            targetRir: readRir(exercise),
          } satisfies SetScheme,
        ]
  const planned: PlannedSet[] = []
  for (const scheme of schemes) {
    const count = Math.max(0, scheme.sets || 0)
    for (let index = 0; index < count; index++) planned.push(plannedSet(exercise, setType, scheme))
  }
  if (exercise.loggedSets && exercise.loggedSets.length > 0) {
    return exercise.loggedSets.map((logged, index) =>
      overlayLogged(setType, planned[index] ?? planned[planned.length - 1] ?? plannedSet(exercise, setType, schemes[0]), logged),
    )
  }
  return planned
}

function overlayLogged(setType: SetType, planned: PlannedSet, logged: LoggedSet): PlannedSet {
  const descriptive = planned.reps && !/^\d+(\.\d+)?$/.test(planned.reps.trim()) && !/^(amrap|emom)$/i.test(planned.reps.trim())
  let reps = planned.reps
  if (!descriptive && logged.reps > 0 && (setType === 'reps_load' || setType === 'each_side' || setType === 'per_leg' || setType === 'emom')) {
    reps = String(logged.reps)
  }
  return {
    reps,
    restSec: setType === 'emom' || setType === 'amrap' ? 0 : Math.max(0, logged.restSec ?? planned.restSec ?? 0),
    loadKg: logged.loadKg > 0 ? logged.loadKg : planned.loadKg,
    percent: positive(logged.targetPercent1RM) ?? planned.percent,
    rpe: planned.rpe,
    rir: planned.rir,
    durationSec: setType === 'time' && logged.durationSec && logged.durationSec > 0 ? logged.durationSec : planned.durationSec,
    distanceM:
      setType === 'distance'
        ? (distanceFrom(planned.distanceM, reps, logged.distanceM) ?? undefined)
        : setType === 'for_time'
          ? (positive(logged.distanceM) ?? planned.distanceM)
          : undefined,
  }
}

function resolveLoad(exercise: CueExercise, planned: PlannedSet, options: CueOptions, unit: WeightUnit): PlannedSet {
  if (!options.liftMaxes || planned.percent == null || (planned.loadKg != null && planned.loadKg > 0)) return planned
  const max = resolveMax(exercise.exerciseId, options.liftMaxes, options.families ?? [], options.aliases)
  if (!max) return planned
  const load = percentToLoadKg(planned.percent, max.maxKg, unit)
  return load > 0 ? { ...planned, loadKg: load } : planned
}

const MOBILITY = /stretch|mobility|cat[- ]?cow|90\/90|pigeon|world'?s greatest|t-?spine|thread the needle|figure[- ]?4|hamstring strap|foam roll|breath|opener|\bflow\b|couch/i

function isMobility(exercise: CueExercise, name: string, exercises?: Exercise[]): boolean {
  const match = exercises?.find((item) => item.id === exercise.exerciseId)
  if (match) return match.theme === 'Mobility'
  return MOBILITY.test(name)
}

function athleteNote(exercise: CueExercise, exercises?: Exercise[]): string | undefined {
  const note = (exercise.notes ?? '').trim()
  if (!note) return undefined
  if (exercise.coachCue && note === exercise.coachCue.trim()) return undefined
  const cues = exercises?.find((item) => item.id === exercise.exerciseId)?.cues ?? []
  if (cues.some((cue) => cue.trim() === note)) return undefined
  return note
}

const INTENSITY = /rpe\s*\d+|rir\s*\d+|\bhard\b|all[- ]out|max(imal)? effort|\bsprint(s|ing)?\b|\beasy\b|\bfast\b|\bsteady\b/i
const HARD = /\b(hard|all[- ]out|max(?:imal)? effort|sprint(?:s|ing)?|fast)\b/gi
const NEGATIVE = /\b(not|no|never|don'?t|without|avoid|isn'?t|nothing|zero|less|non)\b/i

function readNoteIntensity(note?: string): { hard: boolean; negated: boolean; rpe?: string; rir?: string } {
  const text = (note ?? '').trim()
  if (!text) return { hard: false, negated: false }
  let hard = false
  let negated = false
  for (const match of text.matchAll(HARD)) {
    const before = text
      .slice(0, match.index ?? 0)
      .split(/\s+/)
      .filter(Boolean)
      .slice(-3)
      .join(' ')
    if (NEGATIVE.test(before)) negated = true
    else hard = true
  }
  const rpe = text.match(/rpe\s*(\d+(?:\.\d+)?)/i)?.[1]
  const rir = text.match(/rir\s*(\d+(?:\.\d+)?)/i)?.[1]
  return { hard, negated, ...(rpe ? { rpe } : {}), ...(rir ? { rir } : {}) }
}

function clipNote(note?: string): string | null {
  const text = (note ?? '').trim()
  if (!text || !INTENSITY.test(text)) return null
  return text.length > 80 ? `${text.slice(0, 77).trim()}…` : text
}

function noteForSet(note: string | undefined, setNumber: number): string | undefined {
  const clipped = clipNote(note)
  if (clipped && !(clipped.length > 42 && setNumber > 1)) return clipped
  return undefined
}

function effortLine(setType: SetType, rpe: number | undefined, rir: number | undefined, note: string | undefined): string | undefined {
  const interval = setType === 'emom' ? 'this interval' : 'this set'
  const prescribed = (rpe != null && Number.isFinite(rpe)) || (rir != null && Number.isFinite(rir))
  const fromNote = prescribed ? { hard: false, negated: false } : readNoteIntensity(note)
  if (!prescribed && fromNote.negated && note) return note
  const parts: string[] = []
  if (fromNote.hard) parts.push(`Go hard ${interval}`)
  const rpeText = rpe != null && Number.isFinite(rpe) ? `RPE ${numText(rpe)}` : fromNote.rpe ? `RPE ${fromNote.rpe}` : ''
  const rirText = rir != null && Number.isFinite(rir) ? `RIR ${numText(rir)}` : fromNote.rir ? `RIR ${fromNote.rir}` : ''
  if (rpeText) parts.push(rpeText)
  if (rirText) parts.push(rirText)
  if (!parts.length && !prescribed && note && !/rpe|rir/i.test(note)) parts.push(note)
  if (!parts.length) return undefined
  if (!fromNote.hard && parts.length > 0 && (rpeText || rirText) && parts.every((part) => /^(RPE|RIR)\b/.test(part))) {
    return `${setType === 'emom' ? 'This interval' : 'This set'}, ${parts.join(', ')}`
  }
  return parts.join(', ')
}

function targetBits(rpe?: number, rir?: number, note?: string): string | undefined {
  const parts: string[] = []
  if (rpe != null && Number.isFinite(rpe)) parts.push(`RPE ${numText(rpe)}`)
  if (rir != null && Number.isFinite(rir)) parts.push(`RIR ${numText(rir)}`)
  if (parts.length) return parts.join(', ')
  const parsed = readNoteIntensity(note)
  if (parsed.rpe) parts.push(`RPE ${parsed.rpe}`)
  if (parsed.rir) parts.push(`RIR ${parsed.rir}`)
  return parts.length ? parts.join(', ') : undefined
}

function loadBits(planned: PlannedSet, unit: WeightUnit): { spoken: string; display: string } {
  const spoken: string[] = []
  const display: string[] = []
  if (planned.percent != null) {
    spoken.push(`${numText(planned.percent)} percent`)
    display.push(`${numText(planned.percent)}%`)
  }
  if (planned.loadKg != null && planned.loadKg > 0) {
    const exact = planned.percent == null
    const shown = exact ? formatExactLoad(planned.loadKg, unit) : formatPlateLoad(planned.loadKg, unit)
    const said = spokenLoad(planned.loadKg, unit, exact)
    if (said) spoken.push(said)
    if (shown && shown !== '—') display.push(shown)
  }
  return { spoken: spoken.join(', '), display: display.join(' · ') }
}

function repPhrase(reps: string, setType: SetType): string {
  const text = (reps ?? '').trim()
  if (!text || text === '?' || /^(amrap|emom)$/i.test(text)) return ''
  if (/^max$/i.test(text)) return 'max reps'
  const replaced = text
    .replace(/\s*\/\s*side\b/i, ' each side')
    .replace(/\s*\/\s*leg\b/i, ' per leg')
    .replace(/\s*\/\s*arm\b/i, ' each arm')
  const already = /\b(side|leg|arm)s?\b/i.test(replaced)
  const suffix = already ? '' : setType === 'each_side' ? ' each side' : setType === 'per_leg' ? ' per leg' : ''
  if (/^\d+(?:\.\d+)?$/.test(replaced)) {
    const count = numText(Number(replaced))
    return `${count} ${count === '1' ? 'rep' : 'reps'}${suffix}`
  }
  return `${replaced}${suffix}`
}

function workPhrase(reps: string): string {
  const text = (reps ?? '').trim()
  if (!text || /^emom$/i.test(text)) return ''
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const count = numText(Number(text))
    return `${count} ${count === '1' ? 'rep' : 'reps'}`
  }
  return text
}

function figureCount(reps: string): string {
  const match = (reps ?? '').trim().match(/^(\d+(?:\.\d+)?)/)
  return match ? numText(Number(match[1])) : (reps ?? '').trim() || '—'
}

function roleFor(setType: SetType): FocusRole {
  switch (setType) {
    case 'time':
      return 'time_interval'
    case 'distance':
      return 'distance_set'
    case 'amrap':
      return 'amrap'
    case 'emom':
      return 'emom_interval'
    case 'for_time':
      return 'for_time'
    default:
      return 'strength_set'
  }
}

interface StepContext {
  unit: WeightUnit
  mobility: boolean
  note?: string
}

function makeStep(
  exercise: CueExercise,
  setType: SetType,
  name: string,
  planned: PlannedSet,
  setNumber: number,
  setCount: number,
  context: StepContext,
): FocusStep | null {
  if (setCount < 1) return null
  const role = planned.maxReps ? 'strength_set' : roleFor(setType)
  const loads = loadBits(planned, context.unit)
  const note = context.mobility ? undefined : noteForSet(context.note, setNumber)
  const rpe = context.mobility ? undefined : planned.rpe
  const rir = context.mobility ? undefined : planned.rir
  const intensity = setType === 'emom' || setType === 'time' || setType === 'for_time' ? effortLine(setType, rpe, rir, note) : undefined
  const heading = `Set ${setNumber} of ${setCount}`
  const id = ''
  if (role === 'amrap') {
    const cap = planned.durationSec && planned.durationSec > 0 ? planned.durationSec : null
    const spoken = cap ? spokenDuration(cap) : ''
    const effort = effortLine('time', rpe, rir, note) ?? ''
    return {
      id,
      role,
      setType,
      exerciseId: exercise.exerciseId,
      exerciseName: name,
      setNumber,
      setCount,
      headline: cap ? `AMRAP ${clockLabel(cap)}` : 'AMRAP',
      detail: cap ? 'As many as you can' : 'No time cap stored',
      workSec: cap,
      restSec: 0,
      figure: 'AMRAP',
      figureUnit: cap ? clockLabel(cap) : '',
      beforeWork: [`${name}.`, spoken ? `AMRAP, ${spoken}.` : 'AMRAP.', effort].filter(Boolean),
      countdown: true,
      startWord: 'Go',
      intensity: undefined,
      finish: cap ? "Time. That's the cap." : undefined,
      clock: cap ? 'countdown' : 'count_up',
      ...(cap ? { capSec: cap } : {}),
    }
  }
  if (role === 'for_time') {
    const metres = planned.distanceM && planned.distanceM > 0 ? planned.distanceM : null
    const cap = exercise.timeCapSec && exercise.timeCapSec > 0 ? exercise.timeCapSec : null
    const headline = metres ? `${displayDistance(metres)} for time` : 'For time'
    return {
      id,
      role,
      setType,
      exerciseId: exercise.exerciseId,
      exerciseName: name,
      setNumber,
      setCount,
      headline,
      detail: [setCount > 1 ? heading : '', cap ? `Cap ${clockLabel(cap)}` : '', 'Tap Done when finished'].filter(Boolean).join(' · '),
      workSec: null,
      restSec: planned.restSec,
      figure: '0:00',
      figureUnit: 'for time',
      beforeWork: [`${name}.`, setCount > 1 ? `${heading}.` : '', metres ? `${spokenDistance(metres)}.` : '', cap ? `Cap ${spokenDuration(cap)}.` : '', 'For time.'].filter(Boolean),
      countdown: true,
      startWord: 'Go',
      intensity,
      finish: undefined,
      clock: 'count_up',
      ...(cap ? { capSec: cap } : {}),
    }
  }
  if (role === 'emom_interval') {
    const interval = planned.durationSec && planned.durationSec > 0 ? planned.durationSec : 60
    const work = workPhrase(planned.reps)
    const spoken = spokenDuration(interval)
    const round = interval === 60 ? 'Minute' : 'Round'
    return {
      id,
      role,
      setType,
      exerciseId: exercise.exerciseId,
      exerciseName: name,
      setNumber,
      setCount,
      headline: (work || (interval === 60 ? 'Every minute' : `Every ${clockLabel(interval)}`)) + (loads.display ? ` @ ${loads.display}` : ''),
      detail: `${round} ${setNumber} of ${setCount}`,
      workSec: interval,
      restSec: 0,
      figure: String(setNumber),
      figureUnit: round.toLowerCase(),
      beforeWork: [`${name}.`, `${round} ${setNumber} of ${setCount}.`, spoken ? `Every ${spoken}.` : '', [work, loads.spoken].filter(Boolean).join(', ')].filter(Boolean),
      countdown: true,
      startWord: 'Go',
      intensity,
      finish: undefined,
      clock: 'countdown',
    }
  }
  if (role === 'time_interval') {
    const seconds = planned.durationSec && planned.durationSec > 0 ? planned.durationSec : null
    const spoken = seconds ? spokenDuration(seconds) : ''
    return {
      id,
      role,
      setType,
      exerciseId: exercise.exerciseId,
      exerciseName: name,
      setNumber,
      setCount,
      headline: spoken || 'Time',
      detail: heading,
      workSec: seconds,
      restSec: planned.restSec,
      figure: seconds ? clockLabel(seconds) : 'Time',
      figureUnit: '',
      beforeWork: [`${name}.`, `${heading}.`, spoken || 'Time.'].filter(Boolean),
      countdown: !context.mobility,
      startWord: 'Start',
      intensity,
      finish: seconds ? 'Time.' : undefined,
      clock: seconds ? 'countdown' : 'count_up',
    }
  }
  if (role === 'distance_set') {
    const metres = planned.distanceM && planned.distanceM > 0 ? planned.distanceM : null
    const spoken = [metres ? spokenDistance(metres) : 'Distance', loads.spoken].filter(Boolean).join(', ')
    const bits = targetBits(rpe, rir, note)
    return {
      id,
      role,
      setType,
      exerciseId: exercise.exerciseId,
      exerciseName: name,
      setNumber,
      setCount,
      headline: [metres ? displayDistance(metres) : 'Distance', loads.display].filter(Boolean).join(' · '),
      detail: heading,
      workSec: null,
      restSec: planned.restSec,
      figure: metres ? shortDistance(metres) : '—',
      figureUnit: metres ? distanceUnit(metres) : '',
      beforeWork: [`${name}.`, `${heading}.`, spoken, bits].filter((part): part is string => !!part),
      countdown: !context.mobility,
      startWord: 'Start',
      intensity: bits ? undefined : effortLine(setType, rpe, rir, note),
      clock: 'none',
    }
  }
  const reps = planned.maxReps ? 'max reps' : repPhrase(planned.reps, setType)
  const bits = targetBits(rpe, rir, note)
  const spoken = [reps, loads.spoken, bits].filter(Boolean)
  const display = [reps, loads.display, bits].filter(Boolean)
  return {
    id,
    role: 'strength_set',
    setType,
    exerciseId: exercise.exerciseId,
    exerciseName: name,
    setNumber,
    setCount,
    headline: display.join(' · ') || 'Set',
    detail: heading,
    workSec: null,
    restSec: planned.restSec,
    figure: planned.maxReps ? 'Max' : figureCount(planned.reps),
    figureUnit: setType === 'each_side' ? 'each side' : setType === 'per_leg' ? 'per leg' : 'reps',
    beforeWork: [`${name}.`, `${heading}.`, spoken.join(', ')].filter(Boolean),
    countdown: false,
    startWord: 'Start',
    clock: 'none',
  }
}

function splitSides(step: FocusStep): [FocusStep, FocusStep] {
  const rightId = `${step.id}-R`
  const tail = step.beforeWork.slice(1)
  return [
    {
      ...step,
      side: 'left',
      pairStepId: rightId,
      headline: `Left · ${step.headline}`,
      beforeWork: [step.beforeWork[0], ...tail, 'Left side.'].filter((line): line is string => !!line),
      finish: step.workSec == null ? 'Switch sides.' : 'Time. Switch sides.',
      restSec: 0,
    },
    {
      ...step,
      id: rightId,
      side: 'right',
      pairStepId: step.id,
      headline: `Right · ${step.headline}`,
      beforeWork: ['Right side.'],
    },
  ]
}

export function sessionToCue(exercise: SessionExercise): CueExercise {
  return {
    exerciseId: exercise.exerciseId,
    setType: exercise.setType,
    sets: exercise.sets.length || exercise.rounds || 1,
    reps: exercise.targetReps ?? '',
    restSec: exercise.restSec,
    targetLoadKg: exercise.targetLoadKg,
    targetPercent1RM: exercise.targetPercent1RM,
    targetRpe: exercise.targetRpe ?? exercise.schemes?.find((scheme) => scheme.targetRpe != null)?.targetRpe,
    targetRir: exercise.targetRir ?? exercise.schemes?.find((scheme) => readRir(scheme) != null)?.targetRir,
    schemes: exercise.schemes,
    timeCapSec: exercise.timeCapSec,
    emomIntervalSec: exercise.emomIntervalSec,
    rounds: exercise.rounds,
    distanceM: exercise.distanceM,
    notes: exercise.notes,
    loggedSets: exercise.sets,
    perSide: exercise.perSide,
    coachCue: exercise.coachCue,
    plannedExerciseId: exercise.plannedExerciseId,
  }
}

/** Expand a day's exercises into the Focus-mode step list, including sides and rest lines. */
export function buildFocusSteps(exercises: CueExercise[], names: Record<string, string>, unit: WeightUnit = 'kg', options: CueOptions = {}): FocusStep[] {
  const steps: FocusStep[] = []
  exercises.forEach((exercise, exerciseIndex) => {
    const setType = resolveSetType(exercise.setType, exercise.reps, exercise.timeCapSec)
    const name = names[exercise.exerciseId]?.trim() || 'Exercise'
    const context: StepContext = {
      unit: options.unit ?? unit,
      mobility: isMobility(exercise, name, options.exercises),
      note: athleteNote(exercise, options.exercises),
    }
    const perSide =
      (setType === 'time' || setType === 'distance') &&
      prescriptionIsPerSide({ perSide: exercise.perSide, reps: exercise.reps, setType })
    const planned = expandSets(exercise, setType).map((set) => resolveLoad(exercise, set, options, context.unit))
    planned.forEach((set, index) => {
      const step = makeStep(exercise, setType, name, set, index + 1, planned.length, context)
      if (!step) return
      step.id = `${exerciseIndex}-${exercise.exerciseId}-${index + 1}`
      if (perSide && step.role !== 'emom_interval') {
        const [left, right] = splitSides(step)
        steps.push(left, right)
      } else steps.push(step)
    })
  })
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    const next = steps[index + 1]
    const last = index === steps.length - 1
    if (!step) continue
    if (step.side === 'left') {
      step.restSec = 0
      step.restStart = undefined
      step.restWarning = undefined
      continue
    }
    if (last || step.restSec <= 0 || (step.role === 'amrap' && step.workSec != null) || step.role === 'emom_interval') {
      step.restSec = 0
      step.restStart = undefined
      step.restWarning = undefined
      continue
    }
    const spoken = spokenDuration(step.restSec)
    step.restStart = spoken ? `Rest. ${spoken}.` : 'Rest.'
    step.restWarning = next ? `Rest's up. Next, ${next.exerciseName}, set ${next.setNumber}.` : "Rest's up."
  }
  return steps
}

export { formatDistance }
