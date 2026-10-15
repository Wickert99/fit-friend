import type { LiftFamily, LiftMax, WeightUnit } from '../../types.ts'
import { LIFT_FALLBACKS } from './fallbacks.ts'
import { roundToPlate } from './units.ts'

export interface ResolvedMax {
  familyId: string
  maxKg: number
  sourceFamilyId: string
  estimated: boolean
  viaFallback: boolean
  fallbackNote?: string
  factor?: number
}

export function familyById(families: LiftFamily[], id: string): LiftFamily | undefined {
  return families.find((family) => family.id === id)
}

export function familyIdForExercise(
  exerciseId: string,
  families: LiftFamily[],
  aliases: Record<string, string> = {},
): string {
  const id = aliases[exerciseId] ?? exerciseId
  for (const family of families) {
    if (family.members.includes(id) || family.primaryExerciseId === id) return family.id
  }
  return `ex:${id}`
}

export function familyLabel(familyId: string, families: LiftFamily[]): string {
  const known = familyById(families, familyId)
  if (known) return known.name
  if (familyId.startsWith('ex:')) return familyId.slice(3)
  return familyId
}

/**
 * Direct family max, or the first related fallback whose source has a stored max.
 * A stored max always wins, including an estimated one.
 */
export function resolveFamilyMax(
  familyId: string,
  maxes: Record<string, LiftMax>,
  fallbacks = LIFT_FALLBACKS,
): ResolvedMax | null {
  const direct = maxes[familyId]
  if (direct && direct.maxKg > 0) {
    return {
      familyId,
      maxKg: direct.maxKg,
      sourceFamilyId: familyId,
      estimated: !!direct.estimated,
      viaFallback: false,
    }
  }
  if (familyId.startsWith('ex:')) return null
  for (const rule of fallbacks) {
    if (rule.target !== familyId) continue
    const source = maxes[rule.source]
    if (!source || !(source.maxKg > 0)) continue
    return {
      familyId,
      maxKg: source.maxKg * rule.factor,
      sourceFamilyId: rule.source,
      estimated: !!source.estimated,
      viaFallback: true,
      fallbackNote: rule.note,
      factor: rule.factor,
    }
  }
  return null
}

export function resolveExerciseMax(
  exerciseId: string,
  maxes: Record<string, LiftMax>,
  families: LiftFamily[],
  aliases: Record<string, string> = {},
): ResolvedMax | null {
  return resolveFamilyMax(familyIdForExercise(exerciseId, families, aliases), maxes)
}

/** Percent of a resolved 1RM, rounded to the loading plate. */
export function loadFromPercent(percent: number, maxKg: number, unit: WeightUnit): number {
  if (percent <= 0 || maxKg <= 0) return 0
  return roundToPlate((percent / 100) * maxKg, unit)
}
