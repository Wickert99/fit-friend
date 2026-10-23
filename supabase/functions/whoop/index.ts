// Fit Friend Whoop proxy.
//
// Deno Edge Function. The Vite app does not bundle this file.
// WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET come from function secrets.
// Never return tokens, the client secret, or the authorization code.
//
// Whoop responds 403 when the User-Agent looks like Python. Every Whoop
// request below sends FitFriend/1.0.
//
// Deploy steps: DEPLOY_WHOOP.md

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.81.1'

const WHOOP_USER_AGENT = 'FitFriend/1.0'
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth'
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token'
const WHOOP_API = 'https://api.prod.whoop.com/developer'
const SCOPES = 'read:workout read:recovery read:cycles offline'
const STATE_TTL_MS = 10 * 60 * 1000
const REFRESH_SKEW_MS = 60 * 1000
const QUERY_PAD_MS = 12 * 60 * 60 * 1000
const MAX_WINDOW_MS = 48 * 60 * 60 * 1000
const MAX_PAGES = 4

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

type Admin = SupabaseClient

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope?: string
}

Deno.serve((request) => handle(request))

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const config = readConfig()
  if (!config) return json({ ok: false, unavailable: true, error: 'whoop_not_configured' }, 200)

  const userId = await authenticatedUserId(request, config.supabaseUrl, config.anonKey)
  if (!userId) return json({ ok: false, error: 'not_signed_in' }, 401)

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400)
  }

  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const action = typeof body.action === 'string' ? body.action : ''

  try {
    if (action === 'status') return status(admin, userId)
    if (action === 'authorize') return authorize(admin, userId, config, body)
    if (action === 'exchange') return exchange(admin, userId, config, body)
    if (action === 'disconnect') return disconnect(admin, userId)
    if (action === 'workouts') return workouts(admin, userId, config, body)
    return json({ ok: false, error: 'unknown_action' }, 400)
  } catch {
    return json({ ok: false, error: 'whoop_unavailable' }, 200)
  }
}

function readConfig(): {
  supabaseUrl: string
  anonKey: string
  serviceRoleKey: string
  clientId: string
  clientSecret: string
} | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const clientId = Deno.env.get('WHOOP_CLIENT_ID') ?? ''
  const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !clientId || !clientSecret) return null
  return { supabaseUrl, anonKey, serviceRoleKey, clientId, clientSecret }
}

