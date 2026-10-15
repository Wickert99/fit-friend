import type { AppState } from '../types.ts'
import { exerciseAliases, initialState } from './catalog.ts'
import { mergeWithSeed as mergeStates, normalizeState } from './normalize.ts'

export function buildSeedState(): AppState {
  return normalizeState(initialState)
}

export function mergeWithSeed(user: AppState, seed: AppState = buildSeedState()): AppState {
  return mergeStates(user, seed, exerciseAliases)
}
