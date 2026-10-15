import { addDays, format, isSameDay, startOfWeek } from 'date-fns'
import { useStore } from '../../store/useStore.ts'
import { todayKey } from '../../store/id.ts'
import { Badge, Button, Card, Page, ScreenHeader } from '../../ui/index.ts'
import { cn } from '../../ui/cn.ts'

export default function TodayScreen() {
  const { state, go } = useStore()
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const active = state.programs.find((program) => program.id === state.activeProgramId)
  const logged = state.sessions.filter((session) => session.status === 'completed').length
  return (
    <Page>
      <ScreenHeader title={format(today, 'EEEE d MMMM')} subtitle="This week" />
      <div className="h-scroll">
        {days.map((day) => {
          const selected = isSameDay(day, today)
          const key = todayKey(day)
          return (
            <button
              key={key}
              type="button"
              onClick={() => go('workout', { dateKey: key, workoutTab: 'day' })}
              className={cn(
                'flex min-h-11 min-w-12 flex-col items-center rounded-xl px-2 py-1.5 text-xs',
                selected ? 'bg-lime/10 font-semibold text-lime-dim' : 'text-muted',
              )}
            >
              <span>{format(day, 'EEE')}</span>
              <span className="text-sm text-ink">{format(day, 'd')}</span>
            </button>
          )
        })}
      </div>
      <Card className="border-dashed bg-charcoal/80">
        <p className="font-semibold">Nothing scheduled</p>
        <p className="mt-1 text-sm text-muted">
          {active
            ? `Quiet day. Schedule from ${active.name} when you’re ready.`
            : 'Quiet day. Pick a program on Plan when you’re ready.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => go('plan')}>Plan</Button>
          <Button variant="secondary" onClick={() => go('calendar')}>
            Calendar
          </Button>
          <Button variant="ghost" onClick={() => go('exercise-detail', { exerciseId: 'ex-bsquat' })}>
            Back squat
          </Button>
          <Button variant="ghost" onClick={() => go('program-detail', { programId: 'prog-1rm-testing' })}>
            1RM testing
          </Button>
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="lime">{state.profile.name}</Badge>
          <Badge>{state.exercises.length} exercises</Badge>
          <Badge>{state.programs.length} programs</Badge>
          {logged > 0 ? <Badge tone="success">{logged} logged</Badge> : null}
        </div>
        <p className="mt-2 text-sm text-muted">
          Today’s resume card, cycle snapshot, and logged-day list land with the workout package. Your library is already on this device.
        </p>
      </Card>
    </Page>
  )
}
