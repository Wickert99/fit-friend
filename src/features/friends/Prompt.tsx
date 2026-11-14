import { useId, type ReactNode } from 'react'
import { AppDialog } from '../../ui/AppDialog.tsx'
import { Button } from '../../ui/Button.tsx'

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
  const titleId = useId()
  if (!open) return null
  return (
    <AppDialog variant="card" labelledBy={titleId} onClose={onDismiss}>
      <h2 id={titleId} className={tone === 'danger' ? 'text-lg font-semibold text-danger' : 'text-lg font-semibold text-ink'}>{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
      <div className="mt-5 flex flex-col gap-2">
        <Button size="lg" variant="secondary" className="w-full" autoFocus onClick={onDismiss}>
          {cancelLabel}
        </Button>
        <Button size="lg" variant={tone === 'danger' ? 'danger' : 'primary'} className="w-full" data-testid={confirmTestId} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </AppDialog>
  )
}
