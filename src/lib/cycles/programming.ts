import {
  addWeeks,
  eachDayOfInterval,
  endOfWeek,
  format,
  startOfWeek,
} from 'date-fns'
import type { AppState, Program, ProgramInstance, SeasonGoals, WorkoutSession } from '../../types.ts'
import { plansOnDate } from '../../store/dayPlans.ts'
import { sessionVolumeKg } from '../maxes/volume.ts'
import {
  WEEK_OPTS,
  dateKey,
  daysBetween,
  differenceInCalendarWeeks,
  endOfMonth,
  endOfWeek as endOfWeekDate,
  parseKey,
  startOfMonth,
  weekStartKey,
  startOfWeek as startOfWeekDate,
  subWeeks,
  weeksBetween,
} from './dates.ts'
import { latestInstance } from './schedule.ts'

export type CycleKind = 'micro' | 'meso' | 'macro' | 'phase' | 'competition'

export interface CycleBlock {
  id: string
  kind: CycleKind
  label: string
  startKey: string
  endKey: string
  color: string
}

export interface ProgrammingContext {
  activeProgram: Program | null
  planWeekCount?: number
  instance?: ProgramInstance
  blockStartKey?: string
  blockEndKey?: string
  committedKeys: string[]
  seasonGoals: SeasonGoals | null
}

export const CYCLE_COLORS: Record<CycleKind, string> = {
  micro: '#a56b4e',
  meso: '#6b8f71',
  macro: '#b07d5c',
  phase: '#8a7a68',
  competition: '#c0392b',
}

export const CYCLE_LABELS: Record<CycleKind, string> = {
  micro: 'Micro',
  meso: 'Meso',
  macro: 'Macro',
  phase: 'Phase',
  competition: 'Competition',
}

const PHASE_COLORS: Record<string, string> = {
  offseason: '#8a7a68',
  preseason: '#b7791f',
  inseason: '#3d7a55',
  return: '#5c7a8a',
}

const PHASE_LABELS: Record<string, string> = {
  offseason: 'Off-season',
  preseason: 'Pre-season',
  inseason: 'In-season',
  return: 'Return / rebuild',
}

export interface SeasonRead {
  competitionDate?: string
  competitionLabel?: string
  seasonStart?: string
  phaseKey?: string
  phaseLabel?: string
}

export function readSeason(goals: SeasonGoals | null | undefined): SeasonRead {
  if (!goals) return {}
  const extra = goals as SeasonGoals & { competitionName?: string; seasonPhase?: string }
  const competitionDate = validKey(goals.competitionDate)
  const competitionLabel = goals.competitionLabel?.trim() || extra.competitionName?.trim() || undefined
  const seasonStart = validKey(goals.seasonStartDate) ?? validKey(goals.prepStart)
  const phaseKey = normalizePhase(extra.seasonPhase ?? goals.season)
  return {
    competitionDate,
    competitionLabel,
    seasonStart,
    phaseKey,
    phaseLabel: phaseKey ? PHASE_LABELS[phaseKey] : undefined,
  }
}

