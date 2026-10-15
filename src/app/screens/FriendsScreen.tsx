import { format } from 'date-fns'
import { isSupabaseConfigured } from '../../lib/supabase/client.ts'
import { useStore } from '../../store/useStore.ts'
import { Badge, Button, Card } from '../../ui/index.ts'
import { useConfirm } from '../../ui/Confirm.tsx'
import { useToast } from '../../ui/Toast.tsx'
import { FeatureStub } from './stub.tsx'

export default function FriendsScreen() {
  const { nav, storageRevision, listCorruptBackups, restoreFromBackup, deleteBackup } = useStore()
  const confirm = useConfirm()
  const toast = useToast()
  const backups = listCorruptBackups()
  void storageRevision
  return (
    <FeatureStub
      title="Friends"
      subtitle="Invites, chat, crew progress & program shares"
      owner="WP6 · social & sync"
      note="Sign-in, invite codes, chat, and cloud sync are the backend package. Offline / local mode still works without an account."
    >
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isSupabaseConfigured ? 'success' : 'neutral'}>
            {isSupabaseConfigured ? 'Cloud client configured' : 'Offline / local mode'}
          </Badge>
          {nav.invite ? <Badge tone="lime">Invite {nav.invite}</Badge> : null}
        </div>
        <p className="mt-2 text-sm text-muted">
          {isSupabaseConfigured
            ? 'Supabase is configured from the environment. Auth and sync UI are not mounted yet.'
            : 'No Supabase URL or anon key is set, so nothing tries to reach the network.'}
        </p>
      </Card>
      {backups.length > 0 ? (
        <Card>
          <p className="font-semibold">Saved data backups</p>
          <p className="mt-1 text-sm text-muted">
            {backups.length === 1 ? 'One copy' : `${backups.length} copies`} of saved data that couldn’t be read automatically{' '}
            {backups.length === 1 ? 'is' : 'are'} kept on this device.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {backups.map((backup) => (
              <li key={backup.key} className="rounded-xl border border-[#e3c98f] bg-[#fffaf0] p-3" data-backup-row={backup.key}>
                <p className="text-sm font-semibold">
                  {backup.kind === 'catalog' ? 'Library' : 'Activity & plans'} · {format(new Date(backup.at), 'EEE d MMM, h:mm a')}
                </p>
                <p className="text-xs text-muted">
                  {Math.max(1, Math.round(backup.bytes / 1024))} KB
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      const result = restoreFromBackup(backup.key)
                      toast({
                        tone: result.ok ? 'ok' : 'error',
                        text: result.ok
                          ? `Restored: ${result.summary}${result.repaired ? ' (repaired)' : ''}.`
                          : `Couldn't restore this backup: ${result.error}`,
                      })
                    }}
                  >
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void confirm({
                        title: 'Delete this backup?',
                        body: "This removes the saved copy from this device. It can't be undone. Your current data isn't affected.",
                        confirmLabel: 'Delete backup',
                        tone: 'danger',
                      }).then((ok) => {
                        if (!ok) return
                        const removed = deleteBackup(backup.key)
                        toast({ tone: removed ? 'info' : 'error', text: removed ? 'Backup deleted.' : "Couldn't delete that backup." })
                      })
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </FeatureStub>
  )
}
