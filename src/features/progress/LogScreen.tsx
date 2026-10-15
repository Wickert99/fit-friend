import { Dumbbell, Plus, Trash2, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { format, isToday, isValid, isYesterday, parseISO } from 'date-fns'
import { ProgressSubNav } from '../../app/TabSubNav.tsx'
import { exerciseIdAliases } from '../../store/aliases.ts'
import { benchmarkRecords, liftFamilies, runRecords } from '../../store/catalog.ts'
import { useStore } from '../../store/useStore.ts'
import type { Exercise, PersonalRecord } from '../../types.ts'
import { Badge, Button, Card, EmptyState, Page, ScreenHeader } from '../../ui/index.ts'
import { deleteLoggedSession, formatKey, programmingFromState } from '../../lib/cycles/index.ts'
import { formatVolume, formatWeightNumber, plural, sessionVolumeKg } from '../../lib/maxes/index.ts'
import { formatRecord, recordKind } from '../../lib/maxes/scores.ts'
import { CycleCalendarSheet, CycleExplorer } from './CycleCalendar.tsx'
import { CycleSnapshot } from './CycleSnapshot.tsx'

function exerciseName(exercises: Exercise[], id: string): string {
  const canonical = exerciseIdAliases[id] ?? id
  return exercises.find((exercise) => exercise.id === canonical || exercise.id === id)?.name ?? id
}

function prWhen(record: PersonalRecord): string {
  const raw = (record as PersonalRecord & { date?: string }).date ?? record.dateKey
  if (!raw) return '—'
  const key = raw.length >= 10 ? raw.slice(0, 10) : raw
  const date = parseISO(`${key}T12:00:00`)
  return isValid(date) ? formatKey(key, 'd MMM yyyy') : '—'
}

function formatWhen(iso: string | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  if (isToday(date)) return `Today ${format(date, 'h:mm a')}`
  if (isYesterday(date)) return `Yesterday ${format(date, 'h:mm a')}`
  return format(date, 'EEE d MMM · h:mm a')
}

export default function LogScreen() {
  const { state, go, update } = useStore()
  const [cyclesOpen, setCyclesOpen] = useState(false)
  const unit = state.weightUnit ?? 'kg'
  const programming = useMemo(() => programmingFromState(state), [state])
  const maxes = useMemo(() => {
    const groups: Record<'strength' | 'run' | 'benchmark', { familyId: string; name: string; value: string }[]> = {
      strength: [],
      run: [],
      benchmark: [],
    }
    for (const [key, record] of Object.entries(state.liftMaxes ?? {})) {
      const value = formatRecord(record, unit)
      if (value === 'Not set') continue
      const kind = recordKind(record, { runs: runRecords, benchmarks: benchmarkRecords })
      groups[kind].push({
        familyId: record.familyId || key,
        name: record.name?.trim() || liftFamilies.find((family) => family.id === record.familyId)?.name || record.familyId,
        value,
      })
    }
    for (const kind of ['strength', 'run', 'benchmark'] as const) groups[kind].sort((a, b) => a.name.localeCompare(b.name))
    return { groups, kinds: (['strength', 'run', 'benchmark'] as const).filter((kind) => groups[kind].length > 0) }
  }, [state.liftMaxes, unit])
  const history = state.sessions
    .filter((session) => session.status === 'completed')
    .slice()
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  const records = state.prs.slice().sort((a, b) => (b.loadKg ?? 0) - (a.loadKg ?? 0))
  const openCycles = () => setCyclesOpen(true)

  return (
    <Page>
      <ScreenHeader title="Progress" subtitle="Cycles, maxes, PRs, and history" />
      <ProgressSubNav value="log" />
      <CycleSnapshot sessions={state.sessions} programming={programming} unit={unit} onOpen={openCycles} />
      <CycleExplorer programming={programming} />
      <CycleCalendarSheet open={cyclesOpen} programming={programming} onClose={() => setCyclesOpen(false)} />
      <section className="space-y-3" data-log-maxes>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-lime" />
            <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Maxes</h2>
          </div>
          <Button size="sm" onClick={() => go('maxes')}>
            <Plus className="h-3.5 w-3.5" /> Add 1RM
          </Button>
        </div>
        {maxes.kinds.length === 0 ? (
          <EmptyState title="No 1RMs yet" body="Add a 1RM to track lifts, runs, and benchmarks here." />
        ) : maxes.kinds.length === 1 ? (
          <div className="grid grid-cols-1 gap-2">
            {maxes.groups[maxes.kinds[0]!].map((row) => (
              <MaxRow key={row.familyId} {...row} onOpen={() => go('maxes')} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {maxes.kinds.map((kind) => (
              <div key={kind} className="space-y-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {kind === 'strength' ? 'Strength' : kind === 'run' ? 'Running' : 'Benchmarks'}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {maxes.groups[kind].map((row) => (
                    <MaxRow key={row.familyId} {...row} onOpen={() => go('maxes')} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-lime" />
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Personal records</h2>
        </div>
        {records.length === 0 ? (
          <EmptyState title="No PRs yet" body="Complete workouts with load to unlock PRs." />
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {records.map((record) => (
              <Card key={`${record.exerciseId}-${record.sessionId ?? record.dateKey}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{exerciseName(state.exercises, record.exerciseId)}</p>
                    <p className="text-xs text-muted">{prWhen(record)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-lime-dim">
                      {formatWeightNumber(record.loadKg ?? 0, unit)} <span className="text-sm font-medium text-muted">{unit}</span>
                    </p>
                    <p className="text-xs text-muted">× {record.reps ?? '—'}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">History</h2>
        {history.length === 0 ? (
          <EmptyState title="No workouts logged" body="Start a session from Today to build history." />
        ) : (
          history.map((session) => (
            <Card key={session.id}>
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => go('session', { sessionId: session.id })}>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="success">Completed</Badge>
                    {session.shared ? <Badge tone="steel">Shared</Badge> : null}
                  </div>
                  <p className="mt-2 font-semibold">{session.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatWhen(session.completedAt ?? session.startedAt)} · {plural(session.exercises.length, 'exercise')} ·{' '}
                    {formatVolume(sessionVolumeKg(session), unit)} volume
                  </p>
                </button>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Delete ${session.name}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete “${session.name}” from your log?\n\nThis removes it from history, updates PRs if needed, and clears that day from your streak if nothing else was logged.`,
                      )
                    ) {
                      update((current) => deleteLoggedSession(current, session.id))
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </section>
    </Page>
  )
}

function MaxRow({ familyId, name, value, onOpen }: { familyId: string; name: string; value: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-log-max-row={familyId}
      className="w-full rounded-2xl border border-charcoal-4 bg-charcoal p-3 text-left shadow-card transition hover:border-lime/35"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 font-semibold">{name}</span>
        <span className="shrink-0 text-sm font-bold text-lime-dim tabular-nums">{value}</span>
      </span>
    </button>
  )
}
