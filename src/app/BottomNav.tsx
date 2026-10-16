import { CalendarDays, Dumbbell, House, TrendingUp, Users, type LucideIcon } from 'lucide-react'
import type { NavTab } from '../types.ts'
import { activeTab, NAV_HIDDEN } from './router.ts'
import { preloadTab } from './routes.tsx'
import { useStore } from '../store/useStore.ts'
import { cn } from '../ui/cn.ts'

const TABS: { id: NavTab; label: string; icon: LucideIcon }[] = [
  { id: 'today', label: 'Today', icon: House },
  { id: 'train', label: 'Train', icon: Dumbbell },
  { id: 'plan', label: 'Plan', icon: CalendarDays },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'friends', label: 'Friends', icon: Users },
]

export function BottomNav() {
  const { nav, go, openWorkout } = useStore()
  if (NAV_HIDDEN.has(nav.screen)) return null
  const current = activeTab(nav)
  const select = (tab: NavTab) => {
    if (tab === 'today') go('today')
    else if (tab === 'train') {
      const workoutTab = nav.screen === 'workout' && nav.workoutTab && nav.workoutTab !== 'maxes' ? nav.workoutTab : 'day'
      openWorkout(nav.dateKey, workoutTab)
    }
    else if (tab === 'plan') go('plan')
    else if (tab === 'progress') go('log')
    else go('friends')
  }
  return (
    <nav
      className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-charcoal-4 bg-charcoal/95 backdrop-blur-md"
      aria-label="Main"
      data-bottom-nav="true"
    >
      <div className="mx-auto flex h-14 max-w-lg items-stretch justify-around px-1 pt-0.5">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const selected = current === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              data-nav-tab={tab.id}
              aria-current={selected ? 'page' : undefined}
              onClick={() => select(tab.id)}
              onPointerEnter={() => preloadTab(tab.id)}
              onTouchStart={() => preloadTab(tab.id)}
              className={cn(
                'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-medium transition',
                selected ? 'text-lime-dim' : 'text-muted hover:text-ink',
              )}
            >
              <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-lg transition', selected && 'bg-lime/10')}>
                <Icon className={cn('h-5 w-5', selected && 'stroke-[2.5]')} aria-hidden />
              </span>
              <span className="max-w-full leading-tight whitespace-nowrap">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
