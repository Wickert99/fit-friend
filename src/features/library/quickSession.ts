import type { AppState, Exercise, SessionExercise, SetType, WorkoutSession } from '../../types.ts'

export type ConflictMode = 'return' | 'resume' | 'replace'

export interface QuickStartInput {
  name: string
  exerciseIds: string[]
  mode: ConflictMode
  sessionId: string
  dateKey: string
  startedAt?: string
}

export interface QuickStartPlan {
  next: AppState
  kind: 'started' | 'resumed' | 'conflict'
  sessionId: string
  conflict?: WorkoutSession
}

const FOR_TIME = /for\s*time|time\s*trial|\btt\b/i
const TIME_REPS =
  /^\d+\s*s(ec)?(\s|\/|$)|\d+\s*s(ec)?\s*(\/|each|per)\s*(side|leg|arm)|^\d+\s*(-\s*\d+\s*)?s(ec|econds?)?$/i
const PER_SIDE = /\/\s*(leg|side|arm)|per\s+(leg|side|arm)|each\s+(side|leg|arm)/i

/** Same rep-string inference the recovered library used when a quick workout had no prescription yet. */
export function inferSetType(reps: string | undefined): SetType {
  const text = (reps ?? '').trim().toLowerCase()
  if (!text) return 'reps_load'
  if (text.includes('amrap')) return 'amrap'
  if (text.includes('emom')) return 'emom'
  if (FOR_TIME.test(text)) return 'for_time'
  if (TIME_REPS.test(text) || (/\d+\s*min/.test(text) && !text.includes('×') && !/^\d+$/.test(text))) return 'time'
  if (/\d+\s*(m|metres?|meters?|km)\b/.test(text) && !/\d+\s*min/.test(text)) return 'distance'
  if (PER_SIDE.test(text)) return /leg/.test(text) ? 'per_leg' : 'each_side'
  return 'reps_load'
}

function leadingNumber(reps: string | undefined): number {
  const match = /^(\d+(?:\.\d+)?)/.exec((reps ?? '').trim())
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function durationSec(reps: string | undefined): number {
  const text = (reps ?? '').trim().toLowerCase()
  const seconds = /(\d+)\s*s(ec)?/.exec(text)
  if (seconds) return Number(seconds[1])
  const minutes = /(\d+)\s*min/.exec(text)
  if (minutes) return Number(minutes[1]) * 60
  return leadingNumber(reps)
}

export function findLibraryExercise(
  state: AppState,
  exerciseId: string,
  aliases: Record<string, string> = {},
): Exercise | undefined {
  const resolved = aliases[exerciseId] ?? exerciseId
  return state.exercises.find((exercise) => exercise.id === resolved || exercise.id === exerciseId)
}

export function sessionExerciseFromLibrary(exerciseId: string, exercise: Exercise | undefined): SessionExercise {
  const reps = exercise?.defaultReps ?? '8'
  const setType = inferSetType(reps)
  const sets = Math.max(1, exercise?.defaultSets ?? 3)
  const loggedReps = leadingNumber(reps)
  const row: SessionExercise = {
    exerciseId: exercise?.id ?? exerciseId,
    setType,
    restSec: exercise?.defaultRestSec ?? 90,
    targetReps: reps,
    notes: exercise?.cues?.[0],
    sets: Array.from({ length: sets }, (_, index) => ({
      setNumber: index + 1,
      reps: loggedReps,
      loadKg: 0,
      completed: false,
      durationSec: setType === 'time' ? durationSec(reps) : undefined,
      distanceM: setType === 'distance' ? leadingNumber(reps) : undefined,
    })),
  }
  if (setType === 'each_side' || setType === 'per_leg') row.perSide = true
  return row
}

export function planQuickStart(state: AppState, input: QuickStartInput, aliases: Record<string, string> = {}): QuickStartPlan {
  const open = state.sessions.find((session) => session.status === 'in_progress')
  if (open && input.mode === 'resume') {
    return { next: state, kind: 'resumed', sessionId: open.id, conflict: open }
  }
  if (open && input.mode !== 'replace') {
    return { next: state, kind: 'conflict', sessionId: open.id, conflict: open }
  }
  const session: WorkoutSession = {
    id: input.sessionId,
    name: input.name,
    dateKey: input.dateKey,
    status: 'in_progress',
    startedAt: input.startedAt ?? new Date().toISOString(),
    exercises: input.exerciseIds.map((exerciseId) => sessionExerciseFromLibrary(exerciseId, findLibraryExercise(state, exerciseId, aliases))),
    currentSet: input.exerciseIds.length > 0 ? { exerciseIndex: 0, setIndex: 0 } : undefined,
  }
  return {
    next: {
      ...state,
      sessions: [session, ...state.sessions.filter((item) => item.status !== 'in_progress')],
    },
    kind: 'started',
    sessionId: session.id,
  }
}
