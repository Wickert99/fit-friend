import type { SetType } from '../../types.ts'

const FOR_TIME = /for\s*time|time\s*trial|\btt\b/
const TIME =
  /^\d+\s*s(ec)?(\s|\/|$)|\d+\s*s(ec)?\s*(\/|each|per)\s*(side|leg|arm)|^\d+\s*(-\s*\d+\s*)?s(ec|econds?)?$/
const SIDE = /\/\s*(leg|side|arm)|per\s+(leg|side|arm)|each\s+(side|leg|arm)/

export function inferSetType(reps: string | undefined): SetType {
  const text = (reps ?? '').trim().toLowerCase()
  if (!text) return 'reps_load'
  if (text.includes('amrap')) return 'amrap'
  if (text.includes('emom')) return 'emom'
  if (FOR_TIME.test(text)) return 'for_time'
  if (TIME.test(text) || (/\d+\s*min/.test(text) && !text.includes('×') && !/^\d+$/.test(text))) return 'time'
  if (/\d+\s*(m|metres?|meters?|km)\b/.test(text) && !/\d+\s*min/.test(text)) return 'distance'
  if (SIDE.test(text)) return /leg/.test(text) ? 'per_leg' : 'each_side'
  return 'reps_load'
}

export function maxRepCount(reps: string | undefined): number | undefined {
  const matches = String(reps ?? '').match(/\d+/g)
  if (!matches) return undefined
  const value = Math.max(...matches.map(Number))
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function parseSeconds(reps: string | undefined, fallback = 45): number {
  const text = (reps ?? '').trim().toLowerCase()
  const seconds = text.match(/(\d+)\s*s(ec)?/)
  if (seconds) return Number(seconds[1])
  const minutes = text.match(/(\d+)\s*min/)
  if (minutes) return Number(minutes[1]) * 60
  const bare = text.match(/^(\d+)$/)
  return bare ? Number(bare[1]) : fallback
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function ordinal(value: number): string {
  const teen = value % 100
  if (teen >= 11 && teen <= 13) return `${value}th`
  const digit = value % 10
  if (digit === 1) return `${value}st`
  if (digit === 2) return `${value}nd`
  if (digit === 3) return `${value}rd`
  return `${value}th`
}
