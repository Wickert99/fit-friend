import type {
  ActivityEntry,
  AppState,
  Exercise,
  LiftFamily,
  LiftMax,
  LoggedSet,
  PersonalRecord,
  PlannedSession,
  Prescription,
  Program,
  ProgramDay,
  SessionExercise,
  SessionTimer,
  SetType,
  WeightUnit,
  WorkoutSession,
} from '../../types.ts'
import { createId, todayKey } from '../../store/id.ts'
import {
  freshScheme,
  parseDistanceM,
  parseDurationSec,
  parseForTimeDistance,
  parseLeadingCount,
  prescriptionIsPerSide,
  readPercent,
  readRir,
  readSchemes,
  resolveSetType,
} from '../../lib/setTypes/index.ts'
import { deleteLoggedSession } from '../../lib/cycles/schedule.ts'
import { estimate1Rm, roundLoadKg } from '../../lib/setTypes/units.ts'
import { familyIdFor, familyName, resolveMax } from './families.ts'

export interface SetPointer {
  exerciseIndex: number
  setIndex: number
}

export interface SetPatch {
  reps?: number
  loadKg?: number
  rpe?: number | null
  durationSec?: number
  distanceM?: number
  rounds?: number
}

export interface TrainingContext {
  exercises: Exercise[]
  liftMaxes: Record<string, LiftMax>
  weightUnit: WeightUnit
  families: LiftFamily[]
  aliases?: Record<string, string>
}

const WARMUP = /\b(warm[- ]?up|ramp(ing)?|activation)\b/i
const MAX_REPS = /\bmax\b|amrap|as many/i
const STRENGTH_TYPES = new Set<SetType>(['reps_load', 'each_side', 'per_leg'])
const VOLUME_TYPES = new Set<SetType>(['reps_load', 'each_side', 'per_leg', 'amrap', 'emom'])

export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function streakFrom(days: string[], now = new Date()): number {
  let streak = 0
  for (let offset = 0; offset < 60; offset++) {
    const date = new Date(now)
    date.setDate(date.getDate() - offset)
    const key = todayKey(date)
    if (days.includes(key)) streak += 1
    else if (offset > 0) break
  }
  return streak
}

export function blankPlanned(dateKey: string, name = 'Workout', id = createId('plan')): PlannedSession {
  return {
    id,
    dateKey,
    name,
    focus: 'Strength',
    updatedAt: new Date().toISOString(),
    exercises: [],
  }
}

export function plannedFromProgramDay(
  dateKey: string,
  program: Program,
  day: ProgramDay,
  weekIndex?: number,
  id = createId('plan'),
): PlannedSession {
  const session: PlannedSession = {
    id,
    dateKey,
    name: day.name,
    focus: day.focus || program.theme,
    programId: program.id,
    programDayId: day.id,
    programName: program.name,
    sessionPad: day.sessionPad,
    updatedAt: new Date().toISOString(),
    exercises: day.exercises.map((exercise) => ({
      ...exercise,
      id: exercise.id ?? createId('pe'),
      setType: exercise.setType ?? resolveSetType(undefined, exercise.reps),
    })),
  }
  if (weekIndex != null) session.weekIndex = weekIndex
  return session
}

export function findProgramDay(state: AppState, dateKey: string): { program: Program; day: ProgramDay } | null {
  const dayId = state.scheduled[dateKey]
  if (!dayId) return null
  for (const program of state.programs) {
    const day = program.days.find((item) => item.id === dayId)
    if (day) return { program, day }
  }
  return null
}

function defaultReps(setType: SetType, reps?: string): number {
  switch (setType) {
    case 'time':
    case 'distance':
    case 'for_time':
      return 0
    case 'emom':
      return parseLeadingCount(reps, 5)
    case 'amrap':
      return 0
    default:
      return MAX_REPS.test(reps ?? '') ? 0 : parseLeadingCount(reps, 8)
  }
}

function loggedSet(setNumber: number, repsText: string, setType: SetType, loadKg: number, restSec: number | undefined, percent: number | undefined, duration: number | undefined, distance: number | undefined, amrapCap: boolean): LoggedSet {
  return {
    setNumber,
    reps: defaultReps(setType, repsText),
    loadKg,
    completed: false,
    ...(duration && duration > 0 ? { durationSec: duration } : {}),
    ...(distance && distance > 0 ? { distanceM: distance } : {}),
    ...(amrapCap ? { rounds: 0 } : {}),
    ...(restSec != null ? { restSec } : {}),
    ...(percent != null ? { targetPercent1RM: percent } : {}),
  }
}

