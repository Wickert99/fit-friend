import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WorkoutSession } from '../../types.ts'
import { buildProgressSnapshot, defaultProgressDetail, formatProgressDetail, formatWeight } from './progressSnapshot.ts'

function session(): WorkoutSession {
  return {
    id: 's1',
    name: 'Lower',
    dateKey: '2026-10-15',
    status: 'completed',
    startedAt: '2026-10-15T10:00:00.000Z',
    completedAt: '2026-10-15T10:30:00.000Z',
    exercises: [
      {
        exerciseId: 'ex-bsquat',
        setType: 'reps_load',
        sets: [
          { setNumber: 1, reps: 5, loadKg: 100, completed: true },
          { setNumber: 2, reps: 5, loadKg: 80, completed: false },
        ],
      },
    ],
  }
}

describe('progress snapshots', () => {
  it('counts completed sets, volume, duration, and a new PR', () => {
    const snapshot = buildProgressSnapshot(session(), {
      exerciseNames: new Map([['ex-bsquat', 'Back Squat']]),
      previousPrs: [{ exerciseId: 'ex-bsquat', loadKg: 90, reps: 5, dateKey: '2026-10-01' }],
    })
    assert.equal(snapshot.exerciseCount, 1)
    assert.equal(snapshot.completedSets, 1)
    assert.equal(snapshot.totalVolumeKg, 500)
    assert.equal(snapshot.durationSec, 1800)
    assert.equal(snapshot.prHighlights?.[0]?.name, 'Back Squat')
    assert.equal(snapshot.prHighlights?.[0]?.loadKg, 100)
    const detail = defaultProgressDetail(session(), snapshot)
    assert.match(detail, /1 exercise/)
    assert.match(detail, /500 kg vol/)
    const post = { detail, snapshot: { ...snapshot, autoDetail: true } }
    assert.equal(formatProgressDetail(post, 'kg'), detail)
    assert.equal(formatWeight(100, 'kg'), '100 kg')
  })

  it('keeps a hand-written detail', () => {
    const snapshot = buildProgressSnapshot(session(), {})
    assert.equal(formatProgressDetail({ detail: 'Felt heavy', snapshot }, 'kg'), 'Felt heavy')
  })

  it('names an empty free-write session', () => {
    const empty = { ...session(), exercises: [], sessionPad: 'notes' }
    const snapshot = buildProgressSnapshot(empty, {})
    assert.equal(defaultProgressDetail(empty, snapshot), 'Free-write session completed')
  })
})
