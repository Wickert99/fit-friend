import { addDays, format, startOfWeek } from 'date-fns'
import { useMemo, useState } from 'react'
import { todayKey } from '../../store/id.ts'
import { useStore } from '../../store/useStore.ts'
import { Badge, Button, Card, EmptyState, Page, ScreenHeader, useConfirm } from '../../ui/index.ts'
import { cn } from '../../ui/cn.ts'
import { programmingFromState } from '../../lib/cycles/index.ts'
import { formatExactLoad } from '../../lib/setTypes/units.ts'
import { CycleCalendarSheet } from '../progress/CycleCalendar.tsx'
import { CycleSnapshot } from '../progress/CycleSnapshot.tsx'
import { applyStart } from '../session/context.ts'
import { ConflictDialog } from '../session/ConflictDialog.tsx'
import { deleteCompletedSession, planForStart, sessionCounts, sessionVolume, todayPlan } from '../session/logic.ts'
import { parseKey } from './dates.ts'

export default function TodayScreen() {
  const { state, go, update } = useStore()
  const confirm = useConfirm()
  const today = todayKey()
  const [selected, setSelected] = useState(today)
  const [conflict, setConflict] = useState<{ name: string; planDate: string } | null>(null)
  const [cyclesOpen, setCyclesOpen] = useState(false)
  const programming = useMemo(() => programmingFromState(state), [state])
  const selectedDate = parseKey(selected)
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const viewingToday = selected === today
  const info = todayPlan(state, selected)
  const logged = state.sessions.filter((session) => session.status === 'completed' && session.dateKey === selected)
  const subtitle = viewingToday ? 'Today' : 'Selected day'

  function start(mode: 'return' | 'replace' | 'resume') {
    const plan = planForStart(state, today)
    if (!plan) return
    const result = applyStart(state, plan, mode)
    if (result.kind === 'conflict') {
      setConflict({ name: result.session.name, planDate: plan.dateKey })
      return
    }
    update(() => result.state)
    go('session', { sessionId: result.sessionId }, { skipLeaveGuard: true })
  }

  async function remove(sessionId: string, name: string) {
    const ok = await confirm(
      `Delete “${name}” from your log?\n\nRemoves history, updates PRs if needed, and clears this day from your streak if nothing else was logged.`,
    )
    if (!ok) return
    update((current) => deleteCompletedSession(current, sessionId))
  }

  const plannedName = info.name
  const exerciseCount = info.plan?.exercises.length ?? info.programDay?.day.exercises.length ?? 0

  return (
    <Page>
      <div data-today>
        <ScreenHeader title={format(selectedDate, 'EEEE d MMM')} subtitle={subtitle} action={<Badge tone="lime">{state.profile.streak} day streak</Badge>} />
      </div>
      <div className="h-scroll" aria-label="This week">
        {days.map((day) => {
          const key = todayKey(day)
          const active = key === selected
          const hasLog = state.sessions.some((session) => session.status === 'completed' && session.dateKey === key)
          const hasPlan = !!state.plannedSessions[key] || !!state.scheduled[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              className={cn(
                'flex min-h-11 min-w-12 flex-col items-center rounded-xl px-2 py-1.5 text-xs',
                active ? 'bg-lime/10 font-semibold text-lime-dim' : 'text-muted',
              )}
            >
              <span>{format(day, 'EEE')}</span>
              <span className="text-sm text-ink">{format(day, 'd')}</span>
              <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', hasLog ? 'bg-lime-dim' : hasPlan ? 'bg-charcoal-4' : 'bg-transparent')} />
            </button>
          )
        })}
      </div>
      <CycleSnapshot sessions={state.sessions} programming={programming} unit={state.weightUnit} onOpen={() => setCyclesOpen(true)} />
      <CycleCalendarSheet open={cyclesOpen} programming={programming} onClose={() => setCyclesOpen(false)} />
      {viewingToday && info.inProgress ? (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">In progress</p>
              <p className="font-semibold text-ink">{info.inProgress.name}</p>
            </div>
            <Badge>
              {sessionCounts(info.inProgress).done}/{sessionCounts(info.inProgress).planned}
            </Badge>
          </div>
          <Button onClick={() => go('session', { sessionId: info.inProgress?.id })}>Resume</Button>
        </Card>
      ) : null}
      {plannedName ? (
        <Card className="space-y-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Scheduled</p>
            <p className="font-semibold text-ink">{plannedName}</p>
            <p className="text-sm text-muted">
              {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
              {info.plan?.focus ? ` · ${info.plan.focus}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {viewingToday && info.canStart ? (
              <Button data-start-workout onClick={() => start('return')}>
                Start
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => go('workout', { dateKey: selected, workoutTab: 'day' })}>
              Open day
            </Button>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="Nothing scheduled"
          body={viewingToday ? 'Quiet day. Build a workout or pick one from your plan.' : 'Nothing on this day yet.'}
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => go('workout', { dateKey: selected, workoutTab: 'day' })}>Schedule</Button>
              <Button variant="secondary" onClick={() => go('plan')}>
                Plan
              </Button>
            </div>
          }
        />
      )}
      {logged.length > 0 ? (
        <div className="space-y-2">
          {logged.map((session) => (
            <Card key={session.id} className="space-y-2">
              <button type="button" className="w-full text-left" onClick={() => go('session', { sessionId: session.id })}>
                <p className="font-semibold text-ink">{session.name}</p>
                <p className="text-sm text-muted">
                  {session.exercises.length} exercises · {formatExactLoad(sessionVolume(session), state.weightUnit)}
                </p>
              </button>
              <Button variant="danger" size="sm" onClick={() => void remove(session.id, session.name)}>
                Delete
              </Button>
            </Card>
          ))}
        </div>
      ) : null}
      {conflict ? (
        <ConflictDialog
          name={conflict.name}
          onCancel={() => setConflict(null)}
          onResume={() => {
            setConflict(null)
            start('resume')
          }}
          onReplace={() => {
            setConflict(null)
            start('replace')
          }}
        />
      ) : null}
    </Page>
  )
}
