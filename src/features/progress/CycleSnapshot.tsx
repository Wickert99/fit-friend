import { CalendarRange, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { cn } from '../../ui/index.ts'
import { formatVolume } from '../../lib/maxes/index.ts'
import { hasProgramming, summarizeCycles, type ProgrammingContext } from '../../lib/cycles/index.ts'
import type { WorkoutSession, WeightUnit } from '../../types.ts'

export function CycleSnapshot({
  sessions,
  programming,
  unit,
  onOpen,
}: {
  sessions: WorkoutSession[]
  programming: ProgrammingContext
  unit: WeightUnit
  onOpen?: () => void
}) {
  const ready = hasProgramming(programming)
  const summary = useMemo(() => (ready ? summarizeCycles({ sessions }, programming) : null), [ready, sessions, programming])
  if (!ready || !summary) return null
  const mesoPct =
    summary.meso.weeksInBlock > 0 ? Math.round((summary.meso.weekOfBlock / summary.meso.weeksInBlock) * 100) : 0
  const macro =
    summary.macro.competitionLabel && summary.macro.weeksOut !== undefined
      ? summary.macro.weeksOut > 0
        ? `${summary.macro.weeksOut} wk out · ${summary.macro.competitionLabel}`
        : summary.macro.weeksOut === 0
          ? `Comp week · ${summary.macro.competitionLabel}`
          : `${Math.abs(summary.macro.weeksOut)} wk past · ${summary.macro.competitionLabel}`
      : `${summary.macro.sessions} session${summary.macro.sessions === 1 ? '' : 's'} · season`
  return (
    <button
      type="button"
      data-cycle-summary
      onClick={onOpen}
      className={cn(
        'w-full rounded-2xl border border-charcoal-4 bg-charcoal p-4 text-left shadow-card',
        onOpen && 'cursor-pointer transition hover:border-lime/35 active:scale-[0.99]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-lime" aria-hidden />
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">Cycle snapshot</p>
          </div>
          <p className="mt-1 text-sm text-muted">
            {summary.meso.programName ? summary.meso.programName : summary.macro.competitionLabel ? summary.macro.competitionLabel : 'Micro · meso · macro'}
          </p>
        </div>
        {onOpen ? <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted" aria-hidden /> : null}
      </div>
      <div className="mt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-charcoal-3/80 px-3 py-2">
          <div>
            <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">Micro</p>
            <p className="text-sm font-semibold text-ink">
              Week {summary.micro.weekOfBlock}/{summary.micro.weeksInBlock} · {summary.micro.sessions} session
              {summary.micro.sessions === 1 ? '' : 's'}
            </p>
          </div>
          <p className="text-xs text-muted tabular-nums">{formatVolume(summary.micro.volumeKg, unit)}</p>
        </div>
        <div className="rounded-xl bg-charcoal-3/80 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">Meso</p>
              <p className="text-sm font-semibold text-ink">
                Week {summary.meso.weekOfBlock} of {summary.meso.weeksInBlock}
                {summary.meso.theme ? ` · ${summary.meso.theme}` : ''}
              </p>
            </div>
            {summary.meso.sessions > 0 ? (
              <p className="text-xs text-muted tabular-nums" data-meso-logged>
                {summary.meso.sessions} logged
              </p>
            ) : null}
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-charcoal-4"
            role="progressbar"
            aria-valuenow={mesoPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Mesocycle progress"
          >
            <div className="h-full rounded-full bg-lime transition-all" style={{ width: `${Math.min(100, Math.max(8, mesoPct))}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-xl bg-charcoal-3/80 px-3 py-2">
          <div>
            <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">Macro</p>
            <p className="text-sm font-semibold text-ink">{macro}</p>
          </div>
          <p className="text-xs text-muted tabular-nums">{summary.macro.consistencyPct}% days</p>
        </div>
      </div>
      {onOpen ? <p className="mt-3 text-xs text-muted">Open the training-cycles calendar</p> : null}
    </button>
  )
}
