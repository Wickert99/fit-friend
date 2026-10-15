import { deleteLoggedSession } from '../lib/cycles/schedule.ts'
import { streakFromDays } from '../lib/cycles/dates.ts'
import { recomputePrs } from '../lib/maxes/prs.ts'
import type {
  AppState,
  Exercise,
  LiftMax,
  PlanBoard,
  PlannedSession,
  Program,
  SeasonGoals,
  WeightUnit,
  WorkoutSession,
} from '../types.ts'
import { createId } from './id.ts'

function rebuildRecords(state: AppState, today: Date): AppState {
  return {
    ...state,
    prs: recomputePrs(state.sessions),
    profile: { ...state.profile, streak: streakFromDays(state.commitmentDays, today) },
  }
}

export function setActiveProgram(state: AppState, id: string | null): AppState {
  return { ...state, activeProgramId: id }
}

export function updateSeasonGoals(state: AppState, patch: Partial<SeasonGoals>): AppState {
  const seasonGoals: SeasonGoals = { ...state.seasonGoals, ...patch }
  for (const key of Object.keys(seasonGoals) as (keyof SeasonGoals)[]) {
    if (seasonGoals[key] === undefined || seasonGoals[key] === '') delete seasonGoals[key]
  }
  return { ...state, seasonGoals }
}

export function upsertExercise(state: AppState, exercise: Exercise): AppState {
  const index = state.exercises.findIndex((item) => item.id === exercise.id)
  if (index < 0) return { ...state, exercises: [exercise, ...state.exercises] }
  const exercises = state.exercises.slice()
  exercises[index] = exercise
  return { ...state, exercises }
}

export function setLiftMax(state: AppState, max: LiftMax): AppState {
  return {
    ...state,
    liftMaxes: {
      ...state.liftMaxes,
      [max.familyId]: { ...max, updatedAt: max.updatedAt || new Date().toISOString() },
    },
  }
}

export function deleteLiftMax(state: AppState, familyId: string): AppState {
  const liftMaxes = { ...state.liftMaxes }
  delete liftMaxes[familyId]
  return { ...state, liftMaxes }
}

export function setWeightUnit(state: AppState, unit: WeightUnit): AppState {
  return { ...state, weightUnit: unit === 'lb' ? 'lb' : 'kg' }
}

export function setActiveBoard(state: AppState, id: string | null): AppState {
  return { ...state, activeBoardId: id }
}

export function createBoard(state: AppState, name = 'New board', id = createId('board')): { state: AppState; id: string } {
  const board: PlanBoard = {
    id,
    name,
    notes: [],
    weeks: [{ id: createId('week'), label: 'Week 1', days: [] }],
  }
  return {
    id,
    state: {
      ...state,
      planBoards: [...state.planBoards, board],
      activeBoardId: state.activeBoardId ?? id,
    },
  }
}

export function upsertBoard(state: AppState, board: PlanBoard): AppState {
  const index = state.planBoards.findIndex((item) => item.id === board.id)
  const planBoards = state.planBoards.slice()
  if (index < 0) planBoards.push(board)
  else planBoards[index] = board
  return { ...state, planBoards }
}

export function deleteBoard(state: AppState, id: string): AppState {
  const planBoards = state.planBoards.filter((board) => board.id !== id)
  return {
    ...state,
    planBoards,
    activeBoardId: state.activeBoardId === id ? (planBoards[0]?.id ?? null) : state.activeBoardId,
  }
}

export function scheduleDay(state: AppState, dateKey: string, programDayId: string): AppState {
  return {
    ...state,
    scheduled: { ...state.scheduled, [dateKey]: programDayId },
    scheduleUserOwned: true,
  }
}

export function clearSchedule(state: AppState, dateKey: string): AppState {
  const scheduled = { ...state.scheduled }
  const plannedSessions = { ...state.plannedSessions }
  delete scheduled[dateKey]
  delete plannedSessions[dateKey]
  return { ...state, scheduled, plannedSessions, scheduleUserOwned: true }
}

export function clearAllSchedule(state: AppState, today = new Date()): AppState {
  return rebuildRecords(
    {
      ...state,
      scheduled: {},
      plannedSessions: {},
      programInstances: [],
      scheduleUserOwned: true,
    },
    today,
  )
}

export function savePlannedSession(state: AppState, session: PlannedSession): AppState {
  return {
    ...state,
    plannedSessions: { ...state.plannedSessions, [session.dateKey]: session },
    scheduleUserOwned: true,
  }
}

export function deleteSession(state: AppState, id: string, today = new Date()): AppState {
  const session = state.sessions.find((item) => item.id === id)
  if (!session) return state
  if (session.status === 'completed') return deleteLoggedSession(state, id, today)
  return rebuildRecords(
    { ...state, sessions: state.sessions.filter((item) => item.id !== id) },
    today,
  )
}

export function updateSession(
  state: AppState,
  id: string,
  recipe: (session: WorkoutSession) => WorkoutSession,
): AppState {
  return {
    ...state,
    sessions: state.sessions.map((session) => (session.id === id ? recipe(session) : session)),
  }
}

export function setSessionNotes(state: AppState, id: string, notes: string): AppState {
  return updateSession(state, id, (session) => (session.notes === notes ? session : { ...session, notes }))
}

export function setSessionPad(state: AppState, id: string, pad: string): AppState {
  return updateSession(state, id, (session) =>
    session.sessionPad === pad ? session : { ...session, sessionPad: pad, pad },
  )
}

export function createProgram(
  state: AppState,
  partial: Partial<Program> = {},
  id = partial.id ?? createId('prog'),
): { state: AppState; id: string } {
  const program: Program = {
    id,
    name: partial.name ?? 'My Custom Program',
    description: partial.description ?? 'Personal training plan built in Fit Friend.',
    theme: partial.theme ?? 'Strength',
    sports: partial.sports ?? ['General Athletic'],
    weeks: partial.weeks ?? 1,
    isTemplate: false,
    isMine: true,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    days: partial.days ?? [],
    audience: partial.audience,
    coachNotes: partial.coachNotes,
    adaptations: partial.adaptations,
    progression: partial.progression,
  }
  return { id, state: { ...state, programs: [program, ...state.programs] } }
}

export function updateProgram(
  state: AppState,
  id: string,
  recipe: (program: Program) => Program,
): AppState {
  return {
    ...state,
    programs: state.programs.map((program) => (program.id === id ? recipe(program) : program)),
  }
}

export function deleteProgram(state: AppState, id: string): AppState {
  return {
    ...state,
    programs: state.programs.filter((program) => program.id !== id),
    activeProgramId: state.activeProgramId === id ? null : state.activeProgramId,
  }
}

export function cloneProgram(
  state: AppState,
  id: string,
  nextId = createId('prog'),
): { state: AppState; id: string | null } {
  const source = state.programs.find((program) => program.id === id)
  if (!source) return { state, id: null }
  const copy: Program = {
    ...source,
    id: nextId,
    name: `Copy of ${source.name}`,
    isTemplate: false,
    isMine: true,
    createdAt: new Date().toISOString(),
    activeInstance: undefined,
    days: source.days.map((day) => ({ ...day, id: createId('day'), exercises: day.exercises.map((item) => ({ ...item })) })),
  }
  return { id: nextId, state: { ...state, programs: [copy, ...state.programs] } }
}
