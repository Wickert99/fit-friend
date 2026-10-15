import { Calendar, ChevronLeft, ChevronRight, Trash2, ArrowLeftRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { eachDayOfInterval, endOfWeek, format, startOfWeek } from 'date-fns'
import { PlanSubNav } from '../../app/TabSubNav.tsx'
import { exerciseIdAliases } from '../../store/aliases.ts'
import { useStore } from '../../store/useStore.ts'
import type { Exercise, Prescription, Program, WorkoutSession } from '../../types.ts'
import { Badge, Button, Card, Page, ScreenHeader, cn } from '../../ui/index.ts'
import {
  WEEK_OPTS,
  addMonths,
  assignProgramDay,
  clearCalendar,
  clearDay,
  dateKey,
  deleteLoggedSession,
  endOfMonth,
  isSameDay,
  isSameMonth,
  isToday,
  saveBlankDay,
  startOfMonth,
  subMonths,
} from '../../lib/cycles/index.ts'
import CommitToCalendar, { type CommitSource } from './CommitToCalendar.tsx'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function canonicalId(id: string): string {
  return exerciseIdAliases[id] ?? id
}

function exerciseById(exercises: Exercise[], id: string): Exercise | undefined {
  const canonical = canonicalId(id)
  return exercises.find((exercise) => exercise.id === canonical || exercise.id === id)
}

function isFreeWrite(name: string | undefined, focus: string | undefined, exerciseCount: number, pad: string): boolean {
  return /free\s*write/i.test(focus ?? '') || /free\s*write/i.test(name ?? '') || (exerciseCount === 0 && !!pad)
}

function findScheduled(programs: Program[], scheduled: Record<string, string>, key: string) {
  const dayId = scheduled[key]
  if (!dayId) return null
  for (const program of programs) {
    const day = program.days.find((item) => item.id === dayId)
    if (day) return { program, day }
  }
  return null
}

export default function CalendarScreen() {
  const { state, go, openWorkout, update } = useStore()
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState(() => new Date())
  const [reassigning, setReassigning] = useState(false)
  const [programId, setProgramId] = useState<string | null>(null)
  const [commit, setCommit] = useState<CommitSource | null>(null)
  const selectedKey = dateKey(selected)

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), WEEK_OPTS)
    const end = endOfWeek(endOfMonth(cursor), WEEK_OPTS)
    return eachDayOfInterval({ start, end })
  }, [cursor])

  const scheduled = findScheduled(state.programs, state.scheduled, selectedKey)
  const planned = state.plannedSessions[selectedKey]
  const logged = state.sessions.filter((session) => session.status === 'completed' && session.dateKey === selectedKey)
  const title = planned?.name ?? scheduled?.day.name
  const focus = planned?.focus ?? scheduled?.day.focus ?? scheduled?.program.theme
  const programName = planned?.programName ?? scheduled?.program.name
  const exercises = planned?.exercises ?? scheduled?.day.exercises ?? []
  const pad = (planned?.sessionPad ?? scheduled?.day.sessionPad ?? '').trim()
  const freeWrite = isFreeWrite(title, focus, exercises.length, pad)
  const hasPlan = !!(scheduled || planned)
  const hasAnything = hasPlan || logged.length > 0
  const active = state.programs.find((program) => program.id === state.activeProgramId) ?? scheduled?.program ?? null
  const mine = state.programs.filter((program) => program.isMine || program.id === state.activeProgramId)
  const chosen =
    state.programs.find((program) => program.id === (programId ?? active?.id)) ??
    active ??
    state.programs.find((program) => program.isMine) ??
    state.programs[0] ??
    null
  const loggedThisPlan = logged.some(
    (session) => session.programDayId === (planned?.programDayId ?? scheduled?.day.id) || session.name === title,
  )

  const confirmClearAll = (first: string, second: string) => {
    if (!window.confirm(first)) return
    const clearPlanBoards = window.confirm(second)
    update((current) => clearCalendar(current, { clearPlanBoards }))
  }

  return (
    <Page className="gap-4">
      <ScreenHeader title="Plan" subtitle="Calendar · scheduled and logged days" />
      <PlanSubNav value="calendar" />
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-xl font-semibold tracking-tight text-ink">
          {format(cursor, 'MMMM')}
          <span className="ml-2 font-semibold text-muted">{format(cursor, 'yyyy')}</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Clear calendar"
            title="Clear calendar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-charcoal-3 hover:text-danger"
            onClick={() =>
              confirmClearAll(
                `Clear calendar?\n\nOK = clear scheduled workouts + day plans (logged history kept).\nCancel = abort.\n\nAfter OK you can optionally clear Plan boards too.`,
                `Also clear Plan whiteboard boards (exercises on cards)?\n\nOK = Clear schedule & plans\nCancel = Clear schedule only`,
              )
            }
          >
            <Trash2 className="h-5 w-5" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Previous month"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-lime hover:bg-charcoal-3"
            onClick={() => setCursor((current) => subMonths(current, 1))}
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.25} />
          </button>
          <button
            type="button"
            aria-label="Next month"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-lime hover:bg-charcoal-3"
            onClick={() => setCursor((current) => addMonths(current, 1))}
          >
            <ChevronRight className="h-6 w-6" strokeWidth={2.25} />
          </button>
        </div>
      </div>
      <div className="px-0.5">
        <div className="grid min-w-0 grid-cols-7 text-center">
          {WEEKDAYS.map((label) => (
            <div key={label} className="py-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
              {label}
            </div>
          ))}
        </div>
        <div className="grid min-w-0 grid-cols-7 gap-y-1" role="grid" aria-label="Month calendar">
          {days.map((day) => {
            const key = dateKey(day)
            const inMonth = isSameMonth(day, cursor)
            const isSelected = isSameDay(day, selected)
            const today = isToday(day)
            const committed = state.commitmentDays.includes(key)
            const marked = !!(state.scheduled[key] || state.plannedSessions[key] || committed)
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={format(day, 'EEEE d MMMM')}
                className="relative flex h-12 flex-col items-center justify-center"
                onClick={() => {
                  setSelected(day)
                  setReassigning(false)
                  if (!inMonth) setCursor(startOfMonth(day))
                }}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-[15px] font-medium tabular-nums transition',
                    !inMonth && 'text-muted',
                    inMonth && !isSelected && !today && 'text-ink',
                    today && !isSelected && 'font-semibold text-lime-dim',
                    isSelected && 'bg-lime-dim font-semibold text-white',
                    !isSelected && inMonth && 'hover:bg-charcoal-3',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {marked ? (
                  <span
                    className={cn('absolute bottom-1 h-1 w-1 rounded-full', isSelected ? 'bg-white/90' : committed ? 'bg-success' : 'bg-lime')}
                    aria-hidden
                  />
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
      <section className="space-y-3 border-t border-charcoal-4 pt-4">
        <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="text-base font-semibold text-ink">{format(selected, 'EEEE d MMMM')}</p>
          <div className="-mx-2 flex flex-wrap items-center gap-x-1">
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-muted hover:text-danger"
              onClick={() =>
                confirmClearAll(
                  `Clear all scheduled workouts from the calendar?\n\nLogged history is kept. OK to continue.`,
                  `Also clear Plan boards?\n\nOK = Clear schedule & plans\nCancel = schedule only`,
                )
              }
            >
              Clear calendar
            </button>
            {isToday(selected) ? <span className="px-2 text-xs font-medium text-lime-dim">Today</span> : null}
            {hasPlan ? (
              <>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-muted hover:text-ink"
                  aria-expanded={reassigning}
                  onClick={() => setReassigning((open) => !open)}
                >
                  Reassign
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-medium text-muted hover:text-danger"
                  aria-label="Clear this day"
                  onClick={() => {
                    if (window.confirm('Clear the planned workout for this day?')) {
                      update((current) => clearDay(current, selectedKey))
                      setReassigning(false)
                    }
                  }}
                >
                  Clear
                </button>
              </>
            ) : null}
          </div>
        </div>
        {!hasAnything ? (
          <Card className="border-dashed bg-charcoal/80">
            <p className="font-semibold text-ink">Nothing planned</p>
            <p className="mt-1 text-sm text-muted">Create a workout for this day, or commit a plan/program onto the calendar.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  update((current) => saveBlankDay(current, selectedKey).state)
                  openWorkout(selectedKey)
                }}
              >
                Create workout
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const board = state.planBoards.find((item) => item.id === state.activeBoardId) ?? state.planBoards[0]
                  if (active) setCommit({ kind: 'program', program: active })
                  else if (board) setCommit({ kind: 'board', board })
                  else go('plan')
                }}
              >
                <Calendar className="h-3.5 w-3.5" /> Commit from Plan
              </Button>
            </div>
          </Card>
        ) : null}
        {hasPlan ? (
          <Card onClick={() => openWorkout(selectedKey)} className="cursor-pointer border-charcoal-4 bg-charcoal shadow-card">
            <div className="flex gap-3">
              <div className="w-1 shrink-0 rounded-full bg-lime" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {programName ? <Badge tone="lime">{programName}</Badge> : null}
                  {focus ? <Badge tone="steel">{focus}</Badge> : null}
                  {freeWrite && !/free\s*write/i.test(focus ?? '') ? <Badge tone="lime">Free write</Badge> : null}
                  {loggedThisPlan ? <Badge tone="success">Logged</Badge> : null}
                </div>
                <h3 className="mt-1.5 text-base font-semibold text-ink">{title}</h3>
                {pad ? (
                  <p data-session-pad-preview className="font-hand mt-2 line-clamp-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                    {pad}
                  </p>
                ) : exercises.length === 0 ? (
                  <p className="mt-0.5 text-sm text-muted">{freeWrite ? 'Free-write session' : '0 exercises'}</p>
                ) : (
                  <p className="mt-0.5 text-sm text-muted">
                    {exercises.length} exercise{exercises.length === 1 ? '' : 's'}
                  </p>
                )}
                {exercises.length > 0 ? <ExercisePreview exercises={exercises} library={state.exercises} /> : null}
              </div>
            </div>
          </Card>
        ) : null}
        {reassigning && hasPlan && chosen ? (
          <Card className="border-lime/30">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <ArrowLeftRight className="h-4 w-4 text-lime" />
              Reassign · {chosen.name}
            </div>
            <p className="mt-1 text-xs text-muted">Pick a program day for {format(selected, 'EEE d MMM')}. Same path as the old Week scheduler.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {chosen.days.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  aria-pressed={(planned?.programDayId ?? scheduled?.day.id) === day.id}
                  className={cn(
                    'hit-slop-sm min-h-11 rounded-full border px-3.5 py-2 text-xs font-medium',
                    (planned?.programDayId ?? scheduled?.day.id) === day.id
                      ? 'border-lime/50 bg-lime/8 font-semibold text-lime-dim'
                      : 'border-charcoal-4 bg-charcoal text-muted',
                  )}
                  onClick={() => {
                    update((current) => assignProgramDay(current, selectedKey, day.id))
                    setReassigning(false)
                  }}
                >
                  {day.name.replace(/^Day\s+/i, '').slice(0, 22)}
                </button>
              ))}
            </div>
            {mine.length > 1 ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-charcoal-4 pt-3">
                {mine.slice(0, 6).map((program) => (
                  <button
                    key={program.id}
                    type="button"
                    aria-pressed={chosen.id === program.id}
                    className={cn(
                      'hit-slop-sm min-h-11 rounded-full border px-3.5 py-2 text-xs font-medium',
                      chosen.id === program.id ? 'border-lime/50 bg-lime/8 font-semibold text-lime-dim' : 'border-charcoal-4 bg-charcoal text-muted',
                    )}
                    onClick={() => setProgramId(program.id)}
                  >
                    {program.name.slice(0, 18)}
                  </button>
                ))}
              </div>
            ) : null}
          </Card>
        ) : null}
        {!hasPlan
          ? logged.map((session) => (
              <LoggedCard
                key={session.id}
                session={session}
                onOpen={() => go('session', { sessionId: session.id })}
                onDelete={() => {
                  if (
                    window.confirm(
                      `Delete “${session.name}” from your log?\n\nRemoves history, updates PRs if needed, and clears this day from your streak if nothing else was logged.`,
                    )
                  ) {
                    update((current) => deleteLoggedSession(current, session.id))
                  }
                }}
              />
            ))
          : null}
      </section>
      {commit ? <CommitToCalendar source={commit} initialStart={selectedKey} onClose={() => setCommit(null)} /> : null}
    </Page>
  )
}

