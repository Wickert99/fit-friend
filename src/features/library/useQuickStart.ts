import { useState } from 'react'
import { exerciseIdAliases } from '../../store/aliases.ts'
import { createId, todayKey } from '../../store/id.ts'
import { useStore } from '../../store/useStore.ts'
import type { WorkoutSession } from '../../types.ts'
import { planQuickStart, type ConflictMode, type QuickStartPlan } from './quickSession.ts'

export interface QuickConflict {
  session: WorkoutSession
  name: string
  exerciseIds: string[]
}

export function useQuickStart() {
  const { update, go } = useStore()
  const [conflict, setConflict] = useState<QuickConflict | null>(null)

  const launch = (name: string, exerciseIds: string[], mode: ConflictMode) => {
    const box: { plan: QuickStartPlan | null } = { plan: null }
    update((current) => {
      box.plan = planQuickStart(
        current,
        {
          name,
          exerciseIds,
          mode,
          sessionId: createId('ses'),
          dateKey: todayKey(),
          startedAt: new Date().toISOString(),
        },
        exerciseIdAliases,
      )
      return box.plan.next
    })
    const plan = box.plan
    if (!plan) return 'idle' as const
    if (plan.kind === 'conflict' && plan.conflict) {
      setConflict({ session: plan.conflict, name, exerciseIds })
      return 'conflict' as const
    }
    setConflict(null)
    go('session', { sessionId: plan.sessionId })
    return plan.kind
  }

  return { conflict, dismissConflict: () => setConflict(null), launch }
}
