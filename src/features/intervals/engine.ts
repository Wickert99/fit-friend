/**
 * Guided heart-rate intervals.
 * Bristol Method is one entry in HR_INTERVALS. Another program is the same
 * shape: warm-up, optional rest, then N rounds of work and rest at a percent
 * of max heart rate. Add it to HR_INTERVALS and the session screen picks it up.
 */
import type { HrIntervalMark, HrIntervalState, LoggedSet, Profile, SessionExercise, WorkoutSession } from '../../types.ts'

export type MaxHrSource = 'manual' | 'whoop' | 'estimate'

export interface HrIntervalProgram {
  id: string
  title: string
  programIds: string[]
  namePattern: RegExp
  warmupSec: number
  /** Rest between the warm-up and round 1. Zero skips that phase. */
  warmupRestSec: number
  workSec: number
  restSec: number
  lowPct: number
  highPct: number
  defaultRounds: number
  minRounds: number
  maxRounds: number
  warmupDetail: string
  workDetail: string
  restDetail: string
  warmupExerciseId?: string
  workExerciseId?: string
}

export interface IntervalPhase {
  kind: 'warmup' | 'work' | 'rest'
  /** 1-based work round. Warm-up and the rest after it use 0. */
  round: number
  seconds: number
  title: string
  detail: string
  speak: string
}

export interface IntervalCue {
  kind: 'phase' | 'warn' | 'done'
  speak: string
}

export interface ResolvedMaxHr {
  bpm: number
  source: MaxHrSource
  /** Age the estimate used. Set only for source `estimate`. */
  ageUsed?: number
  /** True when the estimate used the default age because none is saved. */
  assumedAge: boolean
}

export interface HeartRatePatch {
  age?: number | null
  maxHeartRate?: number | null
}

export interface IntervalHistory {
  id: string
  status: string
  programId?: string
  name?: string
  completedAt?: string
  hrInterval?: HrIntervalState | null
}

export interface PhaseView {
  title: string
  detail: string
  clock: string
  zone: string
  next: string
  progress: number
  remainingSec: number
  warning: boolean
  promptRound: number | null
}

export interface RoundTally {
  yes: number
  no: number
  open: number
  allInRange: boolean
  nextRounds: number
  detail: string
}

/** Tanaka, Fox & Haskell (2001): 208 − 0.7 × age. */
export const DEFAULT_ESTIMATE_AGE = 30

export const HR_WATCH_NOTE =
  'Watch your HR on your Whoop app or a HR display; Fit Friend tells you the target and timing.'

export const BRISTOL_INTERVAL: HrIntervalProgram = {
  id: 'prog-bristol-method',
  title: 'Bristol Method',
  programIds: ['prog-bristol-method'],
  namePattern: /bristol method/i,
  warmupSec: 4 * 60,
  warmupRestSec: 60,
  workSec: 4 * 60,
  restSec: 60,
  lowPct: 80,
  highPct: 85,
  defaultRounds: 6,
  minRounds: 1,
  maxRounds: 12,
  warmupDetail: 'Easy',
  workDetail: 'Hold the band',
  restDetail: 'Off the bike',
  warmupExerciseId: 'ex-airbike-steady',
  workExerciseId: 'ex-biker',
}

export const HR_INTERVALS: HrIntervalProgram[] = [BRISTOL_INTERVAL]

export function matchHrInterval(session: { programId?: string; name?: string }): HrIntervalProgram | null {
  return (
    HR_INTERVALS.find(
      (program) => program.programIds.includes(session.programId ?? '') || program.namePattern.test(session.name ?? ''),
    ) ?? null
  )
}

export function clampRounds(program: HrIntervalProgram, rounds: number): number {
  if (!Number.isFinite(rounds)) return program.defaultRounds
  return Math.min(program.maxRounds, Math.max(program.minRounds, Math.round(rounds)))
}

export function percentBpm(maxHr: number, percent: number): number {
  return Math.round((maxHr * percent) / 100)
}

export function zoneRange(maxHr: number, lowPct: number, highPct: number): { low: number; high: number } {
  return { low: percentBpm(maxHr, lowPct), high: percentBpm(maxHr, highPct) }
}

export function formatZone(maxHr: number, lowPct: number, highPct: number): string {
  const zone = zoneRange(maxHr, lowPct, highPct)
  return `${lowPct}\u2013${highPct}% = ${zone.low}\u2013${zone.high} bpm`
}

export function spokenZone(maxHr: number, lowPct: number, highPct: number): string {
  const zone = zoneRange(maxHr, lowPct, highPct)
  return `${zone.low} to ${zone.high} bpm`
}

