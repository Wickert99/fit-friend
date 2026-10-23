import { appBase } from '../../lib/base.ts'
import { isSupabaseConfigured, loadSupabase } from '../../lib/supabase/client.ts'
import {
  describeHeartRate,
  matchWhoopWorkout,
  normalizeWhoopWorkouts,
  sessionWindow,
  whoopCallbackMessage,
  whoopRedirectUri,
  writeWhoopNotice,
  WHOOP_NOTICE_EVENT,
  type HeartRateView,
  type SessionHeartRateInput,
  type WhoopCallback,
  type WhoopWorkout,
} from './model.ts'

export const WHOOP_FUNCTION = 'whoop'

let functionMissing = false

interface InvokeResult {
  data: unknown
  status: number | null
  message: string
}

export async function loadSessionHeartRate(session: SessionHeartRateInput): Promise<HeartRateView> {
  const span = sessionWindow(session)
  if (!span) return describeHeartRate({ phase: 'no_window', session })
  if (!isSupabaseConfigured || functionMissing) return describeHeartRate({ phase: 'unavailable', session })

  const result = await callWhoop({
    action: 'workouts',
    start: new Date(span.startMs).toISOString(),
    end: new Date(span.endMs).toISOString(),
  })
  if (result.reason === 'signed_out') return describeHeartRate({ phase: 'signed_out', session })
  if (result.reason === 'unavailable') return describeHeartRate({ phase: 'unavailable', session })
  if (result.reason === 'error') {
    return describeHeartRate({ phase: 'error', session, errorMessage: friendlyError(result.code) })
  }
  if (!result.connected) return describeHeartRate({ phase: 'disconnected', session })
  const matched = matchWhoopWorkout(span, result.workouts)
  if (!matched) return describeHeartRate({ phase: 'no_match', session })
  return describeHeartRate({ phase: 'matched', session, workout: matched })
}

export async function loadWhoopConnection(): Promise<'connected' | 'disconnected' | 'unavailable' | 'signed_out'> {
  if (!isSupabaseConfigured || functionMissing) return 'unavailable'
  const result = await callWhoop({ action: 'status' })
  if (result.reason === 'signed_out') return 'signed_out'
  if (result.reason === 'unavailable') return 'unavailable'
  if (result.reason !== 'ok') return 'disconnected'
  return result.connected ? 'connected' : 'disconnected'
}

export async function startWhoopOAuth(): Promise<{ url?: string; message?: string }> {
  if (!isSupabaseConfigured || functionMissing) {
    return { message: "Whoop isn't set up on the server yet. The rest of Fit Friend still works." }
  }
  const redirectUri = whoopRedirectUri(window.location.origin, appBase())
  const result = await callWhoop({ action: 'authorize', redirectUri })
  if (result.reason === 'ok' && result.url) return { url: result.url }
  if (result.reason === 'signed_out') return { message: 'Sign in, then tap Connect Whoop again.' }
  if (result.reason === 'unavailable') {
    return { message: "Whoop isn't set up on the server yet. The rest of Fit Friend still works." }
  }
  return { message: "Whoop didn't open. The rest of Fit Friend still works." }
}

export async function disconnectWhoop(): Promise<{ connected: boolean; message?: string }> {
  const result = await callWhoop({ action: 'disconnect' })
  if (result.reason === 'ok' && !result.connected) return { connected: false, message: 'Whoop is disconnected.' }
  if (result.reason === 'unavailable') {
    return { connected: false, message: "Whoop isn't set up on the server yet. The rest of Fit Friend still works." }
  }
  return { connected: true, message: "Whoop didn't disconnect. Try again in a moment." }
}

export async function finishWhoopCallback(callback: WhoopCallback): Promise<void> {
  if (callback.error && !callback.code) {
    publishNotice(whoopCallbackMessage({ error: callback.error, errorDescription: callback.errorDescription }))
    return
  }
  if (!callback.code || !callback.state) {
    publishNotice(whoopCallbackMessage({ error: 'missing' }))
    return
  }
  const result = await callWhoop({ action: 'exchange', code: callback.code, state: callback.state })
  if (result.reason === 'ok' && result.connected) {
    publishNotice(whoopCallbackMessage({ connected: true }))
    return
  }
  const exchangeError =
    result.reason === 'signed_out' ? 'not_signed_in' : result.reason === 'unavailable' ? 'unavailable' : result.reason === 'error' ? result.code : 'error'
  publishNotice(whoopCallbackMessage({ exchangeError, errorDescription: callback.errorDescription }))
}

type WhoopCall =
  | { reason: 'ok'; connected: boolean; workouts: WhoopWorkout[]; url?: string }
  | { reason: 'signed_out' }
  | { reason: 'unavailable' }
  | { reason: 'error'; code: string }

async function callWhoop(body: Record<string, unknown>): Promise<WhoopCall> {
  if (functionMissing) return { reason: 'unavailable' }
  try {
    const supabase = await loadSupabase()
    if (!supabase) return { reason: 'unavailable' }
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) return { reason: 'signed_out' }
    const invoked = await supabase.functions.invoke(WHOOP_FUNCTION, { body })
    const result = await readInvoke(invoked.data, invoked.error)
    return interpret(result)
  } catch {
    return { reason: 'error', code: 'whoop_unavailable' }
  }
}

async function readInvoke(data: unknown, error: unknown): Promise<InvokeResult> {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      let body: unknown = null
      try {
        body = await context.clone().json()
      } catch {
        body = null
      }
      const message = error instanceof Error ? error.message : 'Could not reach Whoop'
      return { data: body ?? data, status: context.status, message }
    }
  }
  return {
    data,
    status: error ? null : 200,
    message: error instanceof Error ? error.message : '',
  }
}

function interpret(result: InvokeResult): WhoopCall {
  const payload = result.data && typeof result.data === 'object' ? (result.data as Record<string, unknown>) : null
  if (result.status === 404 || /requested function was not found/i.test(JSON.stringify(payload ?? result.message))) {
    functionMissing = true
    return { reason: 'unavailable' }
  }
  if (result.status === 401 || payload?.error === 'not_signed_in') return { reason: 'signed_out' }
  if (!payload) {
    if (/failed to send a request/i.test(result.message)) return { reason: 'unavailable' }
    return { reason: 'error', code: 'whoop_unavailable' }
  }
  if (payload.unavailable === true || payload.error === 'whoop_not_configured') return { reason: 'unavailable' }
  if (payload.ok !== true) {
    const code = typeof payload.error === 'string' ? payload.error : 'whoop_unavailable'
    return { reason: 'error', code }
  }
  return {
    reason: 'ok',
    connected: payload.connected === true,
    workouts: normalizeWhoopWorkouts(payload.workouts),
    url: typeof payload.url === 'string' ? payload.url : undefined,
  }
}

function friendlyError(code: string): string {
  if (code === 'whoop_rate_limited') return 'Whoop is busy right now. This workout is saved on this device.'
  if (code === 'window_too_long' || code === 'bad_window') {
    return 'This session is too long to match against Whoop in one look.'
  }
  return "Whoop heart rate didn't load. This workout is saved on this device."
}

function publishNotice(message: string): void {
  if (typeof window === 'undefined') return
  writeWhoopNotice(window.sessionStorage, message)
  window.dispatchEvent(new CustomEvent(WHOOP_NOTICE_EVENT, { detail: message }))
}
