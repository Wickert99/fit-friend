import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { FriendInvite, SupabaseProfile } from '../../types.ts'
import {
  acceptFriendInvite,
  createFriendInvite,
  ensureProfile,
  loadFriendIds,
  loadPendingInvites,
  loadProfiles,
  signInWithMagicLink,
  signInWithPassword,
  signUpWithPassword,
  updateDisplayName,
} from '../../lib/supabase/account.ts'
import { consumePostAuthNav, inviteFromHash, rememberPendingInvite, rememberPostAuthNav } from '../../lib/supabase/authLink.ts'
import { isSupabaseConfigured, loadSupabase } from '../../lib/supabase/client.ts'

export interface AuthApi {
  configured: boolean
  loading: boolean
  session: Session | null
  user: Session['user'] | null
  profile: SupabaseProfile | null
  friends: SupabaseProfile[]
  pendingInvites: FriendInvite[]
  refreshSocial: () => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: string; message?: string }>
  signIn: (email: string, password: string) => Promise<{ error?: string; message?: string }>
  signInMagicLink: (email: string) => Promise<{ error?: string; message?: string }>
  signOut: () => Promise<void>
  updateDisplayName: (name: string) => Promise<{ error?: string }>
  createInvite: () => Promise<{ code?: string; error?: string }>
  acceptInvite: (code: string) => Promise<{ error?: string; alreadyFriends?: boolean }>
}

const AuthContext = createContext<AuthApi | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<SupabaseProfile | null>(null)
  const [friends, setFriends] = useState<SupabaseProfile[]>([])
  const [pendingInvites, setPendingInvites] = useState<FriendInvite[]>([])

  const loadProfile = useCallback(async (userId: string) => {
    const client = await loadSupabase()
    if (!client || !session?.user) return
    const row = await ensureProfile(client, session.user.id === userId ? session.user : session.user)
    setProfile(row)
  }, [session])

  const refreshSocial = useCallback(async () => {
    const client = await loadSupabase()
    if (!client || !session?.user) {
      setFriends([])
      setPendingInvites([])
      return
    }
    const userId = session.user.id
    const row = await ensureProfile(client, session.user)
    setProfile(row)
    const ids = await loadFriendIds(client, userId)
    setFriends(ids.length ? await loadProfiles(client, ids) : [])
    setPendingInvites(await loadPendingInvites(client, userId))
  }, [session])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let alive = true
    let unsubscribe = () => {}
    void loadSupabase().then(async (client) => {
      if (!client || !alive) {
        if (alive) setLoading(false)
        return
      }
      const { data: auth } = client.auth.onAuthStateChange((_event, next) => {
        if (alive) setSession(next)
      })
      unsubscribe = () => auth.subscription.unsubscribe()
      if (!alive) {
        unsubscribe()
        return
      }
      const { data } = await client.auth.getSession()
      if (!alive) return
      setSession(data.session)
      setLoading(false)
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) return
    if (!consumePostAuthNav(localStorage)) return
    if (!window.location.hash.startsWith('#/friends')) window.location.hash = '#/friends'
  }, [session?.user?.id])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setFriends([])
      setPendingInvites([])
      return
    }
    void refreshSocial()
  }, [session?.user?.id, refreshSocial])

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const client = await loadSupabase()
    if (!client) return { error: 'Supabase is not configured' }
    const result = await signUpWithPassword(client, email, password, displayName)
    if (!result.error && !result.data?.session) rememberPostAuthNav(localStorage)
    return { error: result.error }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const client = await loadSupabase()
    if (!client) return { error: 'Supabase is not configured' }
    const result = await signInWithPassword(client, email, password)
    return { error: result.error }
  }, [])

  const signInMagicLink = useCallback(async (email: string) => {
    const client = await loadSupabase()
    if (!client) return { error: 'Supabase is not configured' }
    rememberPostAuthNav(localStorage)
    const result = await signInWithMagicLink(client, email)
    if (result.error) {
      consumePostAuthNav(localStorage)
      return { error: result.error }
    }
    return { message: result.data }
  }, [])

  const signOut = useCallback(async () => {
    const client = await loadSupabase()
    if (client) await client.auth.signOut()
  }, [])

  const updateName = useCallback(
    async (name: string) => {
      const client = await loadSupabase()
      if (!client || !session?.user) return { error: 'Not signed in' }
      const result = await updateDisplayName(client, session.user.id, name)
      if (!result.error && result.data) setProfile((current) => (current ? { ...current, display_name: result.data! } : current))
      return { error: result.error }
    },
    [session],
  )

  const createInvite = useCallback(async () => {
    const client = await loadSupabase()
    if (!client || !session?.user) return { error: 'Not signed in' }
    if (!profile) await loadProfile(session.user.id)
    const result = await createFriendInvite(client, session.user.id)
    if (result.data) await refreshSocial()
    return { code: result.data, error: result.error }
  }, [session, profile, loadProfile, refreshSocial])

  const acceptInvite = useCallback(
    async (code: string) => {
      const client = await loadSupabase()
      if (!client || !session?.user) return { error: 'Not signed in' }
      const result = await acceptFriendInvite(client, code)
      if (!result.error) await refreshSocial()
      return result
    },
    [session, refreshSocial],
  )

  const api = useMemo<AuthApi>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      friends,
      pendingInvites,
      refreshSocial,
      signUp,
      signIn,
      signInMagicLink,
      signOut,
      updateDisplayName: updateName,
      createInvite,
      acceptInvite,
    }),
    [loading, session, profile, friends, pendingInvites, refreshSocial, signUp, signIn, signInMagicLink, signOut, updateName, createInvite, acceptInvite],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthApi {
  const api = useContext(AuthContext)
  if (!api) throw new Error('useAuth must be used within AuthProvider')
  return api
}

export function captureInviteFromLocation(): string {
  if (typeof window === 'undefined') return ''
  const code = inviteFromHash(window.location.hash)
  if (!code) return ''
  rememberPendingInvite(localStorage, code)
  return code
}
