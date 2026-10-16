import { useState } from 'react'
import { Button } from '../../ui/index.ts'

export function ConflictDialog({
  name,
  onResume,
  onSaveLater,
  onDiscard,
  onCancel,
}: {
  name: string
  onResume: () => void
  onSaveLater: () => void
  onDiscard: () => void
  onCancel: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="sheet-overlay fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 px-4 pt-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
      <div className="safe-sheet w-full max-w-lg space-y-3 rounded-3xl border border-charcoal-4 bg-charcoal p-4 shadow-raised">
        {confirming ? (
          <>
            <h2 id="conflict-title" className="text-lg font-semibold text-ink">
              Discard this workout?
            </h2>
            <p className="text-sm text-muted">
              Logged sets in “{name}” are removed. It will not be saved for later, and it will not count as a finished workout.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="danger" data-testid="conflict-discard-confirm" onClick={onDiscard}>
                Discard
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Back
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id="conflict-title" className="text-lg font-semibold text-ink">
              A workout is still open
            </h2>
            <p className="text-sm text-muted">{name} is still open. Resume it, save it for later, or discard it.</p>
            <div className="flex flex-col gap-2">
              <Button data-testid="conflict-resume" onClick={onResume}>
                Resume
              </Button>
              <Button variant="secondary" data-testid="conflict-save" onClick={onSaveLater}>
                Save for later
              </Button>
              <Button variant="danger" data-testid="conflict-discard" onClick={() => setConfirming(true)}>
                Discard
              </Button>
              <Button variant="ghost" data-testid="conflict-cancel" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
