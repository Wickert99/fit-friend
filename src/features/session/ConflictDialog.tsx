import { Button } from '../../ui/index.ts'

export function ConflictDialog({
  name,
  onResume,
  onReplace,
  onCancel,
}: {
  name: string
  onResume: () => void
  onReplace: () => void
  onCancel: () => void
}) {
  return (
    <div className="sheet-overlay fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 px-4 pt-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
      <div className="safe-sheet w-full max-w-lg space-y-3 rounded-3xl border border-charcoal-4 bg-charcoal p-4 shadow-raised">
        <h2 id="conflict-title" className="text-lg font-semibold text-ink">
          Another workout is in progress
        </h2>
        <p className="text-sm text-muted">{name} is still open. Resume it, or start this one instead.</p>
        <div className="flex flex-col gap-2">
          <Button onClick={onResume}>Resume</Button>
          <Button variant="secondary" onClick={onReplace}>
            Start instead
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