export function tanakaMaxHr(age: number): number {
  return Math.round(208 - 0.7 * age)
}

function usableBpm(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 100 && value <= 230
}

function usableAge(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 8 && value <= 100
}

export function resolveMaxHr(input: { manual?: number | null; whoop?: number | null; age?: number | null }): ResolvedMaxHr {
  if (usableBpm(input.manual)) return { bpm: Math.round(input.manual), source: 'manual', assumedAge: false }
  if (usableBpm(input.whoop)) return { bpm: Math.round(input.whoop), source: 'whoop', assumedAge: false }
  const assumedAge = !usableAge(input.age)
  const age = assumedAge ? DEFAULT_ESTIMATE_AGE : Math.round(input.age as number)
  return { bpm: tanakaMaxHr(age), source: 'estimate', ageUsed: age, assumedAge }
}

export function resolveProfileMaxHr(profile: Pick<Profile, 'age' | 'maxHeartRate' | 'whoopMaxHeartRate'>): ResolvedMaxHr {
  return resolveMaxHr({ manual: profile.maxHeartRate, whoop: profile.whoopMaxHeartRate, age: profile.age })
}

export function maxHrCaption(resolved: ResolvedMaxHr): string {
  if (resolved.source === 'manual') return `Max HR ${resolved.bpm} bpm, saved in your profile`
  if (resolved.source === 'whoop') return `Max HR ${resolved.bpm} bpm, from Whoop`
  if (resolved.assumedAge) {
    return `Max HR ${resolved.bpm} bpm, estimated from age ${resolved.ageUsed} until you set age or max HR (208 \u2212 0.7 \u00d7 age)`
  }
  return `Max HR ${resolved.bpm} bpm, estimated as 208 \u2212 0.7 \u00d7 age ${resolved.ageUsed}`
}

export function patchProfileHr(profile: Profile, patch: HeartRatePatch): Profile {
  const next: Profile = { ...profile }
  if ('age' in patch) {
    if (patch.age == null) delete next.age
    else next.age = patch.age
  }
  if ('maxHeartRate' in patch) {
    if (patch.maxHeartRate == null) delete next.maxHeartRate
    else next.maxHeartRate = patch.maxHeartRate
  }
  return next
}

function speakDuration(seconds: number): string {
  if (seconds > 0 && seconds % 60 === 0) {
    const minutes = seconds / 60
    return minutes === 1 ? '1 minute' : `${minutes} minutes`
  }
  return seconds === 1 ? '1 second' : `${seconds} seconds`
}

