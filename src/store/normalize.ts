import type {
  ActivityEntry,
  AppState,
  Exercise,
  Friend,
  LiftMax,
  LiftMaxKind,
  LoggedSet,
  PersonalRecord,
  PlanBoard,
  PlanDay,
  PlannedSession,
  PlanWeek,
  Prescription,
  Profile,
  Program,
  ProgramDay,
  ProgramInstance,
  SeasonGoals,
  SessionExercise,
  SessionStatus,
  SessionTimer,
  SetScheme,
  SetType,
  WeightUnit,
  WorkoutSession,
} from '../types.ts'
import { SET_TYPES } from '../types.ts'

const SET_TYPE_SET = new Set<string>(SET_TYPES)

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function inferSetType(reps: string | undefined): SetType {
  const text = (reps ?? '').trim().toLowerCase()
  if (!text) return 'reps_load'
  if (text.includes('amrap')) return 'amrap'
  if (text.includes('emom')) return 'emom'
  if (/for\s*time|time\s*trial|\btt\b/.test(text)) return 'for_time'
  if (/^\d+\s*s(ec)?(\s|\/|$)/.test(text) || (/\d+\s*min/.test(text) && !text.includes('×'))) return 'time'
  if (/\d+\s*(m|metres?|meters?|km)\b/.test(text) && !/\d+\s*min/.test(text)) return 'distance'
  if (/leg/.test(text) && /\/\s*leg|per\s+leg|each\s+leg/.test(text)) return 'per_leg'
  if (/\/\s*(side|arm)|per\s+(side|arm)|each\s+(side|arm)/.test(text)) return 'each_side'
  return 'reps_load'
}

