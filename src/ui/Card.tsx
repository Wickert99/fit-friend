import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn.ts'

export function Card({
  className,
  children,
  onClick,
  ...props
}: HTMLAttributes<HTMLDivElement> & { onClick?: () => void; children?: ReactNode }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full rounded-2xl border border-charcoal-4 bg-charcoal p-4 text-left shadow-card transition hover:border-lime/35 hover:bg-charcoal-2/60 active:scale-[0.99]',
          className,
        )}
      >
        {children}
      </button>
    )
  }
  return (
    <div className={cn('w-full rounded-2xl border border-charcoal-4 bg-charcoal p-4 text-left shadow-card', className)} {...props}>
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <Card className="flex flex-col items-start gap-3 border-dashed bg-charcoal-2/50">
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      </div>
      {action}
    </Card>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{children}</h2>
}

export function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'hit-slop-sm min-h-11 shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition',
        active
          ? 'border-lime/50 bg-lime/8 font-semibold text-lime-dim shadow-sm'
          : 'border-charcoal-4 bg-charcoal text-muted hover:border-lime/25 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

export function Avatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        size === 'sm' && 'h-8 w-8 text-xs',
        size === 'md' && 'h-10 w-10 text-sm',
        size === 'lg' && 'h-14 w-14 text-lg',
      )}
      style={{ background: readable(color) }}
    >
      {initials}
    </div>
  )
}

function readable(color: string): string {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return '#8f5a40'
  let hex = match[1] ?? ''
  if (hex.length === 3) hex = hex.split('').map((char) => char + char).join('')
  let channels = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
  const luminance = (values: number[]) => {
    const channel = (value: number) => {
      const scaled = value / 255
      return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(values[0] ?? 0) + 0.7152 * channel(values[1] ?? 0) + 0.0722 * channel(values[2] ?? 0)
  }
  for (let i = 0; i < 40 && 1.05 / (luminance(channels) + 0.05) < 4.5; i++) {
    channels = channels.map((value) => Math.round(value * 0.95))
  }
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'lime' | 'steel' | 'success' | 'warn' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
        tone === 'neutral' && 'bg-charcoal-3 text-muted',
        tone === 'lime' && 'bg-lime/8 text-lime-dim',
        tone === 'steel' && 'bg-steel/8 text-lime-dim',
        tone === 'success' && 'bg-success/12 text-success-ink',
        tone === 'warn' && 'bg-warn/12 text-warn-ink',
      )}
    >
      {children}
    </span>
  )
}

export type CardButtonProps = ButtonHTMLAttributes<HTMLButtonElement>