export function sessionExerciseFromPrescription(prescription: Prescription, ctx: TrainingContext): SessionExercise {
  const setType = resolveSetType(prescription.setType, prescription.reps, prescription.timeCapSec)
  const perSide = prescriptionIsPerSide({ ...prescription, setType })
  const cap = setType === 'amrap' ? (prescription.timeCapSec ?? parseDurationSec(prescription.reps, 0)) : 0
  const stored = readSchemes(prescription)
  const schemes =
    stored && stored.length > 0
      ? stored
      : [
          freshScheme({
            sets: setType === 'amrap' && cap > 0 ? 1 : setType === 'emom' ? (prescription.rounds ?? prescription.sets) : prescription.sets,
            reps: prescription.reps,
            restSec: prescription.restSec,
            targetLoadKg: prescription.targetLoadKg,
            targetPercent1RM: readPercent(prescription),
            targetRpe: prescription.targetRpe,
            targetRir: readRir(prescription),
          }),
        ]
  const sets: LoggedSet[] = []
  let number = 1
  for (const scheme of schemes) {
    const count = Math.max(1, scheme.sets)
    const reps = scheme.reps || prescription.reps
    let duration: number | undefined
    if (setType === 'time') {
      const seconds = prescription.timeCapSec ?? parseDurationSec(reps, 0)
      duration = seconds > 0 ? seconds : undefined
    }
    let distance: number | undefined
    if (setType === 'distance') distance = prescription.distanceM ?? parseDistanceM(reps, 40)
    if (setType === 'for_time') {
      const metres = prescription.distanceM ?? parseForTimeDistance(reps)
      distance = metres > 0 ? metres : undefined
    }
    let load = scheme.targetLoadKg ?? prescription.targetLoadKg ?? 0
    const percent = readPercent(scheme) ?? readPercent(prescription)
    if (percent != null && percent > 0) {
      const max = resolveMax(prescription.exerciseId, ctx.liftMaxes, ctx.families, ctx.aliases)
      if (max) load = percentToResolved(percent, max.maxKg, ctx.weightUnit)
    }
    for (let index = 0; index < count; index++) {
      sets.push(
        loggedSet(number++, reps, setType, load, scheme.restSec, percent, duration, distance, setType === 'amrap' && cap > 0),
      )
    }
  }
  const first = schemes[0]
  let targetLoad = first?.targetLoadKg ?? prescription.targetLoadKg
  const targetPercent = readPercent(first ?? {}) ?? readPercent(prescription)
  if (targetPercent != null && targetPercent > 0) {
    const max = resolveMax(prescription.exerciseId, ctx.liftMaxes, ctx.families, ctx.aliases)
    if (max) targetLoad = percentToResolved(targetPercent, max.maxKg, ctx.weightUnit)
  }
  const exercise = ctx.exercises.find((item) => item.id === prescription.exerciseId)
  const block: SessionExercise = {
    exerciseId: prescription.exerciseId,
    setType,
    sets,
    notes: prescription.notes,
    restSec: first?.restSec ?? prescription.restSec,
    timeCapSec: prescription.timeCapSec,
    emomIntervalSec: prescription.emomIntervalSec,
    rounds: prescription.rounds,
    distanceM: prescription.distanceM ?? (setType === 'for_time' ? sets[0]?.distanceM : undefined),
    targetReps: prescription.reps,
    targetLoadKg: targetLoad,
    targetPercent1RM: targetPercent,
    schemes: readSchemes(prescription),
    targetRpe: first?.targetRpe ?? prescription.targetRpe,
    targetRir: readRir(first ?? {}) ?? readRir(prescription),
    plannedExerciseId: prescription.id,
  }
  if (perSide) block.perSide = true
  const cue = exercise?.cues[0]
  if (cue) block.coachCue = cue
  return block
}

function percentToResolved(percent: number, maxKg: number, unit: WeightUnit): number {
  return roundLoadKg((percent / 100) * maxKg, unit)
}

export function buildSession(plan: PlannedSession, ctx: TrainingContext, id = createId('ses'), now = new Date()): WorkoutSession {
  const exercises = plan.exercises.map((exercise) => sessionExerciseFromPrescription(exercise, ctx))
  return {
    id,
    programId: plan.programId,
    programDayId: plan.programDayId,
    plannedSessionId: plan.id,
    dateKey: plan.dateKey,
    name: plan.name,
    focus: plan.focus,
    sessionPad: plan.sessionPad,
    pad: plan.sessionPad,
    startedAt: now.toISOString(),
    status: 'in_progress',
    exercises,
    currentSet: exercises.length > 0 ? { exerciseIndex: 0, setIndex: 0 } : undefined,
  }
}