function asSetType(value: unknown, reps?: string): SetType {
  return typeof value === 'string' && SET_TYPE_SET.has(value) ? (value as SetType) : inferSetType(reps)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function emptyProfile(): Profile {
  return {
    id: 'user-you',
    name: 'You',
    handle: '@you',
    avatarColor: '#a56b4e',
    bio: '',
    streak: 0,
    isYou: true,
  }
}

export function emptyState(): AppState {
  return {
    profile: emptyProfile(),
    friends: [],
    exercises: [],
    programs: [],
    sessions: [],
    prs: [],
    activity: [],
    activeProgramId: null,
    commitmentDays: [],
    scheduled: {},
    plannedSessions: {},
    scheduleUserOwned: true,
    planBoards: [],
    activeBoardId: null,
    seasonGoals: {},
    liftMaxes: {},
    weightUnit: 'kg',
    programInstances: [],
  }
}

function normalizeScheme(raw: unknown): SetScheme | null {
  if (!isRecord(raw)) return null
  return {
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : undefined,
    sets: asNumber(raw.sets, 1),
    reps: asString(raw.reps, '8'),
    restSec: raw.restSec == null ? undefined : asNumber(raw.restSec, 0),
    targetPercent1RM: raw.targetPercent1RM == null ? undefined : asNumber(raw.targetPercent1RM),
  }
}

export function normalizePrescription(raw: unknown): Prescription | null {
  if (!isRecord(raw) || typeof raw.exerciseId !== 'string') return null
  const reps = asString(raw.reps, '8')
  const schemes = Array.isArray(raw.schemes)
    ? raw.schemes.map(normalizeScheme).filter((item): item is SetScheme => item != null)
    : undefined
  const waves = Array.isArray(raw.waves)
    ? raw.waves.map(normalizeScheme).filter((item): item is SetScheme => item != null)
    : undefined
  return {
    ...raw,
    exerciseId: raw.exerciseId,
    setType: asSetType(raw.setType, reps),
    sets: asNumber(raw.sets, 3),
    reps,
    restSec: asNumber(raw.restSec, 0),
    schemes,
    waves,
  }
}

function normalizeLoggedSet(raw: unknown, index: number): LoggedSet {
  const row = isRecord(raw) ? raw : {}
  const completed = row.completed != null ? !!row.completed : !!row.done
  return {
    ...row,
    setNumber: asNumber(row.setNumber, index + 1),
    reps: asNumber(row.reps, 0),
    loadKg: asNumber(row.loadKg, 0),
    completed,
    done: completed,
    rpe: row.rpe == null ? undefined : asNumber(row.rpe),
    durationSec: row.durationSec == null ? undefined : asNumber(row.durationSec),
    distanceM: row.distanceM == null ? undefined : asNumber(row.distanceM),
    rounds: row.rounds == null ? undefined : asNumber(row.rounds),
  }
}

function sessionStatus(value: unknown): SessionStatus {
  if (value === 'completed') return 'completed'
  if (value === 'paused' || value === 'abandoned') return 'paused'
  return 'in_progress'
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeTimer(raw: unknown): SessionTimer | undefined {
  if (!isRecord(raw)) return undefined
  if (raw.phase !== 'ready' && raw.phase !== 'count-in' && raw.phase !== 'work' && raw.phase !== 'rest') return undefined
  const timer: SessionTimer = { phase: raw.phase }
  if (raw.mode === 'down' || raw.mode === 'up') timer.mode = raw.mode
  const endsAt = finiteNumber(raw.endsAt)
  const startedAt = finiteNumber(raw.startedAt)
  const remainingSec = finiteNumber(raw.remainingSec)
  const elapsedSec = finiteNumber(raw.elapsedSec)
  const total = finiteNumber(raw.total)
  const cap = finiteNumber(raw.cap)
  const left = finiteNumber(raw.left)
  const spoken = finiteNumber(raw.spoken)
  const sideIndex = finiteNumber(raw.sideIndex)
  if (endsAt != null) timer.endsAt = endsAt
  if (startedAt != null) timer.startedAt = startedAt
  if (remainingSec != null) timer.remainingSec = remainingSec
  if (elapsedSec != null) timer.elapsedSec = elapsedSec
  if (total != null) timer.total = total
  if (cap != null) timer.cap = cap
  if (left != null) timer.left = left
  if (spoken != null) timer.spoken = spoken
  if (sideIndex != null) timer.sideIndex = sideIndex
  if (typeof raw.warned === 'boolean') timer.warned = raw.warned
  if (typeof raw.warning === 'string') timer.warning = raw.warning
  return timer
}

function normalizeSessionExercise(raw: unknown): SessionExercise | null {
  if (!isRecord(raw) || typeof raw.exerciseId !== 'string') return null
  const sets = Array.isArray(raw.sets) ? raw.sets.map(normalizeLoggedSet) : []
  return {
    ...raw,
    exerciseId: raw.exerciseId,
    setType: asSetType(raw.setType, typeof raw.targetReps === 'string' ? raw.targetReps : undefined),
    sets,
  }
}

export function normalizeSession(raw: unknown): WorkoutSession | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises.map(normalizeSessionExercise).filter((item): item is SessionExercise => item != null)
    : []
  return {
    ...raw,
    id: raw.id,
    name: asString(raw.name, 'Session'),
    dateKey: asString(raw.dateKey),
    status: sessionStatus(raw.status),
    pausedAt: typeof raw.pausedAt === 'string' ? raw.pausedAt : undefined,
    timer: normalizeTimer(raw.timer),
    exercises,
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    sessionPad: typeof raw.sessionPad === 'string' ? raw.sessionPad : typeof raw.pad === 'string' ? raw.pad : '',
    pad: typeof raw.pad === 'string' ? raw.pad : typeof raw.sessionPad === 'string' ? raw.sessionPad : '',
  }
}

function normalizeExercise(raw: unknown): Exercise | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  return {
    ...raw,
    id: raw.id,
    name: asString(raw.name, 'Exercise'),
    theme: asString(raw.theme, 'Strength'),
    sports: asStringArray(raw.sports),
    muscles: asStringArray(raw.muscles),
    equipment: asStringArray(raw.equipment),
    description: asString(raw.description),
    cues: asStringArray(raw.cues),
    source: asString(raw.source, 'custom'),
    defaultSets: asNumber(raw.defaultSets, 3),
    defaultReps: asString(raw.defaultReps, '8'),
    defaultRestSec: asNumber(raw.defaultRestSec, 90),
    aliases: asStringArray(raw.aliases),
    primaryMuscles: asStringArray(raw.primaryMuscles),
    secondaryMuscles: asStringArray(raw.secondaryMuscles),
    movementPattern: asString(raw.movementPattern),
    imageUrls: asStringArray(raw.imageUrls),
    videoUrl: typeof raw.videoUrl === 'string' ? raw.videoUrl : undefined,
    youtubeId: typeof raw.youtubeId === 'string' ? raw.youtubeId : undefined,
    imageCredit: typeof raw.imageCredit === 'string' ? raw.imageCredit : undefined,
  }
}

