import type { WeightUnit } from '../../types.ts'

const LB_PER_KG = 2.2046226218

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? kg * LB_PER_KG : kg
}

export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? value / LB_PER_KG : value
}

/** Round a kilogram value to the plate the athlete actually loads. */
export function roundToPlate(kg: number, unit: WeightUnit): number {
  if (!Number.isFinite(kg) || kg <= 0) return 0
  if (unit === 'lb') {
    const pounds = kgToUnit(kg, 'lb')
    return unitToKg(Math.round(pounds / 5) * 5, 'lb')
  }
  return Math.round(kg / 2.5) * 2.5
}

export function formatWeight(kg: number, unit: WeightUnit): string {
  if (!Number.isFinite(kg) || kg <= 0) return '—'
  const rounded = roundToPlate(kg, unit)
  const display = unit === 'lb' ? kgToUnit(rounded, 'lb') : rounded
  return `${trimNumber(display)} ${unit}`
}

/** Unrounded display number used beside an explicit unit, e.g. PR rows. */
export function formatWeightNumber(kg: number, unit: WeightUnit): string {
  if (!Number.isFinite(kg) || kg <= 0) return '0'
  return trimNumber(Math.round(kgToUnit(kg, unit) * 10) / 10)
}

export function formatVolume(kg: number, unit: WeightUnit): string {
  const display = Math.round(kgToUnit(Math.max(0, kg || 0), unit))
  return `${display.toLocaleString('en-AU')} ${unit}`
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
