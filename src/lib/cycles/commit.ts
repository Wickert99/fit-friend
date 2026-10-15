import type { PlanBoard, PlanDay, Prescription, Program, ProgramDay, SetType } from '../../types.ts'
import { addDaysKey, clampToToday, daysBetween, formatKey, weekStartKey } from './dates.ts'

export type CommitMode = 'weekday' | 'consecutive'

export interface CommitDay extends ProgramDay {
  weekIndex?: number
  boardDayId?: string
}

export interface CommitMapping {
  dateKey: string
  programDayId: string
  dayName: string
  label: string
  weekIndex: number
}

export interface CommitPreview {
  mappings: CommitMapping[]
  startKey: string
  endKey: string
  mode: CommitMode
  repacked: number
  spilled: number
  clampedToToday: boolean
}

export interface RunStretch {
  length: number
  startKey: string
  week: number
}

interface Slot {
  day: CommitDay
  weekIndex: number
  key: string | null
}

export type IdFactory = (prefix: string) => string

type BoardExercise = Prescription & { placeholder?: string }

function asCommitDay(day: ProgramDay): CommitDay {
  return day as CommitDay
}

export function defaultCommitMode(program: Program): CommitMode {
  return program.days.some((day) => (day.weekday ?? -1) >= 0) ? 'weekday' : 'consecutive'
}

function weekdayOffset(weekday: number): number | null {
  if (weekday < 0) return null
  return weekday === 0 ? 6 : weekday - 1
}

export function inferredWeekday(day: object, index: number): number {
  const weekday = 'weekday' in day ? day.weekday : undefined
  if (typeof weekday === 'number' && weekday >= -1 && weekday <= 6) return weekday
  const slot = index % 7
  return slot === 6 ? 0 : slot + 1
}

function pinnedKey(weekday: number | undefined, monday: string, weekIndex: number): string | null {
  if (weekday == null || weekday < 0) return null
  const offset = weekdayOffset(weekday)
  if (offset == null) return null
  return addDaysKey(monday, weekIndex * 7 + offset)
}

function toMapping(day: CommitDay, dateKey: string, weekIndex: number): CommitMapping {
  return {
    dateKey,
    programDayId: day.id,
    dayName: day.name,
    label: formatKey(dateKey, 'EEE d MMM'),
    weekIndex,
  }
}

function longestRun(keys: string[]): number {
  const unique = [...new Set(keys)].sort()
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const key of unique) {
    run = previous && addDaysKey(previous, 1) === key ? run + 1 : 1
    best = Math.max(best, run)
    previous = key
  }
  return best
}

/** Place pinned days, sliding anything that would start in the past or collide. */
export function packSlots(slots: Slot[], startKey: string, weekMonday: string, maxRun?: number): {
  mappings: CommitMapping[]
  repacked: number
  spilled: number
} {
  const limit =
    maxRun ??
    Math.max(4, longestRun(packSlots(slots, weekMonday, weekMonday, Number.POSITIVE_INFINITY).mappings.map((item) => item.dateKey)))
  const occupied = new Set<string>()
  const mappings: CommitMapping[] = []
  let repacked = 0
  let spilled = 0
  const place = (slot: Slot, key: string) => {
    occupied.add(key)
    mappings.push(toMapping(slot.day, key, slot.weekIndex))
  }
  const runIfPlaced = (key: string) => {
    let count = 1
    for (let cursor = addDaysKey(key, -1); occupied.has(cursor); cursor = addDaysKey(cursor, -1)) count++
    for (let cursor = addDaysKey(key, 1); occupied.has(cursor); cursor = addDaysKey(cursor, 1)) count++
    return count
  }
  const weekCount = slots.reduce((max, slot) => Math.max(max, slot.weekIndex + 1), 0)
  const horizon = addDaysKey(weekMonday, (weekCount + 1) * 7 - 1)
  const findSpot = (from: string) => {
    let best: string | null = null
    let bestRun = Number.POSITIVE_INFINITY
    for (let cursor = from, guard = 0; cursor <= horizon || best == null; cursor = addDaysKey(cursor, 1), guard++) {
      if (guard > 400) break
      if (occupied.has(cursor)) continue
      const run = runIfPlaced(cursor)
      if (run <= limit) return cursor
      if (run < bestRun) {
        bestRun = run
        best = cursor
      }
      if (cursor > horizon && best != null) break
    }
    return best ?? from
  }
  const pinned = slots.filter((slot) => slot.key != null)
  const weekZero = pinned.filter((slot) => slot.weekIndex === 0).sort((a, b) => (a.key ?? '').localeCompare(b.key ?? ''))
  const shifted = weekZero.some((slot) => (slot.key ?? '') < startKey)
  const collisions: Slot[] = []
  for (const slot of shifted ? pinned.filter((slot) => slot.weekIndex !== 0) : pinned) {
    if (slot.key && occupied.has(slot.key)) collisions.push(slot)
    else if (slot.key) place(slot, slot.key)
  }
  if (shifted) {
    const weekEnd = addDaysKey(weekMonday, 6)
    let cursor = startKey
    for (const slot of weekZero) {
      const preferred = slot.key && slot.key > cursor ? slot.key : cursor
      const placed = findSpot(preferred)
      if (placed !== slot.key) repacked++
      if (placed > weekEnd) spilled++
      place(slot, placed)
      cursor = addDaysKey(placed, 1)
    }
  }
  for (const slot of collisions) {
    const key = slot.key ?? startKey
    place(slot, findSpot(addDaysKey(key, 1)))
    repacked++
  }
  for (let week = 0; week < weekCount; week++) {
    const weekStart = addDaysKey(weekMonday, week * 7)
    const weekEnd = addDaysKey(weekStart, 6)
    for (const slot of slots) {
      if (slot.weekIndex !== week || slot.key != null) continue
      const placed = findSpot(weekStart < startKey ? startKey : weekStart)
      if (placed > weekEnd) spilled++
      place(slot, placed)
    }
  }
  mappings.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  return { mappings, repacked, spilled }
}