async function authenticatedUserId(request: Request, supabaseUrl: string, anonKey: string): Promise<string | null> {
  const header = request.headers.get('Authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(header)) return null
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

async function status(admin: Admin, userId: string): Promise<Response> {
  const { data, error } = await admin.from('whoop_tokens').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) return json({ ok: false, error: 'token_store' }, 200)
  return json({ ok: true, connected: !!data }, 200)
}

async function authorize(
  admin: Admin,
  userId: string,
  config: { clientId: string },
  body: Record<string, unknown>,
): Promise<Response> {
  const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : ''
  if (!allowedRedirect(redirectUri)) return json({ ok: false, error: 'redirect_not_allowed' }, 400)

  const state = randomState()
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString()
  const { error } = await admin.from('whoop_oauth_states').upsert(
    {
      user_id: userId,
      state,
      redirect_uri: redirectUri,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: 'user_id' },
  )
  if (error) return json({ ok: false, error: 'token_store' }, 200)

  const url = new URL(WHOOP_AUTH_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  return json({ ok: true, url: url.toString() }, 200)
}

async function exchange(
  admin: Admin,
  userId: string,
  config: { clientId: string; clientSecret: string },
  body: Record<string, unknown>,
): Promise<Response> {
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const state = typeof body.state === 'string' ? body.state.trim() : ''
  if (!code || !state) return json({ ok: false, error: 'missing_code' }, 400)

  const { data: rows, error } = await admin
    .from('whoop_oauth_states')
    .delete()
    .eq('user_id', userId)
    .eq('state', state)
    .gt('expires_at', new Date().toISOString())
    .select('redirect_uri')
  if (error) return json({ ok: false, error: 'token_store' }, 200)
  const redirectUri = rows?.[0]?.redirect_uri
  if (typeof redirectUri !== 'string' || !allowedRedirect(redirectUri)) {
    return json({ ok: false, error: 'state_mismatch' }, 400)
  }

  const token = await requestToken({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
  })
  if (!token.ok || !token.token.refresh_token) return json({ ok: false, error: 'whoop_token_failed' }, 200)

  const saved = await saveToken(admin, userId, token.token, token.token.refresh_token)
  if (!saved) return json({ ok: false, error: 'token_store' }, 200)
  return json({ ok: true, connected: true }, 200)
}

async function disconnect(admin: Admin, userId: string): Promise<Response> {
  const { data } = await admin
    .from('whoop_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle()
  const accessToken = typeof data?.access_token === 'string' ? data.access_token : ''
  if (accessToken) {
    try {
      await fetch(`${WHOOP_API}/v2/user/access`, {
        method: 'DELETE',
        headers: whoopHeaders(accessToken),
      })
    } catch {
      /* Still drop the local row if Whoop is unreachable. */
    }
  }
  await admin.from('whoop_tokens').delete().eq('user_id', userId)
  await admin.from('whoop_oauth_states').delete().eq('user_id', userId)
  return json({ ok: true, connected: false }, 200)
}

async function workouts(
  admin: Admin,
  userId: string,
  config: { clientId: string; clientSecret: string },
  body: Record<string, unknown>,
): Promise<Response> {
  const startMs = Date.parse(typeof body.start === 'string' ? body.start : '')
  const endMs = Date.parse(typeof body.end === 'string' ? body.end : '')
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return json({ ok: false, error: 'bad_window' }, 400)
  }
  if (endMs - startMs > MAX_WINDOW_MS) return json({ ok: false, error: 'window_too_long' }, 400)

  const token = await validAccessToken(admin, userId, config, false)
  if (token.status === 'missing') return json({ ok: true, connected: false, workouts: [] }, 200)
  if (token.status === 'error') return json({ ok: false, error: token.error, connected: true }, 200)

  const queryStart = new Date(startMs - QUERY_PAD_MS).toISOString()
  const queryEnd = new Date(endMs + QUERY_PAD_MS).toISOString()
  let listed = await listWorkouts(token.accessToken, queryStart, queryEnd)
  if (listed.status === 401) {
    const refreshed = await validAccessToken(admin, userId, config, true)
    if (refreshed.status !== 'ok') return json({ ok: true, connected: false, workouts: [] }, 200)
    listed = await listWorkouts(refreshed.accessToken, queryStart, queryEnd)
  }
  if (listed.status === 429) return json({ ok: false, error: 'whoop_rate_limited', connected: true }, 200)
  if (listed.status !== 200) return json({ ok: false, error: 'whoop_workouts_failed', connected: true }, 200)
  return json({ ok: true, connected: true, workouts: listed.workouts }, 200)
}

async function listWorkouts(
  accessToken: string,
  start: string,
  end: string,
): Promise<{ status: number; workouts: unknown[] }> {
  const workouts: unknown[] = []
  let nextToken = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${WHOOP_API}/v2/activity/workout`)
    url.searchParams.set('limit', '25')
    url.searchParams.set('start', start)
    url.searchParams.set('end', end)
    if (nextToken) url.searchParams.set('nextToken', nextToken)
    const response = await fetch(url, { headers: whoopHeaders(accessToken) })
    if (!response.ok) return { status: response.status, workouts }
    const payload = await response.json().catch(() => null)
    const records =
      payload && typeof payload === 'object' && Array.isArray((payload as { records?: unknown }).records)
        ? (payload as { records: unknown[] }).records
        : []
    for (const record of records) {
      const sanitized = sanitizeWorkout(record)
      if (sanitized) workouts.push(sanitized)
    }
    const token =
      payload && typeof payload === 'object'
        ? ((payload as { next_token?: unknown; nextToken?: unknown }).next_token ??
          (payload as { nextToken?: unknown }).nextToken)
        : null
    if (typeof token !== 'string' || token.length === 0 || token === nextToken) break
    nextToken = token
  }
  return { status: 200, workouts }
}

function sanitizeWorkout(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.start !== 'string' || typeof row.end !== 'string') return null
  const score = row.score && typeof row.score === 'object' ? (row.score as Record<string, unknown>) : null
  const zones = score?.zone_durations ?? score?.zone_duration ?? null
  return {
    id: row.id,
    start: row.start,
    end: row.end,
    sport_name: typeof row.sport_name === 'string' ? row.sport_name : null,
    score_state: typeof row.score_state === 'string' ? row.score_state : null,
    user_max_heart_rate: typeof row.user_max_heart_rate === 'number' ? row.user_max_heart_rate : null,
    score: score
      ? {
          strain: score.strain ?? null,
          average_heart_rate: score.average_heart_rate ?? null,
          max_heart_rate: score.max_heart_rate ?? null,
          zone_durations: zones,
          heart_rate_samples: score.heart_rate_samples ?? null,
        }
      : null,
  }
}

type AccessResult =
  | { status: 'ok'; accessToken: string }
  | { status: 'missing' }
  | { status: 'error'; error: string }

async function validAccessToken(
  admin: Admin,
  userId: string,
  config: { clientId: string; clientSecret: string },
  force: boolean,
): Promise<AccessResult> {
  const { data, error } = await admin.from('whoop_tokens').select('*').eq('user_id', userId).maybeSingle()
  if (error) return { status: 'error', error: 'token_store' }
  if (!data?.access_token || !data.refresh_token) return { status: 'missing' }

  const expiresAt = Date.parse(String(data.expires_at ?? ''))
  const fresh = Number.isFinite(expiresAt) && expiresAt - Date.now() > REFRESH_SKEW_MS
  if (fresh && !force) return { status: 'ok', accessToken: String(data.access_token) }

  const refreshed = await requestToken({
    grant_type: 'refresh_token',
    refresh_token: String(data.refresh_token),
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: SCOPES,
  })
  if (!refreshed.ok) {
    if (refreshed.invalidGrant) {
      await admin.from('whoop_tokens').delete().eq('user_id', userId)
      return { status: 'missing' }
    }
    if (!fresh) return { status: 'error', error: 'whoop_refresh_failed' }
    return { status: 'ok', accessToken: String(data.access_token) }
  }
  const nextRefresh = refreshed.token.refresh_token || String(data.refresh_token)
  const saved = await saveToken(admin, userId, refreshed.token, nextRefresh)
  if (!saved) return { status: 'error', error: 'token_store' }
  return { status: 'ok', accessToken: refreshed.token.access_token }
}

async function saveToken(admin: Admin, userId: string, token: TokenResponse, refreshToken: string): Promise<boolean> {
  const expiresIn = Number.isFinite(token.expires_in) && token.expires_in > 0 ? token.expires_in : 3600
  const { error } = await admin.from('whoop_tokens').upsert(
    {
      user_id: userId,
      access_token: token.access_token,
      refresh_token: refreshToken,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      scope: token.scope ?? SCOPES,
      token_type: token.token_type || 'bearer',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  return !error
}

async function requestToken(fields: Record<string, string>): Promise<
  { ok: true; token: TokenResponse } | { ok: false; invalidGrant: boolean }
> {
  const response = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': WHOOP_USER_AGENT,
    },
    body: new URLSearchParams(fields),
  })
  if (!response.ok) {
    let invalidGrant = false
    if (response.status === 400 || response.status === 401) {
      const payload = await response.json().catch(() => null)
      const code = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : null
      invalidGrant = code === 'invalid_grant'
    }
    return { ok: false, invalidGrant }
  }
  const payload = await response.json().catch(() => null)
  if (!payload || typeof payload !== 'object') return { ok: false, invalidGrant: false }
  const row = payload as Record<string, unknown>
  if (typeof row.access_token !== 'string' || row.access_token.length < 8) return { ok: false, invalidGrant: false }
  return {
    ok: true,
    token: {
      access_token: row.access_token,
      refresh_token: typeof row.refresh_token === 'string' && row.refresh_token.length > 0 ? row.refresh_token : undefined,
      expires_in: typeof row.expires_in === 'number' ? row.expires_in : 3600,
      token_type: typeof row.token_type === 'string' ? row.token_type : 'bearer',
      scope: typeof row.scope === 'string' ? row.scope : undefined,
    },
  }
}

function whoopHeaders(accessToken: string): Headers {
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${accessToken}`)
  headers.set('User-Agent', WHOOP_USER_AGENT)
  headers.set('Accept', 'application/json')
  return headers
}

function allowedRedirect(uri: string): boolean {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.username || url.password || url.hash || url.search) return false
  const local = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:'
  const pages = url.protocol === 'https:' && url.hostname === 'wickert99.github.io'
  if (pages) return url.pathname === '/fit-friend/whoop-callback.html'
  if (local) return url.pathname === '/whoop-callback.html' || url.pathname === '/fit-friend/whoop-callback.html'
  return false
}

function randomState(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
