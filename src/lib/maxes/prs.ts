import type { LoggedSet, PersonalRecord, SessionExercise, WorkoutSession } from '../../types.ts'
import { estimate1rm } from './estimate.ts'

const PR_SET_TYPES = new Set(['reps_load', 'each_side', 'per_leg'])

function isWarmup(set: LoggedSet, exercise: SessionExercise): boolean {
  const extra = set as LoggedSet & { isWarmup?: boolean }
  if (extra.isWarmup != null) return extra.isWarmup
  return !!(exercise.notes && /\b(warm[- ]?up|ramp(ing)?|activation)\b/i.test(exercise.notes))
}

export function countsForPr(exercise: SessionExercise, set: LoggedSet): boolean {
  const setType = exercise.setType ?? 'reps_load'
  return (
    PR_SET_TYPES.has(setType) &&
    set.completed &&
    !isWarmup(set, exercise) &&
    set.loadKg > 0 &&
    set.reps >= 1 &&
    set.reps <= 12
  )
}

export function prScore(loadKg: number, reps: number): number {
  return loadKg > 0 && reps >= 1 && reps <= 12 ? estimate1rm(loadKg, reps) : 0
}

function sessionDate(session: WorkoutSession): string {
  if (session.dateKey) return session.dateKey
  const iso = session.completedAt ?? session.startedAt
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** One PR per exercise: the completed set with the highest Epley+Brzycki estimate. */
export function recomputePrs(sessions: WorkoutSession[]): PersonalRecord[] {
  const best = new Map<string, { record: PersonalRecord; score: number }>()
  for (const session of sessions) {
    if (session.status !== 'completed') continue
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (!countsForPr(exercise, set)) continue
        const score = prScore(set.loadKg, set.reps)
        const current = best.get(exercise.exerciseId)
        if (current && score <= current.score) continue
        best.set(exercise.exerciseId, {
          score,
          record: {
            exerciseId: exercise.exerciseId,
            loadKg: set.loadKg,
            reps: set.reps,
            value: score,
            kind: 'e1rm',
            sessionId: session.id,
            dateKey: sessionDate(session),
          },
        })
      }
    }
  }
  return [...best.values()].map((item) => item.record)
}
