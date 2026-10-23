import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hashFor, parseHash, resolveGo } from './router.ts'

const today = '2026-10-15'

describe('hash router', () => {
  it('parses the shell routes', () => {
    assert.deepEqual(parseHash('#/today', today), { screen: 'today' })
    assert.deepEqual(parseHash('#/calendar', today), { screen: 'calendar' })
    assert.deepEqual(parseHash('#/log', today), { screen: 'log' })
    assert.deepEqual(parseHash('#/plan', today), { screen: 'plan', planView: 'board' })
    assert.deepEqual(parseHash('#/plan/muscles', today), { screen: 'plan', planView: 'muscles' })
    assert.deepEqual(parseHash('#/friends?invite=AB3K', today), { screen: 'friends', invite: 'AB3K' })
    assert.deepEqual(parseHash('#/workout/2026-10-15', today), {
      screen: 'workout',
      dateKey: '2026-10-15',
      workoutTab: 'day',
    })
    assert.deepEqual(parseHash('#/library', today).workoutTab, 'library')
    assert.deepEqual(parseHash('#/maxes', today).workoutTab, 'maxes')
    assert.equal(parseHash('#/session/sess%201', today).sessionId, 'sess 1')
    assert.equal(parseHash('#/program/prog-1rm-testing', today).programId, 'prog-1rm-testing')
    assert.equal(parseHash('#/exercise/ex-bsquat', today).exerciseId, 'ex-bsquat')
    assert.equal(parseHash('#/workout-mode', today).screen, 'workout-mode')
    assert.equal(parseHash('', today).screen, 'today')
    assert.deepEqual(parseHash('#/whoop-callback?code=abc&state=def', today), { screen: 'friends' })
  })

  it('round-trips hashes', () => {
    for (const hash of ['#/today', '#/plan', '#/plan/muscles', '#/calendar', '#/log', '#/library', '#/workout-mode', '#/program-builder']) {
      const nav = parseHash(hash, today)
      assert.equal(hashFor(nav, today), hash)
    }
    assert.equal(hashFor(parseHash('#/friends?invite=AB3K', today), today), '#/friends?invite=AB3K')
    assert.equal(parseHash('#/program-builder', today).screen, 'program-builder')
  })

  it('maps train aliases onto the workout screen', () => {
    assert.equal(resolveGo('coach', {}, today).workoutTab, 'coach')
    assert.equal(resolveGo('maxes', {}, today).workoutTab, 'maxes')
    assert.equal(resolveGo('library', { dateKey: '2026-01-02' }, today).dateKey, '2026-01-02')
  })
})
