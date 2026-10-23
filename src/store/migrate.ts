import type { AppState } from '../types.ts'
import { indexCompletedPlans, indexPlansById, uniqueSessionIds } from './dayPlans.ts'
import { FORMAT_VERSION } from './keys.ts'
import { normalizeState, remapExerciseAliases } from './normalize.ts'

export interface Migration {
  version: number
  id: string
  description: string
  apply: (state: AppState, aliases: Record<string, string>) => AppState
}

/**
 * Versioned upgrades for fit-friend-v1 … v5 blobs.
 * v1 fills missing collections and normalizes sets.
 * v2 remaps legacy exercise ids and marks the catalog split (exercises + programs
 * are stored beside the state document).
 */
export const migrations: Migration[] = [
  {
    version: 1,
    id: 'core-collections',
    description: 'Fill missing collections, weight unit, session rows, and prescription set types.',
    apply: (state) => normalizeState(state),
  },
  {
    version: 2,
    id: 'alias-remap-and-catalog',
    description: 'Remap legacy exercise ids. Persistence then splits the exercise catalog out of the state blob.',
    apply: (state, aliases) => remapExerciseAliases(normalizeState(state), aliases),
  },
  {
    version: 3,
    id: 'paused-sessions',
    description: 'Keep paused workouts. Extra in-progress sessions are parked as paused instead of being dropped.',
    apply: (state) => parkExtraOpenSessions(state),
  },
  {
    version: 4,
    id: 'unique-session-ids',
    description: 'Keep every workout. Each session and plan is stored by its own id so a second workout on the same day does not replace the first.',
    apply: (state) => assignUniqueWorkoutIds(state),
  },
]

/** Give every logged session and planned workout its own id. Nothing is dropped. */
export function assignUniqueWorkoutIds(state: AppState): AppState {
  const sessions = uniqueSessionIds(state.sessions)
  const plannedSessions = indexPlansById(state.plannedSessions)
  const completedPlans = indexCompletedPlans(state.completedPlans)
  const sameSessions = sessions.every((session, index) => session === state.sessions[index])
  const samePlans = plannedSessions === state.plannedSessions || samePlanMap(plannedSessions, state.plannedSessions)
  const sameCompleted = completedPlans === state.completedPlans
  if (sameSessions && samePlans && sameCompleted) return state
  return {
    ...state,
    sessions,
    plannedSessions,
    ...(completedPlans ? { completedPlans } : {}),
  }
}

function samePlanMap(left: AppState['plannedSessions'], right: AppState['plannedSessions']): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => left[key] === right[key])
}

/** Leave one in-progress session. Any others are paused so their sets survive. */
export function parkExtraOpenSessions(state: AppState, now = new Date().toISOString()): AppState {
  const open = state.sessions.filter((session) => session.status === 'in_progress')
  const ranked = [...open].sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
  const keep = open.length > 1 ? ranked[0]?.id : undefined
  let changed = false
  const sessions = state.sessions.map((session) => {
    const extra = session.status === 'in_progress' && keep != null && session.id !== keep
    const stamp = session.status === 'paused' && !session.pausedAt
    if (!extra && !stamp) return session
    changed = true
    return {
      ...session,
      status: 'paused' as const,
      pausedAt: session.pausedAt ?? now,
    }
  })
  return changed ? { ...state, sessions } : state
}

export function runMigrations(
  raw: unknown,
  fromVersion: number,
  aliases: Record<string, string>,
): { state: AppState; applied: string[] } {
  let state = normalizeState(raw)
  const applied: string[] = []
  for (const migration of migrations) {
    if (migration.version <= fromVersion || migration.version > FORMAT_VERSION) continue
    state = migration.apply(state, aliases)
    applied.push(migration.id)
  }
  return { state, applied }
}
