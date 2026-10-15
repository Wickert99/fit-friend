import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import type { SupabaseProfile } from '../../types.ts'
import { Button } from '../../ui/Button.tsx'
import { Input } from '../../ui/Input.tsx'
import { useBodyScrollLock } from '../../ui/useBodyScrollLock.ts'
import { loadThread, markThreadRead, mergeMessages, sendChatMessage, subscribeChat } from './chat.ts'
import { formatWhen } from './format.ts'
import { Avatar } from '../../ui/Card.tsx'

export function ChatSheet({
  friend,
  myUserId,
  onClose,
  onActivity,
}: {
  friend: SupabaseProfile
  myUserId: string
  onClose: () => void
  onActivity?: () => void
}) {
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof loadThread>>['messages']>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const onActivityRef = useRef(onActivity)
  useEffect(() => {
    onActivityRef.current = onActivity
  }, [onActivity])
  useBodyScrollLock(true)

  const refresh = useCallback(async () => {
    const result = await loadThread(friend.id)
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    setMessages((current) => mergeMessages(current, result.messages))
    const marked = await markThreadRead(friend.id)
    if (!marked.error && (marked.updated ?? 0) > 0) onActivityRef.current?.()
  }, [friend.id])

  useEffect(() => {
    setMessages([])
  }, [friend.id])

  useEffect(() => {
    let alive = true
    setLoading(true)
    void refresh().finally(() => {
      if (alive) setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [refresh])

  useEffect(() => {
    const stop = subscribeChat(friend.id, () => {
      void refresh()
    })
    const timer = window.setInterval(() => {
      void refresh()
    }, 8000)
    return () => {
      stop()
      window.clearInterval(timer)
    }
  }, [friend.id, refresh])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      const result = await sendChatMessage(friend.id, text)
      if (result.error) {
        setError(result.error)
        return
      }
      setDraft('')
      if (result.message) setMessages((current) => mergeMessages(current, [result.message!]))
      else await refresh()
      onActivityRef.current?.()
    } finally {
      setSending(false)
    }
  }

  const name = friend.display_name || 'Friend'
  return (
    <div
      className="sheet-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Chat with ${name}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-charcoal-4 bg-charcoal shadow-card sm:rounded-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-charcoal-4 px-4 py-3">
          <Avatar name={name} color="#b07d5c" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="text-xs text-muted">Friend chat</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-charcoal-4 bg-charcoal-2 text-muted hover:text-ink"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3" style={{ maxHeight: 'min(55vh, 420px)' }}>
          {loading ? <p className="text-sm text-muted">Loading messages…</p> : null}
          {!loading && messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <MessageCircle className="h-8 w-8 text-muted" />
              <p className="text-sm text-muted">Say hi — start the conversation.</p>
            </div>
          ) : null}
          {messages.map((message) => {
            const mine = message.from_user === myUserId
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? 'border border-lime/25 bg-lime/10 text-ink' : 'border border-charcoal-4 bg-charcoal-2 text-ink'}`}
                >
                  <p className="break-words whitespace-pre-wrap">{message.body}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {formatWhen(message.created_at)}
                    {mine && message.read_at ? ' · Read' : ''}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>
        <div className="shrink-0 border-t border-charcoal-4 p-3">
          {error ? <p className="mb-2 text-xs text-danger">{error}</p> : null}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <Input
              placeholder="Message…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={2000}
              disabled={sending}
              autoComplete="off"
              aria-label="Message body"
            />
            <Button type="submit" disabled={sending || !draft.trim()} aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
