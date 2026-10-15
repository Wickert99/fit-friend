import { useEffect, useRef, useState } from 'react'
import { todayKey } from '../../store/id.ts'
import { useStore } from '../../store/useStore.ts'
import { Badge, Button, EmptyState, Page, ScreenHeader } from '../../ui/index.ts'
import { applyStart } from './context.ts'
import { ConflictDialog } from './ConflictDialog.tsx'
import { planForStart, todayPlan } from './logic.ts'

let lastRedirect = 0

export default function WorkoutModeScreen() {
  const { state, go, update } = useStore()
  const [conflict, setConflict] = useState<string | null>(null)
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    const inProgress = state.sessions.find((session) => session.status === 'in_progress')
    if (inProgress) {
      if (Date.now() - lastRedirect < 1500) return
      lastRedirect = Date.now()
      booted.current = true
      go('session', { sessionId: inProgress.id }, { skipLeaveGuard: true })
      return
    }
    const today = todayKey()
    const plan = planForStart(state, today)
    const info = todayPlan(state, today)
    if (!plan || !info.canStart) return
    const result = applyStart(state, plan, 'return')
    if (result.kind === 'conflict') {
      setConflict(result.session.name)
      return
    }
    if (Date.now() - lastRedirect < 1500) return
    lastRedirect = Date.now()
    booted.current = true
    update(() => result.state)
    go('session', { sessionId: result.sessionId }, { skipLeaveGuard: true })
  }, [state, go, update])

  const today = todayKey()
  const info = todayPlan(state, today)

  return (
    <Page>
      <ScreenHeader title="Focus mode" subtitle="Workout mode" />
      <Badge tone="lime">Workout mode is now Focus mode</Badge>
      {conflict ? (
        <ConflictDialog
          name={conflict}
          onCancel={() => go('today')}
          onResume={() => {
            const plan = planForStart(state, today)
            if (!plan) return
            const result = applyStart(state, plan, 'resume')
            if (result.kind === 'conflict') return
            update(() => result.state)
            go('session', { sessionId: result.sessionId }, { skipLeaveGuard: true })
          }}
          onReplace={() => {
            const plan = planForStart(state, today)
            if (!plan) return
            const result = applyStart(state, plan, 'replace')
            if (result.kind === 'conflict') return
            update(() => result.state)
            go('session', { sessionId: result.sessionId }, { skipLeaveGuard: true })
          }}
        />
      ) : (
        <EmptyState
          title={info.canStart ? 'Starting focus mode' : 'Set up today’s workout'}
          body="Log each set on one screen with voice cues, a rest timer and a summary at the end."
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => go('workout', { dateKey: today, workoutTab: 'day' })}>Set up today’s workout</Button>
              <Button variant="secondary" onClick={() => go('today')}>
                Back to Today
              </Button>
            </div>
          }
        />
      )}
    </Page>
  )
}
