import type { Exercise, PersonalRecord, Program, WorkoutSession } from '../../types.ts'
import { loadSupabase } from '../../lib/supabase/client.ts'
import {
  buildProgressSnapshot,
  defaultProgressDetail,
  type ProgressSnapshot,
} from './progressSnapshot.ts'

export interface ProgressAuthor {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at?: string
}

export interface ProgressFeedPost {
  id: string
  user_id: string
  session_local_id: string
  title: string | null
  detail: string | null
  post_type: string | null
  snapshot: ProgressSnapshot
  created_at?: string
  author: ProgressAuthor | null
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export async function publishProgressPost(input: {
  session: WorkoutSession
  exercises: Exercise[]
  previousPrs?: PersonalRecord[]
  programName?: string
  title?: string
  detail?: string
  postType?: string
}): Promise<{ post?: ProgressFeedPost; error?: string }> {
  const client = await loadSupabase()
  if (!client) return { error: 'Supabase is not configured' }
  if (offline()) return { error: 'Offline' }
  const { data: auth } = await client.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { error: 'Not signed in' }
  const snapshot = buildProgressSnapshot(input.session, {
    exerciseNames: new Map(input.exercises.map((exercise) => [exercise.id, exercise.name])),
    previousPrs: input.previousPrs,
    programName: input.programName,
  })
  const title = input.title?.trim() || input.session.name || 'Workout'
  const custom = input.detail?.trim()
  const detail = custom || defaultProgressDetail(input.session, snapshot)
  if (!custom && input.session.exercises.length > 0) snapshot.autoDetail = true
  const row = {
    user_id: userId,
    session_local_id: input.session.id,
    title,
    detail,
    post_type: input.postType ?? 'workout',
    snapshot,
  }
  const { data, error } = await client.from('progress_posts').upsert(row, { onConflict: 'user_id,session_local_id' }).select('*').single()
  return error ? { error: error.message } : { post: data as ProgressFeedPost }
}

export async function listFriendsProgress(limit = 40): Promise<{ posts: ProgressFeedPost[]; error?: string }> {
  const client = await loadSupabase()
  if (!client) return { posts: [], error: 'Supabase is not configured' }
  if (offline()) return { posts: [], error: 'Offline' }
  const { data: auth } = await client.auth.getUser()
  if (!auth.user) return { posts: [], error: 'Not signed in' }
  const { data, error } = await client.from('progress_posts').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) return { posts: [], error: error.message }
  const rows = (data ?? []) as ProgressFeedPost[]
  const ids = [...new Set(rows.map((row) => row.user_id))]
  const authors = new Map<string, ProgressAuthor>()
  if (ids.length > 0) {
    const { data: people } = await client.from('profiles').select('id, display_name, avatar_url, created_at').in('id', ids)
    for (const person of (people ?? []) as ProgressAuthor[]) authors.set(person.id, person)
  }
  return {
    posts: rows.map((row) => ({
      ...row,
      snapshot: row.snapshot ?? {},
      author: authors.get(row.user_id) ?? null,
    })),
  }
}

export async function deleteOwnPost(id: string): Promise<{ error?: string }> {
  const client = await loadSupabase()
  if (!client) return { error: 'Supabase is not configured' }
  if (offline()) return { error: 'Offline' }
  const { data: auth } = await client.auth.getUser()
  if (!auth.user) return { error: 'Not signed in' }
  const { error } = await client.from('progress_posts').delete().eq('id', id).eq('user_id', auth.user.id)
  return error ? { error: error.message } : {}
}

export async function deleteOwnPostBySession(sessionId: string): Promise<{ deleted: number; error?: string }> {
  const client = await loadSupabase()
  if (!client) return { deleted: 0 }
  const { data: auth } = await client.auth.getSession()
  const userId = auth.session?.user?.id
  if (!userId) return { deleted: 0 }
  const { data, error } = await client
    .from('progress_posts')
    .delete()
    .eq('user_id', userId)
    .eq('session_local_id', sessionId)
    .select('id')
  return error ? { deleted: 0, error: error.message } : { deleted: (data as { id: string }[] | null)?.length ?? 0 }
}

export function programNameFor(programs: Program[], programId: string | undefined): string | undefined {
  if (!programId) return undefined
  return programs.find((program) => program.id === programId)?.name
}
