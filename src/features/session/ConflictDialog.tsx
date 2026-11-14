import { useState } from 'react'
import { AppDialog } from '../../ui/AppDialog.tsx'
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
    <AppDialog variant="card" labelledBy="conflict-title" onClose={onCancel} lightDismiss={!confirming}>
      {confirming ? (
        <>
          <h2 id="conflict-title" className="text-lg font-semibold text-ink">
            Discard this workout?
          </h2>
          <p className="mt-2 text-sm text-muted">
            Logged sets in “{name}” are removed. It will not be saved for later, and it will not count as a finished workout.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button variant="secondary" autoFocus onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button variant="danger" data-testid="conflict-discard-confirm" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        </>
      ) : (
        <>
          <h2 id="conflict-title" className="text-lg font-semibold text-ink">
            A workout is still open
          </h2>
          <p className="mt-2 text-sm text-muted">{name} is still open. Resume it, save it for later, or discard it.</p>
          <div className="mt-5 flex flex-col gap-2">
            <Button autoFocus data-testid="conflict-resume" onClick={onResume}>
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
    </AppDialog>
  )
}
