import { Check, Share2 } from 'lucide-react'
import { useState } from 'react'
import type { Program } from '../../types.ts'
import { createId } from '../../store/id.ts'
import { useStore } from '../../store/useStore.ts'
import { Avatar, Button, Input, Sheet } from '../../ui/index.ts'
import { AuthProvider, useAuth } from './AuthProvider.tsx'
import { shareProgram } from './shareApi.ts'

export function ShareProgramSheet({ program, onClose }: { program: Program; onClose: () => void }) {
  return (
    <AuthProvider>
      <ShareProgramBody program={program} onClose={onClose} />
    </AuthProvider>
  )
}

function ShareProgramBody({ program, onClose }: { program: Program; onClose: () => void }) {
  const auth = useAuth()
  const { update } = useStore()
  const [friendId, setFriendId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const signedIn = !!(auth.user && auth.configured)

  function postLocal() {
    update((current) => ({
      ...current,
      activity: [
        {
          id: createId('act'),
          kind: 'share',
          text: `Shared: ${program.name}`,
          createdAt: new Date().toISOString(),
          programId: program.id,
        },
        ...current.activity,
      ],
    }))
    onClose()
  }

  async function send() {
    if (!friendId) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await shareProgram(program, friendId, message)
      if (result.error) {
        setError(result.error)
        return
      }
      const friend = auth.friends.find((item) => item.id === friendId)
      setDone(`Shared with ${friend?.display_name || 'friend'}`)
      setFriendId(null)
      setMessage('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Share program" subtitle={program.name}>
      <div className="space-y-3" data-share-program-sheet>
        {!signedIn ? (
          <>
            <p className="text-sm text-muted">
              Cloud share needs a signed-in account on Friends. You can still post to your local activity feed.
            </p>
            <Button className="w-full" onClick={postLocal}>
              <Share2 className="h-4 w-4" /> Post to local feed
            </Button>
          </>
        ) : null}
        {signedIn && auth.loading ? <p className="text-sm text-muted">Loading your crew…</p> : null}
        {signedIn && !auth.loading && auth.friends.length === 0 ? (
          <>
            <p className="text-sm text-muted">Add a friend first (invite code on Friends), then share programs with them.</p>
            <Button className="w-full" variant="secondary" onClick={postLocal}>
              <Share2 className="h-4 w-4" /> Post to local feed instead
            </Button>
          </>
        ) : null}
        {signedIn && auth.friends.length > 0 ? (
          <>
            <p className="text-xs font-medium text-muted">Choose a friend</p>
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {auth.friends.map((friend) => {
                const selected = friendId === friend.id
                return (
                  <li key={friend.id}>
                    <button
                      type="button"
                      onClick={() => setFriendId(friend.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${selected ? 'border-lime/50 bg-lime/10' : 'border-charcoal-4 bg-charcoal-2'}`}
                    >
                      <Avatar name={friend.display_name || 'Friend'} color="#b07d5c" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{friend.display_name || 'Friend'}</span>
                      {selected ? <Check className="h-4 w-4 shrink-0 text-lime" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
            <Input
              placeholder="Optional message"
              aria-label="Optional message"
              value={message}
              maxLength={200}
              onChange={(event) => setMessage(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button className="flex-1" disabled={busy || !friendId} onClick={() => void send()}>
                {busy ? 'Sending…' : 'Share with friend'}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={postLocal}>
                Local feed
              </Button>
            </div>
          </>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {done ? <p className="text-sm text-success">{done}</p> : null}
      </div>
    </Sheet>
  )
}
