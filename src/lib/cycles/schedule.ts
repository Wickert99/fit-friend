import type { AppState, PlanBoard, PlannedSession, Prescription, Program, ProgramDay, ProgramInstance } from '../../types.ts'
import { createId } from '../../store/id.ts'
import { recomputePrs } from '../maxes/prs.ts'
import { streakFromDays, todayKey, weekStartKey, weeksBetween } from './dates.ts'
import {
  previewBoard,
  previewProgram,
  type CommitMode,
  type CommitPreview,
  type IdFactory,
} from './commit.ts'

function copyPrescription(prescription: Prescription): Prescription {
  return {
    ...prescription,
    schemes: prescription.schemes?.map((scheme) => ({ ...scheme })),
    waves: prescription.waves?.map((scheme) => ({ ...scheme })),
  }
}

export function plannedFromDay(
  dateKey: string,
  program: Program,
  day: ProgramDay,
  weekIndex: number | undefined,
  now: string,
  id: string,
): PlannedSession {
  const session: PlannedSession = {
    id,
    dateKey,
    name: day.name,
    focus: day.focus ?? program.theme,
    programId: program.id,
    programDayId: day.id,
    programName: program.name,
    sessionPad: day.sessionPad,
    updatedAt: now,
    exercises: day.exercises.map(copyPrescription),
  }
  if (weekIndex != null) session.weekIndex = weekIndex
  return session
}

export function latestInstance(instances: ProgramInstance[] | undefined, programId: string | undefined): ProgramInstance | undefined {
  if (!instances || !programId) return undefined
  let latest: ProgramInstance | undefined
  for (const instance of instances) {
    if (instance.programId !== programId) continue
    if (!latest || instance.committedAt >= latest.committedAt) latest = instance
  }
  return latest
}

export function weekIndexFor(instance: ProgramInstance, dateKey: string): number | undefined {
  const delta = weeksBetween(weekStartKey(instance.startKey), weekStartKey(dateKey))
  const week = Math.floor(delta)
  return week >= 0 && week < Math.max(1, instance.weeks) ? week : undefined
}

export function assignProgramDay(state: AppState, dateKey: string, programDayId: string, now = new Date().toISOString()): AppState {
  let plannedSessions = state.plannedSessions
  for (const program of state.programs) {
    const day = program.days.find((item) => item.id === programDayId)
    if (!day) continue
    const instance = program.activeInstance ?? latestInstance(state.programInstances, program.id)
    const weekIndex = instance ? weekIndexFor(instance, dateKey) : undefined
    plannedSessions = {
      ...plannedSessions,
      [dateKey]: plannedFromDay(dateKey, program, day, weekIndex, now, createId('plan')),
    }
    break
  }
  return {
    ...state,
    scheduled: { ...state.scheduled, [dateKey]: programDayId },
    plannedSessions,
    scheduleUserOwned: true,
  }
}

export function clearDay(state: AppState, dateKey: string): AppState {
  const scheduled = { ...state.scheduled }
  const plannedSessions = { ...state.plannedSessions }
  delete scheduled[dateKey]
  delete plannedSessions[dateKey]
  return { ...state, scheduled, plannedSessions, scheduleUserOwned: true }
}

export function clearCalendar(
  state: AppState,
  options: { clearPlanBoards?: boolean; futureOnly?: boolean; today?: string } = {},
): AppState {
  const today = options.today ?? todayKey()
  let scheduled = { ...state.scheduled }
  let plannedSessions = { ...state.plannedSessions }
  if (options.futureOnly) {
    for (const key of Object.keys(scheduled)) if (key >= today) delete scheduled[key]
    for (const key of Object.keys(plannedSessions)) if (key >= today) delete plannedSessions[key]
  } else {
    scheduled = {}
    plannedSessions = {}
  }
  const programInstances = options.futureOnly
    ? state.programInstances.filter((instance) => instance.firstSessionKey < today)
    : []
  return {
    ...state,
    scheduled,
    plannedSessions,
    programInstances,
    scheduleUserOwned: true,
    planBoards: options.clearPlanBoards
      ? state.planBoards.map((board) => ({
          ...board,
          notes: [],
          weeks: board.weeks.map((week) => ({
            ...week,
            days: week.days.map((day) => ({ ...day, exercises: [], sessionPad: '' })),
          })),
        }))
      : state.planBoards,
  }
}

export function blankPlannedSession(dateKey: string, name = 'Workout', id = createId('plan'), now = new Date().toISOString()): PlannedSession {
  return { id, dateKey, name, focus: 'Strength', updatedAt: now, exercises: [] }
}

