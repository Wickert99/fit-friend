import type { WorkoutSession } from '../../types.ts'
import { Button } from '../../ui/index.ts'
import { countLabel } from './search.ts'

export function SessionConflict({
  session,
  startName,
  onResume,
  onReplace,
  onDismiss,
}: {
  session: WorkoutSession | null
  startName?: string
  onResume: () => void
  onReplace: () => void
  onDismiss: () => void
}) {
  if (!session) return null
  const planned = session.exercises.flatMap((exercise) => exercise.sets)
  const done = planned.filter((set) => set.completed).length
  return (
    <div
      className="sheet-overlay fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-conflict-title"
        data-session-conflict="true"
        className="w-full max-w-lg rounded-t-2xl border border-charcoal-4 bg-charcoal px-4 pt-5 shadow-card sm:rounded-2xl"
        style={{ paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
      >
        <h2 id="session-conflict-title" className="text-lg font-semibold text-ink">
          Another workout is in progress
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          “{session.name}” is still open
          {planned.length > 0 ? ` (${done} of ${countLabel(planned.length, 'set')} logged)` : ''}.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">Starting a new one ends that session without saving it to your log.</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button size="lg" className="w-full" autoFocus data-testid="conflict-resume" onClick={onResume}>
            Resume {session.name}
          </Button>
          <Button size="lg" variant="danger" className="w-full" data-testid="conflict-replace" onClick={onReplace}>
            Start {startName ?? 'this workout'} instead
          </Button>
          <Button size="lg" variant="ghost" className="w-full" data-testid="conflict-cancel" onClick={onDismiss}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
