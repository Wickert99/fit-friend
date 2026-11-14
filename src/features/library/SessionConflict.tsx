import { useState } from 'react'
import type { WorkoutSession } from '../../types.ts'
import { AppDialog } from '../../ui/AppDialog.tsx'
import { Button } from '../../ui/index.ts'
import { countLabel } from './search.ts'

export function SessionConflict({
  session,
  startName,
  onResume,
  onSaveLater,
  onDiscard,
  onDismiss,
}: {
  session: WorkoutSession | null
  startName?: string
  onResume: () => void
  onSaveLater: () => void
  onDiscard: () => void
  onDismiss: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  if (!session) return null
  const planned = session.exercises.flatMap((exercise) => exercise.sets)
  const done = planned.filter((set) => set.completed).length
  return (
    <AppDialog variant="card" labelledBy="session-conflict-title" onClose={onDismiss} lightDismiss={!confirming} data-session-conflict="true">
      {confirming ? (
        <>
          <h2 id="session-conflict-title" className="text-lg font-semibold text-ink">
            Discard this workout?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Logged sets in “{session.name}” are removed. It will not be saved for later, and it will not count as a finished workout.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button size="lg" variant="secondary" className="w-full" autoFocus onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button size="lg" variant="danger" className="w-full" data-testid="conflict-discard-confirm" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        </>
      ) : (
        <>
          <h2 id="session-conflict-title" className="text-lg font-semibold text-ink">
            A workout is still open
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            “{session.name}” is still open
            {planned.length > 0 ? ` (${done} of ${countLabel(planned.length, 'set')} logged)` : ''}. Resume it, save it for later, or discard it.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button size="lg" className="w-full" autoFocus data-testid="conflict-resume" onClick={onResume}>
              Resume {session.name}
            </Button>
            <Button size="lg" variant="secondary" className="w-full" data-testid="conflict-save" onClick={onSaveLater}>
              Save for later
            </Button>
            <Button variant="danger" size="lg" className="w-full" data-testid="conflict-discard" onClick={() => setConfirming(true)}>
              Discard
            </Button>
            <Button size="lg" variant="ghost" className="w-full" data-testid="conflict-cancel" onClick={onDismiss}>
              Cancel
            </Button>
          </div>
          {startName ? <p className="mt-3 text-xs text-muted">Starting {startName} waits until you choose.</p> : null}
        </>
      )}
    </AppDialog>
  )
}
