import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { isDetailScreen } from './router.ts'
import { useStore } from '../store/useStore.ts'
import { BottomNav } from './BottomNav.tsx'
import { RecoveryBanner } from './RecoveryBanner.tsx'

export function Shell({ children }: { children: ReactNode }) {
  const { nav } = useStore()
  useScrollRestore()
  useKeyboardInset()
  return (
    <div className="shell min-h-full bg-charcoal-2 text-ink">
      <div className="safe-top-scrim" aria-hidden />
      <main className="relative min-h-full min-w-0 overflow-x-clip" data-screen={nav.screen}>
        <RecoveryBanner />
        {children}
      </main>
      <BottomNav />
    </div>
  )
}

function useKeyboardInset(): void {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const apply = () => {
      const overlap = window.innerHeight - viewport.offsetTop - viewport.height
      const inset = overlap > 40 ? Math.round(overlap) : 0
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
    }
    apply()
    viewport.addEventListener('resize', apply)
    viewport.addEventListener('scroll', apply)
    return () => {
      viewport.removeEventListener('resize', apply)
      viewport.removeEventListener('scroll', apply)
      document.documentElement.style.removeProperty('--keyboard-inset')
    }
  }, [])
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
