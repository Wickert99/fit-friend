import { format, isToday, isYesterday, parseISO } from 'date-fns'

export function formatWhen(value: string | null | undefined): string {
  if (!value) return ''
  const date = parseISO(value)
  if (Number.isNaN(date.getTime())) return ''
  if (isToday(date)) return `Today ${format(date, 'h:mm a')}`
  if (isYesterday(date)) return `Yesterday ${format(date, 'h:mm a')}`
  return format(date, 'EEE d MMM · h:mm a')
}

export function formatStamp(value: string): string {
  const date = parseISO(value)
  if (Number.isNaN(date.getTime())) return value
  return format(date, 'd MMM yyyy, h:mm a')
}
