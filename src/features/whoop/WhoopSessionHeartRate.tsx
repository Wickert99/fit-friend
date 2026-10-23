import { useEffect, useState } from 'react'
import type { WorkoutSession } from '../../types.ts'
import { Badge, Card, EmptyState } from '../../ui/index.ts'
import { loadSessionHeartRate } from './api.ts'
import type { HeartRateView } from './model.ts'

export function WhoopSessionHeartRate({ session }: { session: WorkoutSession }) {
  const { id, startedAt, completedAt, programId, name } = session
  const requestKey = `${id}|${startedAt ?? ''}|${completedAt ?? ''}|${programId ?? ''}|${name ?? ''}`
  const [result, setResult] = useState<{ key: string; view: HeartRateView } | null>(null)
  const view: HeartRateView | 'loading' = result?.key === requestKey ? result.view : 'loading'

  useEffect(() => {
    let alive = true
    void loadSessionHeartRate({ programId, name, startedAt, completedAt }).then((next) => {
      if (alive) setResult({ key: requestKey, view: next })
    })
    return () => {
      alive = false
    }
  }, [requestKey, programId, name, startedAt, completedAt])

  if (view === 'loading') {
    return (
      <Card data-whoop="loading">
        <p className="text-sm text-muted">Checking Whoop…</p>
      </Card>
    )
  }

  if (view.kind === 'empty') {
    return (
      <div data-whoop="empty">
        <EmptyState title={view.title} body={view.body} />
      </div>
    )
  }

  const { metrics } = view
  return (
    <Card data-whoop="metrics" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Whoop heart rate</h2>
        {metrics.sportName ? <Badge tone="lime">{metrics.sportName}</Badge> : null}
      </div>
      <div className={`grid gap-2 ${metrics.strain ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <Stat label="Average" value={metrics.average} />
        <Stat label="Max" value={metrics.max} />
        {metrics.strain ? <Stat label="Strain" value={metrics.strain} /> : null}
      </div>
      {metrics.bristol?.kind === 'band' ? (
        <div className="rounded-xl border border-lime/40 bg-lime/8 px-3 py-2" data-whoop-bristol="band">
          <p className="text-xs font-semibold tracking-wider text-lime-dim uppercase">{metrics.bristol.label}</p>
          <p className="mt-1 text-lg font-semibold text-ink">{metrics.bristol.duration}</p>
        </div>
      ) : null}
      {metrics.bristol?.kind === 'unavailable' ? (
        <p className="text-xs text-muted" data-whoop-bristol="unavailable">
          {metrics.bristol.text}
        </p>
      ) : null}
      {metrics.zonesMissing ? (
        <p className="text-sm text-muted">Whoop didn't include time in heart-rate zones for this workout.</p>
      ) : (
        <ul className="space-y-2">
          {metrics.zones.map((zone) => (
            <li key={zone.id} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
              <span className="font-medium text-ink">{zone.label}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="h-1.5 overflow-hidden rounded-full bg-charcoal-3">
                  <span className="block h-full rounded-full bg-lime-dim" style={{ width: `${Math.round(zone.share * 100)}%` }} />
                </span>
                <span className="text-[11px] text-muted">{zone.range}</span>
              </span>
              <span className="tabular-nums text-muted">{zone.duration}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-charcoal-3 px-2 py-2">
      <p className="text-[11px] font-medium tracking-wider text-muted uppercase">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  )
}
