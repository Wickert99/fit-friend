import type { PlanView, WorkoutTab } from '../types.ts'
import { useStore } from '../store/useStore.ts'
import { Segmented } from '../ui/Segmented.tsx'

export function PlanSubNav({ value }: { value: 'plan' | 'calendar' | 'muscles' }) {
  const { go } = useStore()
  return (
    <Segmented
      label="Plan views"
      value={value}
      onChange={(next) => {
        if (next === value) return
        if (next === 'calendar') go('calendar')
        else if (next === 'muscles') go('plan', { planView: 'muscles' })
        else go('plan', { planView: 'board' })
      }}
      options={[
        { id: 'plan', label: 'Board' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'muscles', label: 'Muscles' },
      ]}
    />
  )
}

export function ProgressSubNav({ value }: { value: 'log' | 'maxes' }) {
  const { go } = useStore()
  return (
    <Segmented
      label="Progress views"
      value={value}
      onChange={(next) => {
        if (next === value) return
        if (next === 'maxes') go('workout', { workoutTab: 'maxes' })
        else go('log')
      }}
      options={[
        { id: 'log', label: 'History & PRs' },
        { id: 'maxes', label: 'Maxes' },
      ]}
    />
  )
}

export function TrainSubNav({ value }: { value: WorkoutTab }) {
  const { go, nav } = useStore()
  const current = value === 'maxes' ? 'day' : value
  return (
    <Segmented
      label="Train views"
      value={current}
      onChange={(next) => {
        if (next === current) return
        go('workout', { dateKey: nav.dateKey, workoutTab: next })
      }}
      options={[
        { id: 'day' as const, label: 'My day' },
        { id: 'library' as const, label: 'Library' },
        { id: 'programs' as const, label: 'Programs' },
        { id: 'coach' as const, label: 'Coach' },
      ]}
    />
  )
}

export function planViewId(view: PlanView | undefined): 'plan' | 'calendar' | 'muscles' {
  return view === 'muscles' ? 'muscles' : 'plan'
}
