import type { LiftFamily, LiftMax } from '../../types.ts'

export interface FamilyFallback {
  target: string
  source: string
  factor: number
  note: string
}

/** Related-lift stand-ins used when that family has no max of its own. */
export const FAMILY_FALLBACKS: FamilyFallback[] = [
  { target: 'front_squat', source: 'back_squat', factor: 0.85, note: 'Front squat ≈ 85% of back squat when no front-squat max is set' },
  { target: 'oh_squat', source: 'front_squat', factor: 0.8, note: 'OHS ≈ 80% of front squat (mobility-limited; rough)' },
  { target: 'oh_squat', source: 'back_squat', factor: 0.65, note: 'OHS ≈ 65% of back squat if neither OHS nor front max exists' },
  { target: 'rdl', source: 'conventional_dl', factor: 0.75, note: 'RDL ≈ 75% of conventional deadlift (common S&C heuristic)' },
  { target: 'sumo_dl', source: 'conventional_dl', factor: 1, note: 'Sumo often comparable to conventional; 1:1 until a sumo max is set' },
  { target: 'trap_bar_dl', source: 'conventional_dl', factor: 1.05, note: 'Trap bar often slightly above conventional' },
  { target: 'cg_bench', source: 'bench', factor: 0.9, note: 'Close-grip ≈ 90% of competition bench' },
  { target: 'incline_bb_bench', source: 'bench', factor: 0.85, note: 'Incline BB ≈ 85% of flat bench' },
  { target: 'push_press', source: 'ohp', factor: 1.15, note: 'Push press typically above strict press' },
  { target: 'hang_clean', source: 'power_clean', factor: 0.95, note: 'Hang clean slightly below floor power clean for many athletes' },
  { target: 'clean_jerk', source: 'power_clean', factor: 1, note: 'C&J often limited by jerk; use power-clean max as stand-in' },
  { target: 'hang_snatch', source: 'power_snatch', factor: 0.95, note: 'Hang snatch ≈ 95% of power snatch' },
  { target: 'chinup', source: 'pullup', factor: 1.05, note: 'Chin-up (supinated) often slightly stronger than pull-up' },
]

export function canonicalExerciseId(exerciseId: string, aliases: Record<string, string> = {}): string {
  return aliases[exerciseId] ?? exerciseId
}

export function familyIdFor(exerciseId: string, families: LiftFamily[], aliases: Record<string, string> = {}): string {
  const id = canonicalExerciseId(exerciseId, aliases)
  const family = families.find((item) => item.members.includes(id) || item.primaryExerciseId === id)
  return family?.id ?? `ex:${id}`
}

export function familyById(familyId: string, families: LiftFamily[]): LiftFamily | undefined {
  return families.find((family) => family.id === familyId)
}

export function familyName(familyId: string, families: LiftFamily[], fallback: string): string {
  if (familyId.startsWith('ex:')) return fallback
  return familyById(familyId, families)?.name || fallback
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

export function resolveMax(
  exerciseId: string,
  liftMaxes: Record<string, LiftMax> | undefined,
  families: LiftFamily[],
  aliases: Record<string, string> = {},
): ResolvedMax | null {
  if (!liftMaxes) return null
  const familyId = familyIdFor(exerciseId, families, aliases)
  const direct = liftMaxes[familyId]
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
  for (const fallback of FAMILY_FALLBACKS.filter((item) => item.target === familyId)) {
    const source = liftMaxes[fallback.source]
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
  return null
}
