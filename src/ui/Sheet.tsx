import { X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { AppDialog } from './AppDialog.tsx'
import { IconButton } from './Button.tsx'
import { cn } from './cn.ts'

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
  if (!open) return null
  return (
    <AppDialog onClose={onClose} labelledBy={titleId} variant="sheet">
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
    </AppDialog>
  )
}
