import type { PlanBoard, PlanDay, PlanWeek, Prescription } from '../../types.ts'
import { createId } from '../../store/id.ts'
import { focusColor } from './focus.ts'

export function stamp(board: PlanBoard, now = new Date().toISOString()): PlanBoard {
  return { ...board, updatedAt: now }
}

export function withWeeks(board: PlanBoard, weeks: PlanWeek[], now?: string): PlanBoard {
  return stamp({ ...board, weeks }, now)
}

export function addWeek(board: PlanBoard, id = createId('week')): { board: PlanBoard; weekId: string } {
  const week: PlanWeek = { id, label: `Week ${board.weeks.length + 1}`, days: [] }
  return { weekId: id, board: withWeeks(board, [...board.weeks, week]) }
}

export function renameWeek(board: PlanBoard, weekId: string, label: string): PlanBoard {
  return withWeeks(
    board,
    board.weeks.map((week) => (week.id === weekId ? { ...week, label } : week)),
  )
}

export function duplicateWeek(
  board: PlanBoard,
  weekId: string,
  id: (prefix: string) => string = createId,
): { board: PlanBoard; weekId: string } | null {
  const index = board.weeks.findIndex((week) => week.id === weekId)
  const source = board.weeks[index]
  if (!source) return null
  const copyId = id('week')
  const copy: PlanWeek = {
    id: copyId,
    label: `${source.label} copy`,
    days: source.days.map((day) => ({
      ...day,
      id: id('day'),
      exercises: day.exercises.map((exercise) => ({ ...exercise, id: id('pex') })),
    })),
  }
  const weeks = board.weeks.slice()
  weeks.splice(index + 1, 0, copy)
  return { weekId: copyId, board: withWeeks(board, weeks) }
}

function cleared(day: PlanDay): PlanDay {
  return { ...day, exercises: [], sessionPad: '', pad: '' }
}

export function clearWeek(board: PlanBoard, weekId: string): PlanBoard {
  return withWeeks(
    board,
    board.weeks.map((week) => (week.id === weekId ? { ...week, days: week.days.map(cleared) } : week)),
  )
}

export function deleteWeek(board: PlanBoard, weekId: string): PlanBoard {
  return withWeeks(
    board,
    board.weeks.filter((week) => week.id !== weekId),
  )
}

export function clearBoard(board: PlanBoard): PlanBoard {
  return withWeeks(
    board,
    board.weeks.map((week) => ({ ...week, days: week.days.map(cleared) })),
  )
}

function mapDay(board: PlanBoard, dayId: string, recipe: (day: PlanDay) => PlanDay): PlanBoard {
  return withWeeks(
    board,
    board.weeks.map((week) => ({
      ...week,
      days: week.days.map((day) => (day.id === dayId ? recipe(day) : day)),
    })),
  )
}

export function clearDay(board: PlanBoard, dayId: string): PlanBoard {
  return mapDay(board, dayId, cleared)
}

export function deleteDay(board: PlanBoard, dayId: string): PlanBoard {
  return withWeeks(
    board,
    board.weeks.map((week) => ({ ...week, days: week.days.filter((day) => day.id !== dayId) })),
  )
}

export function addDay(
  board: PlanBoard,
  weekId: string,
  partial: Partial<PlanDay> = {},
  id = createId('day'),
): { board: PlanBoard; dayId: string } | null {
  const week = board.weeks.find((item) => item.id === weekId)
  if (!week) return null
  const focus = partial.focus ?? 'Strength'
  const day: PlanDay = {
    id,
    name: partial.name ?? `Day ${week.days.length + 1}`,
    focus,
    color: focusColor(focus).accent,
    exercises: partial.exercises ?? [],
    sessionPad: partial.sessionPad ?? '',
    pad: partial.pad,
    isWhiteboard: focus === 'Free write',
    freeWrite: focus === 'Free write',
  }
  return {
    dayId: id,
    board: withWeeks(
      board,
      board.weeks.map((item) => (item.id === weekId ? { ...item, days: [...item.days, day] } : item)),
    ),
  }
}

export function updateDay(board: PlanBoard, dayId: string, recipe: (day: PlanDay) => PlanDay): PlanBoard {
  return mapDay(board, dayId, recipe)
}

/** Free write keeps the pad. Any other focus leaves the whiteboard so exercises can be added. */
export function setDayFocus(day: PlanDay, focus: string): PlanDay {
  const free = focus === 'Free write'
  return {
    ...day,
    focus,
    color: focusColor(focus).accent,
    isWhiteboard: free,
    freeWrite: free,
  }
}

export function moveExercise(day: PlanDay, index: number, direction: -1 | 1): PlanDay {
  const next = index + direction
  if (next < 0 || next >= day.exercises.length) return day
  const exercises = day.exercises.slice()
  const current = exercises[index]
  const swap = exercises[next]
  if (!current || !swap) return day
  exercises[index] = swap
  exercises[next] = current
  return { ...day, exercises }
}

export function blankPrescription(partial: Partial<Prescription> = {}): Prescription {
  return {
    exerciseId: '',
    setType: 'reps_load',
    sets: 3,
    reps: '8',
    restSec: 90,
    ...partial,
  }
}

export function findDay(board: PlanBoard, dayId: string): { week: PlanWeek; day: PlanDay } | null {
  for (const week of board.weeks) {
    const day = week.days.find((item) => item.id === dayId)
    if (day) return { week, day }
  }
  return null
}