function finish(mappings: CommitMapping[], start: string, mode: CommitMode, extra: { repacked: number; spilled: number; clamped: boolean }): CommitPreview {
  const keys = mappings.map((item) => item.dateKey)
  return {
    mappings,
    startKey: keys[0] ?? start,
    endKey: keys[keys.length - 1] ?? start,
    mode,
    repacked: extra.repacked,
    spilled: extra.spilled,
    clampedToToday: extra.clamped,
  }
}

function weekIndexList(days: CommitDay[], description: string, weeks: number): (number | null)[] | null {
  if (days.length === 0) return null
  if (days.some((day) => day.weekIndex != null)) {
    return days.map((day) => (day.weekIndex == null ? null : day.weekIndex))
  }
  if (!/plan board/i.test(description) || weeks <= 1 || days.some((day) => (day.weekday ?? 0) < 0)) return null
  const order = (weekday: number) => (weekday === 0 ? 7 : weekday)
  const indexes: number[] = []
  let week = 0
  let previous = -1
  for (const day of days) {
    const value = order(day.weekday ?? 0)
    if (previous >= 0 && value <= previous) week++
    indexes.push(week)
    previous = value
  }
  return week + 1 === weeks ? indexes : null
}

export function previewProgram(
  program: Program,
  start: string,
  mode: CommitMode,
  today: string,
  options: { repeatWeeks?: boolean } = {},
): CommitPreview {
  const { key, clamped } = clampToToday(start, today)
  const days = program.days.map(asCommitDay)
  const indexed = weekIndexList(days, program.description, program.weeks)
  if (mode === 'consecutive') {
    const sequence: { day: CommitDay; weekIndex: number }[] = []
    if (indexed) {
      days.forEach((day, index) => sequence.push({ day, weekIndex: indexed[index] ?? 0 }))
    } else {
      const repeats = options.repeatWeeks ? Math.max(1, program.weeks) : 1
      for (let week = 0; week < repeats; week++) {
        for (const day of days) sequence.push({ day, weekIndex: week })
      }
    }
    const mappings = sequence.map((item, index) => toMapping(item.day, addDaysKey(key, index), item.weekIndex))
    return finish(mappings, key, mode, { repacked: 0, spilled: 0, clamped })
  }
  const monday = weekStartKey(key)
  const slots: Slot[] = []
  if (indexed) {
    days.forEach((day, index) => {
      const weekIndex = indexed[index] ?? 0
      slots.push({ day, weekIndex, key: pinnedKey(day.weekday, monday, weekIndex) })
    })
  } else {
    const weeks = Math.max(1, program.weeks)
    for (let week = 0; week < weeks; week++) {
      for (const day of days) slots.push({ day, weekIndex: week, key: pinnedKey(day.weekday, monday, week) })
    }
  }
  const packed = packSlots(slots, key, monday)
  return finish(packed.mappings, key, mode, { ...packed, clamped })
}

