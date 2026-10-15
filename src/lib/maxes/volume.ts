import type { LoggedSet, SessionExercise, WorkoutSession } from '../../types.ts'

const VOLUME_SET_TYPES = new Set(['reps_load', 'each_side', 'per_leg', 'amrap', 'emom'])

function isWarmup(set: LoggedSet, exercise: SessionExercise): boolean {
  const extra = set as LoggedSet & { isWarmup?: boolean }
  if (extra.isWarmup != null) return extra.isWarmup
  return !!(exercise.notes && /\b(warm[- ]?up|ramp(ing)?|activation)\b/i.test(exercise.notes))
}

export function sessionVolumeKg(session: WorkoutSession): number {
  let total = 0
  for (const exercise of session.exercises) {
    const setType = exercise.setType ?? 'reps_load'
    if (!VOLUME_SET_TYPES.has(setType)) continue
    for (const set of exercise.sets) {
      if (!set.completed || isWarmup(set, exercise) || set.loadKg <= 0 || set.reps <= 0) continue
      total += set.reps * set.loadKg
    }
  }
  return total
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`
}
