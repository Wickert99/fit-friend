import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Check,
  Copy,
  Link2,
  LogOut,
  MessageCircle,
  Share2,
  ShieldAlert,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { appBase } from '../../lib/base.ts'
import type { ActivityEntry, Program, SupabaseProfile, WorkoutSession } from '../../types.ts'
import {
  authLinkMessage,
  captureAuthLinkError,
  clearAuthLinkError,
  clearPendingInvite,
  readAuthLinkError,
  readPendingInvite,
  type AuthLinkError,
} from '../../lib/supabase/authLink.ts'
import { ensureSyncEngine, prepareSyncForLocalReset } from '../../lib/sync/engine.ts'
import { useStore } from '../../store/useStore.ts'
import { Avatar, Badge, Card, EmptyState, SectionLabel } from '../../ui/Card.tsx'
import { Button } from '../../ui/Button.tsx'
import { Input, Select, TextArea } from '../../ui/Input.tsx'
import { Page, ScreenHeader } from '../../ui/Page.tsx'
import { Segmented } from '../../ui/Segmented.tsx'
import { AuthProvider, captureInviteFromLocation, useAuth } from './AuthProvider.tsx'
import { ChatSheet } from './ChatSheet.tsx'
import { formatWhen } from './format.ts'
import { Prompt } from './Prompt.tsx'
import { deleteOwnPost, listFriendsProgress, programNameFor, publishProgressPost, type ProgressFeedPost } from './progressApi.ts'
import { formatProgressDetail, formatWeight } from './progressSnapshot.ts'
import { acceptProgramShare, declineProgramShare, listIncomingShares, listOutgoingShares, shareProgram } from './shareApi.ts'
import type { ShareView } from './programShare.ts'
import { SyncPanel } from './SyncPanel.tsx'
import { HeartRateSettings } from '../intervals/HeartRateFields.tsx'
import { WhoopConnect } from '../whoop/WhoopConnect.tsx'
import { loadThreads, type ChatThread } from './chat.ts'

if (typeof window !== 'undefined') {
  captureAuthLinkError()
  ensureSyncEngine()
}

type AuthMode = 'signin' | 'signup' | 'magic'

function activityLines(entry: ActivityEntry): { title: string; detail: string } {
  const extra = entry as ActivityEntry & { title?: string; detail?: string }
  return { title: extra.title || entry.text || 'Activity', detail: extra.detail || entry.text }
}

