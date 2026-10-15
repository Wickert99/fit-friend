import { PENDING_INVITE_KEY, POST_AUTH_NAV_KEY } from '../../store/keys.ts'

export const AUTH_LINK_ERROR_KEY = 'ff-auth-link-error'
const POST_AUTH_MAX_AGE_MS = 86_400_000

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface AuthLinkError {
  error: string
  code?: string | null
  description?: string | null
}

export interface AuthLinkStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function normalizeInviteCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const code = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (code.length < 4 || code.length > 32) return null
  return code
}

export function inviteFromHash(hash: string): string | null {
  const query = hash.indexOf('?')
  if (query < 0) return null
  return normalizeInviteCode(new URLSearchParams(hash.slice(query + 1)).get('invite'))
}

export function rememberPendingInvite(storage: AuthLinkStorage, code: string | null): void {
  const normalized = normalizeInviteCode(code)
  if (!normalized) return
  try {
    storage.setItem(PENDING_INVITE_KEY, normalized)
  } catch {
    /* private mode */
  }
}

export function readPendingInvite(storage: AuthLinkStorage): string | null {
  try {
    return normalizeInviteCode(storage.getItem(PENDING_INVITE_KEY))
  } catch {
    return null
  }
}

export function clearPendingInvite(storage: AuthLinkStorage): void {
  try {
    storage.removeItem(PENDING_INVITE_KEY)
  } catch {
    /* ignore */
  }
}

export function rememberPostAuthNav(storage: AuthLinkStorage, now = Date.now()): void {
  try {
    storage.setItem(POST_AUTH_NAV_KEY, JSON.stringify({ screen: 'friends', at: now }))
  } catch {
    /* ignore */
  }
}

/** Reads and clears the flag. True when the magic-link return is still fresh. */
export function consumePostAuthNav(storage: AuthLinkStorage, now = Date.now()): boolean {
  try {
    const raw = storage.getItem(POST_AUTH_NAV_KEY)
    if (!raw) return false
    storage.removeItem(POST_AUTH_NAV_KEY)
    const parsed = JSON.parse(raw) as { screen?: string; at?: number }
    return parsed.screen === 'friends' && typeof parsed.at === 'number' && now - parsed.at < POST_AUTH_MAX_AGE_MS
  } catch {
    return false
  }
}

export function createInviteCode(bytes = new Uint8Array(8)): string {
  let code = ''
  for (let index = 0; index < bytes.length; index++) {
    code += INVITE_ALPHABET[(bytes[index] ?? 0) % INVITE_ALPHABET.length]
  }
  return code
}

export function randomInviteCode(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return createInviteCode(bytes)
}

export function authLinkMessage(error: AuthLinkError): string {
  const description = error.description ?? ''
  if (error.code === 'otp_expired' || /expired/i.test(description)) {
    return 'That sign-in link has expired or was already used. Links work once and expire after a short time.'
  }
  if (error.code === 'otp_disabled' || error.code === 'signup_disabled') {
    return 'Sign-in by email link is turned off right now.'
  }
  if (error.error === 'access_denied' || /invalid/i.test(description)) {
    return "That sign-in link isn't valid. It may have been copied incompletely or replaced by a newer link."
  }
  if (description) return `Sign-in failed: ${description}`
  return "That sign-in link didn't work."
}

function readParam(hashParams: URLSearchParams, searchParams: URLSearchParams, name: string): string | null {
  return hashParams.get(name) ?? searchParams.get(name)
}

/**
 * Stash a magic-link error and send the hash to #/friends.
 * A successful link (access_token + type) only remembers the post-auth screen.
 * Returns true when it rewrote the URL.
 */
export function captureAuthLinkError(win: Window & typeof globalThis = window): boolean {
  try {
    const { hash, search } = win.location
    const hashParams = new URLSearchParams(hash.replace(/^#\/?[^?=&]*\?/, '').replace(/^#/, ''))
    const searchParams = new URLSearchParams(search)
    const error = readParam(hashParams, searchParams, 'error')
    const code = readParam(hashParams, searchParams, 'error_code')
    const description = readParam(hashParams, searchParams, 'error_description')
    if (error || code || description) {
      const payload: AuthLinkError = { error: error ?? 'error', code, description }
      win.sessionStorage.setItem(AUTH_LINK_ERROR_KEY, JSON.stringify(payload))
      win.history.replaceState(null, '', `${win.location.pathname}#/friends`)
      return true
    }
    if (/(^#|&)access_token=/.test(hash) && /(^#|&)type=(magiclink|signup|invite|email)\b/.test(hash)) {
      rememberPostAuthNav(win.localStorage)
    }
  } catch {
    /* ignore */
  }
  return false
}

export function readAuthLinkError(storage: AuthLinkStorage): AuthLinkError | null {
  try {
    const raw = storage.getItem(AUTH_LINK_ERROR_KEY)
    return raw ? (JSON.parse(raw) as AuthLinkError) : null
  } catch {
    return null
  }
}

export function clearAuthLinkError(storage: AuthLinkStorage): void {
  try {
    storage.removeItem(AUTH_LINK_ERROR_KEY)
  } catch {
    /* ignore */
  }
}
