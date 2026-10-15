import { todayKey } from '../../store/id.ts'

export function parseKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

export function shiftKey(dateKey: string, days: number): string {
  const date = parseKey(dateKey)
  date.setDate(date.getDate() + days)
  return todayKey(date)
}