export function formatClock(totalSeconds: number): string {
  const sec = Math.max(0, Math.ceil(totalSeconds))
  const minutes = Math.floor(sec / 60)
  const seconds = sec % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function buildPhases(program: HrIntervalProgram, rounds: number, zoneSpeak = ''): IntervalPhase[] {
  const count = clampRounds(program, rounds)
  const phases: IntervalPhase[] = []
  if (program.warmupSec > 0) {
    phases.push({
      kind: 'warmup',
      round: 0,
      seconds: program.warmupSec,
      title: 'Warm-up',
      detail: program.warmupDetail,
      speak: `Warm-up. ${program.warmupDetail} for ${speakDuration(program.warmupSec)}.`,
    })
  }
  if (program.warmupRestSec > 0) {
    phases.push({
      kind: 'rest',
      round: 0,
      seconds: program.warmupRestSec,
      title: 'Rest',
      detail: program.restDetail,
      speak: `Rest. ${program.restDetail}.`,
    })
  }
  for (let round = 1; round <= count; round++) {
    if (program.workSec > 0) {
      const zone = zoneSpeak ? ` ${zoneSpeak}.` : ''
      phases.push({
        kind: 'work',
        round,
        seconds: program.workSec,
        title: `Work round ${round} of ${count}`,
        detail: program.workDetail,
        speak: `Work. Round ${round} of ${count}.${zone}`,
      })
    }
    if (program.restSec > 0) {
      phases.push({
        kind: 'rest',
        round,
        seconds: program.restSec,
        title: 'Rest',
        detail: program.restDetail,
        speak: `Rest. ${program.restDetail}.`,
      })
    }
  }
  return phases
}

export function structureLine(program: HrIntervalProgram, rounds: number): string {
  const count = clampRounds(program, rounds)
  const warm = `${formatClock(program.warmupSec)} easy`
  const afterWarm = program.warmupRestSec > 0 ? `, ${formatClock(program.warmupRestSec)} off` : ''
  return `${warm}${afterWarm}, then ${count} \u00d7 ${formatClock(program.workSec)} work and ${formatClock(program.restSec)} off`
}

export function sessionLengthSec(program: HrIntervalProgram, rounds: number): number {
  return buildPhases(program, rounds).reduce((sum, phase) => sum + phase.seconds, 0)
}

function zoneFor(state: HrIntervalState): string {
  if (state.maxHr == null) return ''
  return spokenZone(state.maxHr, state.lowPct, state.highPct)
}

export function tickInterval(state: HrIntervalState, program: HrIntervalProgram, now: number): { state: HrIntervalState; cues: IntervalCue[] } {
  if (state.run !== 'live' || state.endsAt == null) return { state, cues: [] }
  const phases = buildPhases(program, state.rounds, zoneFor(state))
  let phaseIndex = state.phaseIndex
  let endsAt = state.endsAt
  let warned = state.warned === true
  let phaseSpeak: string | null = null

  for (let step = 0; step <= phases.length + 1; step++) {
    const phase = phases[phaseIndex]
    if (!phase) {
      return {
        state: doneState(state, phases.length),
        cues: [{ kind: 'done', speak: 'Session complete.' }],
      }
    }
    const remaining = Math.ceil((endsAt - now) / 1000)
    if (remaining > 0) {
      const cues: IntervalCue[] = []
      if (phaseSpeak) cues.push({ kind: 'phase', speak: phaseSpeak })
      let nextWarned = warned
      if (!warned && remaining <= 10 && remaining < phase.seconds) {
        nextWarned = true
        cues.push({ kind: 'warn', speak: '10 seconds.' })
      }
      if (phaseIndex === state.phaseIndex && endsAt === state.endsAt && nextWarned === (state.warned === true) && cues.length === 0) {
        return { state, cues: [] }
      }
      return { state: { ...state, phaseIndex, endsAt, warned: nextWarned }, cues }
    }
    phaseIndex += 1
    const upcoming = phases[phaseIndex]
    if (!upcoming) {
      return {
        state: doneState(state, phases.length),
        cues: [{ kind: 'done', speak: 'Session complete.' }],
      }
    }
    endsAt += upcoming.seconds * 1000
    warned = false
    phaseSpeak = upcoming.speak
  }

  return {
    state: doneState(state, phases.length),
    cues: [{ kind: 'done', speak: 'Session complete.' }],
  }
}

function doneState(state: HrIntervalState, phaseCount: number): HrIntervalState {
  const next: HrIntervalState = { ...state, run: 'done', phaseIndex: phaseCount, warned: false }
  delete next.endsAt
  delete next.remainingSec
  return next
}

export function remainingSeconds(state: HrIntervalState, now: number): number {
  if (state.run === 'done') return 0
  if (state.endsAt != null) return Math.max(0, Math.ceil((state.endsAt - now) / 1000))
  if (state.remainingSec != null) return Math.max(0, state.remainingSec)
  return 0
}

export function phaseView(program: HrIntervalProgram, state: HrIntervalState, now: number): PhaseView {
  const speak = state.maxHr != null ? spokenZone(state.maxHr, state.lowPct, state.highPct) : ''
  const phases = buildPhases(program, state.rounds, speak)
  const zone = state.maxHr != null ? formatZone(state.maxHr, state.lowPct, state.highPct) : formatZone(resolveMaxHr({}).bpm, program.lowPct, program.highPct)
  if (state.run === 'done' || state.phaseIndex >= phases.length) {
    return {
      title: 'Done',
      detail: 'Session complete',
      clock: '0:00',
      zone,
      next: 'Next: Done',
      progress: 1,
      remainingSec: 0,
      warning: false,
      promptRound: null,
    }
  }
  const phase = phases[state.phaseIndex]
  const remaining = remainingSeconds(state, now)
  const next = nextLine(phases[state.phaseIndex + 1])
  const mark = state.marks.find((item) => item.round === phase?.round)
  const promptRound = phase?.kind === 'rest' && phase.round > 0 && !mark ? phase.round : null
  return {
    title: phase?.title ?? 'Done',
    detail: phase?.detail ?? '',
    clock: formatClock(remaining),
    zone,
    next,
    progress: progressFraction(phases, state.phaseIndex, remaining),
    remainingSec: remaining,
    warning: !!phase && phase.seconds > 10 && remaining > 0 && remaining <= 10,
    promptRound,
  }
}

function nextLine(phase: IntervalPhase | undefined): string {
  if (!phase) return 'Next: Done'
  if (phase.kind === 'warmup') return `Next: Warm-up \u00b7 ${formatClock(phase.seconds)} easy`
  if (phase.kind === 'work') return `Next: ${phase.title} \u00b7 ${formatClock(phase.seconds)}`
  return `Next: Rest \u00b7 ${formatClock(phase.seconds)} off the bike`
}

function progressFraction(phases: IntervalPhase[], phaseIndex: number, remainingSec: number): number {
  const total = phases.reduce((sum, phase) => sum + phase.seconds, 0)
  if (total <= 0) return 0
  let elapsed = 0
  for (let index = 0; index < phaseIndex && index < phases.length; index++) elapsed += phases[index]?.seconds ?? 0
  const current = phases[phaseIndex]
  if (current) elapsed += Math.min(current.seconds, Math.max(0, current.seconds - remainingSec))
  return Math.min(1, Math.max(0, elapsed / total))
}

export function setupInterval(program: HrIntervalProgram, rounds: number): HrIntervalState {
  return {
    programId: program.id,
    rounds: clampRounds(program, rounds),
    lowPct: program.lowPct,
    highPct: program.highPct,
    phaseIndex: 0,
    run: 'setup',
    marks: [],
  }
}

export function startInterval(session: WorkoutSession, program: HrIntervalProgram, rounds: number, max: ResolvedMaxHr, now: number): WorkoutSession {
  const count = clampRounds(program, rounds)
  const phases = buildPhases(program, count, spokenZone(max.bpm, program.lowPct, program.highPct))
  const first = phases[0]
  const hrInterval: HrIntervalState = {
    programId: program.id,
    rounds: count,
    maxHr: max.bpm,
    source: max.source,
    lowPct: program.lowPct,
    highPct: program.highPct,
    phaseIndex: 0,
    endsAt: now + (first?.seconds ?? 0) * 1000,
    run: 'live',
    marks: [],
    warned: false,
  }
  return { ...fitWorkSets(session, program, count), hrInterval }
}

export function markInRange(state: HrIntervalState, round: number, inRange: boolean): HrIntervalState {
  const marks = state.marks.filter((mark) => mark.round !== round)
  marks.push({ round, inRange })
  marks.sort((a, b) => a.round - b.round)
  return { ...state, marks }
}

/** Freeze the countdown the screen is showing, even if the wall clock has moved on. */
export function pinVisibleRemaining(state: HrIntervalState, remainingSec: number): HrIntervalState {
  if (state.run !== 'live') return state
  const next: HrIntervalState = { ...state, remainingSec: Math.max(0, Math.ceil(remainingSec)) }
  delete next.endsAt
  return next
}

export function freezeHrInterval(state: HrIntervalState | null | undefined, now: number): HrIntervalState | null | undefined {
  if (state == null) return state
  if (state.run !== 'live' || state.endsAt == null) return state
  const remainingSec = Math.max(0, Math.ceil((state.endsAt - now) / 1000))
  const next: HrIntervalState = { ...state, remainingSec }
  delete next.endsAt
  return next
}

export function thawHrInterval(state: HrIntervalState, now: number): HrIntervalState {
  if (state.run !== 'live' || state.remainingSec == null || state.endsAt != null) return state
  const next: HrIntervalState = { ...state, endsAt: now + Math.max(0, state.remainingSec) * 1000 }
  delete next.remainingSec
  return next
}

export function tallyMarks(marks: HrIntervalMark[], rounds: number): { yes: number; no: number; open: number } {
  let yes = 0
  let no = 0
  for (let round = 1; round <= rounds; round++) {
    const mark = marks.find((item) => item.round === round)
    if (!mark) continue
    if (mark.inRange) yes += 1
    else no += 1
  }
  return { yes, no, open: Math.max(0, rounds - yes - no) }
}

export function resultCopy(rounds: number, marks: HrIntervalMark[], program: HrIntervalProgram): RoundTally {
  const count = clampRounds(program, rounds)
  const tally = tallyMarks(marks, count)
  const allInRange = tally.open === 0 && tally.no === 0 && tally.yes === count && count > 0
  const nextRounds = allInRange ? Math.min(program.maxRounds, count + 1) : count
  let detail: string
  if (allInRange && count >= program.maxRounds) {
    detail = `All ${count} rounds stayed in range. That's the top of this build.`
  } else if (allInRange) {
    detail = `All ${count} rounds stayed in range. Next time, try ${nextRounds}.`
  } else if (tally.no > 0) {
    detail = `A round was outside the band, so the next session stays at ${count} rounds.`
  } else {
    detail = `Mark every work round in range to add a round next time. Next session stays at ${count} until then.`
  }
  return { ...tally, allInRange, nextRounds: allInRange && count >= program.maxRounds ? count : nextRounds, detail }
}

export function recommendedRounds(
  sessions: IntervalHistory[],
  program: HrIntervalProgram,
  excludeId?: string,
): { rounds: number; detail: string | null } {
  const previous = [...sessions]
    .filter((session) => session.id !== excludeId && session.status === 'completed' && matchHrInterval(session)?.id === program.id)
    .filter((session) => session.hrInterval && session.hrInterval.rounds > 0)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0]
  if (!previous?.hrInterval) return { rounds: program.defaultRounds, detail: null }
  const copy = resultCopy(previous.hrInterval.rounds, previous.hrInterval.marks ?? [], program)
  if (copy.allInRange && copy.nextRounds > previous.hrInterval.rounds) {
    return {
      rounds: copy.nextRounds,
      detail: `Last time every round stayed in range. This one starts at ${copy.nextRounds} rounds.`,
    }
  }
  if (copy.allInRange) {
    return { rounds: copy.nextRounds, detail: `Last time you held all ${previous.hrInterval.rounds} rounds. This one starts there.` }
  }
  return {
    rounds: clampRounds(program, previous.hrInterval.rounds),
    detail: `Last session stays at ${clampRounds(program, previous.hrInterval.rounds)} rounds until every round is in range.`,
  }
}

