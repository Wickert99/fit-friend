import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import type { FriendInvite, Friendship, SupabaseProfile } from '../../types.ts'
import { appBase } from '../base.ts'
import { loadSupabase } from './client.ts'
import { randomInviteCode } from './authLink.ts'

export interface AccountResult<T> {
  data?: T
  error?: string
}

function originRedirect(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return new URL(appBase(), window.location.origin).href
}

export async function signUpWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
  displayName: string,
): Promise<AccountResult<{ session: Session | null }>> {
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { display_name: displayName.trim() || undefined },
      emailRedirectTo: originRedirect(),
    },
  })
  if (error) return { error: error.message }
  return { data: { session: data.session } }
}

export async function signInWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<AccountResult<true>> {
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
  return error ? { error: error.message } : { data: true }
}

export async function signInWithMagicLink(client: SupabaseClient, email: string): Promise<AccountResult<string>> {
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: originRedirect() },
  })
  return error ? { error: error.message } : { data: 'Check your email for a magic link.' }
}

export function fallbackDisplayName(user: User | null | undefined): string {
  const meta = user?.user_metadata?.display_name
  if (typeof meta === 'string' && meta.trim()) return meta.trim()
  const email = user?.email?.split('@')[0]
  return email || 'Athlete'
}

export async function ensureProfile(client: SupabaseClient, user: User): Promise<SupabaseProfile | null> {
  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) {
    console.warn('profile load', error.message)
    return null
  }
  if (data) return data as SupabaseProfile
  const { data: created } = await client
    .from('profiles')
    .upsert({ id: user.id, display_name: fallbackDisplayName(user) })
    .select('*')
    .single()
  return (created as SupabaseProfile | null) ?? null
}

export async function updateDisplayName(
  client: SupabaseClient,
  userId: string,
  name: string,
): Promise<AccountResult<string>> {
  const displayName = name.trim()
  if (!displayName) return { error: 'Display name required' }
  const { error } = await client.from('profiles').update({ display_name: displayName }).eq('id', userId)
  return error ? { error: error.message } : { data: displayName }
}

export async function loadFriendIds(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await client
    .from('friendships')
    .select('user_a, user_b, created_at')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
  return ((data ?? []) as Friendship[]).map((row) => (row.user_a === userId ? row.user_b : row.user_a))
}

export async function loadProfiles(client: SupabaseClient, ids: string[]): Promise<SupabaseProfile[]> {
  if (ids.length === 0) return []
  const { data } = await client.from('profiles').select('*').in('id', ids)
  return (data ?? []) as SupabaseProfile[]
}

export async function loadPendingInvites(client: SupabaseClient, userId: string): Promise<FriendInvite[]> {
  const { data } = await client
    .from('friend_invites')
    .select('*')
    .eq('from_user', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return (data ?? []) as FriendInvite[]
}

export async function createFriendInvite(client: SupabaseClient, userId: string): Promise<AccountResult<string>> {
  let last = 'Could not create invite'
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomInviteCode()
    const { data, error } = await client
      .from('friend_invites')
      .insert({ from_user: userId, code, status: 'pending' })
      .select('code')
      .single()
    if (!error && data) return { data: (data as { code: string }).code }
    last = error?.message ?? last
    if (error && !/duplicate|unique/i.test(error.message)) break
  }
  return { error: last }
}

export interface AcceptInviteResult {
  error?: string
  alreadyFriends?: boolean
}

export async function acceptFriendInvite(client: SupabaseClient, code: string): Promise<AcceptInviteResult> {
  const { data, error } = await client.rpc('accept_friend_invite', {
    invite_code: code.trim().toUpperCase(),
  })
  if (error) return { error: error.message }
  const body = data as { ok?: boolean; already_friends?: boolean } | null
  if (body && body.already_friends) return { alreadyFriends: true }
  if (body && body.ok === false) return { error: 'Could not accept invite' }
  return {}
}

export async function currentClient(): Promise<SupabaseClient | null> {
  return loadSupabase()
}
