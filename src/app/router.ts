import type { GoTarget, NavState, Screen, WorkoutTab } from '../types.ts'
import { todayKey } from '../store/id.ts'

const TOP_LEVEL: Screen[] = ['today', 'calendar', 'workout', 'plan', 'friends', 'log']
const TRAIN_TABS = new Set<WorkoutTab>(['library', 'programs', 'coach', 'maxes'])

function pathOnly(hash: string): string {
  const query = hash.indexOf('?')
  return query >= 0 ? hash.slice(0, query) : hash
}

function readInvite(hash: string): string | undefined {
  const query = hash.indexOf('?')
  if (query < 0) return undefined
  const code = new URLSearchParams(hash.slice(query + 1)).get('invite')?.trim()
  return code || undefined
}

export function parseHash(hash: string, today = todayKey()): NavState {
  const path = pathOnly(hash || '#/today')
  const invite = readInvite(hash)
  const workoutDate = path.match(/^#\/workout\/(\d{4}-\d{2}-\d{2})/)
  if (workoutDate) return { screen: 'workout', dateKey: workoutDate[1], workoutTab: 'day' }
  if (path === '#/workout-mode') return { screen: 'workout-mode' }
  const session = path.match(/^#\/session\/([^/]+)/)
  if (session) return { screen: 'session', sessionId: decodeURIComponent(session[1]) }
  const program = path.match(/^#\/program\/([^/]+)/)
  if (program) return { screen: 'program-detail', programId: decodeURIComponent(program[1]) }
  const exercise = path.match(/^#\/exercise\/([^/]+)/)
  if (exercise) return { screen: 'exercise-detail', exerciseId: decodeURIComponent(exercise[1]) }
  if (path === '#/program-builder') return { screen: 'program-builder' }
  const train = path.match(/^#\/(library|programs|coach|maxes)$/)
  if (train) return { screen: 'workout', dateKey: today, workoutTab: train[1] as WorkoutTab }
  if (path === '#/plan/muscles') return { screen: 'plan', planView: 'muscles' }
  const top = path.match(/^#\/(today|calendar|workout|plan|friends|log)$/)
  if (top) {
    const screen = top[1] as Screen
    if (screen === 'workout') return { screen, dateKey: today, workoutTab: 'day' }
    if (screen === 'friends') return invite ? { screen, invite } : { screen }
    if (screen === 'plan') return { screen, planView: 'board' }
    return { screen }
  }
  return { screen: 'today' }
}

/** Returns null when the screen has no hash of its own. */
export function hashFor(nav: NavState, today = todayKey()): string | null {
  if (nav.screen === 'workout') {
    const tab = nav.workoutTab ?? 'day'
    if (TRAIN_TABS.has(tab)) return `#/${tab}`
    return `#/workout/${nav.dateKey ?? today}`
  }
  if (nav.screen === 'workout-mode') return '#/workout-mode'
  if (nav.screen === 'session' && nav.sessionId) return `#/session/${encodeURIComponent(nav.sessionId)}`
  if (nav.screen === 'program-detail' && nav.programId) return `#/program/${encodeURIComponent(nav.programId)}`
  if (nav.screen === 'program-builder') return '#/program-builder'
  if (nav.screen === 'exercise-detail' && nav.exerciseId) return `#/exercise/${encodeURIComponent(nav.exerciseId)}`
  if (nav.screen === 'plan' && nav.planView === 'muscles') return '#/plan/muscles'
  if (nav.screen === 'friends') return nav.invite ? `#/friends?invite=${encodeURIComponent(nav.invite)}` : '#/friends'
  if (nav.screen === 'plan') return '#/plan'
  if (TOP_LEVEL.includes(nav.screen)) return `#/${nav.screen}`
  return null
}

export function resolveGo(target: GoTarget, params: Partial<NavState> = {}, today = todayKey()): NavState {
  if (target === 'library' || target === 'programs' || target === 'coach') {
    return {
      screen: 'workout',
      dateKey: params.dateKey ?? today,
      workoutTab: target,
    }
  }
  if (target === 'maxes') {
    return { screen: 'workout', dateKey: params.dateKey ?? today, workoutTab: 'maxes' }
  }
  if (target === 'workout') {
    return {
      screen: 'workout',
      dateKey: params.dateKey ?? today,
      workoutTab: params.workoutTab ?? 'day',
    }
  }
  if (target === 'plan') {
    return { screen: 'plan', planView: params.planView ?? 'board' }
  }
  if (target === 'friends') {
    return { screen: 'friends', invite: params.invite }
  }
  return { screen: target, ...params }
}

const DETAIL = new Set<NavState['screen']>([
  'session',
  'program-detail',
  'program-builder',
  'exercise-detail',
  'workout-mode',
])

export function isDetailScreen(screen: NavState['screen']): boolean {
  return DETAIL.has(screen)
}

export function tabMemory(nav: NavState): NavState {
  if (nav.screen === 'workout-mode' || isDetailScreen(nav.screen)) return { screen: 'today' }
  if (nav.screen === 'workout') {
    return {
      screen: 'workout',
      dateKey: nav.dateKey,
      workoutTab: nav.workoutTab ?? 'day',
    }
  }
  if (nav.screen === 'plan') return { screen: 'plan', planView: nav.planView }
  if (nav.screen === 'friends') return { screen: 'friends', invite: nav.invite }
  return { screen: nav.screen }
}

export function activeTab(nav: NavState): 'today' | 'train' | 'plan' | 'progress' | 'friends' {
  switch (nav.screen) {
    case 'today':
    case 'workout-mode':
    case 'session':
      return 'today'
    case 'workout':
      return nav.workoutTab === 'maxes' ? 'progress' : 'train'
    case 'exercise-detail':
    case 'program-detail':
    case 'program-builder':
      return 'train'
    case 'plan':
    case 'calendar':
      return 'plan'
    case 'log':
      return 'progress'
    case 'friends':
      return 'friends'
    default:
      return 'today'
  }
}

export const NAV_HIDDEN = new Set<NavState['screen']>(['session', 'program-detail', 'program-builder'])