function samePointer(a: SetPointer | null | undefined, b: SetPointer | null | undefined): boolean {
  return !!a && !!b && a.exerciseIndex === b.exerciseIndex && a.setIndex === b.setIndex
}

export function pointerValid(session: WorkoutSession, pointer: SetPointer | null | undefined): pointer is SetPointer {
  if (!pointer) return false
  const exercise = session.exercises[pointer.exerciseIndex]
  return !!exercise && pointer.setIndex >= 0 && pointer.setIndex < exercise.sets.length
}

export function setAt(session: WorkoutSession, pointer: SetPointer | null | undefined): LoggedSet | undefined {
  if (!pointerValid(session, pointer)) return undefined
  return session.exercises[pointer.exerciseIndex]?.sets[pointer.setIndex]
}

function allPointers(session: WorkoutSession): SetPointer[] {
  const pointers: SetPointer[] = []
  session.exercises.forEach((exercise, exerciseIndex) => {
    exercise.sets.forEach((_set, setIndex) => pointers.push({ exerciseIndex, setIndex }))
  })
  return pointers
}

export function nextOpen(session: WorkoutSession, after?: SetPointer | null): SetPointer | null {
  const pointers = allPointers(session)
  if (pointers.length === 0) return null
  const start = after ? pointers.findIndex((pointer) => samePointer(pointer, after)) : -1
  for (let step = 1; step <= pointers.length; step++) {
    const pointer = pointers[(start + step + pointers.length) % pointers.length]
    if (pointer && !setAt(session, pointer)?.completed) return pointer
  }
  return null
}

export function displayPointer(session: WorkoutSession): SetPointer | null {
  const current = session.currentSet
  if (pointerValid(session, current) && !setAt(session, current)?.completed) return { ...current }
  if (pointerValid(session, current)) return nextOpen(session, current)
  return nextOpen(session, null)
}

export function sessionCounts(session: WorkoutSession): { planned: number; done: number } {
  const sets = session.exercises.flatMap((exercise) => exercise.sets)
  return { planned: sets.length, done: sets.filter((set) => set.completed).length }
}

function mapSet(session: WorkoutSession, pointer: SetPointer, recipe: (set: LoggedSet) => LoggedSet): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((exercise, exerciseIndex) =>
      exerciseIndex === pointer.exerciseIndex
        ? { ...exercise, sets: exercise.sets.map((set, setIndex) => (setIndex === pointer.setIndex ? recipe(set) : set)) }
        : exercise,
    ),
  }
}

function applyPatch(set: LoggedSet, patch: SetPatch): LoggedSet {
  const next = { ...set }
  if (patch.reps != null && Number.isFinite(patch.reps)) next.reps = Math.max(0, Math.round(patch.reps))
  if (patch.loadKg != null && Number.isFinite(patch.loadKg)) next.loadKg = Math.max(0, patch.loadKg)
  if (patch.rpe === null) delete next.rpe
  else if (patch.rpe != null && Number.isFinite(patch.rpe)) next.rpe = Math.min(10, Math.max(1, patch.rpe))
  if (patch.durationSec != null && Number.isFinite(patch.durationSec)) next.durationSec = Math.max(0, Math.round(patch.durationSec))
  if (patch.distanceM != null && Number.isFinite(patch.distanceM)) next.distanceM = Math.max(0, patch.distanceM)
  if (patch.rounds != null && Number.isFinite(patch.rounds)) next.rounds = Math.max(0, Math.round(patch.rounds))
  return next
}

export function logSet(session: WorkoutSession, pointer: SetPointer, patch: SetPatch = {}, advance = true, now = new Date()): WorkoutSession {
  if (!pointerValid(session, pointer)) return session
  const updated = mapSet(session, pointer, (set) => ({
    ...applyPatch(set, patch),
    completed: true,
    done: true,
    loggedAt: now.toISOString(),
  }))
  return { ...updated, currentSet: advance ? (nextOpen(updated, pointer) ?? undefined) : { ...pointer } }
}

export function editSet(session: WorkoutSession, pointer: SetPointer, patch: SetPatch): WorkoutSession {
  if (!pointerValid(session, pointer)) return session
  return mapSet(session, pointer, (set) => applyPatch(set, patch))
}

export function undoSet(session: WorkoutSession, pointer: SetPointer): WorkoutSession {
  if (!pointerValid(session, pointer)) return session
  const updated = mapSet(session, pointer, (set) => {
    const { loggedAt: _logged, ...rest } = set
    return { ...rest, completed: false, done: false }
  })
  return { ...updated, currentSet: { ...pointer } }
}