function validKey(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

function normalizePhase(value: string | undefined): string | undefined {
  if (!value) return undefined
  const key = value.trim().toLowerCase()
  if (key in PHASE_LABELS) return key
  if (key.includes('off')) return 'offseason'
  if (key.includes('pre')) return 'preseason'
  if (key.includes('return') || key.includes('rebuild')) return 'return'
  if (key.includes('in-season') || key.includes('in season') || key.includes('inseason')) return 'inseason'
  return undefined
}

export function programmingFromState(state: AppState): ProgrammingContext {
  const activeProgram = state.programs.find((program) => program.id === state.activeProgramId) ?? null
  const instance = activeProgram?.activeInstance ?? latestInstance(state.programInstances, activeProgram?.id)
  const board = state.planBoards.find((item) => item.id === state.activeBoardId) ?? state.planBoards[0]
  const planWeekCount = board?.weeks.length || undefined
  const keys = new Set<string>(Object.keys(state.scheduled))
  for (const plan of Object.values(state.plannedSessions)) if (plan?.dateKey) keys.add(plan.dateKey)
  const completed = new Map<string, { programId?: string }>()
  for (const record of Object.values(state.completedPlans ?? {})) {
    const plan = record?.plan
    if (!plan?.dateKey) continue
    keys.add(plan.dateKey)
    const current = completed.get(plan.dateKey)
    if (!current || (activeProgram && plan.programId === activeProgram.id && current.programId !== activeProgram.id)) {
      completed.set(plan.dateKey, plan)
    }
  }
  const matched: string[] = []
  for (const key of keys) {
    const dayPlans = plansOnDate(state.plannedSessions, key)
    const plan =
      dayPlans.find((item) => activeProgram && item.programId === activeProgram.id) ?? dayPlans[0] ?? completed.get(key)
    if (activeProgram && plan?.programId === activeProgram.id) {
      matched.push(key)
      continue
    }
    const scheduledId = state.scheduled[key]
    if (activeProgram && scheduledId && activeProgram.days.some((day) => day.id === scheduledId)) matched.push(key)
  }
  const sorted = (matched.length > 0 ? matched : [...keys]).sort()
  const lastMatched = sorted[sorted.length - 1]
  return {
    activeProgram,
    planWeekCount,
    instance,
    blockStartKey: instance?.startKey ?? sorted[0],
    blockEndKey: instance ? [instance.lastSessionKey, lastMatched ?? ''].sort().pop() : lastMatched,
    committedKeys: [...keys].sort(),
    seasonGoals: state.seasonGoals ?? null,
  }
}

function sessionKey(session: WorkoutSession): string {
  return session.dateKey
}

export function extendBlockStart(context: ProgrammingContext, sessions: WorkoutSession[]): ProgrammingContext {
  if (context.instance || context.activeProgram?.activeInstance || !context.blockStartKey) return context
  const programId = context.activeProgram?.id
  const earlier = sessions
    .filter((session) => session.status === 'completed')
    .filter((session) => {
      const plannedId = (session as WorkoutSession & { plannedSessionId?: string }).plannedSessionId
      return plannedId && (!programId || !session.programId || session.programId === programId)
    })
    .map(sessionKey)
    .filter((key) => key < (context.blockStartKey ?? ''))
    .sort()
    .reverse()
  let start = context.blockStartKey
  for (const key of earlier) {
    if (daysBetween(key, start) > 7) break
    start = key
  }
  return start === context.blockStartKey ? context : { ...context, blockStartKey: start }
}

export interface BlockProgress {
  weeksInBlock: number
  weekOfBlock: number
  blockStart: Date
  blockEnd: Date
  status: 'active' | 'upcoming' | 'complete'
  programName?: string
  theme?: string
}

export function blockProgress(context: ProgrammingContext, today = new Date()): BlockProgress {
  const instance = context.instance ?? context.activeProgram?.activeInstance
  let weeks = 4
  const startKey = instance?.startKey ?? context.blockStartKey
  const endKey = instance?.lastSessionKey ?? context.blockEndKey
  if (instance && instance.weeks > 0) weeks = instance.weeks
  else if ((context.activeProgram?.weeks ?? 0) > 0) weeks = context.activeProgram?.weeks ?? weeks
  else if ((context.planWeekCount ?? 0) > 0) weeks = context.planWeekCount ?? weeks
  else if (startKey && endKey) {
    const span = weeksBetween(weekStartKey(startKey), weekStartKey(endKey)) + 1
    if (span >= 1) weeks = span
  }
  weeks = Math.max(1, Math.min(52, Math.round(weeks)))
  const todayWeek = startOfWeek(today, WEEK_OPTS)
  const blockStart = startKey ? startOfWeek(parseKey(startKey), WEEK_OPTS) : todayWeek
  let weekOfBlock = differenceInCalendarWeeks(todayWeek, blockStart, WEEK_OPTS) + 1
  let status: BlockProgress['status'] = 'active'
  if (weekOfBlock < 1) {
    weekOfBlock = 1
    status = 'upcoming'
  } else if (weekOfBlock > weeks) {
    weekOfBlock = weeks
    status = 'complete'
  }
  return {
    weeksInBlock: weeks,
    weekOfBlock,
    blockStart,
    blockEnd: endOfWeek(addWeeks(blockStart, weeks - 1), WEEK_OPTS),
    status,
    programName: context.activeProgram?.name,
    theme: context.activeProgram?.theme,
  }
}

export function macroStart(season: SeasonRead, competition: Date, today: Date): Date {
  if (season.seasonStart) return startOfWeek(parseKey(season.seasonStart), WEEK_OPTS)
  const competitionWeek = startOfWeek(competition, WEEK_OPTS)
  const todayWeek = startOfWeek(today, WEEK_OPTS)
  const away = Math.abs(differenceInCalendarWeeks(competitionWeek, todayWeek, WEEK_OPTS))
  const span = Math.max(12, Math.min(24, away + 4))
  let begin = subWeeks(competitionWeek, span - 1)
  if (begin > todayWeek) begin = subWeeks(todayWeek, 11)
  return startOfWeek(begin, WEEK_OPTS)
}

export interface WindowStats {
  sessions: number
  volumeKg: number
  daysTrained: number
  daysInWindow: number
  consistencyPct: number
}

export function windowStats(sessions: WorkoutSession[], start: Date, end: Date): WindowStats {
  const startKey = dateKey(start)
  const endKey = dateKey(end)
  const completed = sessions.filter((session) => session.status === 'completed' && session.dateKey >= startKey && session.dateKey <= endKey)
  const days = eachDayOfInterval({ start, end })
  const trained = new Set(completed.map((session) => session.dateKey))
  const daysTrained = days.filter((day) => trained.has(dateKey(day))).length
  const volumeKg = Math.round(completed.reduce((sum, session) => sum + sessionVolumeKg(session), 0))
  return {
    sessions: completed.length,
    volumeKg,
    daysTrained,
    daysInWindow: days.length,
    consistencyPct: days.length === 0 ? 0 : Math.round((daysTrained / days.length) * 100),
  }
}

export interface CycleSummary {
  micro: WindowStats & { weekOfBlock: number; weeksInBlock: number }
  meso: WindowStats & { weekOfBlock: number; weeksInBlock: number; theme?: string; programName?: string }
  macro: WindowStats & { weeksOut?: number; competitionLabel?: string }
}

export function summarizeCycles(state: Pick<AppState, 'sessions'>, context: ProgrammingContext, today = new Date()): CycleSummary {
  const extended = extendBlockStart(context, state.sessions)
  const progress = blockProgress(extended, today)
  const season = readSeason(extended.seasonGoals)
  const microStart = startOfWeek(today, WEEK_OPTS)
  const microEnd = endOfWeek(today, WEEK_OPTS)
  const mesoEnd = progress.blockEnd
  const competition = season.competitionDate ? parseKey(season.competitionDate) : null
  let macroFrom = subWeeks(startOfWeek(today, WEEK_OPTS), 11)
  let macroTo = endOfWeek(today, WEEK_OPTS)
  let weeksOut: number | undefined
  let competitionLabel: string | undefined
  if (competition) {
    const competitionWeek = startOfWeek(competition, WEEK_OPTS)
    weeksOut = differenceInCalendarWeeks(competitionWeek, startOfWeek(today, WEEK_OPTS), WEEK_OPTS)
    competitionLabel = season.competitionLabel?.trim() || 'Competition'
    macroFrom = macroStart(season, competition, today)
    macroTo = endOfWeek(competition > today ? competition : today, WEEK_OPTS)
  }
  return {
    micro: { ...windowStats(state.sessions, microStart, microEnd), weekOfBlock: progress.weekOfBlock, weeksInBlock: progress.weeksInBlock },
    meso: {
      ...windowStats(state.sessions, progress.blockStart, mesoEnd),
      weekOfBlock: progress.weekOfBlock,
      weeksInBlock: progress.weeksInBlock,
      theme: progress.theme,
      programName: progress.programName,
    },
    macro: { ...windowStats(state.sessions, macroFrom, macroTo), weeksOut, competitionLabel },
  }
}

export function hasProgramming(context: ProgrammingContext): boolean {
  const season = readSeason(context.seasonGoals)
  return !!(context.activeProgram || season.competitionDate || (context.blockStartKey && context.blockEndKey))
}

const KIND_ORDER: CycleKind[] = ['macro', 'phase', 'meso', 'micro', 'competition']

export function buildCycleBlocks(context: ProgrammingContext, today = new Date()): CycleBlock[] {
  const blocks: CycleBlock[] = []
  const season = readSeason(context.seasonGoals)
  const todayWeek = startOfWeek(today, WEEK_OPTS)
  const competition = season.competitionDate ? parseKey(season.competitionDate) : null
  if (competition) {
    const label = season.competitionLabel?.trim() || 'Competition prep'
    const start = macroStart(season, competition, today)
    const end = endOfWeek(competition, WEEK_OPTS)
    blocks.push({
      id: 'macro-season',
      kind: 'macro',
      label,
      startKey: dateKey(start),
      endKey: dateKey(end),
      color: CYCLE_COLORS.macro,
    })
    blocks.push({
      id: 'competition-day',
      kind: 'competition',
      label: season.competitionLabel?.trim() || 'Competition',
      startKey: dateKey(competition),
      endKey: dateKey(competition),
      color: CYCLE_COLORS.competition,
    })
  }
  if (season.phaseKey && season.phaseLabel) {
    let start = season.seasonStart ? startOfWeek(parseKey(season.seasonStart), WEEK_OPTS) : null
    let end = competition ? endOfWeek(competition, WEEK_OPTS) : null
    if (!start && context.blockStartKey) start = startOfWeek(parseKey(context.blockStartKey), WEEK_OPTS)
    if (!end && context.blockEndKey) end = endOfWeek(parseKey(context.blockEndKey), WEEK_OPTS)
    if (start && end && start <= end) {
      blocks.push({
        id: `phase-${season.phaseKey}`,
        kind: 'phase',
        label: season.phaseLabel,
        startKey: dateKey(start),
        endKey: dateKey(end),
        color: PHASE_COLORS[season.phaseKey] ?? CYCLE_COLORS.phase,
      })
    }
  }
  const program = context.activeProgram
  const instance = context.instance ?? program?.activeInstance
  const blockStart = context.blockStartKey ? parseKey(context.blockStartKey) : null
  const blockEnd = context.blockEndKey ? parseKey(context.blockEndKey) : null
  if (program || context.planWeekCount || (blockStart && blockEnd) || instance) {
    let start: Date
    let end: Date
    let weeks = instance?.weeks ?? program?.weeks ?? context.planWeekCount ?? 0
    if (instance?.startKey) {
      start = startOfWeek(parseKey(instance.startKey), WEEK_OPTS)
      end = endOfWeek(addWeeks(start, Math.max(1, instance.weeks) - 1), WEEK_OPTS)
      weeks = Math.max(1, instance.weeks)
    } else if (blockStart && blockEnd) {
      start = startOfWeek(blockStart, WEEK_OPTS)
      end = endOfWeek(blockEnd, WEEK_OPTS)
      if (!weeks || weeks < 1) weeks = differenceInCalendarWeeks(end, start, WEEK_OPTS) + 1
    } else if (program && program.weeks > 0) {
      start = todayWeek
      end = endOfWeek(addWeeks(todayWeek, program.weeks - 1), WEEK_OPTS)
      weeks = program.weeks
    } else if (context.planWeekCount && context.planWeekCount > 0) {
      start = todayWeek
      end = endOfWeek(addWeeks(todayWeek, context.planWeekCount - 1), WEEK_OPTS)
      weeks = context.planWeekCount
    } else {
      start = todayWeek
      end = endOfWeek(addWeeks(todayWeek, 3), WEEK_OPTS)
      weeks = 4
    }
    const name = program?.name ?? (context.planWeekCount ? 'Plan board' : 'Training block')
    blocks.push({
      id: `meso-${program?.id ?? 'plan'}`,
      kind: 'meso',
      label: weeks > 0 ? `${name} · ${weeks} wk` : name,
      startKey: dateKey(start),
      endKey: dateKey(end),
      color: CYCLE_COLORS.meso,
    })
  }
  const committed = context.committedKeys.filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
  if (committed.length > 0) {
    const weeks = new Map<string, { start: Date; end: Date }>()
    for (const key of committed) {
      const date = parseKey(key)
      const start = startOfWeek(date, WEEK_OPTS)
      const end = endOfWeek(date, WEEK_OPTS)
      const id = dateKey(start)
      if (!weeks.has(id)) weeks.set(id, { start, end })
    }
    for (const [id, range] of [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      blocks.push({
        id: `micro-${id}`,
        kind: 'micro',
        label: `Micro · ${format(range.start, 'd MMM')}`,
        startKey: id,
        endKey: dateKey(range.end),
        color: CYCLE_COLORS.micro,
      })
    }
  }
  return blocks
}

export function blocksInRange(blocks: CycleBlock[], startKey: string, endKey: string): CycleBlock[] {
  return blocks.filter((block) => block.startKey <= endKey && block.endKey >= startKey)
}

export function blocksOnDay(blocks: CycleBlock[], key: string): CycleBlock[] {
  return blocks.filter((block) => key >= block.startKey && key <= block.endKey)
}

export function legendKinds(blocks: CycleBlock[]): CycleKind[] {
  const present = new Set(blocks.map((block) => block.kind))
  return KIND_ORDER.filter((kind) => present.has(kind))
}

export function phaseColor(blocks: CycleBlock[]): string | undefined {
  return blocks.find((block) => block.kind === 'phase')?.color
}

export { endOfMonth, endOfWeekDate, startOfMonth, startOfWeekDate }
