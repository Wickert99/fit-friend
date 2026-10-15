import type { LiftMax, LiftMaxKind, ScoreRecordDef, WeightUnit } from '../../types.ts'
import { formatWeight, roundToPlate, unitToKg } from './units.ts'

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const total = Math.round(seconds * 10) / 10
  if (total < 60) return Number.isInteger(total) ? `${total}s` : `${total.toFixed(1)}s`
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = Math.round((total % 60) * 10) / 10
  const secText = Number.isInteger(secs) ? String(secs).padStart(2, '0') : secs.toFixed(1).padStart(4, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secText}` : `${minutes}:${secText}`
}

/** Accepts `12.4`, `12.4s`, `1:23.5`, or `1:02:03`. */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/s$/, '')
  if (!text) return null
  if (/^\d+(\.\d+)?$/.test(text)) {
    const value = Number(text)
    return Number.isFinite(value) && value > 0 ? value : null
  }
  const parts = text.split(':').map((part) => part.trim())
  if (parts.some((part) => part === '' || !/^\d+(\.\d+)?$/.test(part))) return null
  const numbers = parts.map(Number)
  if (numbers.some((value) => !Number.isFinite(value))) return null
  if (numbers.length === 2) {
    const [minutes, seconds] = numbers
    if (minutes == null || seconds == null || seconds >= 60) return null
    return minutes * 60 + seconds
  }
  if (numbers.length === 3) {
    const [hours, minutes, seconds] = numbers
    if (hours == null || minutes == null || seconds == null || minutes >= 60 || seconds >= 60) return null
    return hours * 3600 + minutes * 60 + seconds
  }
  return null
}

export function formatRounds(rounds: number, extraReps?: number): string {
  if (!Number.isFinite(rounds) || rounds < 0) return '—'
  return extraReps && extraReps > 0 ? `${rounds} + ${extraReps}` : `${rounds} rounds`
}

export function formatRecord(record: LiftMax | undefined, unit: WeightUnit): string {
  if (!record) return 'Not set'
  const kind = record.kind ?? 'strength'
  const strengthLike =
    kind === 'strength' ||
    (record.maxKg > 0 && !record.bestTimeSec && record.bestRounds == null)
  if (strengthLike && record.maxKg > 0) return formatWeight(record.maxKg, unit)
  if (record.bestTimeSec != null && record.bestTimeSec > 0) return formatDuration(record.bestTimeSec)
  if (record.bestRounds != null && record.bestRounds >= 0) return formatRounds(record.bestRounds, record.bestExtraReps)
  if (record.maxKg > 0) return formatWeight(record.maxKg, unit)
  return 'Not set'
}

export function strengthMax(familyId: string, name: string, displayValue: number, unit: WeightUnit, notes?: string, sourceExerciseId?: string): LiftMax {
  return {
    familyId,
    name,
    kind: 'strength',
    maxKg: roundToPlate(unitToKg(displayValue, unit), unit),
    estimated: false,
    updatedAt: new Date().toISOString(),
    notes,
    sourceExerciseId,
  }
}

export function timeRecord(
  familyId: string,
  name: string,
  seconds: number,
  kind: Extract<LiftMaxKind, 'run' | 'benchmark'>,
  notes?: string,
  sourceExerciseId?: string,
): LiftMax {
  return {
    familyId,
    name,
    kind,
    maxKg: 0,
    bestTimeSec: seconds,
    estimated: false,
    updatedAt: new Date().toISOString(),
    notes,
    sourceExerciseId,
  }
}

export function amrapRecord(
  familyId: string,
  name: string,
  rounds: number,
  extraReps: number | undefined,
  notes?: string,
  sourceExerciseId?: string,
): LiftMax {
  return {
    familyId,
    name,
    kind: 'benchmark',
    maxKg: 0,
    bestRounds: rounds,
    bestExtraReps: extraReps && extraReps > 0 ? extraReps : undefined,
    estimated: false,
    updatedAt: new Date().toISOString(),
    notes,
    sourceExerciseId,
  }
}

export function estimatedStrengthMax(familyId: string, name: string, maxKg: number, sourceExerciseId?: string, notes?: string): LiftMax {
  return {
    familyId,
    name,
    kind: 'strength',
    maxKg: roundToPlate(maxKg, 'kg'),
    estimated: true,
    updatedAt: new Date().toISOString(),
    sourceExerciseId,
    notes,
  }
}

export function recordKind(record: LiftMax, catalogs: { runs: ScoreRecordDef[]; benchmarks: ScoreRecordDef[] }): 'strength' | 'run' | 'benchmark' {
  if (record.kind === 'run' || record.kind === 'benchmark' || record.kind === 'strength') return record.kind
  return catalogs.runs.find((item) => item.id === record.familyId)?.kind
    ?? catalogs.benchmarks.find((item) => item.id === record.familyId)?.kind
    ?? 'strength'
}
