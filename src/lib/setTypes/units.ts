import type { WeightUnit } from '../../types.ts'

const LB_PER_KG = 2.2046226218

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kg * LB_PER_KG : kg
}

export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value / LB_PER_KG : value
}

/** Plate round: 2.5 kg or 5 lb, returned in kilograms. */
export function roundLoadKg(kg: number, unit: WeightUnit): number {
  if (!Number.isFinite(kg) || kg <= 0) return 0
  if (unit === 'lb') return unitToKg(Math.round(kgToUnit(kg, 'lb') / 5) * 5, 'lb')
  return Math.round(kg / 2.5) * 2.5
}

export function formatExactLoad(kg: number, unit: WeightUnit): string {
  if (!Number.isFinite(kg) || kg <= 0) return '—'
  const display = kgToUnit(kg, unit)
  const factor = unit === 'lb' ? 10 : 100
  return `${Math.round(display * factor) / factor} ${unit}`
}

export function formatPlateLoad(kg: number, unit: WeightUnit): string {
  if (!Number.isFinite(kg) || kg <= 0) return '—'
  const rounded = roundLoadKg(kg, unit)
  const display = unit === 'lb' ? kgToUnit(rounded, 'lb') : rounded
  const text = Number.isInteger(display) ? String(display) : display.toFixed(1).replace(/\.0$/, '')
  return `${text} ${unit}`
}

export function percentToLoadKg(percent: number, maxKg: number, unit: WeightUnit): number {
  if (percent <= 0 || maxKg <= 0) return 0
  return roundLoadKg((percent / 100) * maxKg, unit)
}

/** Epley: load × (1 + reps/30), reps capped at 12. A single counts as the load. */
export function epley(loadKg: number, reps: number): number {
  if (loadKg <= 0 || reps <= 0) return 0
  if (reps === 1) return loadKg
  return loadKg * (1 + Math.min(reps, 12) / 30)
}

/** Brzycki: load × 36 / (37 − reps), reps capped at 12. */
export function brzycki(loadKg: number, reps: number): number {
  if (loadKg <= 0 || reps <= 0) return 0
  if (reps === 1) return loadKg
  const capped = Math.min(reps, 12)
  if (capped >= 37) return loadKg
  return loadKg * (36 / (37 - capped))
}

/** Average of Epley and Brzycki. A single returns the load unchanged. */
export function estimate1Rm(loadKg: number, reps: number): number {
  if (reps === 1) return loadKg
  return (epley(loadKg, reps) + brzycki(loadKg, reps)) / 2
}

export function spokenLoad(kg: number, unit: WeightUnit, exact: boolean): string {
  const text = exact ? formatExactLoad(kg, unit) : formatPlateLoad(kg, unit)
  if (!text || text === '—') return ''
  return unit === 'lb' ? text.replace(/ lb$/, ' pounds') : text.replace(/ kg$/, ' kilos')
}
