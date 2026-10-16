import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn.ts'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  children?: ReactNode
}) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' && 'hit-slop-sm min-h-11 min-w-11 px-3 py-2 text-xs',
        size === 'md' && 'min-h-11 px-4 py-2.5 text-sm',
        size === 'lg' && 'min-h-12 px-5 py-3.5 text-base',
        variant === 'primary' && 'bg-lime-dim text-white shadow-sm hover:brightness-95 active:brightness-90',
        variant === 'secondary' &&
          'border border-charcoal-4 bg-charcoal text-ink hover:border-lime/40 hover:bg-charcoal-2',
        variant === 'ghost' && 'bg-transparent text-muted hover:bg-charcoal-3/80 hover:text-ink',
        variant === 'danger' && 'bg-danger/10 text-danger hover:bg-danger/18',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  variant?: 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md'
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl transition disabled:cursor-not-allowed disabled:opacity-40',
        size === 'md' && 'h-11 w-11',
        size === 'sm' && 'h-11 w-11',
        variant === 'ghost' && 'text-muted hover:bg-charcoal-3/80 hover:text-ink',
        variant === 'outline' && 'border border-charcoal-4 bg-charcoal-2 text-muted hover:text-ink',
        variant === 'danger' && 'bg-danger/10 text-danger hover:bg-danger/18',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
