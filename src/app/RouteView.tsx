import { Suspense, useEffect } from 'react'
import { useStore } from '../store/useStore.ts'
import { RouteSkeleton } from '../ui/index.ts'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { preloadIdleRoutes, routeScreens } from './routes.tsx'

export function RouteView() {
  const { nav, backToTab } = useStore()
  useEffect(() => {
    const timer = window.setTimeout(preloadIdleRoutes, 2500)
    return () => window.clearTimeout(timer)
  }, [])
  const resetKey = `${nav.screen}|${nav.workoutTab ?? ''}|${nav.planView ?? ''}|${nav.sessionId ?? ''}|${nav.programId ?? ''}|${nav.exerciseId ?? ''}`
  const hideNav = nav.screen === 'session' || nav.screen === 'program-detail' || nav.screen === 'program-builder'
  const Screen = screenFor(nav.screen, nav.workoutTab, nav.planView)
  return (
    <ErrorBoundary inline resetKey={resetKey} onBack={hideNav ? backToTab : undefined}>
      <Suspense fallback={<RouteSkeleton />}>
        <Screen />
      </Suspense>
    </ErrorBoundary>
  )
}

function screenFor(
  screen: string,
  workoutTab: string | undefined,
  planView: string | undefined,
) {
  if (screen === 'workout' && workoutTab === 'maxes') return routeScreens.progress
  if (screen === 'plan' && planView === 'muscles') return routeScreens.muscles
  switch (screen) {
    case 'today':
      return routeScreens.today
    case 'calendar':
      return routeScreens.calendar
    case 'plan':
      return routeScreens.plan
    case 'log':
      return routeScreens.log
    case 'friends':
      return routeScreens.friends
    case 'session':
      return routeScreens.session
    case 'workout':
      return routeScreens.workout
    case 'workout-mode':
      return routeScreens.workoutMode
    case 'program-detail':
      return routeScreens.programDetail
    case 'program-builder':
      return routeScreens.programBuilder
    case 'exercise-detail':
      return routeScreens.exerciseDetail
    default:
      return routeScreens.today
  }
}