function themeFromFocus(focus?: string): string | null {
  const text = (focus ?? '').trim().toLowerCase()
  if (!text || text === 'free write') return null
  if (text.includes('speed') || text.includes('power') || text.includes('plyo')) return 'Power'
  if (text.includes('hypertrophy') || text.includes('muscle')) return 'Hypertrophy'
  if (text.includes('endurance') || text.includes('conditioning') || text.includes('aerobic') || text.includes('engine')) return 'Endurance'
  if (text.includes('mobility') || text.includes('recovery') || text.includes('stretch')) return 'Mobility'
  if (text.includes('strength')) return 'Strength'
  return ['Strength', 'Power', 'Hypertrophy', 'Endurance', 'Mobility'].find((theme) => theme.toLowerCase() === text) ?? null
}

function boardTheme(board: PlanBoard): string {
  const scores = new Map<string, number>()
  const add = (theme: string | null, weight: number) => {
    if (!theme) return
    scores.set(theme, (scores.get(theme) ?? 0) + weight)
  }
  for (const week of board.weeks) {
    for (const day of week.days) add(themeFromFocus(day.focus), 2)
  }
  let best = 'Strength'
  let score = 0
  for (const [theme, value] of scores) {
    if (value > score) {
      best = theme
      score = value
    }
  }
  return best
}

function copyExercise(exercise: BoardExercise, exerciseId: string): Prescription {
  return {
    exerciseId,
    setType: (exercise.setType ?? 'reps_load') as SetType,
    sets: exercise.sets ?? 0,
    reps: exercise.reps ?? '',
    restSec: exercise.restSec ?? 0,
    targetLoadKg: exercise.targetLoadKg,
    targetPercent1RM: exercise.targetPercent1RM,
    percent1RM: exercise.percent1RM,
    targetRpe: exercise.targetRpe,
    targetRir: exercise.targetRir,
    rir: exercise.rir,
    timeCapSec: exercise.timeCapSec,
    distanceM: exercise.distanceM,
    durationSec: exercise.durationSec,
    rounds: exercise.rounds,
    intervalSec: exercise.intervalSec,
    emomIntervalSec: exercise.emomIntervalSec,
    notes: exercise.notes ?? exercise.placeholder,
    perSide: exercise.perSide,
    waves: exercise.waves,
    schemes: exercise.schemes,
  }
}

export interface BuiltBoardProgram {
  program: Program
  newExercises: import('../../types.ts').Exercise[]
}

/** Turn whiteboard days that have work (or a pad) into program days. */
export function boardToProgram(board: PlanBoard, id: IdFactory, now = new Date().toISOString()): BuiltBoardProgram {
  const newExercises: import('../../types.ts').Exercise[] = []
  const days: CommitDay[] = []
  board.weeks.forEach((week, weekIndex) => {
    week.days.forEach((day, index) => {
      const built = exercisesForDay(day, board.name, id, newExercises)
      const pad = (day.sessionPad ?? '').trim()
      if (built.length === 0 && !pad) return
      days.push({
        id: id('pd'),
        name: board.weeks.length > 1 ? `${week.label} · ${day.name}` : day.name,
        weekday: inferredWeekday(day, index),
        focus: day.focus ?? (day.isWhiteboard || day.freeWrite ? 'Free write' : 'Strength'),
        sessionPad: day.sessionPad,
        exercises: built,
        weekIndex,
        boardDayId: day.id,
      })
    })
  })
  return {
    newExercises,
    program: {
      id: id('prog'),
      name: board.name,
      description: `Created from plan board “${board.name}”.`,
      theme: boardTheme(board),
      sports: ['General Athletic'],
      weeks: Math.max(1, board.weeks.length || 1),
      days,
      isTemplate: false,
      isMine: true,
      createdAt: now,
    },
  }
}