function ExercisePreview({ exercises, library }: { exercises: Prescription[]; library: Exercise[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {exercises.slice(0, 4).map((exercise, index) => {
        const known = exerciseById(library, exercise.exerciseId)
        return (
          <li key={`${exercise.exerciseId}-${index}`} className="truncate text-sm text-muted">
            <span className="text-ink">{known?.name ?? exercise.exerciseId}</span>
            <span className="text-muted">
              {' '}
              · {exercise.sets}×{exercise.reps}
            </span>
          </li>
        )
      })}
      {exercises.length > 4 ? <li className="text-xs text-muted">+{exercises.length - 4} more</li> : null}
    </ul>
  )
}

function LoggedCard({ session, onOpen, onDelete }: { session: WorkoutSession; onOpen: () => void; onDelete: () => void }) {
  const pad = session.sessionPad?.trim() ?? ''
  const free = pad && (/free\s*write/i.test(session.focus ?? '') || /free\s*write/i.test(session.name) || session.exercises.length === 0)
  return (
    <Card className="border-charcoal-4 bg-charcoal shadow-card">
      <div className="flex gap-3">
        <div className="w-1 shrink-0 rounded-full bg-success" aria-hidden />
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Logged</Badge>
              {free ? <Badge tone="lime">Free write</Badge> : null}
            </div>
            <p className="mt-1.5 font-semibold text-ink">{session.name}</p>
            {pad ? (
              <p data-session-pad-preview className="font-hand mt-1.5 line-clamp-4 text-sm leading-relaxed whitespace-pre-wrap text-ink">
                {pad}
              </p>
            ) : null}
          </button>
          <Button size="sm" variant="danger" aria-label={`Delete ${session.name}`} onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
