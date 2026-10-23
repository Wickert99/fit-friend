import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { memoryStorage } from '../../store/storage.ts'
import {
  authLinkMessage,
  captureAuthLinkError,
  consumePostAuthNav,
  createInviteCode,
  inviteFromHash,
  normalizeInviteCode,
  readPendingInvite,
  rememberPendingInvite,
  rememberPostAuthNav,
} from './authLink.ts'

describe('auth links and invite codes', () => {
  it('normalizes invite codes from the hash', () => {
    assert.equal(normalizeInviteCode(' ab-3k '), 'AB3K')
    assert.equal(normalizeInviteCode('abc'), null)
    assert.equal(normalizeInviteCode('x'.repeat(33)), null)
    assert.equal(inviteFromHash('#/friends?invite=zz9q'), 'ZZ9Q')
    assert.equal(inviteFromHash('#/today'), null)
  })

  it('keeps a pending invite and a 24h post-auth return', () => {
    const storage = memoryStorage()
    rememberPendingInvite(storage, 'invite-code')
    assert.equal(readPendingInvite(storage), 'INVITECODE')
    const now = 1_000_000
    rememberPostAuthNav(storage, now)
    assert.equal(consumePostAuthNav(storage, now + 1000), true)
    assert.equal(consumePostAuthNav(storage, now + 1000), false)
    rememberPostAuthNav(storage, now)
    assert.equal(consumePostAuthNav(storage, now + 86_400_000), false)
  })

  it('uses the invite alphabet and explains magic-link errors', () => {
    const code = createInviteCode(Uint8Array.from([0, 31, 32, 10, 1, 2, 3, 4]))
    assert.equal(code.length, 8)
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/)
    assert.match(authLinkMessage({ error: 'access_denied', code: 'otp_expired' }), /expired/)
    assert.match(authLinkMessage({ error: 'access_denied', code: 'otp_disabled' }), /turned off/)
    assert.match(authLinkMessage({ error: 'access_denied', description: 'invalid grant' }), /isn't valid/)
    assert.match(authLinkMessage({ error: 'server_error', description: 'mailbox full' }), /mailbox full/)
  })

  it('leaves a Whoop callback in the hash for the app to exchange', () => {
    let replaced = false
    const storage = new Map<string, string>()
    const win = {
      location: {
        hash: '#/whoop-callback?error=access_denied&state=abc',
        search: '',
        pathname: '/fit-friend/',
      },
      sessionStorage: {
        setItem: (key: string, value: string) => storage.set(key, value),
        getItem: (key: string) => storage.get(key) ?? null,
      },
      localStorage: {
        setItem: () => {},
        getItem: () => null,
      },
      history: {
        replaceState: () => {
          replaced = true
        },
      },
    }
    assert.equal(captureAuthLinkError(win as unknown as Window & typeof globalThis), false)
    assert.equal(replaced, false)
    assert.equal(storage.size, 0)
  })
})