function freshLogged(exercise: SessionExercise, setNumber: number): LoggedSet {
  const setType = resolveSetType(exercise.setType, exercise.targetReps, exercise.timeCapSec)
  const duration = (setType === 'time' && (parseDurationSec(exercise.targetReps, 0) || exercise.timeCapSec)) || 0
  const distance =
    setType === 'distance'
      ? (exercise.distanceM ?? parseDistanceM(exercise.targetReps, 40))
      : setType === 'for_time'
        ? (exercise.distanceM ?? parseForTimeDistance(exercise.targetReps))
        : 0
  return {
    setNumber,
    reps: defaultReps(setType, exercise.targetReps),
    loadKg: exercise.targetLoadKg ?? 0,
    completed: false,
    ...(duration > 0 ? { durationSec: duration } : {}),
    ...(distance > 0 ? { distanceM: distance } : {}),
    ...(setType === 'amrap' && exercise.timeCapSec ? { rounds: 0 } : {}),
    ...(exercise.restSec != null ? { restSec: exercise.restSec } : {}),
  }
}

export function addSet(session: WorkoutSession, exerciseIndex: number): WorkoutSession {
  const exercise = session.exercises[exerciseIndex]
  if (!exercise) return session
  const last = exercise.sets[exercise.sets.length - 1]
  const setNumber = exercise.sets.length + 1
  let next: LoggedSet
  if (last) {
    const { loggedAt: _logged, rpe: _rpe, ...rest } = last
    next = { ...rest, setNumber, completed: false, done: false }
  } else next = freshLogged(exercise, setNumber)
  return {
    ...session,
    exercises: session.exercises.map((item, index) => (index === exerciseIndex ? { ...item, sets: [...item.sets, next] } : item)),
  }
}

export function removeLastSet(session: WorkoutSession, exerciseIndex: number): WorkoutSession {
  const exercise = session.exercises[exerciseIndex]
  if (!exercise || exercise.sets.length === 0) return session
  const updated: WorkoutSession = {
    ...session,
    exercises: session.exercises.map((item, index) =>
      index === exerciseIndex ? { ...item, sets: item.sets.slice(0, -1) } : item,
    ),
  }
  if (!pointerValid(updated, updated.currentSet)) return { ...updated, currentSet: displayPointer(updated) ?? undefined }
  return updated
}

export function changeSetType(session: WorkoutSession, exerciseIndex: number, setType: SetType): WorkoutSession {
  const exercise = session.exercises[exerciseIndex]
  if (!exercise || exercise.setType === setType) return session
  const next: SessionExercise = { ...exercise, setType }
  if (prescriptionIsPerSide({ reps: exercise.targetReps, setType })) next.perSide = true
  else delete next.perSide
  next.sets = exercise.sets.map((set, index) => {
    if (set.completed) return set
    const seeded = freshLogged(next, index + 1)
    return {
      ...seeded,
      setNumber: set.setNumber,
      loadKg: set.loadKg || seeded.loadKg,
      restSec: set.restSec ?? seeded.restSec,
      targetPercent1RM: set.targetPercent1RM,
    }
  })
  return { ...session, exercises: session.exercises.map((item, index) => (index === exerciseIndex ? next : item)) }
}

function isWarmup(set: LoggedSet, exercise: SessionExercise): boolean {
  if (set.isWarmup != null) return set.isWarmup
  return !!(exercise.notes && WARMUP.test(exercise.notes))
}

export function countsForEstimate(exercise: SessionExercise, set: LoggedSet, maxReps = 12): boolean {
  const setType = exercise.setType ?? 'reps_load'
  return STRENGTH_TYPES.has(setType) && set.completed && !isWarmup(set, exercise) && set.loadKg > 0 && set.reps >= 1 && set.reps <= maxReps
}

export function setVolume(exercise: SessionExercise): number {
  const setType = exercise.setType ?? 'reps_load'
  if (!VOLUME_TYPES.has(setType)) return 0
  return exercise.sets.reduce((total, set) => {
    if (!set.completed || isWarmup(set, exercise) || set.loadKg <= 0 || set.reps <= 0) return total
    return total + set.reps * set.loadKg
  }, 0)
}

export function sessionVolume(session: WorkoutSession): number {
  return session.exercises.reduce((total, exercise) => total + setVolume(exercise), 0)
}