export function firstPhaseSpeak(program: HrIntervalProgram, rounds: number, max: ResolvedMaxHr): string {
  const phases = buildPhases(program, rounds, spokenZone(max.bpm, program.lowPct, program.highPct))
  return phases[0]?.speak ?? 'Start.'
}

function fitWorkSets(session: WorkoutSession, program: HrIntervalProgram, rounds: number): WorkoutSession {
  if (!program.workExerciseId) return session
  return {
    ...session,
    exercises: session.exercises.map((exercise) => {
      if (exercise.exerciseId !== program.workExerciseId) return exercise
      return { ...exercise, sets: resizeSets(exercise.sets, rounds, program) }
    }),
  }
}

function resizeSets(sets: LoggedSet[], rounds: number, program: HrIntervalProgram): LoggedSet[] {
  const template = sets[0]
  const next: LoggedSet[] = []
  for (let index = 0; index < rounds; index++) {
    const existing = sets[index]
    if (existing) {
      next.push({ ...existing, setNumber: index + 1, durationSec: program.workSec, restSec: program.restSec })
    } else {
      next.push({
        setNumber: index + 1,
        reps: template?.reps ?? 0,
        loadKg: template?.loadKg ?? 0,
        completed: false,
        done: false,
        durationSec: program.workSec,
        restSec: program.restSec,
      })
    }
  }
  return next
}