function normalizeProgramDay(raw: unknown): ProgramDay | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises.map(normalizePrescription).filter((item): item is Prescription => item != null)
    : []
  return {
    ...raw,
    id: raw.id,
    name: asString(raw.name, 'Day'),
    weekday: raw.weekday == null ? undefined : asNumber(raw.weekday),
    focus: asString(raw.focus, 'Strength'),
    sessionPad: asString(raw.sessionPad),
    exercises,
  }
}

function stripActiveInstance(raw: Record<string, unknown>): Record<string, unknown> {
  if (!('activeInstance' in raw)) return raw
  const { activeInstance: _active, ...rest } = raw
  return rest
}

export function normalizeProgram(raw: unknown): Program | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const source = stripActiveInstance(raw)
  const days = Array.isArray(source.days)
    ? source.days.map(normalizeProgramDay).filter((item): item is ProgramDay => item != null)
    : []
  return {
    ...source,
    id: source.id as string,
    name: asString(source.name, 'Program'),
    description: asString(source.description),
    theme: asString(source.theme, 'Strength'),
    sports: asStringArray(source.sports),
    weeks: Math.max(1, asNumber(source.weeks, 1)),
    isTemplate: !!source.isTemplate,
    isMine: !!source.isMine,
    createdAt: asString(source.createdAt, new Date(0).toISOString()),
    days,
    audience: typeof source.audience === 'string' ? source.audience : undefined,
    coachNotes: typeof source.coachNotes === 'string' ? source.coachNotes : undefined,
    adaptations: Array.isArray(source.adaptations) ? asStringArray(source.adaptations) : undefined,
    progression: isRecord(source.progression)
      ? {
          percentPerWeek: asNumber(source.progression.percentPerWeek, 0),
          deloadEvery: asNumber(source.progression.deloadEvery, 0),
        }
      : undefined,
  }
}

function normalizePlanDay(raw: unknown): PlanDay | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises.map(normalizePrescription).filter((item): item is Prescription => item != null)
    : []
  return {
    ...raw,
    id: raw.id,
    name: asString(raw.name, 'Day'),
    focus: typeof raw.focus === 'string' ? raw.focus : undefined,
    sessionPad: asString(raw.sessionPad),
    pad: typeof raw.pad === 'string' ? raw.pad : asString(raw.sessionPad),
    freeWrite: !!raw.freeWrite,
    isWhiteboard: !!raw.isWhiteboard,
    exercises,
  }
}

function normalizeBoard(raw: unknown): PlanBoard | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const weeks = Array.isArray(raw.weeks)
    ? raw.weeks
        .map((week): PlanWeek | null => {
          if (!isRecord(week) || typeof week.id !== 'string') return null
          const days = Array.isArray(week.days)
            ? week.days.map(normalizePlanDay).filter((item): item is PlanDay => item != null)
            : []
          return { ...week, id: week.id, label: asString(week.label, 'Week'), days }
        })
        .filter((item): item is PlanWeek => item != null)
    : []
  return {
    ...raw,
    id: raw.id,
    name: asString(raw.name, 'Board'),
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    weeks,
  }
}

function normalizePlanned(raw: unknown): PlannedSession | null {
  if (!isRecord(raw)) return null
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises.map(normalizePrescription).filter((item): item is Prescription => item != null)
    : []
  const dateKey = asString(raw.dateKey)
  if (!dateKey) return null
  return {
    ...raw,
    id: asString(raw.id, `plan-${dateKey}`),
    dateKey,
    name: asString(raw.name, 'Session'),
    sessionPad: asString(raw.sessionPad),
    exercises,
  }
}

function normalizeLiftMax(id: string, raw: unknown): LiftMax | null {
  if (!isRecord(raw)) return null
  const maxKg = asNumber(raw.maxKg, 0)
  const bestTimeSec = raw.bestTimeSec == null ? undefined : asNumber(raw.bestTimeSec)
  const bestRounds =
    typeof raw.bestRounds === 'number' && Number.isFinite(raw.bestRounds) ? raw.bestRounds : undefined
  const hasKg = maxKg > 0
  const hasTime = bestTimeSec != null && bestTimeSec > 0
  const hasRounds = bestRounds != null && bestRounds >= 0
  if (!hasKg && !hasTime && !hasRounds) return null
  let kind: LiftMaxKind = 'strength'
  if (raw.kind === 'run' || raw.kind === 'benchmark' || raw.kind === 'strength') kind = raw.kind
  else if (hasRounds) kind = 'benchmark'
  else if (hasTime && !hasKg) kind = 'run'
  const extra = raw.bestExtraReps == null ? undefined : asNumber(raw.bestExtraReps)
  return {
    familyId: asString(raw.familyId, id),
    name: asString(raw.name, id),
    kind,
    maxKg: hasKg ? maxKg : 0,
    bestTimeSec: hasTime ? bestTimeSec : undefined,
    bestRounds: hasRounds ? bestRounds : undefined,
    bestExtraReps: extra != null && extra > 0 ? extra : undefined,
    estimated: !!raw.estimated,
    sourceExerciseId: typeof raw.sourceExerciseId === 'string' ? raw.sourceExerciseId : undefined,
    updatedAt: asString(raw.updatedAt, new Date().toISOString()),
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
  }
}