export interface PrHit {
  exerciseId: string
  loadKg: number
  reps: number
  previous?: { loadKg: number; reps: number }
}

export interface MaxOffer {
  familyId: string
  exerciseId: string
  estimateKg: number
  fromLoadKg: number
  fromReps: number
  currentKg?: number
  liftName: string
}

export interface UnloggedGroup {
  exerciseIndex: number
  exerciseId: string
  setNumbers: number[]
}

export interface SessionSummary {
  plannedSets: number
  doneSets: number
  pct: number
  volumeKg: number
  unlogged: UnloggedGroup[]
  prs: PrHit[]
  maxOffers: MaxOffer[]
}

function bestE1rm(loadKg: number, reps: number): number {
  return reps >= 1 && reps <= 12 && loadKg > 0 ? estimate1Rm(loadKg, reps) : 0
}

export function summarizeSession(session: WorkoutSession, state: AppState, ctx: Pick<TrainingContext, 'families' | 'aliases' | 'weightUnit'>): SessionSummary {
  const counts = sessionCounts(session)
  const previous = new Map<string, { loadKg: number; reps: number }>()
  for (const other of state.sessions) {
    if (other.id === session.id || other.status !== 'completed') continue
    for (const exercise of other.exercises) {
      for (const set of exercise.sets) {
        if (!countsForEstimate(exercise, set)) continue
        const current = previous.get(exercise.exerciseId)
        if (!current || bestE1rm(set.loadKg, set.reps) > bestE1rm(current.loadKg, current.reps)) {
          previous.set(exercise.exerciseId, { loadKg: set.loadKg, reps: set.reps })
        }
      }
    }
  }
  for (const record of state.prs) {
    if (record.sessionId === session.id || !record.loadKg || !record.reps) continue
    if (record.reps < 1 || record.reps > 12) continue
    const current = previous.get(record.exerciseId)
    if (!current || bestE1rm(record.loadKg, record.reps) > bestE1rm(current.loadKg, current.reps)) {
      previous.set(record.exerciseId, { loadKg: record.loadKg, reps: record.reps })
    }
  }
  const best = new Map<string, { loadKg: number; reps: number }>()
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (!countsForEstimate(exercise, set)) continue
      const current = best.get(exercise.exerciseId)
      if (!current || bestE1rm(set.loadKg, set.reps) > bestE1rm(current.loadKg, current.reps)) {
        best.set(exercise.exerciseId, { loadKg: set.loadKg, reps: set.reps })
      }
    }
  }
  const prs: PrHit[] = []
  for (const [exerciseId, hit] of best) {
    const prior = previous.get(exerciseId)
    if (prior && bestE1rm(hit.loadKg, hit.reps) <= bestE1rm(prior.loadKg, prior.reps)) continue
    prs.push({ exerciseId, loadKg: hit.loadKg, reps: hit.reps, ...(prior ? { previous: prior } : {}) })
  }
  const familyBest = new Map<string, { e1rm: number; exerciseId: string; loadKg: number; reps: number }>()
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (!countsForEstimate(exercise, set, 10)) continue
      const familyId = familyIdFor(exercise.exerciseId, ctx.families, ctx.aliases)
      const e1rm = estimate1Rm(set.loadKg, set.reps)
      const current = familyBest.get(familyId)
      if (!current || e1rm > current.e1rm) familyBest.set(familyId, { e1rm, exerciseId: exercise.exerciseId, loadKg: set.loadKg, reps: set.reps })
    }
  }
  const maxOffers: MaxOffer[] = []
  for (const [familyId, hit] of familyBest) {
    const stored = state.liftMaxes[familyId]
    const currentKg = stored && stored.maxKg > 0 ? stored.maxKg : undefined
    const estimateKg = roundLoadKg(hit.e1rm, ctx.weightUnit)
    if (currentKg != null && estimateKg <= currentKg) continue
    const name = state.exercises.find((exercise) => exercise.id === hit.exerciseId)?.name ?? hit.exerciseId
    maxOffers.push({
      familyId,
      exerciseId: hit.exerciseId,
      estimateKg,
      fromLoadKg: hit.loadKg,
      fromReps: hit.reps,
      ...(currentKg == null ? {} : { currentKg }),
      liftName: familyName(familyId, ctx.families, name),
    })
  }
  const unlogged: UnloggedGroup[] = []
  session.exercises.forEach((exercise, exerciseIndex) => {
    const setNumbers = exercise.sets.map((set, index) => (set.completed ? null : (set.setNumber ?? index + 1))).filter((value): value is number => value != null)
    if (setNumbers.length) unlogged.push({ exerciseIndex, exerciseId: exercise.exerciseId, setNumbers })
  })
  return {
    plannedSets: counts.planned,
    doneSets: counts.done,
    pct: counts.planned === 0 ? 0 : Math.round((counts.done / counts.planned) * 100),
    volumeKg: sessionVolume(session),
    unlogged,
    prs,
    maxOffers,
  }
}

