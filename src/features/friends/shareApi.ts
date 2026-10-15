import type { Program, SupabaseProfile } from '../../types.ts'
import { loadSupabase } from '../../lib/supabase/client.ts'
import { materializeSharedProgram, type ShareView } from './programShare.ts'

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

async function listShares(column: 'to_user' | 'from_user', statuses?: string[]): Promise<{ shares: ShareView[]; error?: string }> {
  const client = await loadSupabase()
  if (!client) return { shares: [], error: 'Supabase is not configured' }
  if (offline()) return { shares: [], error: 'Offline' }
  const { data: auth } = await client.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { shares: [], error: 'Not signed in' }
  let query = client.from('program_shares').select('*').eq(column, userId).order('created_at', { ascending: false })
  if (statuses && statuses.length > 0) query = query.in('status', statuses)
  const { data, error } = await query
  if (error) return { shares: [], error: error.message }
  const rows = (data ?? []) as ShareView[]
  const ids = [...new Set(rows.map((row) => (column === 'to_user' ? row.from_user : row.to_user)))]
  const profiles = new Map<string, SupabaseProfile>()
  if (ids.length > 0) {
    const { data: people } = await client.from('profiles').select('id, display_name, avatar_url, created_at').in('id', ids)
    for (const person of (people ?? []) as SupabaseProfile[]) profiles.set(person.id, person)
  }
  return {
    shares: rows.map((row) => ({
      ...row,
      program_snapshot: row.program_snapshot,
      from_profile: column === 'to_user' ? (profiles.get(row.from_user) ?? null) : undefined,
      to_profile: column === 'from_user' ? (profiles.get(row.to_user) ?? null) : undefined,
    })),
  }
}

export function listIncomingShares(statuses: string[] = ['pending', 'accepted']): Promise<{ shares: ShareView[]; error?: string }> {
  return listShares('to_user', statuses)
}

export function listOutgoingShares(statuses?: string[]): Promise<{ shares: ShareView[]; error?: string }> {
  return listShares('from_user', statuses)
}

export async function shareProgram(
  program: Program,
  toUser: string,
  message?: string,
): Promise<{ share?: ShareView; error?: string }> {
  const client = await loadSupabase()
  if (!client) return { error: 'Supabase is not configured' }
  const { data: auth } = await client.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { error: 'Not signed in' }
  if (userId === toUser) return { error: 'Cannot share with yourself' }
  const { data, error } = await client
    .from('program_shares')
    .insert({
      from_user: userId,
      to_user: toUser,
      program_id: program.id,
      program_name: program.name,
      program_snapshot: program,
      message: message?.trim() || null,
      status: 'pending',
    })
    .select('*')
    .single()
  return error ? { error: error.message } : { share: data as ShareView }
}

export async function acceptProgramShare(id: string): Promise<{ program?: Program; error?: string }> {
  const client = await loadSupabase()
  if (!client) return { error: 'Supabase is not configured' }
  const { data: auth } = await client.auth.getUser()
  if (!auth.user) return { error: 'Not signed in' }
  const { data, error } = await client
    .from('program_shares')
    .select('*')
    .eq('id', id)
    .eq('to_user', auth.user.id)
    .maybeSingle()
  if (error) return { error: error.message }
  const share = data as ShareView | null
  if (!share) return { error: 'Share not found' }
  if (share.status !== 'pending' && share.status !== 'accepted') return { error: 'Share is no longer available' }
  const snapshot = share.program_snapshot
  if (!snapshot || typeof snapshot !== 'object') return { error: 'Invalid program snapshot' }
  const { error: updateError } = await client
    .from('program_shares')
    .update({ status: 'accepted' })
    .eq('id', id)
    .eq('to_user', auth.user.id)
  if (updateError) return { error: updateError.message }
  return { program: materializeSharedProgram(snapshot as Program) }
}

export async function declineProgramShare(id: string): Promise<{ error?: string }> {
  const client = await loadSupabase()
  if (!client) return { error: 'Supabase is not configured' }
  const { data: auth } = await client.auth.getUser()
  if (!auth.user) return { error: 'Not signed in' }
  const { error } = await client.from('program_shares').update({ status: 'declined' }).eq('id', id).eq('to_user', auth.user.id)
  return error ? { error: error.message } : {}
}
