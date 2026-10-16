import { format } from 'date-fns'
import { ChevronDown, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../store/useStore.ts'
import { cn } from '../ui/cn.ts'
import { useConfirm } from '../ui/Confirm.tsx'

const RECOVERED = {
  catalog:
    'Your library loaded. Some recent activity couldn’t be loaded automatically. You can try restoring a backup copy below.',
  activity:
    'Your activity loaded. Some custom exercises couldn’t be loaded automatically. You can try restoring a backup copy below.',
  none: 'Some data couldn’t be loaded automatically. You can try restoring a backup copy below.',
} as const

export function RecoveryBanner() {
  const { nav, storageNotice, dismissStorageNotice, storageRevision, listCorruptBackups, restoreFromBackup, deleteBackup } =
    useStore()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  void storageRevision
  if (!storageNotice || nav.screen === 'session' || nav.screen === 'workout-mode') return null
  const backups = listCorruptBackups()
  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4" data-storage-notice={storageNotice.recovered}>
      <div className="rounded-2xl border border-[#d9a441] bg-[#fbf0d9] p-4">
        <div role="alert" className="flex gap-3">
          <TriangleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[#7a5212]" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-[#3b2f26]">{storageNotice.message}</p>
            <p className="mt-1 text-[#5c4a3d]">{RECOVERED[storageNotice.recovered]}</p>
            {storageNotice.backupKeys[0] ? (
              <p className="mt-1 text-xs break-all text-[#6b5545]">Backup: {storageNotice.backupKeys[0]}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss saved-data warning"
            onClick={dismissStorageNotice}
            className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#5c4a3d]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="backup-list"
          data-backup-toggle="true"
          onClick={() => setOpen((value) => !value)}
          className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#5c3a1a] underline"
        >
          <ChevronDown aria-hidden className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          Backup copies
        </button>
        {open ? (
          <div id="backup-list" className="mt-2 border-t border-[#e3c98f] pt-2" data-backup-list="true">
            <p className="sr-only" role="status" aria-live="polite">
              {status}
            </p>
            {backups.length === 0 ? (
              <p className="py-2 text-sm text-[#5c4a3d]">No backup copies left on this device.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {backups.map((backup) => (
                  <li key={backup.key} className="rounded-xl border border-[#e3c98f] bg-[#fffaf0] p-3" data-backup-row={backup.key}>
                    <p className="text-sm font-semibold text-[#3b2f26]">
                      {backup.kind === 'catalog' ? 'Library' : 'Activity & plans'} · {format(new Date(backup.at), 'EEE d MMM, h:mm a')}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        data-backup-restore="true"
                        className="inline-flex min-h-11 items-center rounded-full bg-[#8f5a40] px-5 text-sm font-semibold text-white"
                        onClick={() => {
                          const result = restoreFromBackup(backup.key)
                          setStatus(
                            result.ok
                              ? `Restored: ${result.summary}${result.repaired ? ' (repaired)' : ''}. The backup is still kept; you can delete it once everything looks right.`
                              : `Couldn't restore this backup: ${result.error}`,
                          )
                        }}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        data-backup-delete="true"
                        className="inline-flex min-h-11 items-center rounded-full border border-[#c9b8a4] px-5 text-sm font-semibold text-[#3b2f26]"
                        onClick={() => {
                          void confirm({
                            title: 'Delete this backup?',
                            body: "This removes the saved copy from this device. It can't be undone. Your current data isn't affected.",
                            confirmLabel: 'Delete backup',
                            tone: 'danger',
                          }).then((ok) => {
                            if (!ok) return
                            const removed = deleteBackup(backup.key)
                            setStatus(removed ? 'Backup deleted.' : "Couldn't delete that backup.")
                          })
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