function normalizeProfile(raw: unknown, fallback: Profile): Profile {
  if (!isRecord(raw)) return fallback
  return {
    ...fallback,
    ...raw,
    id: asString(raw.id, fallback.id),
    name: asString(raw.name, fallback.name),
    handle: asString(raw.handle, fallback.handle),
    avatarColor: asString(raw.avatarColor, fallback.avatarColor),
    bio: asString(raw.bio, fallback.bio),
    streak: asNumber(raw.streak, 0),
    isYou: raw.isYou == null ? true : !!raw.isYou,
  }
}

function normalizeInstance(raw: unknown): ProgramInstance | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.programId !== 'string') return null
  return {
    id: raw.id,
    programId: raw.programId,
    startKey: asString(raw.startKey),
    firstSessionKey: asString(raw.firstSessionKey),
    lastSessionKey: asString(raw.lastSessionKey),
    weeks: asNumber(raw.weeks, 1),
    committedAt: asString(raw.committedAt, new Date(0).toISOString()),
    source: asString(raw.source, 'import'),
    boardId: typeof raw.boardId === 'string' ? raw.boardId : undefined,
  }
}

function mapRecord<T>(raw: unknown, map: (key: string, value: unknown) => T | null): Record<string, T> {
  if (!isRecord(raw)) return {}
  const out: Record<string, T> = {}
  for (const [key, value] of Object.entries(raw)) {
    const next = map(key, value)
    if (next) out[key] = next
  }
  return out
}

export function normalizeState(raw: unknown): AppState {
  const base = emptyState()
  if (!isRecord(raw)) return base
  const weight: WeightUnit = raw.weightUnit === 'lb' ? 'lb' : 'kg'
  const scheduled: Record<string, string> = {}
  if (isRecord(raw.scheduled)) {
    for (const [key, value] of Object.entries(raw.scheduled)) {
      if (typeof value === 'string') scheduled[key] = value
    }
  }
  return {
    profile: normalizeProfile(raw.profile, base.profile),
    friends: Array.isArray(raw.friends)
      ? raw.friends.filter(isRecord).map(
          (friend): Friend => ({
            id: asString(friend.id),
            name: asString(friend.name, 'Friend'),
            handle: asString(friend.handle),
            avatarColor: asString(friend.avatarColor, '#8f8070'),
            bio: typeof friend.bio === 'string' ? friend.bio : undefined,
            isYou: !!friend.isYou,
          }),
        )
      : [],
    exercises: Array.isArray(raw.exercises)
      ? raw.exercises.map(normalizeExercise).filter((item): item is Exercise => item != null)
      : [],
    programs: Array.isArray(raw.programs)
      ? raw.programs.map(normalizeProgram).filter((item): item is Program => item != null)
      : [],
    sessions: Array.isArray(raw.sessions)
      ? raw.sessions.map(normalizeSession).filter((item): item is WorkoutSession => item != null)
      : [],
    prs: Array.isArray(raw.prs)
      ? raw.prs.filter(isRecord).map(
          (pr): PersonalRecord => ({
            exerciseId: asString(pr.exerciseId),
            kind: typeof pr.kind === 'string' ? pr.kind : undefined,
            value: pr.value == null ? undefined : asNumber(pr.value),
            loadKg: pr.loadKg == null ? undefined : asNumber(pr.loadKg),
            reps: pr.reps == null ? undefined : asNumber(pr.reps),
            sessionId: typeof pr.sessionId === 'string' ? pr.sessionId : undefined,
            dateKey: asString(pr.dateKey),
          }),
        )
      : [],
    activity: Array.isArray(raw.activity)
      ? raw.activity.filter(isRecord).map(
          (entry): ActivityEntry => ({
            id: asString(entry.id, createFallbackId()),
            kind: typeof entry.kind === 'string' ? entry.kind : undefined,
            text: asString(entry.text, asString(entry.title, 'Activity')),
            dateKey: typeof entry.dateKey === 'string' ? entry.dateKey : undefined,
            createdAt: asString(entry.createdAt, new Date(0).toISOString()),
            sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : undefined,
            programId: typeof entry.programId === 'string' ? entry.programId : undefined,
          }),
        )
      : [],
    activeProgramId: typeof raw.activeProgramId === 'string' ? raw.activeProgramId : null,
    commitmentDays: asStringArray(raw.commitmentDays),
    scheduled,
    plannedSessions: mapRecord(raw.plannedSessions, (_key, value) => normalizePlanned(value)),
    scheduleUserOwned: raw.scheduleUserOwned == null ? true : !!raw.scheduleUserOwned,
    planBoards: Array.isArray(raw.planBoards)
      ? raw.planBoards.map(normalizeBoard).filter((item): item is PlanBoard => item != null)
      : [],
    activeBoardId: typeof raw.activeBoardId === 'string' ? raw.activeBoardId : null,
    seasonGoals: isRecord(raw.seasonGoals) ? (raw.seasonGoals as SeasonGoals) : {},
    liftMaxes: mapRecord(raw.liftMaxes, (key, value) => normalizeLiftMax(key, value)),
    weightUnit: weight,
    programInstances: Array.isArray(raw.programInstances)
      ? raw.programInstances.map(normalizeInstance).filter((item): item is ProgramInstance => item != null)
      : [],
    completedPlans: isRecord(raw.completedPlans)
      ? (raw.completedPlans as AppState['completedPlans'])
      : undefined,
  }
}

