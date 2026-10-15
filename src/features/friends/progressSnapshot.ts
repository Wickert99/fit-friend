import type { PersonalRecord, WeightUnit, WorkoutSession } from '../../types.ts'

export interface ProgressSnapshot {
  dateKey: string
  exerciseCount: number
  completedSets: number
  totalVolumeKg: number
  durationSec?: number
  prHighlights?: { name: string; loadKg: number; reps: number }[]
  programName?: string
  autoDetail?: boolean
}

export interface SnapshotStats {
  exercises: number
  sets: number
  volumeKg: number
  prs: number
}

const AUTO_DETAIL = /^\d+ exercises?( · \d+ sets?)?( · \d+ kg vol)?( · \d+ PRs?)?$/

function epley(loadKg: number, reps: number): number {
  return loadKg * (1 + reps / 30)
}

function volumeOf(session: WorkoutSession): { completedSets: number; totalVolumeKg: number } {
  let completedSets = 0
  let volume = 0
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (!set.completed) continue
      completedSets += 1
      volume += set.reps * set.loadKg
    }
  }
  return { completedSets, totalVolumeKg: Math.round(volume * 1e3) / 1e3 }
}

export function buildProgressSnapshot(
  session: WorkoutSession,
  options: {
    exerciseNames?: Map<string, string>
    previousPrs?: PersonalRecord[]
    programName?: string
    resolveId?: (id: string) => string
  } = {},
): ProgressSnapshot {
  const names = options.exerciseNames ?? new Map<string, string>()
  const resolveId = options.resolveId ?? ((id: string) => id)
  const { completedSets, totalVolumeKg } = volumeOf(session)
  const previous = new Map((options.previousPrs ?? []).map((pr) => [pr.exerciseId, pr]))
  const highlights: { name: string; loadKg: number; reps: number }[] = []
  for (const exercise of session.exercises) {
    for (const set of exercise.sets.filter((item) => item.completed && item.loadKg > 0)) {
      const prior = previous.get(exercise.exerciseId)
      const score = epley(set.loadKg, set.reps)
      const priorScore = prior ? epley(prior.loadKg ?? 0, prior.reps ?? 0) : 0
      if (prior && score <= priorScore) continue
      const name = names.get(resolveId(exercise.exerciseId)) || exercise.exerciseId
      const existing = highlights.find((item) => item.name === name)
      if (!existing || score > epley(existing.loadKg, existing.reps)) {
        if (existing) {
          existing.loadKg = set.loadKg
          existing.reps = set.reps
        } else {
          highlights.push({ name, loadKg: set.loadKg, reps: set.reps })
        }
      }
    }
  }
  const snapshot: ProgressSnapshot = {
    dateKey: session.dateKey,
    exerciseCount: session.exercises.length,
    completedSets,
    totalVolumeKg,
  }
  if (session.startedAt && session.completedAt) {
    const duration = new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()
    if (Number.isFinite(duration) && duration > 0) snapshot.durationSec = Math.round(duration / 1000)
  }
  if (highlights.length > 0) snapshot.prHighlights = highlights.slice(0, 5)
  if (options.programName) snapshot.programName = options.programName
  return snapshot
}

export function snapshotStats(snapshot: ProgressSnapshot | null | undefined): SnapshotStats | null {
  if (!snapshot || snapshot.exerciseCount == null) return null
  return {
    exercises: snapshot.exerciseCount ?? 0,
    sets: snapshot.completedSets ?? 0,
    volumeKg: snapshot.totalVolumeKg ?? 0,
    prs: snapshot.prHighlights?.length ?? 0,
  }
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function formatWeight(kg: number, unit: WeightUnit = 'kg'): string {
  if (!Number.isFinite(kg) || kg <= 0) return '—'
  const converted = unit === 'lb' ? kg * 2.2046226218 : kg
  const scale = unit === 'lb' ? 10 : 100
  return `${Math.round(converted * scale) / scale} ${unit}`
}

export function formatProgressStats(stats: SnapshotStats, unit: WeightUnit = 'kg'): string {
  const parts = [plural(stats.exercises, 'exercise')]
  if (stats.sets > 0) parts.push(plural(stats.sets, 'set'))
  if (stats.volumeKg > 0) parts.push(`${formatWeight(stats.volumeKg, unit)} vol`)
  if (stats.prs > 0) parts.push(plural(stats.prs, 'PR'))
  return parts.join(' · ')
}

export function formatProgressDetail(
  post: { detail?: string | null; snapshot?: ProgressSnapshot | null },
  unit: WeightUnit = 'kg',
): string {
  const stats = snapshotStats(post.snapshot)
  const detail = post.detail ?? ''
  if (stats && stats.exercises > 0 && (post.snapshot?.autoDetail || AUTO_DETAIL.test(detail.trim()))) {
    return formatProgressStats(stats, unit)
  }
  return detail
}

export function defaultProgressDetail(session: WorkoutSession, snapshot: ProgressSnapshot): string {
  if (session.exercises.length === 0) {
    return session.sessionPad?.trim() || session.pad?.trim() ? 'Free-write session completed' : 'Session completed'
  }
  const stats = snapshotStats(snapshot)
  return stats ? formatProgressStats(stats, 'kg') : 'Session completed'
}
