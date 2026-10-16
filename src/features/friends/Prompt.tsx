import type { ReactNode } from 'react'
import { Button } from '../../ui/Button.tsx'
import { useBodyScrollLock } from '../../ui/useBodyScrollLock.ts'

export function Prompt({
  open,
  title,
  tone = 'neutral',
  onDismiss,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  confirmTestId,
  children,
}: {
  open: boolean
  title: string
  tone?: 'neutral' | 'danger'
  onDismiss: () => void
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  confirmTestId?: string
  children?: ReactNode
}) {
  useBodyScrollLock(open)
  if (!open) return null
  return (
    <div
      className="sheet-overlay fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="safe-sheet w-full max-w-lg rounded-t-2xl border border-charcoal-4 bg-charcoal px-4 pt-5 shadow-card sm:rounded-2xl"
      >
        <h2 className={tone === 'danger' ? 'text-lg font-semibold text-danger' : 'text-lg font-semibold text-ink'}>{title}</h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
        <div className="mt-5 flex flex-col gap-2">
          <Button size="lg" variant="secondary" className="w-full" autoFocus onClick={onDismiss}>
            {cancelLabel}
          </Button>
          <Button
            size="lg"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            className="w-full"
            data-testid={confirmTestId}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