export function rebuildPrs(sessions: WorkoutSession[]): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>()
  for (const session of sessions) {
    if (session.status !== 'completed') continue
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (!countsForEstimate(exercise, set)) continue
        const current = best.get(exercise.exerciseId)
        if (!current || bestE1rm(set.loadKg, set.reps) > bestE1rm(current.loadKg ?? 0, current.reps ?? 0)) {
          best.set(exercise.exerciseId, {
            exerciseId: exercise.exerciseId,
            kind: 'load',
            loadKg: set.loadKg,
            reps: set.reps,
            value: round1(estimate1Rm(set.loadKg, set.reps)),
            sessionId: session.id,
            dateKey: session.dateKey,
          })
        }
      }
    }
  }
  return [...best.values()]
}

function sessionDate(session: WorkoutSession): string {
  return session.dateKey || todayKey(new Date(session.completedAt ?? session.startedAt ?? Date.now()))
}

export function finishSession(state: AppState, sessionId: string, shared: boolean, now = new Date()): AppState {
  const existing = state.sessions.find((session) => session.id === sessionId)
  if (!existing) return state
  const completedAt = now.toISOString()
  const sessions = state.sessions.map((session) => {
    if (session.id !== sessionId) return session
    const { timer: _timer, pausedAt: _pausedAt, restEndsAt: _restEndsAt, ...rest } = session
    return { ...rest, status: 'completed' as const, completedAt, shared }
  })
  const session = sessions.find((item) => item.id === sessionId) ?? existing
  const dateKey = sessionDate(session)
  const commitmentDays = state.commitmentDays.includes(dateKey) ? state.commitmentDays : [dateKey, ...state.commitmentDays]
  const activity: ActivityEntry[] = shared
    ? [
        {
          id: createId('act'),
          kind: 'workout',
          text:
            session.exercises.length === 0
              ? session.sessionPad?.trim()
                ? 'Free-write session completed · shared from Fit Friend'
                : 'Session completed · shared from Fit Friend'
              : `Completed ${session.exercises.length} ${session.exercises.length === 1 ? 'exercise' : 'exercises'} · shared from Fit Friend`,
          dateKey,
          createdAt: completedAt,
          sessionId: session.id,
          programId: session.programId,
        },
        ...state.activity,
      ]
    : state.activity
  const planned = findCompletedPlan(state, session)
  let plannedSessions = state.plannedSessions
  let scheduled = state.scheduled
  let completedPlans = state.completedPlans
  if (planned) {
    plannedSessions = { ...state.plannedSessions }
    delete plannedSessions[planned.dateKey]
    scheduled = { ...state.scheduled }
    delete scheduled[planned.dateKey]
    completedPlans = { ...(state.completedPlans ?? {}), [planned.id]: { plan: planned } }
  }
  return {
    ...state,
    sessions,
    commitmentDays,
    prs: rebuildPrs(sessions),
    activity,
    profile: { ...state.profile, streak: streakFrom(commitmentDays, now) },
    plannedSessions,
    scheduled,
    completedPlans,
    scheduleUserOwned: true,
  }
}

function findCompletedPlan(state: AppState, session: WorkoutSession): PlannedSession | null {
  if (session.plannedSessionId) {
    for (const plan of Object.values(state.plannedSessions)) {
      if (plan.id === session.plannedSessionId) return plan
    }
    return null
  }
  const plan = state.plannedSessions[session.dateKey]
  if (!plan) return null
  if (session.programDayId) return plan.programDayId === session.programDayId ? plan : null
  if (plan.programDayId) return null
  return plan.name === session.name ? plan : null
}

export function deleteCompletedSession(state: AppState, sessionId: string, now = new Date()): AppState {
  return deleteLoggedSession(state, sessionId, now)
}

export function discardSession(state: AppState, sessionId: string): AppState {
  return { ...state, sessions: state.sessions.filter((session) => session.id !== sessionId || session.status === 'completed') }
}

