import { useEffect, useState } from 'react'
import { formatStamp, formatWhen } from './format.ts'
import { Prompt } from './Prompt.tsx'
import {
  backupNow,
  deleteMyCloudData,
  getSyncStatus,
  listBackups,
  restoreBackup,
  resumeSyncing,
  subscribeSyncStatus,
  type BackupSummary,
  type SyncPhase,
} from '../../lib/sync/engine.ts'
import { Button } from '../../ui/Button.tsx'

const PHASE_LABEL: Record<SyncPhase, string> = {
  off: 'Not syncing',
  synced: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  error: 'Sync error',
  paused: 'Paused — cloud data deleted',
}

export function SyncPanel() {
  const [status, setStatus] = useState(() => getSyncStatus())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [backups, setBackups] = useState<BackupSummary[] | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<BackupSummary | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => subscribeSyncStatus(setStatus), [])

  const run = async (action: () => Promise<void> | void) => {
    setBusy(true)
    setNote(null)
    try {
      await action()
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const tone =
    status.phase === 'error' ? 'text-danger' : status.phase === 'synced' ? 'text-lime-dim' : 'text-muted'

  return (
    <div className="mt-3 space-y-2" data-testid="sync-controls">
      <p className="text-xs text-muted" role="status" aria-live="polite">
        <span className={`font-medium ${tone}`}>{PHASE_LABEL[status.phase]}</span>
        {status.lastSyncedAt ? <span> · last synced {formatWhen(status.lastSyncedAt)}</span> : null}
        {status.phase === 'error' && status.error ? <span> · {status.error}</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await backupNow()
              setNote('Backup saved')
            })
          }
        >
          Back up now
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setBackups(await listBackups())
            })
          }
        >
          Restore backup
        </Button>
        {status.phase === 'paused' ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              resumeSyncing()
              setNote('Syncing this device’s data again')
            }}
          >
            Start syncing
          </Button>
        ) : null}
        <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
          Delete my cloud data…
        </Button>
      </div>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
      {backups ? (
        <div className="space-y-1 rounded-xl bg-charcoal-3 p-3">
          {backups.length === 0 ? <p className="text-xs text-muted">No backups yet.</p> : null}
          {backups.map((backup) => (
            <button
              key={backup.id}
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 text-left text-xs hover:bg-charcoal-2"
              onClick={() => setRestoreTarget(backup)}
            >
              <span className="font-medium text-ink">{formatStamp(backup.created_at)}</span>
              <span className="truncate text-muted">
                {backup.device_label ?? 'Device'} · {Math.max(1, Math.round((backup.size_bytes ?? 0) / 1024))} KB
              </span>
            </button>
          ))}
          <button
            type="button"
            className="min-h-11 px-1 text-xs font-medium text-lime-dim hover:underline"
            onClick={() => setBackups(null)}
          >
            Close
          </button>
        </div>
      ) : null}
      <Prompt
        open={restoreTarget !== null}
        title="Restore this backup?"
        tone="danger"
        confirmLabel="Restore"
        onDismiss={() => setRestoreTarget(null)}
        onConfirm={() => {
          const target = restoreTarget
          setRestoreTarget(null)
          setBackups(null)
          if (!target) return
          void run(async () => {
            await restoreBackup(target.id)
            setNote('Backup restored')
          })
        }}
      >
        <p>
          This replaces everything on this device with the backup from{' '}
          <strong className="text-ink">{restoreTarget ? formatStamp(restoreTarget.created_at) : ''}</strong>, then syncs it to
          your other devices.
        </p>
      </Prompt>
      <Prompt
        open={confirmDelete}
        title="Delete your cloud data?"
        tone="danger"
        confirmLabel="Delete cloud data"
        confirmTestId="confirm-delete-cloud"
        onDismiss={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          void run(async () => {
            const deleted = await deleteMyCloudData()
            setNote(`Deleted ${deleted} synced item${deleted === 1 ? '' : 's'} from the cloud. Backup kept.`)
          })
        }}
      >
        <p>
          First we save a <strong className="text-ink">backup</strong> of everything, then delete all your synced workouts,
          programs, plans and settings from the cloud.
        </p>
        <p>
          <strong className="text-ink">Backups are kept</strong>, including this one, so you can still bring it all back with
          Restore backup.
        </p>
        <p>
          This device keeps its data and stops syncing until you tap Start syncing. Your other signed-in devices will remove the
          synced data on their next sync (each saves its own backup first).
        </p>
      </Prompt>
    </div>
  )
}