async function copyText(value: string): Promise<boolean> {
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '0'
    area.style.left = '0'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.focus()
    area.select()
    area.setSelectionRange(0, value.length)
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    if (copied) return true
  } catch {
    /* try the async clipboard next */
  }
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function AuthLinkBanner({ onResend }: { onResend: () => void }) {
  const [error, setError] = useState<AuthLinkError | null>(() =>
    typeof sessionStorage === 'undefined' ? null : readAuthLinkError(sessionStorage),
  )
  if (!error) return null
  const dismiss = () => {
    clearAuthLinkError(sessionStorage)
    setError(null)
  }
  return (
    <div role="alert" data-auth-link-error className="w-full">
      <div className="flex gap-3 rounded-2xl border border-[#d9b5a4] bg-[#f5e8e2] p-4">
        <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[#7a4a35]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Sign-in link didn't work</p>
          <p className="mt-1 text-sm text-[#5c4a3d]">{authLinkMessage(error)}</p>
          <button
            type="button"
            data-auth-link-resend
            className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[#8f5a40] px-5 text-sm font-semibold text-white"
            onClick={() => {
              dismiss()
              onResend()
              window.setTimeout(() => {
                const field = document.querySelector<HTMLInputElement>('input[type="email"]')
                field?.scrollIntoView({ block: 'center' })
                field?.focus()
              }, 50)
            }}
          >
            Send a new link
          </button>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

function FriendsBody() {
  const auth = useAuth()
  const { state, createProgram, go, resetToSeed } = useStore()
  const unit = state.weightUnit ?? 'kg'
  const [mode, setMode] = useState<AuthMode>('signin')
  const [resetOpen, setResetOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [acceptCode, setAcceptCode] = useState(() => captureInviteFromLocation() || readPendingInvite(localStorage) || '')
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [posts, setPosts] = useState<ProgressFeedPost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [deletingPost, setDeletingPost] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<ShareView[]>([])
  const [outgoing, setOutgoing] = useState<ShareView[]>([])
  const [sharesLoading, setSharesLoading] = useState(false)
  const [shareBusy, setShareBusy] = useState<string | null>(null)
  const [chatWith, setChatWith] = useState<SupabaseProfile | null>(null)
  const [shareProgramId, setShareProgramId] = useState('')
  const [shareFriendId, setShareFriendId] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [shareSessionId, setShareSessionId] = useState('')
  const origin = useMemo(() => (typeof window === 'undefined' ? '' : window.location.origin), [])
  const inviteLink = inviteCode && origin ? `${origin}${appBase()}#/friends?invite=${inviteCode}` : null
  const signedIn = !!auth.user
  const mine = state.programs.filter((program) => program.isMine)
  const finished = state.sessions.filter((session) => session.status === 'completed')

  useEffect(() => {
    const syncInvite = () => {
      const code = captureInviteFromLocation()
      if (!code) return
      setAcceptCode(code)
      const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
      params.delete('invite')
      const next = params.toString()
      try {
        window.history.replaceState(window.history.state, '', `#/friends${next ? `?${next}` : ''}`)
      } catch {
        /* ignore */
      }
    }
    syncInvite()
    window.addEventListener('hashchange', syncInvite)
    return () => window.removeEventListener('hashchange', syncInvite)
  }, [])

  const refreshShares = useCallback(async () => {
    if (!auth.user || !auth.configured) {
      setIncoming([])
      setOutgoing([])
      return
    }
    setSharesLoading(true)
    try {
      const [received, sent] = await Promise.all([
        listIncomingShares(['pending', 'accepted']),
        listOutgoingShares(['pending', 'accepted']),
      ])
      if (received.error) console.warn('incoming shares', received.error)
      if (sent.error) console.warn('outgoing shares', sent.error)
      setIncoming(received.shares)
      setOutgoing(sent.shares.slice(0, 8))
    } finally {
      setSharesLoading(false)
    }
  }, [auth.user, auth.configured])

  const refreshPosts = useCallback(async () => {
    if (!auth.user || !auth.configured) {
      setPosts([])
      return
    }
    setPostsLoading(true)
    try {
      const result = await listFriendsProgress(40)
      if (result.error) console.warn('crew progress', result.error)
      setPosts(result.posts)
    } finally {
      setPostsLoading(false)
    }
  }, [auth.user, auth.configured])

  const refreshThreads = useCallback(async () => {
    if (!auth.user || !auth.configured) {
      setThreads([])
      return
    }
    setThreadsLoading(true)
    try {
      const result = await loadThreads()
      if (result.error) console.warn('chat threads', result.error)
      setThreads(result.threads)
    } finally {
      setThreadsLoading(false)
    }
  }, [auth.user, auth.configured])

  useEffect(() => {
    void refreshShares()
  }, [refreshShares])
  useEffect(() => {
    void refreshPosts()
  }, [refreshPosts])
  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

  async function runAuth(action: () => Promise<{ error?: string; message?: string }>) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await action()
      if (result.error) setError(result.error)
      else if (result.message) setMessage(result.message)
    } finally {
      setBusy(false)
    }
  }

  async function makeInvite() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await auth.createInvite()
      if (result.error) setError(result.error)
      else if (result.code) {
        setInviteCode(result.code)
        setMessage('Invite ready — share the code or link.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function accept() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await auth.acceptInvite(acceptCode)
      if (result.error) {
        setError(result.error)
        if (/not found|no longer pending|own invite/i.test(result.error)) clearPendingInvite(localStorage)
      } else if (result.alreadyFriends) {
        setMessage("You're already friends")
      } else {
        setMessage('Friend added!')
        setAcceptCode('')
        clearPendingInvite(localStorage)
      }
    } finally {
      setBusy(false)
    }
  }

  async function saveName() {
    setBusy(true)
    setError(null)
    const result = await auth.updateDisplayName(nameDraft)
    setBusy(false)
    if (result.error) setError(result.error)
    else {
      setEditingName(false)
      setMessage('Display name updated.')
    }
  }

  async function copy(value: string) {
    if (await copyText(value)) {
      setError(null)
      setMessage('Copied.')
      return
    }
    setError('Could not copy — select the link and copy it manually.')
  }

  async function shareInvite() {
    if (!inviteLink || !origin || !inviteCode) return
    const text = `Join me on Fit Friend\nApp: ${origin}\nInvite: ${inviteLink}\nCode: ${inviteCode}`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Fit Friend', text, url: origin })
        return
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      }
    }
    await copy(text)
  }

  async function removePost(id: string) {
    setDeletingPost(id)
    setError(null)
    setMessage(null)
    try {
      const result = await deleteOwnPost(id)
      if (result.error) setError(result.error)
      else {
        setMessage('Progress post removed')
        await refreshPosts()
      }
    } finally {
      setDeletingPost(null)
    }
  }

  async function acceptShare(id: string) {
    setShareBusy(id)
    setError(null)
    setMessage(null)
    try {
      const result = await acceptProgramShare(id)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.program) {
        createProgram(result.program)
        setMessage(`Added “${result.program.name}” to My Programs`)
      }
      await refreshShares()
    } finally {
      setShareBusy(null)
    }
  }

  async function declineShare(id: string) {
    setShareBusy(id)
    setError(null)
    setMessage(null)
    try {
      const result = await declineProgramShare(id)
      if (result.error) setError(result.error)
      else {
        setMessage('Share declined')
        await refreshShares()
      }
    } finally {
      setShareBusy(null)
    }
  }

  async function sendProgram() {
    const program = mine.find((item) => item.id === shareProgramId)
    if (!program || !shareFriendId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await shareProgram(program, shareFriendId, shareMessage)
      if (result.error) setError(result.error)
      else {
        setMessage(`Shared “${program.name}”.`)
        setShareMessage('')
        await refreshShares()
      }
    } finally {
      setBusy(false)
    }
  }

  async function publishSession() {
    const session = finished.find((item) => item.id === shareSessionId)
    if (!session) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await publishProgressPost({
        session,
        exercises: state.exercises,
        previousPrs: state.prs,
        programName: programNameFor(state.programs, session.programId),
      })
      if (result.error) setError(result.error)
      else {
        setMessage('Shared to the crew feed.')
        await refreshPosts()
      }
    } finally {
      setBusy(false)
    }
  }

  const pendingShares = incoming.filter((share) => share.status === 'pending')
  const acceptedShares = incoming.filter((share) => share.status === 'accepted').slice(0, 5)

  return (
    <Page>
      <ScreenHeader
        title="Friends"
        subtitle={
          signedIn
            ? 'Invites, chat, crew progress & program shares'
            : 'Sign in to invite friends — local app still works offline'
        }
        action={
          signedIn ? (
            <Button size="sm" variant="ghost" aria-label="Sign out" onClick={() => void auth.signOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          ) : undefined
        }
      />
      <AuthLinkBanner
        onResend={() => {
          setMode('magic')
          setError(null)
          setMessage(null)
        }}
      />
      <HeartRateSettings />
      {!auth.configured ? (
        <Card className="border-dashed">
          <p className="text-sm text-muted">
            Cloud friends needs <code className="text-ink">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-ink">VITE_SUPABASE_ANON_KEY</code>. Local workouts keep working without an account.
          </p>
        </Card>
      ) : null}
      {auth.configured && auth.loading ? <p className="text-sm text-muted">Checking account…</p> : null}
      {auth.configured && !auth.loading && !signedIn ? (
        <Card>
          <div className="mb-4">
            <Segmented
              label="Account access"
              options={[
                { id: 'signin', label: 'Sign in' },
                { id: 'signup', label: 'Sign up' },
                { id: 'magic', label: 'Magic link' },
              ]}
              value={mode}
              onChange={(next) => {
                setMode(next)
                setError(null)
                setMessage(null)
              }}
            />
          </div>
          <div className="space-y-3">
            {mode === 'signup' ? (
              <div>
                <label htmlFor="auth-display-name" className="mb-1 block text-sm font-medium text-ink">
                  Display name
                </label>
                <Input
                  id="auth-display-name"
                  name="nickname"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="nickname"
                />
              </div>
            ) : null}
            <div>
              <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-ink">
                Email
              </label>
              <Input
                id="auth-email"
                name="email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete={mode === 'signin' ? 'username' : 'email'}
              />
            </div>
            {mode !== 'magic' ? (
              <div>
                <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-ink">
                  Password
                </label>
                <Input
                  id="auth-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  aria-describedby={mode === 'signup' ? 'auth-password-hint' : undefined}
                />
                {mode === 'signup' ? (
                  <p id="auth-password-hint" className="mt-1 text-xs text-muted">
                    At least 6 characters.
                  </p>
                ) : null}
              </div>
            ) : null}
            <Button
              className="w-full"
              disabled={busy || !email.trim() || (mode !== 'magic' && password.length < 6)}
              onClick={() => {
                void runAuth(
                  mode === 'signin'
                    ? () => auth.signIn(email, password)
                    : mode === 'signup'
                      ? () => auth.signUp(email, password, displayName)
                      : () => auth.signInMagicLink(email),
                )
              }}
            >
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send magic link'}
            </Button>
            {acceptCode ? (
              <p className="text-xs text-muted">
                Invite code <span className="font-mono tracking-wider text-ink">{acceptCode}</span> saved — sign in or sign up,
                then tap Accept.
              </p>
            ) : null}
            <p className="text-xs text-muted">
              Offline / local mode still works without an account. Sign in to share programs with friends.
            </p>
          </div>
        </Card>
      ) : null}
      {signedIn ? (
        <>
          <Card>
            <SectionLabel>Account</SectionLabel>
            <div className="mt-2 flex items-center gap-3">
              <Avatar name={auth.profile?.display_name || auth.user?.email || 'You'} color="#a56b4e" />
              <div className="min-w-0 flex-1">
                {editingName ? (
                  <div className="flex gap-2">
                    <Input
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      placeholder="Display name"
                      aria-label="Display name"
                      autoComplete="nickname"
                    />
                    <Button size="sm" disabled={busy} onClick={() => void saveName()}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-semibold">{auth.profile?.display_name || 'Set a display name'}</p>
                    <p className="truncate text-xs text-muted">{auth.user?.email}</p>
                    <button
                      type="button"
                      className="-ml-1 inline-flex min-h-11 items-center rounded-lg px-1 text-xs font-medium text-lime-dim hover:underline"
                      onClick={() => {
                        setNameDraft(auth.profile?.display_name || '')
                        setEditingName(true)
                      }}
                    >
                      Edit display name
                    </button>
                  </>
                )}
              </div>
            </div>
            <SyncPanel />
          </Card>
          <WhoopConnect />
          <section className="space-y-3">
            <SectionLabel>Invite a friend</SectionLabel>
            <Card>
              <p className="text-sm text-muted">Generate a code your friend enters after they sign up. Or share the link.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void makeInvite()}>
                  <UserPlus className="h-4 w-4" />
                  New invite code
                </Button>
              </div>
              {inviteCode && origin && inviteLink ? (
                <div className="mt-3 space-y-3 rounded-xl bg-charcoal-3 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-lg font-semibold tracking-widest">{inviteCode}</p>
                    <Button size="sm" variant="secondary" onClick={() => void copy(inviteCode)}>
                      <Copy className="h-3.5 w-3.5" />
                      Copy code
                    </Button>
                  </div>
                  <LinkRow label="App link" value={origin} onCopy={() => void copy(origin)} />
                  <LinkRow label="Invite link" value={inviteLink} onCopy={() => void copy(inviteLink)} />
                  <Button className="w-full" variant="secondary" onClick={() => void shareInvite()}>
                    <Share2 className="h-4 w-4" />
                    Share invite
                  </Button>
                </div>
              ) : null}
              {auth.pendingInvites.length > 0 ? (
                <div className="mt-3 space-y-1 border-t border-charcoal-4 pt-3">
                  <p className="text-xs font-medium text-muted">Open invites</p>
                  {auth.pendingInvites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between text-sm">
                      <span className="font-mono tracking-wider">{invite.code}</span>
                      <Badge>pending</Badge>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
            <Card>
              <SectionLabel>Accept invite</SectionLabel>
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="Enter code"
                  aria-label="Invite code"
                  autoCapitalize="characters"
                  autoComplete="off"
                  value={acceptCode}
                  onChange={(event) => setAcceptCode(event.target.value.toUpperCase())}
                  className="font-mono tracking-wider uppercase"
                />
                <Button disabled={busy || acceptCode.trim().length < 4} onClick={() => void accept()}>
                  Accept
                </Button>
              </div>
            </Card>
          </section>
          <section className="space-y-3">
            <SectionLabel>Your crew</SectionLabel>
            {auth.friends.length === 0 ? (
              <EmptyState title="No friends yet" body="Create an invite code and share it, or accept a friend’s code." />
            ) : (
              <>
                <div className="h-scroll gap-3 pb-1">
                  <CrewChip name={auth.profile?.display_name || 'You'} label="You" color="#a56b4e" />
                  {auth.friends.map((friend) => (
                    <CrewChip key={friend.id} name={friend.display_name || 'Friend'} label={friend.display_name || 'Friend'} color="#b07d5c" />
                  ))}
                </div>
                <div className="space-y-2">
                  {auth.friends.map((friend) => {
                    const unread = threads.find((thread) => thread.friendId === friend.id)?.unreadCount ?? 0
                    return (
                      <Card key={`crew-msg-${friend.id}`} className="py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={friend.display_name || 'Friend'} color="#b07d5c" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{friend.display_name || 'Friend'}</p>
                            {unread > 0 ? <p className="text-xs text-lime-dim">{unread} unread</p> : null}
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => setChatWith(friend)}>
                            <MessageCircle className="h-3.5 w-3.5" />
                            Message
                            {unread > 0 ? <Badge tone="lime">{unread > 9 ? '9+' : String(unread)}</Badge> : null}
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </>
            )}
          </section>
          <section className="space-y-3">
            <SectionLabel>Chat</SectionLabel>
            {threadsLoading ? <p className="text-sm text-muted">Loading chats…</p> : null}
            {!threadsLoading && threads.length === 0 ? (
              <EmptyState
                title="No conversations yet"
                body="Tap Message on a crew member to start a 1:1 chat. Only mutual friends can message."
              />
            ) : null}
            {threads.map((thread) => {
              const name =
                thread.friend?.display_name || auth.friends.find((friend) => friend.id === thread.friendId)?.display_name || 'Friend'
              const preview = thread.latest.body.length > 80 ? `${thread.latest.body.slice(0, 80)}…` : thread.latest.body
              const mine = thread.latest.from_user === auth.user?.id
              return (
                <Card
                  key={thread.friendId}
                  onClick={() =>
                    setChatWith({
                      id: thread.friendId,
                      display_name: name,
                      avatar_url: thread.friend?.avatar_url ?? null,
                    })
                  }
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={name} color="#b07d5c" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{name}</p>
                        <div className="flex shrink-0 items-center gap-2">
                          {thread.unreadCount > 0 ? (
                            <Badge tone="lime">{thread.unreadCount > 9 ? '9+' : String(thread.unreadCount)}</Badge>
                          ) : null}
                          <span className="text-[10px] text-muted">{formatWhen(thread.latest.created_at)}</span>
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {mine ? 'You: ' : ''}
                        {preview}
                      </p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </section>
          <section className="space-y-3">
            <SectionLabel>Crew progress</SectionLabel>
            {finished.length > 0 ? (
              <Card>
                <p className="text-sm text-muted">Share a finished workout to the crew feed.</p>
                <div className="mt-2 flex gap-2">
                  <Select aria-label="Workout to share" value={shareSessionId} onChange={(event) => setShareSessionId(event.target.value)}>
                    <option value="">Choose a workout</option>
                    {finished.slice(0, 20).map((session) => (
                      <option key={session.id} value={session.id}>
                        {sessionLabel(session)}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" disabled={busy || !shareSessionId} onClick={() => void publishSession()}>
                    Share
                  </Button>
                </div>
              </Card>
            ) : null}
            {postsLoading ? <p className="text-sm text-muted">Loading progress…</p> : null}
            {!postsLoading && posts.length === 0 ? (
              <EmptyState
                title="No shared progress yet"
                body="When you or a friend finish a workout with Share on, a summary shows up here. Mutual friends can observe each other’s shared progress."
              />
            ) : null}
            {posts.map((post) => (
              <ProgressCard
                key={post.id}
                post={post}
                mine={post.user_id === auth.user?.id}
                name={post.user_id === auth.user?.id ? auth.profile?.display_name || 'You' : post.author?.display_name || 'Friend'}
                unit={unit}
                deleting={deletingPost === post.id}
                onDelete={() => void removePost(post.id)}
              />
            ))}
          </section>
          <section className="space-y-3">
            <SectionLabel>Shared with you</SectionLabel>
            {mine.length > 0 && auth.friends.length > 0 ? (
              <Card>
                <p className="text-sm text-muted">Send one of your programs to a friend.</p>
                <div className="mt-2 space-y-2">
                  <Select aria-label="Program to share" value={shareProgramId} onChange={(event) => setShareProgramId(event.target.value)}>
                    <option value="">Choose a program</option>
                    {mine.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label="Friend to share with" value={shareFriendId} onChange={(event) => setShareFriendId(event.target.value)}>
                    <option value="">Choose a friend</option>
                    {auth.friends.map((friend) => (
                      <option key={friend.id} value={friend.id}>
                        {friend.display_name || 'Friend'}
                      </option>
                    ))}
                  </Select>
                  <TextArea
                    aria-label="Share message"
                    placeholder="Optional note"
                    value={shareMessage}
                    onChange={(event) => setShareMessage(event.target.value)}
                    className="min-h-20"
                  />
                  <Button disabled={busy || !shareProgramId || !shareFriendId} onClick={() => void sendProgram()}>
                    <Share2 className="h-4 w-4" />
                    Share program
                  </Button>
                </div>
              </Card>
            ) : null}
            {sharesLoading ? <p className="text-sm text-muted">Loading shares…</p> : null}
            {!sharesLoading && pendingShares.length === 0 && acceptedShares.length === 0 ? (
              <EmptyState
                title="No shared programs"
                body="When a friend shares a program, it shows up here. Accept to add it to My Programs."
              />
            ) : null}
            {pendingShares.map((share) => (
              <Card key={share.id} data-incoming-share={share.id}>
                <div className="flex items-start gap-3">
                  <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-lime" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{share.program_name}</p>
                    <p className="text-xs text-muted">
                      From {share.from_profile?.display_name || 'Friend'} · {formatWhen(share.created_at)}
                    </p>
                    {share.message ? <p className="mt-1 text-xs text-ink/80">{share.message}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" disabled={shareBusy === share.id} onClick={() => void acceptShare(share.id)}>
                        <Check className="h-3.5 w-3.5" />
                        Accept → My Programs
                      </Button>
                      <Button size="sm" variant="secondary" disabled={shareBusy === share.id} onClick={() => void declineShare(share.id)}>
                        <X className="h-3.5 w-3.5" />
                        Decline
                      </Button>
                    </div>
                  </div>
                  <Badge>pending</Badge>
                </div>
              </Card>
            ))}
            {acceptedShares.map((share) => (
              <Card key={share.id} className="opacity-90">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{share.program_name}</p>
                    <p className="text-xs text-muted">Accepted · from {share.from_profile?.display_name || 'Friend'}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => go('programs')}>
                    Programs
                  </Button>
                </div>
              </Card>
            ))}
          </section>
          {outgoing.length > 0 ? (
            <section className="space-y-3">
              <SectionLabel>You shared</SectionLabel>
              {outgoing.map((share) => (
                <Card key={share.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{share.program_name}</p>
                      <p className="text-xs text-muted">
                        To {share.to_profile?.display_name || 'Friend'} · {share.status}
                      </p>
                    </div>
                    <Badge tone={share.status === 'accepted' ? 'success' : 'neutral'}>{share.status}</Badge>
                  </div>
                </Card>
              ))}
            </section>
          ) : null}
          <Card className="border-dashed">
            <p className="text-xs text-muted">
              Chat, progress observe, and program share are live between mutual friends. Local workouts stay on this device.
            </p>
          </Card>
        </>
      ) : (
        <section className="space-y-3">
          <SectionLabel>Local crew (demo)</SectionLabel>
          <div className="h-scroll gap-3 pb-1">
            {[state.profile, ...state.friends].map((friend) => (
              <div
                key={friend.id}
                className="flex w-24 shrink-0 flex-col items-center gap-2 rounded-2xl border border-charcoal-4 bg-charcoal-2 p-3 text-center"
              >
                <Avatar name={friend.name} color={friend.avatarColor} />
                <p className="truncate text-xs font-medium">{friend.isYou ? 'You' : friend.name.split(' ')[0]}</p>
                <p className="text-[10px] text-muted">{(friend as { streak?: number }).streak ?? 0}d</p>
              </div>
            ))}
          </div>
          {state.activity.length === 0 ? (
            <EmptyState
              title="Activity feed"
              body="Sign in to invite friends, share progress, and receive programs. Local workouts stay on this device."
            />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted">Local shared activity (this device)</p>
              {state.activity.slice(0, 12).map((entry) => {
                const lines = activityLines(entry)
                return (
                  <Card key={entry.id} className="py-3">
                    <p className="text-sm font-semibold">{lines.title}</p>
                    <p className="text-xs text-muted">
                      {formatWhen(entry.createdAt)} · {lines.detail}
                    </p>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      )}
      {error || message ? (
        <p className={`text-sm ${error ? 'text-danger' : 'text-success-ink'}`} role="status">
          {error || message}
        </p>
      ) : null}
      <Card className="border-danger/40" data-danger-zone>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-danger" aria-hidden />
          <h2 className="text-xs font-semibold tracking-wider text-danger uppercase">Danger zone</h2>
        </div>
        <p className="mt-2 text-sm text-muted">
          Wipe everything this app stores on this device and start again from the starter catalog.
        </p>
        <Button variant="danger" className="mt-3 w-full" onClick={() => setResetOpen(true)}>
          Reset all local data…
        </Button>
      </Card>
      <Prompt
        open={resetOpen}
        tone="danger"
        title="Reset all local data?"
        confirmLabel="Erase local data"
        onDismiss={() => setResetOpen(false)}
        onConfirm={() => {
          setResetOpen(false)
          prepareSyncForLocalReset()
          void resetToSeed()
        }}
      >
        <p>
          This erases your <strong className="text-ink">workout sessions, 1RM maxes and plans</strong> (boards, schedule and
          custom programs) stored on this device, then restores the starter catalog.
        </p>
        <p>
          This clears <strong className="text-ink">this device only</strong>. Your cloud copy and backups stay safe: when you’re
          signed in, your synced data comes back on the next sync, and you can also restore a backup from Account.
        </p>
        <p>Friends and chats aren’t affected. Anything on this device that hasn’t synced yet is lost.</p>
      </Prompt>
      {chatWith && auth.user ? (
        <ChatSheet
          friend={chatWith}
          myUserId={auth.user.id}
          onClose={() => {
            setChatWith(null)
            void refreshThreads()
          }}
          onActivity={() => void refreshThreads()}
        />
      ) : null}
    </Page>
  )
}

function LinkRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          aria-label={label}
          onFocus={(event) => event.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-taupe-strong bg-charcoal-2 px-2 py-1.5 text-xs text-ink"
        />
        <Button size="sm" variant="secondary" onClick={onCopy}>
          {label === 'Invite link' ? <Link2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          Copy
        </Button>
      </div>
    </div>
  )
}

function CrewChip({ name, label, color }: { name: string; label: string; color: string }) {
  return (
    <div className="flex w-24 shrink-0 flex-col items-center gap-2 rounded-2xl border border-charcoal-4 bg-charcoal-2 p-3 text-center">
      <Avatar name={name} color={color} />
      <p className="truncate text-xs font-medium">{label}</p>
    </div>
  )
}

function sessionLabel(session: WorkoutSession): string {
  return `${session.dateKey} · ${session.name || 'Workout'}`
}

function ProgressCard({
  post,
  mine,
  name,
  unit,
  deleting,
  onDelete,
}: {
  post: ProgressFeedPost
  mine: boolean
  name: string
  unit: 'kg' | 'lb'
  deleting: boolean
  onDelete: () => void
}) {
  const snapshot = post.snapshot || {}
  const bits: string[] = []
  if (snapshot.exerciseCount != null) bits.push(`${snapshot.exerciseCount} ex`)
  if (snapshot.completedSets != null) bits.push(`${snapshot.completedSets} set${snapshot.completedSets === 1 ? '' : 's'}`)
  if (snapshot.totalVolumeKg != null && snapshot.totalVolumeKg > 0) bits.push(formatWeight(snapshot.totalVolumeKg, unit))
  if (snapshot.programName) bits.push(snapshot.programName)
  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar name={name} color={mine ? '#a56b4e' : '#b07d5c'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{post.title}</p>
              <p className="text-xs text-muted">
                {mine ? 'You' : name} · {formatWhen(post.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Badge>{post.post_type}</Badge>
              {mine ? (
                <Button size="sm" variant="ghost" disabled={deleting} aria-label="Delete progress post" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
          <p className="mt-1 text-xs text-ink/80">{formatProgressDetail(post, unit)}</p>
          {bits.length > 0 ? (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
              <Activity className="h-3 w-3 shrink-0" />
              {bits.join(' · ')}
            </p>
          ) : null}
          {snapshot.prHighlights && snapshot.prHighlights.length > 0 ? (
            <p className="mt-1 text-[11px] text-lime-dim">
              PRs:{' '}
              {snapshot.prHighlights.map((pr) => `${pr.name} ${formatWeight(pr.loadKg, unit)} × ${pr.reps}`).join(', ')}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

export function shareProgramWithFriend(program: Program, friendId: string, message?: string) {
  return shareProgram(program, friendId, message)
}

export default function FriendsScreen() {
  return (
    <AuthProvider>
      <FriendsBody />
    </AuthProvider>
  )
}
