import type { ReactNode } from 'react'
import { NAV_HIDDEN } from '../app/router.ts'
import { useStore } from '../store/useStore.ts'
import { cn } from './cn.ts'

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  const { nav } = useStore()
  const hidden = NAV_HIDDEN.has(nav.screen)
  return (
    <div className={cn('page-stack mx-auto flex w-full min-w-0 max-w-lg flex-col gap-4 px-4 pt-4', hidden ? 'pb-safe-end' : 'pb-nav', className)}>
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
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  )
}

export function RouteSkeleton() {
  return (
    <div className="page-stack mx-auto flex w-full min-w-0 max-w-lg flex-col gap-4 px-4 pt-4 pb-nav" aria-busy="true" aria-label="Loading" data-route-skeleton="true">
      <div>
        <div className="h-7 w-32 animate-pulse rounded-lg bg-charcoal-3" />
        <div className="mt-1.5 h-4 w-48 animate-pulse rounded bg-charcoal-3/80" />
      </div>
      <div className="h-11 animate-pulse rounded-2xl bg-charcoal-3/70" />
      <div className="h-40 animate-pulse rounded-2xl border border-charcoal-4 bg-charcoal" />
      <div className="h-24 animate-pulse rounded-2xl border border-charcoal-4 bg-charcoal" />
    </div>
  )
}
