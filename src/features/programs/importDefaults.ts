import type { LiftMax, LoadMode, Program } from '../../types.ts'
import { isTestingProgram, missingMaxes, wantsPreparation, type MainLiftRef } from '../../lib/personalize/index.ts'

export interface ImportDefaults {
  testing: boolean
  missing: MainLiftRef[]
  prepWeek: boolean
  retestWeek: boolean
  mode: LoadMode
}

/** Prep starts on only for strength-style programs that still need maxes and are not a testing block. */
export function importDefaults(program: Program, maxes: Record<string, LiftMax> | undefined): ImportDefaults {
  const testing = isTestingProgram(program)
  const missing = missingMaxes(program, maxes)
  return {
    testing,
    missing,
    prepWeek: wantsPreparation(program) && !testing && missing.length > 0,
    retestWeek: false,
    mode: missing.length > 0 ? 'find_working' : 'resolve',
  }
}
