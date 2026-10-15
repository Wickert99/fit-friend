import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const sql = readFileSync(new URL('../../../supabase/migrations/20261015120000_inferred_social_sync.sql', import.meta.url), 'utf8')

describe('inferred supabase migration', () => {
  it('defines the live tables and RPCs and does not target the hosted project', () => {
    for (const name of [
      'profiles',
      'friendships',
      'friend_invites',
      'chat_messages',
      'program_shares',
      'progress_posts',
      'user_records',
      'user_backups',
    ]) {
      assert.match(sql, new RegExp(`create table public\\.${name}\\b`))
    }
    assert.match(sql, /accept_friend_invite\(invite_code text\)/)
    assert.match(sql, /upsert_user_records\(records jsonb\[\]\)/)
    assert.match(sql, /program_snapshot/)
    assert.match(sql, /accepted_by/)
    assert.match(sql, /on conflict \(user_id, session_local_id\)|progress_posts_session_unique/)
    assert.match(sql, /user_id,session_local_id|unique \(user_id, session_local_id\)/)
    assert.match(sql, /enable row level security/)
    assert.match(sql, /do not apply this file to the live project/i)
    assert.doesNotMatch(sql, /insert into public\.profiles/i)
  })
})