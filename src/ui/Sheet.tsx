import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconButton } from './Button.tsx'
import { cn } from './cn.ts'
import { useBodyScrollLock } from './useBodyScrollLock.ts'

export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  labelledBy?: string
}) {
  const autoId = useId()
  const titleId = labelledBy ?? autoId
  const panelRef = useRef<HTMLDivElement>(null)
  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-panel relative z-10 flex w-full max-w-lg flex-col rounded-t-3xl border border-charcoal-4 bg-charcoal shadow-raised sm:rounded-3xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-charcoal-4 px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-lg font-semibold">
              {title}
            </h2>
            {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className={cn('sheet-body space-y-4 px-4 py-3')}>{children}</div>
      </div>
    </div>
  )
}