function exercisesForDay(day: PlanDay, boardName: string, id: IdFactory, created: import('../../types.ts').Exercise[]): Prescription[] {
  const prescriptions: Prescription[] = []
  for (const raw of day.exercises as BoardExercise[]) {
    let exerciseId = raw.exerciseId
    if (!exerciseId) {
      const name = (raw.placeholder ?? '').trim()
      if (!name) continue
      exerciseId = id('ex')
      const theme = themeFromFocus(day.focus) ?? 'Strength'
      created.push({
        id: exerciseId,
        name,
        theme,
        sports: ['General Athletic'],
        muscles: ['Full Body'],
        equipment: ['None'],
        description: `Custom exercise from plan board “${boardName}”.`,
        cues: [],
        source: 'custom',
        defaultSets: raw.sets ?? 3,
        defaultReps: raw.reps ?? '8',
        defaultRestSec: raw.restSec ?? 90,
        aliases: [],
        primaryMuscles: [],
        secondaryMuscles: [],
        movementPattern: '',
        imageUrls: [],
      })
    }
    prescriptions.push(copyExercise(raw, exerciseId))
  }
  return prescriptions
}

function lookupBoardDay(board: PlanBoard, days: CommitDay[]): (dayId: string) => CommitDay | undefined {
  const byBoard = new Map<string, CommitDay>()
  for (const day of days) {
    if (day.boardDayId) byBoard.set(day.boardDayId, day)
  }
  const flat = board.weeks.flatMap((week) => week.days)
  const positional = byBoard.size === 0 && days.length === flat.length
  return (dayId: string) => {
    if (byBoard.size > 0) return byBoard.get(dayId)
    if (!positional) return undefined
    const index = flat.findIndex((day) => day.id === dayId)
    return index >= 0 ? days[index] : undefined
  }
}

export function previewBoard(board: PlanBoard, start: string, mode: CommitMode, today: string, id: IdFactory, now?: string): (BuiltBoardProgram & { preview: CommitPreview }) | null {
  const built = boardToProgram(board, id, now)
  if (built.program.days.length === 0) return null
  const { key, clamped } = clampToToday(start, today)
  if (mode === 'consecutive') {
    const preview = previewProgram(built.program, key, 'consecutive', key, { repeatWeeks: false })
    return { ...built, preview: { ...preview, clampedToToday: clamped } }
  }
  const monday = weekStartKey(key)
  const find = lookupBoardDay(board, built.program.days as CommitDay[])
  const slots: Slot[] = []
  board.weeks.forEach((week, weekIndex) => {
    const weekMonday = addDaysKey(monday, weekIndex * 7)
    week.days.forEach((day, index) => {
      const commitDay = find(day.id)
      if (!commitDay) return
      const weekday = inferredWeekday(day, Math.min(index, 6))
      slots.push({
        day: commitDay,
        weekIndex,
        key: weekday < 0 ? null : addDaysKey(weekMonday, weekday === 0 ? 6 : weekday - 1),
      })
    })
  })
  const packed = packSlots(slots, key, monday)
  return { ...built, preview: finish(packed.mappings, key, mode, { ...packed, clamped }) }
}

export function findStretches(mappings: CommitMapping[], minimum = 5): RunStretch[] {
  const keys = [...new Set(mappings.map((item) => item.dateKey))].sort()
  if (keys.length === 0) return []
  const origin = weekStartKey(keys[0] ?? '')
  const stretches: RunStretch[] = []
  let start = 0
  for (let index = 1; index <= keys.length; index++) {
    const previous = keys[index - 1]
    const current = keys[index]
    if (previous && current && addDaysKey(previous, 1) === current) continue
    const length = index - start
    const startKey = keys[start]
    if (length >= minimum && startKey) {
      const week = Math.floor(daysBetween(origin, startKey) / 7) + 1
      stretches.push({ length, startKey, week })
    }
    start = index
  }
  return stretches
}

export function longestStretch(stretches: RunStretch[]): RunStretch | null {
  return stretches.reduce<RunStretch | null>((best, stretch) => (!best || stretch.length > best.length ? stretch : best), null)
}

export function packHint(preview: CommitPreview): string {
  return [
    preview.clampedToToday ? 'Starts today, not in the past' : null,
    preview.repacked ? `${preview.repacked} session${preview.repacked === 1 ? '' : 's'} repacked onto free days` : null,
    preview.spilled ? `${preview.spilled} spilled to the next free day` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function runWarning(length: number, week: number, stretchCount: number, laterStartHelps: boolean): string {
  return (
    `${length} days in a row in week ${week}` +
    (stretchCount > 1 ? ` (${stretchCount} stretches of 5+ days)` : '') +
    (laterStartHelps ? ', a later start helps' : ', consider adding a rest day')
  )
}
