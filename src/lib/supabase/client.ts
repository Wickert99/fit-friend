import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

/** True only when both env values are present. Otherwise the app stays local-only. */
export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0

export const supabaseConfig = {
  url: isSupabaseConfigured ? url : '',
  configured: isSupabaseConfigured,
}

let clientPromise: Promise<SupabaseClient | null> | null = null

/**
 * Loads @supabase/supabase-js on demand. Returns null when env is missing so
 * callers can keep the offline path without opening a connection.
 */
export function loadSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null)
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }),
  )
  return clientPromise
}
