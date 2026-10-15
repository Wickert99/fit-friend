import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  isToday,
  isYesterday,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns'

export const WEEK_OPTS = { weekStartsOn: 1 as const }

export function parseKey(key: string): Date {
  return parseISO(`${key}T12:00:00`)
}

export function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function todayKey(now = new Date()): string {
  return dateKey(now)
}

export function addDaysKey(key: string, days: number): string {
  return dateKey(addDays(parseKey(key), days))
}

export function weekStartKey(key: string): string {
  return dateKey(startOfWeek(parseKey(key), WEEK_OPTS))
}

export function addWeeksKey(key: string, weeks: number): string {
  return dateKey(addWeeks(parseKey(key), weeks))
}

/** Monday after the week that contains `key`. */
export function nextMondayKey(key: string): string {
  return addDaysKey(weekStartKey(key), 7)
}

/** Thursday through Sunday. A commit opened then prefers the following Monday. */
export function isLateInWeek(key: string): boolean {
  const day = getDay(parseKey(key))
  return day === 0 || day >= 4
}

/**
 * Future dates stay. Otherwise a Thu–Sun "today" moves to next Monday so the
 * first week is a full Mon–Sun week.
 */
export function defaultStartKey(requested: string | undefined, today: string): string {
  if (requested && requested > today) return requested
  return isLateInWeek(today) ? nextMondayKey(today) : today
}

export function clampToToday(start: string, today: string): { key: string; clamped: boolean } {
  if (start < today) return { key: today, clamped: true }
  return { key: start, clamped: false }
}

export function daysBetween(earlier: string, later: string): number {
  return differenceInCalendarDays(parseKey(later), parseKey(earlier))
}

export function weeksBetween(earlier: string, later: string): number {
  return differenceInCalendarWeeks(parseKey(later), parseKey(earlier), WEEK_OPTS)
}

export function formatKey(key: string, pattern: string): string {
  return format(parseKey(key), pattern)
}

export function streakFromDays(days: string[], today = new Date()): number {
  const owned = new Set(days)
  let count = 0
  for (let offset = 0; offset < 60; offset++) {
    const key = dateKey(subDays(today, offset))
    if (owned.has(key)) count++
    else if (offset > 0) break
  }
  return count
}

export {
  addMonths,
  addYears,
  differenceInCalendarWeeks,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  isToday,
  isYesterday,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
}