/** Stop the clock at `now` so a paused rest or interval resumes with the same time left. */
export function freezeTimer(timer: SessionTimer | null | undefined, now = Date.now()): SessionTimer | undefined {
  if (!timer) return undefined
  const sideIndex = timer.sideIndex
  const withSide = (next: SessionTimer): SessionTimer => (sideIndex != null ? { ...next, sideIndex } : next)
  if (timer.phase === 'ready') return withSide({ phase: 'ready' })
  if (timer.phase === 'work' && timer.mode === 'up') {
    const elapsedSec =
      timer.startedAt != null ? Math.max(0, Math.floor((now - timer.startedAt) / 1000)) : Math.max(0, timer.elapsedSec ?? 0)
    return withSide({ phase: 'work', mode: 'up', elapsedSec, cap: timer.cap ?? 0 })
  }
  const remainingSec =
    timer.endsAt != null ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : Math.max(0, timer.remainingSec ?? 0)
  if (remainingSec <= 0) return withSide({ phase: 'ready' })
  if (timer.phase === 'rest') {
    return withSide({
      phase: 'rest',
      remainingSec,
      total: timer.total ?? remainingSec,
      warned: !!timer.warned,
      ...(timer.warning ? { warning: timer.warning } : {}),
    })
  }
  if (timer.phase === 'count-in') return withSide({ phase: 'count-in', remainingSec, left: remainingSec, spoken: remainingSec })
  return withSide({ phase: 'work', mode: 'down', remainingSec, cap: timer.cap ?? 0 })
}

/** Turn a frozen timer back into wall-clock timestamps for Focus mode. */
export function thawTimer(timer: SessionTimer | null | undefined, now = Date.now()): SessionTimer {
  const sideIndex = timer?.sideIndex
  const ready = (): SessionTimer => (sideIndex != null ? { phase: 'ready', sideIndex } : { phase: 'ready' })
  if (!timer || timer.phase === 'ready') return ready()
  if (timer.phase === 'work' && timer.mode === 'up') {
    const elapsed =
      timer.elapsedSec ?? (timer.startedAt != null ? Math.max(0, Math.floor((now - timer.startedAt) / 1000)) : 0)
    return {
      phase: 'work',
      mode: 'up',
      startedAt: now - elapsed * 1000,
      cap: timer.cap ?? 0,
      ...(sideIndex != null ? { sideIndex } : {}),
    }
  }
  const remaining =
    timer.remainingSec ?? (timer.endsAt != null ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : 0)
  if (remaining <= 0) return ready()
  const endsAt = timer.endsAt != null && timer.remainingSec == null ? timer.endsAt : now + remaining * 1000
  if (timer.phase === 'rest') {
    return {
      phase: 'rest',
      endsAt,
      total: timer.total ?? remaining,
      warned: !!timer.warned,
      ...(timer.warning ? { warning: timer.warning } : {}),
      ...(sideIndex != null ? { sideIndex } : {}),
    }
  }
  if (timer.phase === 'count-in') {
    return {
      phase: 'count-in',
      endsAt,
      left: remaining,
      spoken: remaining,
      ...(sideIndex != null ? { sideIndex } : {}),
    }
  }
  return {
    phase: 'work',
    mode: 'down',
    endsAt,
    cap: timer.cap ?? 0,
    ...(sideIndex != null ? { sideIndex } : {}),
  }
}

export function pauseSession(
  state: AppState,
  sessionId: string,
  recipe: (session: WorkoutSession) => WorkoutSession = (session) => session,
  now = new Date(),
): AppState {
  return {
    ...state,
    sessions: state.sessions.map((session) => {
      if (session.id !== sessionId || session.status === 'completed') return session
      const next = recipe(session)
      const timer = freezeTimer(next.timer, now.getTime())
      return {
        ...next,
        status: 'paused',
        pausedAt: now.toISOString(),
        timer,
        restEndsAt: null,
      }
    }),
  }
}

export function resumeSession(state: AppState, sessionId: string): AppState {
  return {
    ...state,
    sessions: state.sessions.map((session) => {
      if (session.id !== sessionId || session.status !== 'paused') return session
      const { pausedAt: _pausedAt, ...rest } = session
      return { ...rest, status: 'in_progress' }
    }),
  }
}

export type StartMode = 'return' | 'replace' | 'resume' | 'pause'

export type StartResult =
  | { kind: 'started'; sessionId: string; state: AppState }
  | { kind: 'resumed'; sessionId: string; state: AppState }
  | { kind: 'conflict'; session: WorkoutSession; state: AppState }

function matchesPlan(session: WorkoutSession, plan: PlannedSession): boolean {
  if (session.plannedSessionId == null) return false
  return session.plannedSessionId === plan.id
}

function parkedMatch(state: AppState, plan: PlannedSession): WorkoutSession | undefined {
  return state.sessions.find((session) => session.status === 'paused' && matchesPlan(session, plan))
}

