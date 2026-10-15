import type { AppState, PlannedSession } from '../../types.ts'
import { exerciseAliases, liftFamilies } from '../../store/catalog.ts'
import { startFromPlan, type StartMode, type StartResult, type TrainingContext } from './logic.ts'

export function trainingContext(state: AppState): TrainingContext {
  return {
    exercises: state.exercises,
    liftMaxes: state.liftMaxes,
    weightUnit: state.weightUnit,
    families: liftFamilies,
    aliases: exerciseAliases,
  }
}

/** Save the plan, then start, resume, or report an in-progress conflict. */
export function applyStart(state: AppState, plan: PlannedSession, mode: StartMode = 'return'): StartResult {
  const seeded: AppState = {
    ...state,
    plannedSessions: {
      ...state.plannedSessions,
      [plan.dateKey]: { ...plan, updatedAt: new Date().toISOString() },
    },
  }
  return startFromPlan(seeded, plan, trainingContext(seeded), mode)
}
