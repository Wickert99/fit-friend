import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { NavTab } from '../types.ts'

type Loader = () => Promise<{ default: ComponentType }>

const loaders = {
  today: () => import('../features/workout/TodayScreen.tsx'),
  workout: () => import('../features/library/TrainScreen.tsx'),
  plan: () => import('../features/plan/PlanScreen.tsx'),
  calendar: () => import('../features/calendar/CalendarScreen.tsx'),
  muscles: () => import('../features/plan/MusclesScreen.tsx'),
  log: () => import('../features/progress/LogScreen.tsx'),
  progress: () => import('../features/progress/MaxesScreen.tsx'),
  friends: () => import('../features/friends/FriendsScreen.tsx'),
  session: () => import('../features/session/SessionScreen.tsx'),
  workoutMode: () => import('../features/session/WorkoutModeScreen.tsx'),
  programDetail: () => import('../features/programs/ProgramDetailScreen.tsx'),
  programBuilder: () => import('../features/programs/ProgramBuilderScreen.tsx'),
  exerciseDetail: () => import('../features/library/ExerciseDetailScreen.tsx'),
} satisfies Record<string, Loader>

export type RouteId = keyof typeof loaders

function lazyRoute(loader: Loader): LazyExoticComponent<ComponentType> {
  return lazy(loader)
}

export const routeScreens: Record<RouteId, LazyExoticComponent<ComponentType>> = {
  today: lazyRoute(loaders.today),
  workout: lazyRoute(loaders.workout),
  plan: lazyRoute(loaders.plan),
  calendar: lazyRoute(loaders.calendar),
  muscles: lazyRoute(loaders.muscles),
  log: lazyRoute(loaders.log),
  progress: lazyRoute(loaders.progress),
  friends: lazyRoute(loaders.friends),
  session: lazyRoute(loaders.session),
  workoutMode: lazyRoute(loaders.workoutMode),
  programDetail: lazyRoute(loaders.programDetail),
  programBuilder: lazyRoute(loaders.programBuilder),
  exerciseDetail: lazyRoute(loaders.exerciseDetail),
}

const preloaded = new Set<RouteId>()

export function preloadRoute(id: RouteId): void {
  if (preloaded.has(id)) return
  preloaded.add(id)
  void loaders[id]().catch(() => preloaded.delete(id))
}

const TAB_ROUTES: Record<NavTab, RouteId[]> = {
  today: ['session', 'workoutMode'],
  train: ['workout', 'exerciseDetail', 'programDetail'],
  plan: ['plan', 'calendar', 'muscles'],
  progress: ['log', 'progress'],
  friends: ['friends'],
}

export function preloadTab(tab: NavTab): void {
  for (const id of TAB_ROUTES[tab]) preloadRoute(id)
}

export function preloadIdleRoutes(): void {
  ;(['workout', 'plan', 'log', 'session', 'friends', 'calendar', 'progress'] as RouteId[]).forEach(preloadRoute)
}
