import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { memoryStorage } from '../../store/storage.ts'
import {
  authEmailRedirectUrl,
  authLinkMessage,
  captureAuthLinkError,
  clearPendingInvite,
  consumePostAuthNav,
  createInviteCode,
  friendInviteShare,
  inviteCodeToAccept,
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

  it('remembers an invite opened while signed out and still has it to accept after sign-in', () => {
    const storage = memoryStorage()
    const opened = inviteCodeToAccept('#/friends?invite=zz9q', storage)
    assert.equal(opened, 'ZZ9Q')
    assert.equal(readPendingInvite(storage), 'ZZ9Q')

    // The screen strips ?invite= from the hash. A reload must keep the saved code.
    assert.equal(inviteCodeToAccept('#/friends', storage), 'ZZ9Q')

    // Magic-link return lands on the app and must not drop the pending invite.
    let replaced: string | null = null
    const win = {
      location: {
        hash: '#access_token=tok&type=magiclink',
        search: '',
        pathname: '/fit-friend/',
      },
      sessionStorage: storage,
      localStorage: storage,
      history: {
        replaceState: (_state: unknown, _title: string, url?: string | URL | null) => {
          replaced = url == null ? null : String(url)
        },
      },
    }
    assert.equal(captureAuthLinkError(win as unknown as Window & typeof globalThis), false)
    assert.equal(replaced, null)
    assert.equal(consumePostAuthNav(storage), true)
    assert.equal(readPendingInvite(storage), 'ZZ9Q')
    assert.equal(inviteCodeToAccept('#/friends', storage), 'ZZ9Q')

    clearPendingInvite(storage)
    assert.equal(readPendingInvite(storage), null)
    assert.equal(inviteCodeToAccept('#/friends', storage), '')
  })

  it('builds share links on the GitHub Pages base, not the bare host', () => {
    const origin = 'https://wickert99.github.io'
    const base = '/fit-friend/'
    const code = 'AB3K9Q2M'
    const share = friendInviteShare(origin, base, code)
    assert.ok(share)
    assert.equal(share.appUrl, `${origin}${base}`)
    assert.equal(share.appUrl, 'https://wickert99.github.io/fit-friend/')
    assert.equal(share.url, share.appUrl)
    assert.equal(share.inviteLink, `${origin}${base}#/friends?invite=${code}`)
    assert.equal(share.text, `Join me on Fit Friend\nApp: ${share.appUrl}\nInvite: ${share.inviteLink}\nCode: ${code}`)
    assert.equal(friendInviteShare('http://127.0.0.1:41731', '/', 'AB3K')?.appUrl, 'http://127.0.0.1:41731/')
    assert.equal(friendInviteShare('http://127.0.0.1:41731', '/', 'AB3K')?.inviteLink, 'http://127.0.0.1:41731/#/friends?invite=AB3K')
    assert.equal(friendInviteShare('', '/fit-friend/', 'AB3K'), null)
  })

  it('sends auth email back to origin plus the app base', () => {
    const pages = authEmailRedirectUrl('https://wickert99.github.io', '/fit-friend/')
    assert.equal(pages, 'https://wickert99.github.io' + '/fit-friend/')
    assert.equal(pages, 'https://wickert99.github.io/fit-friend/')
    assert.equal(authEmailRedirectUrl('http://127.0.0.1:41731', '/'), 'http://127.0.0.1:41731/')
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

  it('keeps the Pages path when an auth error returns to friends', () => {
    let nextUrl = ''
    const storage = memoryStorage()
    rememberPendingInvite(storage, 'AB3K')
    const win = {
      location: {
        hash: '#error=access_denied&error_code=otp_expired&error_description=expired',
        search: '',
        pathname: '/fit-friend/',
      },
      sessionStorage: storage,
      localStorage: storage,
      history: {
        replaceState: (_state: unknown, _title: string, url?: string | URL | null) => {
          nextUrl = url == null ? '' : String(url)
        },
      },
    }
    assert.equal(captureAuthLinkError(win as unknown as Window & typeof globalThis), true)
    assert.equal(nextUrl, '/fit-friend/#/friends')
    assert.equal(readPendingInvite(storage), 'AB3K')
  })
})