let fallback = 0
function createFallbackId(): string {
  fallback += 1
  return `activity-${fallback}`
}

const ID_KEYS = new Set(['exerciseId', 'sourceExerciseId'])

function walkAliases(value: unknown, aliases: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => walkAliases(item, aliases))
  if (!isRecord(value)) return value
  let changed = false
  const next: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    let mapped = child
    if (ID_KEYS.has(key) && typeof child === 'string' && aliases[child]) mapped = aliases[child]
    else if (child && typeof child === 'object') mapped = walkAliases(child, aliases)
    if (mapped !== child) changed = true
    next[key] = mapped
  }
  return changed ? next : value
}

/** Rewrite legacy exercise ids. Custom copies whose id collides are prefixed. */
export function remapExerciseAliases(state: AppState, aliases: Record<string, string>): AppState {
  if (!Object.keys(aliases).length) return state
  const walked = walkAliases(state, aliases) as AppState
  const exercises = walked.exercises.flatMap((exercise) => {
    const target = aliases[exercise.id]
    if (!target) return [exercise]
    if (exercise.source === 'custom') return [{ ...exercise, id: `custom-${exercise.id}` }]
    return []
  })
  const dedupedPrs = dedupePrs(walked.prs)
  return { ...walked, exercises, prs: dedupedPrs }
}

function dedupePrs(prs: PersonalRecord[]): PersonalRecord[] {
  const seen = new Set<string>()
  return prs.filter((pr) => {
    const key = `${pr.exerciseId}|${pr.sessionId ?? ''}|${pr.reps ?? ''}|${pr.loadKg ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function mergeWithSeed(user: AppState, seed: AppState, aliases: Record<string, string>): AppState {
  const remapped = remapExerciseAliases(user, aliases)
  const seedIds = new Set(seed.exercises.map((exercise) => exercise.id))
  const exercises = [...seed.exercises]
  const seen = new Set(seedIds)
  for (const exercise of remapped.exercises) {
    if (exercise.source === 'custom') {
      if (!seen.has(exercise.id)) {
        exercises.push(exercise)
        seen.add(exercise.id)
      }
      continue
    }
    if (!seen.has(exercise.id)) {
      exercises.push(exercise)
      seen.add(exercise.id)
    }
  }
  const seedPrograms = new Map(seed.programs.map((program) => [program.id, program]))
  const programs = seed.programs.map((program) => {
    const owned = remapped.programs.find((item) => item.id === program.id && item.isMine)
    return owned ?? program
  })
  for (const program of remapped.programs) {
    if (seedPrograms.has(program.id)) continue
    if (program.isMine) programs.unshift(program)
    else programs.push(program)
  }
  return normalizeState({
    ...remapped,
    exercises,
    programs,
    profile: { ...seed.profile, ...remapped.profile },
    seasonGoals: { ...seed.seasonGoals, ...remapped.seasonGoals },
  })
}