export function startFromPlan(state: AppState, plan: PlannedSession, ctx: TrainingContext, mode: StartMode = 'return', now = new Date()): StartResult {
  const current = state.sessions.find((session) => session.status === 'in_progress')
  if (current && matchesPlan(current, plan)) return { kind: 'resumed', sessionId: current.id, state }
  if (current && mode === 'resume') return { kind: 'resumed', sessionId: current.id, state }
  if (current && mode !== 'replace' && mode !== 'pause') return { kind: 'conflict', session: current, state }

  let base = state
  if (current && mode === 'pause') base = pauseSession(state, current.id, (session) => session, now)
  if (current && mode === 'replace') {
    base = { ...state, sessions: state.sessions.filter((session) => session.id !== current.id) }
  }
  const parked = parkedMatch(base, plan)
  if (parked) return { kind: 'resumed', sessionId: parked.id, state: resumeSession(base, parked.id) }

  const session = buildSession(plan, ctx, createId('ses'), now)
  const sessions = [session, ...base.sessions.filter((item) => item.status !== 'in_progress')]
  return {
    kind: 'started',
    sessionId: session.id,
    state: {
      ...base,
      sessions,
      plannedSessions: {
        ...base.plannedSessions,
        [plan.dateKey]: { ...plan, updatedAt: now.toISOString() },
      },
    },
  }
}

export function todayPlan(state: AppState, dateKey: string): {
  inProgress?: WorkoutSession
  paused: WorkoutSession[]
  plan?: PlannedSession
  programDay?: { program: Program; day: ProgramDay }
  canStart: boolean
  name?: string
} {
  const inProgress = state.sessions.find((session) => session.status === 'in_progress')
  const paused = state.sessions.filter((session) => session.status === 'paused')
  const plan = state.plannedSessions[dateKey]
  const programDay = !plan && state.scheduled[dateKey] ? findProgramDay(state, dateKey) ?? undefined : undefined
  const logged = state.sessions.some((session) => {
    if (session.status !== 'completed' || session.dateKey !== dateKey) return false
    if (!plan) return false
    return session.plannedSessionId === plan.id || (session.programDayId === plan.programDayId && session.name === plan.name)
  })
  const matches = (session: WorkoutSession | undefined) =>
    !!(session && plan && (session.plannedSessionId === plan.id || session.name === plan.name))
  const sameWorkout = matches(inProgress) || paused.some((session) => matches(session))
  const hasWork = plan ? plan.exercises.length > 0 || !!plan.sessionPad?.trim() : !!(programDay && programDay.day.exercises.length > 0)
  return {
    inProgress,
    paused,
    plan,
    programDay,
    canStart: hasWork && !logged && !sameWorkout,
    name: plan?.name ?? programDay?.day.name,
  }
}

export function planForStart(state: AppState, dateKey: string): PlannedSession | null {
  const plan = state.plannedSessions[dateKey]
  if (plan && (plan.exercises.length > 0 || !!plan.sessionPad?.trim())) return plan
  const found = findProgramDay(state, dateKey)
  if (!found || found.day.exercises.length === 0) return null
  return plannedFromProgramDay(dateKey, found.program, found.day)
}

export function restFor(session: WorkoutSession, pointer: SetPointer, stepRest: number | undefined, exercises: Exercise[]): number {
  const exercise = session.exercises[pointer.exerciseIndex]
  if (!exercise) return 0
  const setType = resolveSetType(exercise.setType, exercise.targetReps, exercise.timeCapSec)
  if (setType === 'emom' || setType === 'amrap') return 0
  const logged = setAt(session, pointer)?.restSec
  if (logged != null) return logged
  if (stepRest != null && stepRest > 0) return stepRest
  const library = exercises.find((item) => item.id === exercise.exerciseId)
  return exercise.restSec ?? library?.defaultRestSec ?? 90
}

export function defaultPrescription(exercise: Exercise | null | undefined): Prescription {
  const reps = exercise?.defaultReps ?? '8'
  const setType = resolveSetType(undefined, reps)
  return {
    exerciseId: exercise?.id ?? '',
    setType,
    sets: exercise?.defaultSets ?? 3,
    reps,
    restSec: exercise?.defaultRestSec ?? 90,
    notes: exercise?.cues[0],
    ...(setType === 'time' ? { timeCapSec: parseDurationSec(reps, 45) } : {}),
    ...(setType === 'distance' ? { distanceM: parseDistanceM(reps, 40) } : {}),
  }
}
