import type { Prescription, SetScheme, SetType } from '../../types.ts'
import { applySetType, readPercent, readRir, readSchemes, withSchemes } from '../../lib/setTypes/index.ts'

const WAVE_TYPES = new Set<SetType>(['reps_load', 'each_side', 'per_leg', 'distance', 'time'])

export function isWaveType(setType: SetType): boolean {
  return WAVE_TYPES.has(setType)
}

/** Keep spec aliases (`percent1RM`, `rir`, `waves`) in step with the canonical fields. */
export function mirrorPrescription(prescription: Prescription): Prescription {
  const percent = readPercent(prescription)
  const rir = readRir(prescription)
  const schemes = readSchemes(prescription)
  const next: Prescription = { ...prescription }
  if (percent == null) delete next.percent1RM
  else {
    next.targetPercent1RM = percent
    next.percent1RM = percent
  }
  if (rir == null) delete next.rir
  else {
    next.targetRir = rir
    next.rir = rir
  }
  if (schemes && schemes.length > 0) {
    next.schemes = schemes
    next.waves = schemes
  }
  return next
}

export function changePrescriptionType(prescription: Prescription, setType: SetType): Prescription {
  return mirrorPrescription(applySetType(prescription, setType))
}

export function patchPrescription(prescription: Prescription, patch: Partial<Prescription>): Prescription {
  const next: Prescription = { ...prescription, ...patch }
  if ('targetPercent1RM' in patch || 'percent1RM' in patch) {
    const percent = patch.targetPercent1RM ?? patch.percent1RM
    if (percent == null) {
      delete next.targetPercent1RM
      delete next.percent1RM
    } else {
      next.targetPercent1RM = percent
      next.percent1RM = percent
    }
  }
  if ('targetRir' in patch || 'rir' in patch) {
    const rir = patch.targetRir ?? patch.rir
    if (rir == null) {
      delete next.targetRir
      delete next.rir
    } else {
      next.targetRir = rir
      next.rir = rir
    }
  }
  const stored = readSchemes(prescription)
  if (stored && stored.length > 0 && isWaveType(next.setType)) {
    const [first, ...rest] = stored
    if (!first) return mirrorPrescription(next)
    let sets = first.sets
    if (patch.sets != null) {
      if (stored.length === 1) sets = Math.max(1, patch.sets)
      else {
        const others = rest.reduce((total, scheme) => total + Math.max(1, scheme.sets), 0)
        sets = Math.max(1, patch.sets - others)
      }
    }
    const updated: SetScheme = {
      ...first,
      sets,
      reps: patch.reps ?? first.reps,
      restSec: patch.restSec ?? first.restSec ?? next.restSec,
      targetLoadKg: 'targetLoadKg' in patch ? patch.targetLoadKg : first.targetLoadKg,
      targetPercent1RM: 'targetPercent1RM' in patch || 'percent1RM' in patch ? readPercent(next) : readPercent(first),
      targetRpe: 'targetRpe' in patch ? patch.targetRpe : first.targetRpe,
      targetRir: 'targetRir' in patch || 'rir' in patch ? readRir(next) : readRir(first),
    }
    return withSchemes(
      next,
      [updated, ...rest].map((scheme, index) => ({ ...scheme, id: scheme.id || `sch-${index + 1}` })),
    )
  }
  return mirrorPrescription(next)
}

export function replaceSchemes(prescription: Prescription, schemes: SetScheme[]): Prescription {
  return withSchemes(prescription, schemes)
}
