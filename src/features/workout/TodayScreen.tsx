import { addDays, format, startOfWeek } from 'date-fns'
import { useMemo, useState } from 'react'
import { plansOnDate } from '../../store/dayPlans.ts'
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
import { deleteCompletedSession, discardSession, pauseSession, planForStart, resumeSession, sessionCounts, sessionVolume, todayPlan } from '../session/logic.ts'
import type { PlannedSession } from '../../types.ts'
import type { WorkoutSession } from '../../types.ts'
import { parseKey } from './dates.ts'

export default function TodayScreen() {
  const { state, go, update } = useStore()
  const confirm = useConfirm()
  const today = todayKey()
  const [selected, setSelected] = useState(today)
  const [conflict, setConflict] = useState<{ name: string; openId: string; intent: { planId: string } | { sessionId: string } } | null>(null)
  const [cyclesOpen, setCyclesOpen] = useState(false)
  const programming = useMemo(() => programmingFromState(state), [state])
  const selectedDate = parseKey(selected)
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const viewingToday = selected === today
  const info = todayPlan(state, selected)
  const logged = state.sessions.filter((session) => session.status === 'completed' && session.dateKey === selected)
  const subtitle = viewingToday ? 'Today' : 'Selected day'

  function start(plan: PlannedSession, mode: 'return' | 'replace' | 'resume' | 'pause') {
    const result = applyStart(state, plan, mode)
    if (result.kind === 'conflict') {
      setConflict({ name: result.session.name, openId: result.session.id, intent: { planId: plan.id } })
      return
    }
    update(() => result.state)
    go('session', { sessionId: result.sessionId }, { skipLeaveGuard: true })
  }

  function openWorkout(target: WorkoutSession) {
    const open = state.sessions.find((session) => session.status === 'in_progress' && session.id !== target.id)
    if (open) {
      setConflict({ name: open.name, openId: open.id, intent: { sessionId: target.id } })
      return
    }
    if (target.status === 'paused') update((current) => resumeSession(current, target.id))
    go('session', { sessionId: target.id })
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
          const hasPlan = plansOnDate(state.plannedSessions, key).length > 0 || !!state.scheduled[key]
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
        <ResumeCard session={info.inProgress} label="In progress" onResume={() => openWorkout(info.inProgress as WorkoutSession)} />
      ) : null}
      {(viewingToday ? info.paused : info.paused.filter((session) => session.dateKey === selected)).map((session) => (
        <ResumeCard key={session.id} session={session} label="Saved for later" onResume={() => openWorkout(session)} />
      ))}
      {info.entries.length > 0 ? (
        info.entries.map((entry) => {
          const count = entry.plan.exercises.length
          return (
            <Card key={entry.plan.id} className="space-y-3" data-day-plan={entry.plan.id}>
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Scheduled</p>
                <p className="font-semibold text-ink">{entry.plan.name}</p>
                <p className="text-sm text-muted">
                  {count} {count === 1 ? 'exercise' : 'exercises'}
                  {entry.plan.focus ? ` · ${entry.plan.focus}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {viewingToday && entry.canStart ? (
                  <Button data-start-workout={entry.plan.id} onClick={() => start(entry.plan, 'return')}>
                    Start
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => go('workout', { dateKey: selected, workoutTab: 'day' })}>
                  Open day
                </Button>
              </div>
            </Card>
          )
        })
      ) : plannedName ? (
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
              <Button
                data-start-workout
                onClick={() => {
                  const plan = info.plan ?? planForStart(state, today)
                  if (plan) start(plan, 'return')
                }}
              >
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
            const openId = conflict.openId
            setConflict(null)
            if ('planId' in conflict.intent) {
              const planId = conflict.intent.planId
              const plan = plansOnDate(state.plannedSessions, today).find((item) => item.id === planId) ?? planForStart(state, today)
              if (plan) start(plan, 'resume')
            } else go('session', { sessionId: openId })
          }}
          onSaveLater={() => {
            const pending = conflict
            setConflict(null)
            if (!pending) return
            if ('planId' in pending.intent) {
              const planId = pending.intent.planId
              const plan = plansOnDate(state.plannedSessions, today).find((item) => item.id === planId) ?? planForStart(state, today)
              if (plan) start(plan, 'pause')
              return
            }
            const sessionId = pending.intent.sessionId
            update((current) => resumeSession(pauseSession(current, pending.openId), sessionId))
            go('session', { sessionId })
          }}
          onDiscard={() => {
            const pending = conflict
            setConflict(null)
            if (!pending) return
            if ('planId' in pending.intent) {
              const planId = pending.intent.planId
              const plan = plansOnDate(state.plannedSessions, today).find((item) => item.id === planId) ?? planForStart(state, today)
              if (plan) start(plan, 'replace')
              return
            }
            const sessionId = pending.intent.sessionId
            update((current) => resumeSession(discardSession(current, pending.openId), sessionId))
            go('session', { sessionId })
          }}
        />
      ) : null}
    </Page>
  )
}

function ResumeCard({ session, label, onResume }: { session: WorkoutSession; label: string; onResume: () => void }) {
  const counts = sessionCounts(session)
  return (
    <Card className="space-y-3" data-resume-card={session.id}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
          <p className="font-semibold text-ink">{session.name}</p>
        </div>
        <Badge>
          {counts.done}/{counts.planned}
        </Badge>
      </div>
      <Button data-resume-session={session.id} onClick={onResume}>
        Resume
      </Button>
    </Card>
  )
}
