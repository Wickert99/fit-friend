import type { LiftMax, WeightUnit } from '../../types.ts'
import { exerciseIdAliases, familyFallbacks, liftFamilies, type FamilyDef } from './families.ts'

const KG_PER_LB = 2.2046226218

const byMember = new Map<string, string>()
for (const family of liftFamilies) {
  for (const member of family.members) byMember.set(member, family.id)
}

export function canonicalExerciseId(id: string): string {
  return exerciseIdAliases[id] ?? id
}

export function familyIdForExercise(exerciseId: string): string {
  const id = canonicalExerciseId(exerciseId)
  return byMember.get(id) ?? `ex:${id}`
}

export function familyById(id: string): FamilyDef {
  const found = liftFamilies.find((family) => family.id === id)
  if (found) return found
  if (id.startsWith('ex:')) {
    const exerciseId = id.slice(3)
    return { id, name: exerciseId, primaryExerciseId: exerciseId, members: [exerciseId] }
  }
  return { id, name: id, primaryExerciseId: '', members: [] }
}

export interface ResolvedMax {
  familyId: string
  maxKg: number
  sourceFamilyId: string
  estimated: boolean
  viaFallback: boolean
  fallbackNote?: string
  factor?: number
}

export function resolveMax(exerciseId: string, maxes: Record<string, LiftMax> | undefined): ResolvedMax | null {
  if (!maxes) return null
  const familyId = familyIdForExercise(exerciseId)
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
  if (!familyId.startsWith('ex:')) {
    for (const fallback of familyFallbacks) {
      if (fallback.target !== familyId) continue
      const source = maxes[fallback.source]
      if (source && source.maxKg > 0) {
        return {
          familyId,
          maxKg: source.maxKg * fallback.factor,
          sourceFamilyId: fallback.source,
          estimated: !!source.estimated,
          viaFallback: true,
          fallbackNote: fallback.note,
          factor: fallback.factor,
        }
      }
    }
  }
  return null
}

export function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + Math.min(reps, 12) / 30)
}

export function brzycki(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  const capped = Math.min(reps, 12)
  if (capped >= 37) return weight
  return weight * (36 / (37 - capped))
}

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value / KG_PER_LB : value
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kg * KG_PER_LB : kg
}

/** Round a kilogram load to the plate the lifter would actually load. */
export function roundLoad(kg: number, unit: WeightUnit): number {
  if (!Number.isFinite(kg) || kg <= 0) return 0
  if (unit === 'lb') {
    const pounds = fromKg(kg, 'lb')
    return toKg(Math.round(pounds / 5) * 5, 'lb')
  }
  return Math.round(kg / 2.5) * 2.5
}

export function percentToKg(percent: number, maxKg: number, unit: WeightUnit): number {
  if (percent <= 0 || maxKg <= 0) return 0
  return roundLoad((percent / 100) * maxKg, unit)
}

export function formatLoad(kg: number, unit: WeightUnit): string {
  if (!Number.isFinite(kg) || kg <= 0) return '—'
  const shown = fromKg(kg, unit)
  const factor = unit === 'lb' ? 10 : 100
  const rounded = Math.round(shown * factor) / factor
  return `${rounded} ${unit}`
}

export function estimatedMaxFromSet(load: number, reps: number, unit: WeightUnit): number {
  return roundLoad(epley(toKg(load, unit), reps), unit)
}

export function makeLiftMax(input: {
  familyId: string
  name: string
  maxKg: number
  estimated?: boolean
  sourceExerciseId?: string
  notes?: string
  now?: string
}): LiftMax {
  return {
    familyId: input.familyId,
    name: input.name,
    kind: 'strength',
    maxKg: input.maxKg,
    estimated: input.estimated ?? false,
    sourceExerciseId: input.sourceExerciseId,
    updatedAt: input.now ?? new Date().toISOString(),
    notes: input.notes,
  }
}