export function saveBlankDay(state: AppState, dateKey: string, name = 'Workout'): { state: AppState; session: PlannedSession } {
  const session = blankPlannedSession(dateKey, name)
  return {
    session,
    state: {
      ...state,
      plannedSessions: { ...state.plannedSessions, [dateKey]: session },
      scheduleUserOwned: true,
    },
  }
}

function instanceFor(program: Program, preview: CommitPreview, source: string, boardId: string | undefined, now: string, id: string): ProgramInstance | null {
  if (preview.mappings.length === 0) return null
  const keys = preview.mappings.map((item) => item.dateKey).sort()
  let start: string | null = null
  for (const mapping of preview.mappings) {
    const blockMonday = addWeeksBack(weekStartKey(mapping.dateKey), mapping.weekIndex)
    if (!start || blockMonday < start) start = blockMonday
  }
  const first = keys[0] ?? preview.startKey
  const last = keys[keys.length - 1] ?? preview.endKey
  const startKey = start ?? weekStartKey(first)
  const span = Math.floor(weeksBetween(startKey, weekStartKey(last))) + 1
  const weeks =
    preview.mode === 'consecutive'
      ? Math.max(1, span)
      : Math.max(1, program.weeks || 1, preview.mappings.reduce((max, item) => Math.max(max, item.weekIndex + 1), 1))
  return {
    id,
    programId: program.id,
    startKey,
    firstSessionKey: first,
    lastSessionKey: last,
    weeks,
    committedAt: now,
    source,
    ...(boardId ? { boardId } : {}),
  }
}

function addWeeksBack(monday: string, weeks: number): string {
  if (weeks <= 0) return monday
  const date = new Date(`${monday}T12:00:00`)
  date.setDate(date.getDate() - weeks * 7)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export interface PreparedCommit {
  program: Program
  newExercises: AppState['exercises']
  preview: CommitPreview
  addProgram: boolean
  boardId?: string
}

export function prepareProgramCommit(program: Program, start: string, mode: CommitMode, today: string): PreparedCommit | null {
  if (program.days.length === 0) return null
  const preview = previewProgram(program, start, mode, today, { repeatWeeks: true })
  if (preview.mappings.length === 0) return null
  return { program, newExercises: [], preview, addProgram: false }
}

export function prepareBoardCommit(board: PlanBoard, start: string, mode: CommitMode, today: string, id: IdFactory = createId, now = new Date().toISOString()): PreparedCommit | null {
  const built = previewBoard(board, start, mode, today, id, now)
  if (!built || built.preview.mappings.length === 0) return null
  return {
    program: built.program,
    newExercises: built.newExercises,
    preview: built.preview,
    addProgram: true,
    boardId: board.id,
  }
}

export function applyCommit(state: AppState, prepared: PreparedCommit, now = new Date().toISOString(), id: IdFactory = createId): AppState {
  const scheduled = { ...state.scheduled }
  const plannedSessions = { ...state.plannedSessions }
  const days = new Map(prepared.program.days.map((day) => [day.id, day]))
  for (const mapping of prepared.preview.mappings) {
    const day = days.get(mapping.programDayId)
    if (!day) continue
    scheduled[mapping.dateKey] = day.id
    plannedSessions[mapping.dateKey] = plannedFromDay(mapping.dateKey, prepared.program, day, mapping.weekIndex, now, id('plan'))
  }
  const known = new Set(state.exercises.map((exercise) => exercise.id))
  const added = prepared.newExercises.filter((exercise) => !known.has(exercise.id))
  const instance = instanceFor(prepared.program, prepared.preview, prepared.boardId ? 'board' : 'program', prepared.boardId, now, id('pinst'))
  return {
    ...state,
    exercises: added.length ? [...state.exercises, ...added] : state.exercises,
    programs: prepared.addProgram ? [prepared.program, ...state.programs] : state.programs,
    scheduled,
    plannedSessions,
    programInstances: instance ? [...state.programInstances, instance].slice(-40) : state.programInstances,
    scheduleUserOwned: true,
    activeProgramId: prepared.program.id,
  }
}

export function deleteLoggedSession(state: AppState, id: string, today = new Date()): AppState {
  const session = state.sessions.find((item) => item.id === id)
  if (!session || session.status !== 'completed') return state
  const sessions = state.sessions.filter((item) => item.id !== id)
  const stillLogged = sessions.some((item) => item.status === 'completed' && item.dateKey === session.dateKey)
  const commitmentDays = stillLogged ? state.commitmentDays : state.commitmentDays.filter((day) => day !== session.dateKey)
  return {
    ...state,
    sessions,
    commitmentDays,
    prs: recomputePrs(sessions),
    activity: state.activity.filter((entry) => entry.sessionId !== id),
    profile: { ...state.profile, streak: streakFromDays(commitmentDays, today) },
  }
}
