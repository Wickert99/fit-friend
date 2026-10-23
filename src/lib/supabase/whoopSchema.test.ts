import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const sql = readFileSync(new URL('../../../supabase/migrations/20261023190000_whoop_tokens.sql', import.meta.url), 'utf8')
const fn = readFileSync(new URL('../../../supabase/functions/whoop/index.ts', import.meta.url), 'utf8')
const api = readFileSync(new URL('../../features/whoop/api.ts', import.meta.url), 'utf8')

describe('whoop token migration', () => {
  it('keeps tokens behind service_role and records the grant change', () => {
    assert.match(sql, /create table public\.whoop_tokens\b/)
    assert.match(sql, /create table public\.whoop_oauth_states\b/)
    assert.match(sql, /enable row level security/)
    assert.match(sql, /force row level security/)
    assert.match(sql, /revoke all on table public\.whoop_tokens from anon/)
    assert.match(sql, /revoke all on table public\.whoop_tokens from authenticated/)
    assert.match(sql, /grant select, insert, update, delete on table public\.whoop_tokens to service_role/)
    assert.match(sql, /grant select, insert, update, delete on table public\.whoop_oauth_states to service_role/)
    assert.match(sql, /30 Oct 2026/)
    assert.doesNotMatch(sql, /grant select(?:, insert|, update|, delete)* on table public\.whoop_tokens to anon/)
    assert.doesNotMatch(sql, /grant select(?:, insert|, update|, delete)* on table public\.whoop_tokens to authenticated/)
    assert.doesNotMatch(sql, /create policy/i)
    assert.doesNotMatch(sql, /insert into public\.whoop_tokens/i)
  })
})

describe('whoop edge function secrets', () => {
  it('reads the client secret from the function environment and sets a non-Python user agent', () => {
    assert.match(fn, /Deno\.env\.get\('WHOOP_CLIENT_ID'\)/)
    assert.match(fn, /Deno\.env\.get\('WHOOP_CLIENT_SECRET'\)/)
    assert.match(fn, /FitFriend\/1\.0/)
    assert.match(fn, /read:workout read:recovery read:cycles offline/)
    assert.match(fn, /\/v2\/activity\/workout/)
    assert.doesNotMatch(fn, /WHOOP_CLIENT_SECRET\s*=\s*['"][^'"]+['"]/)
    assert.doesNotMatch(api, /WHOOP_CLIENT_SECRET/)
    assert.doesNotMatch(api, /client_secret/)
  })
})
