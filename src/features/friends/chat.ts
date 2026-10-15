import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage, SupabaseProfile } from '../../types.ts'
import { loadSupabase } from '../../lib/supabase/client.ts'

const THREAD_LIMIT = 120
const INBOX_LIMIT = 400

export interface ChatThread {
  friendId: string
  friend: SupabaseProfile | null
  latest: ChatMessage
  unreadCount: number
}

const unread = new Map<string, number>()
let cachedUserId: string | null | undefined
let userPromise: Promise<string | null> | null = null
let listening = false

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function watchAuth(client: SupabaseClient): void {
  if (listening) return
  listening = true
  client.auth.onAuthStateChange((_event, session) => {
    cachedUserId = session?.user?.id ?? undefined
    userPromise = null
    unread.clear()
    if (session?.user?.id) cachedUserId = session.user.id
  })
}

async function userId(): Promise<string | null> {
  const client = await loadSupabase()
  if (!client) return null
  watchAuth(client)
  if (cachedUserId !== undefined) return cachedUserId
  if (!userPromise) {
    const pending = client.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null
      if (userPromise === pending) {
        cachedUserId = id
        userPromise = null
      }
      return id
    })
    userPromise = pending
  }
  return userPromise
}

function byTime(a: ChatMessage, b: ChatMessage): number {
  if (a.created_at === b.created_at) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1
}

export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>()
  for (const message of current) map.set(message.id, message)
  for (const message of incoming) map.set(message.id, message)
  return [...map.values()].sort(byTime)
}

export async function loadThread(friendId: string, limit = THREAD_LIMIT): Promise<{ messages: ChatMessage[]; error?: string }> {
  const client = await loadSupabase()
  if (!client) return { messages: [], error: 'Supabase is not configured' }
  if (offline()) return { messages: [], error: 'Offline' }
  const me = await userId()
  if (!me) return { messages: [], error: 'Not signed in' }
  const { data, error } = await client
    .from('chat_messages')
    .select('*')
    .in('from_user', [me, friendId])
    .in('to_user', [me, friendId])
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (error) return { messages: [], error: error.message }
  const rows = (data ?? []) as ChatMessage[]
  unread.set(friendId, rows.filter((row) => row.to_user === me && row.read_at == null).length)
  return { messages: rows.slice().reverse() }
}

export async function sendChatMessage(friendId: string, body: string): Promise<{ message?: ChatMessage; error?: string }> {
  const client = await loadSupabase()
  if (!client) return { error: 'Supabase is not configured' }
  if (offline()) return { error: 'Offline' }
  const me = await userId()
  if (!me) return { error: 'Not signed in' }
  const text = body.trim()
  if (!text) return { error: 'Message cannot be empty' }
  if (text.length > 2000) return { error: 'Message is too long (max 2000)' }
  if (friendId === me) return { error: 'Cannot message yourself' }
  const { data, error } = await client
    .from('chat_messages')
    .insert({ from_user: me, to_user: friendId, body: text })
    .select('*')
    .single()
  return error ? { error: error.message } : { message: data as ChatMessage }
}

export async function markThreadRead(friendId: string, knownUnread?: number): Promise<{ updated?: number; error?: string }> {
  const client = await loadSupabase()
  if (!client) return { error: 'Supabase is not configured' }
  if ((knownUnread ?? unread.get(friendId)) === 0) return { updated: 0 }
  if (offline()) return { error: 'Offline' }
  const me = await userId()
  if (!me) return { error: 'Not signed in' }
  const { data, error } = await client
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('to_user', me)
    .eq('from_user', friendId)
    .is('read_at', null)
    .select('id')
  if (error) return { error: error.message }
  unread.set(friendId, 0)
  return { updated: (data as { id: string }[] | null)?.length ?? 0 }
}

export async function loadThreads(): Promise<{ threads: ChatThread[]; error?: string }> {
  const client = await loadSupabase()
  if (!client) return { threads: [], error: 'Supabase is not configured' }
  if (offline()) return { threads: [], error: 'Offline' }
  const me = await userId()
  if (!me) return { threads: [], error: 'Not signed in' }
  const { data, error } = await client
    .from('chat_messages')
    .select('*')
    .or(`from_user.eq.${me},to_user.eq.${me}`)
    .order('created_at', { ascending: false })
    .limit(INBOX_LIMIT)
  if (error) return { threads: [], error: error.message }
  const rows = (data ?? []) as ChatMessage[]
  const latest = new Map<string, ChatMessage>()
  const counts = new Map<string, number>()
  for (const row of rows) {
    const other = row.from_user === me ? row.to_user : row.from_user
    if (!latest.has(other)) latest.set(other, row)
    if (row.to_user === me && row.read_at == null) counts.set(other, (counts.get(other) ?? 0) + 1)
  }
  const ids = [...latest.keys()]
  const profiles = new Map<string, SupabaseProfile>()
  if (ids.length > 0) {
    const { data: people } = await client.from('profiles').select('id, display_name, avatar_url, created_at').in('id', ids)
    for (const person of (people ?? []) as SupabaseProfile[]) profiles.set(person.id, person)
  }
  return {
    threads: ids.map((id) => ({
      friendId: id,
      friend: profiles.get(id) ?? null,
      latest: latest.get(id) as ChatMessage,
      unreadCount: counts.get(id) ?? 0,
    })),
  }
}

export function subscribeChat(friendId: string, onChange: () => void): () => void {
  let stopped = false
  let remove: (() => void) | null = null
  void loadSupabase().then((client) => {
    if (!client || stopped) return
    const channel = client
      .channel(`chat:${friendId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
        if (!stopped) onChange()
      })
      .subscribe()
    remove = () => {
      void client.removeChannel(channel)
    }
  })
  return () => {
    stopped = true
    remove?.()
  }
}
