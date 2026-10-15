import { CalendarRange, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { eachDayOfInterval, format } from 'date-fns'
import { Button, Chip, useBodyScrollLock, cn } from '../../ui/index.ts'
import {
  WEEK_OPTS,
  addMonths,
  addYears,
  dateKey,
  endOfMonth,
  endOfYear,
  isToday,
  parseKey,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subYears,
} from '../../lib/cycles/dates.ts'
import {
  CYCLE_COLORS,
  CYCLE_LABELS,
  blocksInRange,
  blocksOnDay,
  buildCycleBlocks,
  legendKinds,
  phaseColor,
  type CycleBlock,
  type CycleKind,
  type ProgrammingContext,
} from '../../lib/cycles/programming.ts'

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const LANES: CycleKind[] = ['macro', 'phase', 'meso', 'micro', 'competition']
const DAY_PRIORITY: CycleKind[] = ['competition', 'micro', 'meso', 'phase', 'macro']

export function CycleExplorer({ programming }: { programming: ProgrammingContext }) {
  const [open, setOpen] = useState(false)
  const blocks = useMemo(() => buildCycleBlocks(programming), [programming])
  const kinds = legendKinds(blocks)
  const spans = blocks.filter((block) => block.kind !== 'micro')
  return (
    <>
      <button
        type="button"
        data-cycle-explorer
        data-cycle-open
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-charcoal-4 bg-charcoal px-4 py-3.5 text-left shadow-card transition hover:bg-charcoal-2/70 active:scale-[0.99]"
        onClick={() => setOpen(true)}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-lime" aria-hidden />
            <span className="text-xs font-semibold tracking-wider text-muted uppercase">Training cycles</span>
          </span>
          <span className="mt-1 block text-sm text-muted">
            {blocks.length === 0
              ? 'Year & month calendar — blank until you program a block'
              : `${spans.length || blocks.length} programmed span${blocks.length === 1 ? '' : 's'} · year & month views`}
          </span>
          {kinds.length > 0 ? (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {kinds.map((kind) => (
                <span key={kind} className="inline-flex items-center rounded-full bg-steel/8 px-2 py-0.5 text-[11px] font-medium text-lime-dim">
                  <span
                    className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: kind === 'phase' ? (phaseColor(blocks) ?? CYCLE_COLORS[kind]) : CYCLE_COLORS[kind] }}
                  />
                  {CYCLE_LABELS[kind]}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
      </button>
      <CycleCalendarSheet open={open} programming={programming} onClose={() => setOpen(false)} />
    </>
  )
}

export function CycleCalendarSheet({
  open,
  programming,
  onClose,
}: {
  open: boolean
  programming: ProgrammingContext
  onClose: () => void
}) {
  const [scale, setScale] = useState<'year' | 'month'>('year')
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const blocks = useMemo(() => buildCycleBlocks(programming), [programming])
  useBodyScrollLock(open)
  if (!open) return null
  const title = scale === 'year' ? String(cursor.getFullYear()) : format(cursor, 'MMMM yyyy')
  const visible =
    scale === 'year'
      ? blocksInRange(blocks, dateKey(startOfYear(cursor)), dateKey(endOfYear(cursor)))
      : blocksInRange(blocks, dateKey(startOfMonth(cursor)), dateKey(endOfMonth(cursor)))
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/45 p-0 sm:items-center sm:p-3" data-cycle-calendar-sheet>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close training cycles" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cycles-cal-title"
        className="relative z-10 flex h-[100dvh] w-full max-w-lg flex-col bg-charcoal-2 shadow-raised sm:h-[min(96dvh,900px)] sm:rounded-3xl sm:border sm:border-charcoal-4"
      >
        <div className="flex items-center justify-between gap-2 border-b border-charcoal-4 bg-charcoal px-3 py-3">
          <div className="min-w-0">
            <h2 id="cycles-cal-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
              <CalendarRange className="h-5 w-5 text-lime" aria-hidden />
              Training cycles
            </h2>
            <p className="truncate text-xs text-muted">Year & month snapshots from your program and season</p>
          </div>
          <Button size="sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 border-b border-charcoal-4 bg-charcoal px-3 py-2">
          <div className="flex gap-1.5" role="tablist" aria-label="Calendar scale">
            <Chip active={scale === 'year'} onClick={() => setScale('year')}>
              Year
            </Chip>
            <Chip active={scale === 'month'} onClick={() => setScale('month')}>
              Month
            </Chip>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" aria-label="Previous" onClick={() => setCursor((current) => (scale === 'year' ? subYears(current, 1) : subMonths(current, 1)))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="min-w-[7.5rem] text-center text-sm font-semibold text-ink tabular-nums">{title}</p>
            <Button size="sm" variant="ghost" aria-label="Next" onClick={() => setCursor((current) => (scale === 'year' ? addYears(current, 1) : addMonths(current, 1)))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {blocks.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="font-medium text-ink">No cycles programmed</p>
              <p className="max-w-xs text-sm text-muted">Activate a program, commit a schedule, or set a competition date in Coach. Empty periods stay blank.</p>
            </div>
          ) : scale === 'year' ? (
            <YearGrid year={cursor.getFullYear()} blocks={blocks} />
          ) : (
            <MonthGrid cursor={cursor} blocks={blocks} />
          )}
        </div>
        <div className="border-t border-charcoal-4 bg-charcoal px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Legend blocks={visible.length ? visible : blocks} />
          {visible.length === 0 && blocks.length > 0 ? (
            <p className="mt-1.5 text-[11px] text-muted">No blocks in this {scale === 'year' ? 'year' : 'month'}.</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Legend({ blocks }: { blocks: CycleBlock[] }) {
  const kinds = legendKinds(blocks)
  if (kinds.length === 0) return null
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5" data-cycle-legend aria-label="Cycle colour legend">
      {kinds.map((kind) => {
        const phase = kind === 'phase' ? blocks.find((block) => block.kind === 'phase') : undefined
        return (
          <div key={kind} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: phase?.color ?? CYCLE_COLORS[kind] }} aria-hidden />
            <span>{kind === 'phase' && phase ? phase.label : CYCLE_LABELS[kind]}</span>
          </div>
        )
      })}
    </div>
  )
}

function YearGrid({ year, blocks }: { year: number; blocks: CycleBlock[] }) {
  const months = Array.from({ length: 12 }, (_, index) => new Date(year, index, 1))
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" data-cycle-year>
      {months.map((month) => {
        const start = startOfMonth(month)
        const end = endOfMonth(month)
        const covering = blocksInRange(blocks, dateKey(start), dateKey(end))
        const days = end.getDate()
        const lanes = LANES.filter((kind) => covering.some((block) => block.kind === kind))
        return (
          <div key={dateKey(start)} className="rounded-xl border border-charcoal-4 bg-charcoal px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{format(month, 'MMM')}</p>
              {covering.length === 0 ? (
                <p className="text-[10px] text-muted">—</p>
              ) : (
                <p className="text-[10px] text-muted tabular-nums">
                  {covering.length} block{covering.length === 1 ? '' : 's'}
                </p>
              )}
            </div>
            <div className="relative mt-2 h-7 overflow-hidden rounded-md bg-charcoal-3/50">
              {lanes.length === 0 ? null : (
                <div className="absolute inset-0 flex flex-col justify-center gap-0.5 px-0.5 py-1">
                  {lanes.map((kind) => (
                    <div key={kind} className="relative h-1.5 w-full">
                      {covering
                        .filter((block) => block.kind === kind)
                        .map((block) => {
                          const left = Math.max(0, (parseKey(block.startKey).getTime() - start.getTime()) / (86400000 * days))
                          const right = Math.min(1, (parseKey(block.endKey).getTime() - start.getTime() + 86400000) / (86400000 * days))
                          return (
                            <div
                              key={block.id}
                              title={block.label}
                              className="absolute top-0 h-full rounded-sm"
                              style={{
                                left: `${left * 100}%`,
                                width: `${Math.max(2, (right - left) * 100)}%`,
                                background: block.color,
                                opacity: kind === 'macro' || kind === 'phase' ? 0.55 : 0.9,
                              }}
                            />
                          )
                        })}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {covering.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5">
                {covering
                  .filter((block) => block.kind !== 'micro')
                  .slice(0, 3)
                  .map((block) => (
                    <li key={block.id} className="truncate text-[10px] text-muted" title={block.label}>
                      <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: block.color }} />
                      {block.label}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function MonthGrid({ cursor, blocks }: { cursor: Date; blocks: CycleBlock[] }) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), WEEK_OPTS)
    const end = endOfMonth(cursor)
    const last = endOfWeekSafe(end)
    return eachDayOfInterval({ start, end: last })
  }, [cursor])
  const monthBlocks = blocksInRange(blocks, dateKey(startOfMonth(cursor)), dateKey(endOfMonth(cursor)))
  return (
    <div data-cycle-month>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold tracking-wide text-muted uppercase">
        {WEEK.map((label, index) => (
          <div key={`${label}-${index}`} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = dateKey(day)
          const inMonth = day.getMonth() === cursor.getMonth()
          const covering = inMonth ? blocksOnDay(blocks, key) : []
          const primary = DAY_PRIORITY.map((kind) => covering.find((block) => block.kind === kind)).find(Boolean) ?? null
          return (
            <div
              key={key}
              title={covering.length ? covering.map((block) => block.label).join(' · ') : undefined}
              className={cn(
                'relative flex min-h-[2.75rem] flex-col rounded-lg border px-0.5 pt-0.5 pb-1',
                inMonth ? 'border-charcoal-4 bg-charcoal' : 'border-transparent bg-transparent opacity-35',
                isToday(day) && inMonth && 'ring-1 ring-lime/50',
              )}
            >
              <span className={cn('text-[11px] tabular-nums', isToday(day) ? 'font-bold text-lime-dim' : 'text-muted')}>{format(day, 'd')}</span>
              {primary ? <div className="mt-auto h-1.5 w-full rounded-sm" style={{ background: primary.color }} /> : null}
              {covering.length > 1 ? (
                <div className="mt-0.5 flex gap-0.5">
                  {covering.slice(0, 3).map((block) => (
                    <span key={block.id} className="h-1 flex-1 rounded-full" style={{ background: block.color, opacity: 0.7 }} />
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {monthBlocks.length === 0 ? (
        <p className="mt-4 text-center text-sm text-muted">Nothing programmed this month.</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {monthBlocks
            .filter((block) => block.kind !== 'micro')
            .map((block) => (
              <li key={block.id} className="flex items-start gap-2 rounded-xl border border-charcoal-4 bg-charcoal px-3 py-2">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: block.color }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{block.label}</p>
                  <p className="text-[11px] text-muted">
                    {CYCLE_LABELS[block.kind]} · {format(parseKey(block.startKey), 'd MMM')}
                    {block.startKey === block.endKey ? '' : ` – ${format(parseKey(block.endKey), 'd MMM')}`}
                  </p>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function endOfWeekSafe(date: Date): Date {
  const end = new Date(date)
  const day = end.getDay()
  const distance = day === 0 ? 0 : 7 - day
  end.setDate(end.getDate() + distance)
  return end
}
