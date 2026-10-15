import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { isDetailScreen } from './router.ts'
import { useStore } from '../store/useStore.ts'
import { BottomNav } from './BottomNav.tsx'
import { RecoveryBanner } from './RecoveryBanner.tsx'

export function Shell({ children }: { children: ReactNode }) {
  const { nav } = useStore()
  useScrollRestore()
  return (
    <div className="min-h-full bg-charcoal-2 text-ink">
      <main className="relative min-h-full min-w-0 overflow-x-clip" data-screen={nav.screen}>
        <RecoveryBanner />
        {children}
      </main>
      <BottomNav />
    </div>
  )
}

function useScrollRestore(): void {
  const { nav } = useStore()
  const key = [nav.screen, nav.workoutTab ?? '', nav.dateKey ?? '', nav.programId ?? '', nav.exerciseId ?? '', nav.sessionId ?? ''].join('|')
  const keyRef = useRef(key)
  const screenRef = useRef(nav.screen)
  const positions = useRef(new Map<string, number>())

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    const onScroll = () => positions.current.set(keyRef.current, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    if (keyRef.current === key) return
    const cameFromDetail = isDetailScreen(screenRef.current)
    keyRef.current = key
    screenRef.current = nav.screen
    const restore = cameFromDetail && !isDetailScreen(nav.screen) ? positions.current.get(key) : undefined
    window.scrollTo(0, restore ?? 0)
  }, [key, nav.screen])
}
