import type { Exercise, PlanBoard, PlanDay, Prescription, Program, ProgramDay } from '../../types.ts'
import { createId } from '../../store/id.ts'

const THEMES = new Set(['Strength', 'Power', 'Hypertrophy', 'Endurance', 'Mobility'])

export interface BoardExportSummary {
  emptyDays: number
  customNames: number
  keptDays: number
  message: string
}

function named(prescription: Prescription): boolean {
  return !!prescription.exerciseId || !!(prescription.placeholder ?? '').trim()
}

export function dayHasContent(day: PlanDay): boolean {
  if (day.exercises.some(named)) return true
  return !!(day.sessionPad ?? day.pad ?? '').trim()
}

export function boardExportSummary(board: PlanBoard): BoardExportSummary | { error: string } {
  const days = board.weeks.flatMap((week) => week.days)
  const empty = days.filter((day) => !dayHasContent(day))
  const kept = days.length - empty.length
  const custom = days
    .flatMap((day) => day.exercises)
    .filter((exercise) => !exercise.exerciseId && (exercise.placeholder ?? '').trim()).length
  if (days.length === 0 || kept === 0) {
    return {
      error:
        'Nothing to export — add exercises, a custom name, or a free-write pad to at least one day first.\n\nEmpty days are not turned into 0-exercise program days.',
    }
  }
  const lines: string[] = []
  if (empty.length > 0) {
    lines.push(
      `${empty.length} empty day${empty.length === 1 ? '' : 's'} will be skipped (not added as blank program days)`,
    )
  }
  if (custom > 0) {
    lines.push(`${custom} custom name${custom === 1 ? '' : 's'} will be added to your exercise library`)
  }
  lines.push(`${kept} day${kept === 1 ? '' : 's'} will become your program`)
  return {
    emptyDays: empty.length,
    customNames: custom,
    keptDays: kept,
    message: `Use board as a program?\n\n• ${lines.join('\n• ')}\n\nContinue?`,
  }
}

function themeFrom(days: Array<{ focus?: string }>): string {
  const counts = new Map<string, number>()
  for (const day of days) {
    const focus = day.focus ?? ''
    if (!THEMES.has(focus)) continue
    counts.set(focus, (counts.get(focus) ?? 0) + 1)
  }
  let best = 'Strength'
  let bestCount = 0
  for (const [theme, count] of counts) {
    if (count > bestCount) {
      best = theme
      bestCount = count
    }
  }
  return best
}

function weeksShareTemplate(board: PlanBoard): boolean {
  const filled = board.weeks.filter((week) => week.days.some(dayHasContent))
  if (filled.length <= 1) return true
  const signature = (days: PlanDay[]) =>
    days
      .filter(dayHasContent)
      .map((day) => day.exercises.map((exercise) => exercise.exerciseId || (exercise.placeholder ?? '').trim()).join(','))
      .join('|')
  const first = signature(filled[0]?.days ?? [])
  return filled.every((week) => signature(week.days) === first)
}

function customExercise(name: string, prescription: Prescription, focus: string | undefined, id: string): Exercise {
  const theme = focus && THEMES.has(focus) ? focus : 'Strength'
  return {
    id,
    name,
    theme,
    sports: [],
    muscles: [],
    equipment: [],
    description: '',
    cues: [],
    source: 'custom',
    defaultSets: prescription.sets,
    defaultReps: prescription.reps,
    defaultRestSec: prescription.restSec,
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    movementPattern: '',
    imageUrls: [],
  }
}

export interface BoardProgramDraft {
  program: Program
  exercises: Exercise[]
}

/** Turn a whiteboard into a program. Empty days are dropped. Custom names become library exercises. */
export function boardToProgram(board: PlanBoard, id: (prefix: string) => string = createId, now = new Date().toISOString()): BoardProgramDraft | null {
  const summary = boardExportSummary(board)
  if ('error' in summary) return null
  const template = weeksShareTemplate(board)
  const sourceWeeks = template ? board.weeks.filter((week) => week.days.some(dayHasContent)).slice(0, 1) : board.weeks
  const exercises: Exercise[] = []
  const days: ProgramDay[] = []
  for (const week of sourceWeeks) {
    for (const day of week.days) {
      if (!dayHasContent(day)) continue
      const prescriptions: Prescription[] = []
      for (const exercise of day.exercises) {
        const custom = (exercise.placeholder ?? '').trim()
        if (!exercise.exerciseId && !custom) continue
        let exerciseId = exercise.exerciseId
        if (!exerciseId && custom) {
          exerciseId = id('ex')
          exercises.push(customExercise(custom, exercise, day.focus, exerciseId))
        }
        const { placeholder: _placeholder, ...rest } = exercise
        prescriptions.push({ ...rest, id: id('pex'), exerciseId })
      }
      days.push({
        id: id('pd'),
        name: day.name || 'Day',
        focus: day.focus || 'Strength',
        sessionPad: (day.sessionPad ?? day.pad ?? '').trim() || undefined,
        exercises: prescriptions,
      })
    }
  }
  if (days.length === 0) return null
  const filledWeekCount = board.weeks.filter((week) => week.days.some(dayHasContent)).length
  return {
    exercises,
    program: {
      id: id('prog'),
      name: board.name.trim() || 'My program',
      description: `Personal training plan built from the “${board.name}” board.`,
      theme: themeFrom(days),
      sports: ['General Athletic'],
      weeks: template ? Math.max(1, filledWeekCount || board.weeks.length || 1) : 1,
      isTemplate: false,
      isMine: true,
      createdAt: now,
      days,
    },
  }
}
