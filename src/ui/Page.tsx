import type { ReactNode } from 'react'
import { NAV_HIDDEN } from '../app/router.ts'
import { useStore } from '../store/useStore.ts'
import { cn } from './cn.ts'

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  const { nav } = useStore()
  const hidden = NAV_HIDDEN.has(nav.screen)
  return (
    <div className={cn('mx-auto flex w-full max-w-lg min-w-0 flex-col gap-4 px-4 pt-5', hidden ? 'pb-safe-end' : 'pb-nav', className)}>
      {children}
    </div>
  )
}

export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0 text-left">
        <h1 tabIndex={-1} className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  )
}

export function RouteSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-lg min-w-0 flex-col gap-4 px-4 pt-5 pb-nav" aria-busy="true" aria-label="Loading" data-route-skeleton="true">
      <div>
        <div className="skeleton-pulse h-7 w-32 rounded-lg bg-charcoal-3" />
        <div className="skeleton-pulse mt-1.5 h-4 w-48 rounded bg-charcoal-3/80" />
      </div>
      <div className="skeleton-pulse h-11 rounded-2xl bg-charcoal-3/70" />
      <div className="skeleton-pulse h-40 rounded-2xl border border-charcoal-4 bg-charcoal" />
      <div className="skeleton-pulse h-24 rounded-2xl border border-charcoal-4 bg-charcoal" />
    </div>
  )
}
