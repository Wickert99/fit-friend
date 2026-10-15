import { Minus, Plus } from 'lucide-react'
import { cn } from './cn.ts'

export function Stepper({
  value,
  onChange,
  label,
  step = 1,
  min,
  max,
  suffix,
  className,
}: {
  value: number
  onChange: (next: number) => void
  label: string
  step?: number
  min?: number
  max?: number
  suffix?: string
  className?: string
}) {
  const clamp = (next: number) => {
    const floored = Math.round(next * 1000) / 1000
    if (min != null && floored < min) return min
    if (max != null && floored > max) return max
    return floored
  }
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()} by ${step}`}
        onClick={() => onChange(clamp(value - step))}
        className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-taupe-strong bg-charcoal-2 text-ink active:bg-charcoal-3"
      >
        <Minus className="h-6 w-6" aria-hidden />
      </button>
      <div className="relative min-w-0 flex-1">
        <input
          aria-label={label}
          inputMode="decimal"
          value={Number.isFinite(value) ? String(value) : ''}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(clamp(next))
          }}
          className={cn(
            'h-16 w-full rounded-2xl border border-taupe-strong bg-charcoal text-center text-4xl font-semibold text-ink tabular-nums outline-none focus:border-lime-dim focus:ring-2 focus:ring-lime/30',
            suffix && 'px-16',
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">{suffix}</span>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()} by ${step}`}
        onClick={() => onChange(clamp(value + step))}
        className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-taupe-strong bg-charcoal-2 text-ink active:bg-charcoal-3"
      >
        <Plus className="h-6 w-6" aria-hidden />
      </button>
    </div>
  )
}
