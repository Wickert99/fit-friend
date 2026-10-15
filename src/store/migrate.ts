import type { AppState } from '../types.ts'
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
]

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