export function applyIntervalProgress(session: WorkoutSession, program: HrIntervalProgram, next: HrIntervalState, now = Date.now()): WorkoutSession {
  const before = next.run === 'done' ? Number.POSITIVE_INFINITY : next.phaseIndex
  return {
    ...session,
    hrInterval: next,
    exercises: completePassedPhases(session.exercises, program, next.rounds, before, new Date(now).toISOString()),
  }
}

function completePassedPhases(
  exercises: SessionExercise[],
  program: HrIntervalProgram,
  rounds: number,
  beforeIndex: number,
  nowIso: string,
): SessionExercise[] {
  const phases = buildPhases(program, rounds)
  let warmupDone = false
  const workDone = new Set<number>()
  phases.forEach((phase, index) => {
    if (index >= beforeIndex) return
    if (phase.kind === 'warmup') warmupDone = true
    if (phase.kind === 'work') workDone.add(phase.round)
  })
  return exercises.map((exercise) => {
    if (warmupDone && program.warmupExerciseId && exercise.exerciseId === program.warmupExerciseId) {
      return {
        ...exercise,
        sets: exercise.sets.map((set, index) => (index === 0 ? completeSet(set, program.warmupSec, nowIso) : set)),
      }
    }
    if (program.workExerciseId && exercise.exerciseId === program.workExerciseId) {
      return {
        ...exercise,
        sets: exercise.sets.map((set) => (workDone.has(set.setNumber) ? completeSet(set, program.workSec, nowIso) : set)),
      }
    }
    return exercise
  })
}

function completeSet(set: LoggedSet, durationSec: number, nowIso: string): LoggedSet {
  if (set.completed) return set
  return { ...set, completed: true, done: true, durationSec: set.durationSec && set.durationSec > 0 ? set.durationSec : durationSec, loggedAt: nowIso }
}
