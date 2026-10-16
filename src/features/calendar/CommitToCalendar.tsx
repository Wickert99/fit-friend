import { Calendar, Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getDay } from 'date-fns'
import { useStore } from '../../store/useStore.ts'
import type { PlanBoard, Program } from '../../types.ts'
import { Badge, Button, Chip, Input, useBodyScrollLock } from '../../ui/index.ts'
import {
  applyCommit,
  defaultCommitMode,
  defaultStartKey,
  findStretches,
  formatKey,
  isLateInWeek,
  longestStretch,
  nextMondayKey,
  packHint,
  parseKey,
  prepareBoardCommit,
  prepareProgramCommit,
  runWarning,
  todayKey,
  type CommitMode,
  type PreparedCommit,
} from '../../lib/cycles/index.ts'

export type CommitSource = { kind: 'program'; program: Program } | { kind: 'board'; board: PlanBoard }

export default function CommitToCalendar({
  source,
  initialStart,
  onClose,
}: {
  source: CommitSource
  initialStart?: string
  onClose: () => void
}) {
  const { state, update, go } = useStore()
  const today = todayKey()
  const initialMode = source.kind === 'program' ? defaultCommitMode(source.program) : 'weekday'
  const bumped = !(initialStart && initialStart > today) && isLateInWeek(today) ? defaultStartKey(initialStart, today) : null
  const [chosen, setChosen] = useState(() => defaultStartKey(initialStart, todayKey()))
  const [mode, setMode] = useState<CommitMode>(initialMode)
  useBodyScrollLock(true)
  const clamped = chosen < today ? today : chosen
  const prepared = useMemo(
    () =>
      source.kind === 'program'
        ? prepareProgramCommit(source.program, clamped, mode, today)
        : prepareBoardCommit(source.board, clamped, mode, today),
    [source, clamped, mode, today],
  )
  const preview = prepared?.preview
  const shown = preview && preview.mappings.length > 0 ? preview.startKey : clamped
  const moved = shown !== chosen
  const hint = packHint(
    preview ?? { mappings: [], startKey: shown, endKey: shown, mode, repacked: 0, spilled: 0, clampedToToday: clamped !== chosen },
  )
  const stretches = useMemo(() => (preview ? findStretches(preview.mappings, 5) : []), [preview])
  const longest = longestStretch(stretches)
  const monday = nextMondayKey(shown)
  const later = useMemo(() => {
    if (!longest || getDay(parseKey(shown)) === 1) return null
    return source.kind === 'program'
      ? prepareProgramCommit(source.program, monday, mode, today)
      : prepareBoardCommit(source.board, monday, mode, today)
  }, [longest, shown, monday, mode, today, source])
  const laterLongest = later?.preview ? longestStretch(findStretches(later.preview.mappings, 5)) : null
  const laterHelps = !!longest && getDay(parseKey(shown)) !== 1 && !!later?.preview.mappings.length && (!laterLongest || laterLongest.length < longest.length)
  const warning = longest ? runWarning(longest.length, longest.week, stretches.length, laterHelps) : ''
  const conflicts = useMemo(
    () =>
      preview
        ? preview.mappings.filter((item) => state.scheduled[item.dateKey] || state.plannedSessions[item.dateKey]).map((item) => item.dateKey)
        : [],
    [preview, state.scheduled, state.plannedSessions],
  )
  const name = source.kind === 'program' ? source.program.name : source.board.name
  const dayCount = source.kind === 'program' ? source.program.days.length : source.board.weeks.reduce((sum, week) => sum + week.days.length, 0)
  const ready = !!preview && preview.mappings.length > 0

  const confirm = () => {
    if (!prepared || !ready) return
    if (
      conflicts.length > 0 &&
      !window.confirm(`${conflicts.length} day${conflicts.length === 1 ? '' : 's'} already have a plan and will be overwritten.\n\nContinue?`)
    ) {
      return
    }
    update((current) => applyCommit(current, prepared))
    onClose()
    go('calendar')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="commit-title"
        className="sheet-panel relative z-10 flex w-full max-w-lg flex-col rounded-t-3xl border border-charcoal-4 bg-charcoal shadow-raised sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-charcoal-4 px-4 py-3">
          <div className="min-w-0">
            <h2 id="commit-title" className="flex items-center gap-2 text-lg font-semibold">
              <Calendar className="h-5 w-5 text-lime" />
              Commit to calendar
            </h2>
            <p className="truncate text-xs text-muted">
              {name} · {dayCount} day{dayCount === 1 ? '' : 's'}
            </p>
          </div>
          <Button size="sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <div>
            <label htmlFor="commit-start-date" className="mb-1 block text-xs font-medium text-muted">
              Start date
            </label>
            <Input
              id="commit-start-date"
              type="date"
              value={shown}
              min={today}
              onChange={(event) => setChosen(event.target.value)}
              aria-describedby={bumped && clamped === bumped ? 'commit-start-hint' : moved ? 'commit-start-moved' : undefined}
            />
            {bumped && clamped === bumped ? (
              <p id="commit-start-hint" className="mt-1.5 text-xs text-muted">
                {formatKey(today, 'EEE d MMM')} is late in the week, so this starts the following Monday for a full first week.
              </p>
            ) : null}
            {!(bumped && clamped === bumped) && moved && chosen ? (
              <p id="commit-start-moved" className="mt-1.5 text-xs text-muted">
                {chosen < today ? 'Can’t start in the past' : `No session falls on ${formatKey(chosen, 'EEE d MMM')}`}, so the first session is{' '}
                {formatKey(shown, 'EEE d MMM')}.
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip active={shown === today} onClick={() => setChosen(today)}>
                Today
              </Chip>
              <Chip active={shown === nextMondayKey(today)} onClick={() => setChosen(nextMondayKey(today))}>
                Next Monday
              </Chip>
            </div>
          </div>
          <div>
            <p className="mb-1 block text-xs font-medium text-muted">Mapping</p>
            <div className="flex flex-wrap gap-2">
              <Chip active={mode === 'weekday'} onClick={() => setMode('weekday')}>
                Mon-start week
              </Chip>
              <Chip active={mode === 'consecutive'} onClick={() => setMode('consecutive')}>
                Board / day order
              </Chip>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {mode === 'weekday'
                ? 'Pins days onto weekdays in Mon–Sun weeks (program weekdays or board order Mon→Sun).'
                : 'Places days back-to-back from the start date.'}
            </p>
          </div>
          <Preview prepared={prepared} hint={ready ? hint : ''} warning={warning} laterHelps={laterHelps} onMonday={() => setChosen(monday)} conflicts={conflicts} />
        </div>
        <div className="space-y-2 border-t border-charcoal-4 p-4">
          {ready && preview ? (
            <p className="text-center text-xs text-muted" data-commit-summary>
              Ready:{' '}
              <span className="font-semibold text-ink">
                {preview.mappings.length} day{preview.mappings.length === 1 ? '' : 's'}
              </span>{' '}
              from {formatKey(preview.startKey, 'EEE d MMM')}
              {conflicts.length > 0 ? ` · ${conflicts.length} overwrite${conflicts.length === 1 ? '' : 's'}` : ' · no conflicts'}
            </p>
          ) : null}
          <Button size="lg" className="w-full shadow-lg shadow-lime/20" data-commit-confirm disabled={!ready} onClick={confirm}>
            <Check className="h-5 w-5" />
            Confirm · add {preview?.mappings.length || 0} to calendar
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

function Preview({
  prepared,
  hint,
  warning,
  laterHelps,
  onMonday,
  conflicts,
}: {
  prepared: PreparedCommit | null
  hint: string
  warning: string
  laterHelps: boolean
  onMonday: () => void
  conflicts: string[]
}) {
  const preview = prepared?.preview
  const ready = !!preview && preview.mappings.length > 0
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">Preview</p>
        {ready && preview ? (
          <span className="text-xs text-muted">
            {formatKey(preview.startKey, 'd MMM')} → {formatKey(preview.endKey, 'd MMM')}
          </span>
        ) : null}
      </div>
      {!ready ? (
        <p className="rounded-2xl border border-dashed border-charcoal-4 px-3 py-6 text-center text-sm text-muted">
          Nothing to map — add exercises or a free-write pad to at least one day.
        </p>
      ) : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-2xl border border-charcoal-4 bg-charcoal-2 p-2">
          {preview.mappings.map((item) => {
            const overwrite = conflicts.includes(item.dateKey)
            return (
              <li key={`${item.dateKey}-${item.programDayId}`} className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-ink">{item.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{item.dayName}</span>
                </span>
                <Badge tone={overwrite ? 'steel' : 'success'}>{overwrite ? 'Overwrite' : 'Free'}</Badge>
              </li>
            )
          })}
        </ul>
      )}
      {hint ? (
        <p className="mt-1.5 text-xs text-muted" role="status" data-commit-pack-hint>
          {hint}
        </p>
      ) : null}
      {warning ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warn/12 px-3 py-2" data-commit-run-warning-box>
          <p className="text-xs text-warn-ink" role="status" data-commit-run-warning>
            {warning}
          </p>
          {laterHelps ? <Chip onClick={onMonday}>Next Monday</Chip> : null}
        </div>
      ) : null}
    </div>
  )
}
