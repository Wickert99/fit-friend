import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { recomputePrs } from '../maxes/prs.ts'
import { emptyState, normalizeState } from '../../store/normalize.ts'
import type { AppState, WorkoutSession } from '../../types.ts'
import {
  MAX_RECORD_BYTES,
  adoptLegacyPlanKeys,
  applyChanges,
  backfillClock,
  baselineHashes,
  byteSize,
  contentHash,
  integrateRemote,
  massDelete,
  pushPayloads,
  recordKey,
  recordsForSync,
  stripEmpty,
  syncBaselineState,
  tombstones,
} from './records.ts'

function session(id: string, patch: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id,
    name: 'Squat day',
    dateKey: '2026-10-15',
    status: 'completed',
    exercises: [],
    ...patch,
  }
}

describe('sync records', () => {
  it('hashes stably and ignores empty fields', () => {
    const first = contentHash({ b: 1, a: 'x', c: 0, d: '', e: false, f: [], g: {} })
    const second = contentHash({ a: 'x', b: 1 })
    assert.equal(first, second)
    assert.notEqual(contentHash({ a: 'x', b: 2 }), first)
    assert.notEqual(contentHash([0]), contentHash([]))
    assert.deepEqual(stripEmpty({ a: 0, b: [0] }), { b: [0] })
  })

  it('syncs custom exercises and my programs, not the seed catalog', () => {
    const state = emptyState()
    state.exercises = [
      { ...state.exercises[0], id: 'ex-seed', source: 'library', name: 'Squat' } as AppState['exercises'][number],
      {
        id: 'ex-custom',
        name: 'My lift',
        theme: 'Strength',
        sports: [],
        muscles: [],
        equipment: [],
        description: '',
        cues: [],
        source: 'custom',
        defaultSets: 3,
        defaultReps: '5',
        defaultRestSec: 90,
        aliases: [],
        primaryMuscles: [],
        secondaryMuscles: [],
        movementPattern: '',
        imageUrls: [],
      },
    ]
    state.programs = [
      {
        id: 'prog-template',
        name: 'Template',
        description: '',
        theme: 'Strength',
        sports: [],
        weeks: 1,
        isTemplate: true,
        isMine: false,
        createdAt: '2026-10-01T00:00:00.000Z',
        days: [],
      },
      {
        id: 'prog-mine',
        name: 'Mine',
        description: '',
        theme: 'Strength',
        sports: [],
        weeks: 1,
        isTemplate: false,
        isMine: true,
        createdAt: '2026-10-02T00:00:00.000Z',
        days: [],
        activeInstance: {
          id: 'inst',
          programId: 'prog-mine',
          startKey: '2026-10-01',
          firstSessionKey: '2026-10-01',
          lastSessionKey: '2026-10-02',
          weeks: 1,
          committedAt: '2026-10-01T00:00:00.000Z',
          source: 'plan',
        },
      },
    ]
    state.sessions = [session('s1', { startedAt: '2026-10-15T10:00:00.000Z' })]
    state.weightUnit = 'lb'
    const records = recordsForSync(state)
    assert.equal(records.has(recordKey('exercise', 'ex-custom')), true)
    assert.equal(records.has(recordKey('exercise', 'ex-seed')), false)
    assert.equal(records.has(recordKey('program', 'prog-mine')), true)
    assert.equal(records.has(recordKey('program', 'prog-template')), false)
    assert.equal('activeInstance' in ((records.get(recordKey('program', 'prog-mine'))?.data ?? {}) as object), false)
    assert.equal(records.has(recordKey('session', 's1')), true)
    assert.equal(records.get(recordKey('settings', 'weightUnit'))?.data && true, true)
    assert.ok(baselineHashes().size > 0)
  })

  it('applies a newer remote session and tombstones a deleted one', () => {
    const state = emptyState()
    state.sessions = [session('keep'), session('drop')]
    const remote = integrateRemote(
      [
        {
          kind: 'session',
          id: 'keep',
          data: session('keep', { name: 'From cloud' }),
          updated_at: '2026-10-16T00:00:00.000Z',
          deleted_at: null,
          rev: 4,
        },
        {
          kind: 'session',
          id: 'drop',
          data: {},
          updated_at: '2026-10-16T00:00:00.000Z',
          deleted_at: '2026-10-16T00:00:00.000Z',
          rev: 5,
        },
      ],
      {},
      {},
    )
    const next = applyChanges(state, remote.apply, syncBaselineState())
    assert.equal(next.sessions.find((item) => item.id === 'keep')?.name, 'From cloud')
    assert.equal(next.sessions.some((item) => item.id === 'drop'), false)
    assert.equal(remote.clock[recordKey('session', 'drop')]?.d, 1)
  })

  it('does not push a record the server already has at a newer time', () => {
    const state = emptyState()
    state.sessions = [session('s1')]
    const records = recordsForSync(state)
    const key = recordKey('session', 's1')
    const hash = contentHash(records.get(key)?.data)
    const clock = { [key]: { h: hash, t: '2026-10-01T00:00:00.000Z' } }
    const meta = { [key]: { h: hash, u: '2026-10-02T00:00:00.000Z' } }
    assert.equal(pushPayloads(records, clock, meta).length, 0)
    const ahead = pushPayloads(records, { [key]: { h: hash, t: '2026-10-03T00:00:00.000Z' } }, meta)
    assert.equal(ahead.length, 1)
    assert.equal(ahead[0]?.deleted_at, null)
    assert.equal(ahead[0]?.kind, 'session')
  })

  it('backfills historical timestamps on a first sync and skips oversized pushes', () => {
    const state = emptyState()
    state.sessions = [session('s1', { startedAt: '2026-01-02T03:04:05.000Z' })]
    const records = recordsForSync(state)
    const clock = backfillClock(records, {}, '2026-10-15T00:00:00.000Z', { backfill: true })
    assert.equal(clock[recordKey('session', 's1')]?.t, '2026-01-02T03:04:05.000Z')
    const huge = { kind: 'session', id: 'big', data: { blob: 'x'.repeat(MAX_RECORD_BYTES) }, updated_at: '2026-10-15T00:00:00.000Z', deleted_at: null }
    assert.ok(byteSize(huge.data) > MAX_RECORD_BYTES)
    assert.equal(massDelete(20, 10), true)
    assert.equal(massDelete(1, 100), false)
    const tombs = tombstones([{ kind: 'session', id: 's1', updated_at: '2026-10-01T00:00:00.000Z' }], '2026-10-02T00:00:00.000Z')
    assert.equal(tombs[0]?.deleted_at, tombs[0]?.updated_at)
  })

  it('round-trips a paused session through user_records without treating it as finished', () => {
    const paused = session('s1', {
      status: 'paused',
      pausedAt: '2026-10-16T01:00:00.000Z',
      startedAt: '2026-10-16T00:30:00.000Z',
      currentSet: { exerciseIndex: 0, setIndex: 1 },
      timer: { phase: 'rest', remainingSec: 40, total: 90 },
      restEndsAt: null,
      exercises: [
        {
          exerciseId: 'ex-bsquat',
          setType: 'reps_load',
          sets: [
            { setNumber: 1, reps: 5, loadKg: 100, completed: true },
            { setNumber: 2, reps: 5, loadKg: 100, completed: false },
          ],
        },
      ],
    })
    const state = emptyState()
    state.sessions = [paused]
    const records = recordsForSync(state)
    const data = records.get(recordKey('session', 's1'))?.data as WorkoutSession
    assert.equal(data.status, 'paused')
    assert.equal(data.currentSet?.setIndex, 1)
    assert.equal(data.timer?.remainingSec, 40)
    assert.equal(data.exercises[0]?.sets[0]?.completed, true)
    assert.notEqual(contentHash(data), contentHash({ ...data, status: 'in_progress' }))
    const remote = integrateRemote(
      [
        {
          kind: 'session',
          id: 's1',
          data,
          updated_at: '2026-10-16T01:00:00.000Z',
          deleted_at: null,
          rev: 3,
        },
      ],
      {},
      {},
    )
    const next = applyChanges(emptyState(), remote.apply, syncBaselineState())
    assert.equal(next.sessions[0]?.status, 'paused')
    assert.equal(next.sessions[0]?.exercises[0]?.sets[0]?.loadKg, 100)
    assert.equal(recomputePrs(next.sessions).length, 0)
    const normalized = normalizeState(next)
    assert.equal(normalized.sessions[0]?.status, 'paused')
    assert.equal(normalized.sessions[0]?.timer?.phase, 'rest')
    assert.equal(normalized.sessions[0]?.currentSet?.setIndex, 1)
    const clock = { [recordKey('session', 's1')]: { h: contentHash(data), t: '2026-10-16T01:00:00.000Z' } }
    const pushed = pushPayloads(records, clock, {})
    assert.equal(pushed.length, 1)
    assert.equal(pushed[0]?.deleted_at, null)
    assert.equal((pushed[0]?.data as WorkoutSession).status, 'paused')
  })

  it('syncs two workouts on the same day as separate user_records', () => {
    const state = emptyState()
    state.sessions = [
      session('ses-am', {
        name: 'Morning',
        dateKey: '2026-10-23',
        startedAt: '2026-10-23T08:00:00.000Z',
        completedAt: '2026-10-23T09:00:00.000Z',
      }),
      session('ses-pm', {
        name: 'Evening',
        dateKey: '2026-10-23',
        startedAt: '2026-10-23T18:00:00.000Z',
        completedAt: '2026-10-23T19:00:00.000Z',
      }),
    ]
    state.plannedSessions = {
      'plan-a': { id: 'plan-a', dateKey: '2026-10-24', name: 'A', exercises: [] },
      'plan-b': { id: 'plan-b', dateKey: '2026-10-24', name: 'B', exercises: [] },
    }
    const records = recordsForSync(state)
    assert.equal(records.has(recordKey('session', 'ses-am')), true)
    assert.equal(records.has(recordKey('session', 'ses-pm')), true)
    assert.equal(records.has(recordKey('session', '2026-10-23')), false)
    assert.equal(records.has(recordKey('planned_session', 'plan-a')), true)
    assert.equal(records.has(recordKey('planned_session', 'plan-b')), true)
    assert.equal(records.has(recordKey('planned_session', '2026-10-24')), false)
    const remote = integrateRemote(
      [
        {
          kind: 'session',
          id: 'ses-am',
          data: records.get(recordKey('session', 'ses-am'))?.data,
          updated_at: '2026-10-23T09:00:00.000Z',
          deleted_at: null,
          rev: 1,
        },
        {
          kind: 'session',
          id: 'ses-pm',
          data: records.get(recordKey('session', 'ses-pm'))?.data,
          updated_at: '2026-10-23T19:00:00.000Z',
          deleted_at: null,
          rev: 2,
        },
        {
          kind: 'planned_session',
          id: '2026-10-24',
          data: { id: 'plan-a', dateKey: '2026-10-24', name: 'A', exercises: [] },
          updated_at: '2026-10-24T00:00:00.000Z',
          deleted_at: null,
          rev: 3,
        },
        {
          kind: 'planned_session',
          id: 'plan-b',
          data: { id: 'plan-b', dateKey: '2026-10-24', name: 'B', exercises: [] },
          updated_at: '2026-10-24T01:00:00.000Z',
          deleted_at: null,
          rev: 4,
        },
      ],
      {},
      {},
    )
    const next = applyChanges(emptyState(), remote.apply, syncBaselineState())
    assert.deepEqual(
      next.sessions.map((item) => item.name).sort(),
      ['Evening', 'Morning'],
    )
    assert.equal(next.plannedSessions['plan-a']?.name, 'A')
    assert.equal(next.plannedSessions['plan-b']?.name, 'B')
    assert.equal(next.plannedSessions['2026-10-24'], undefined)
    const adopted = adoptLegacyPlanKeys(
      { [recordKey('planned_session', '2026-10-24')]: { h: 'abc', t: '2026-10-24T00:00:00.000Z' } },
      {},
      { 'plan-a': { id: 'plan-a', dateKey: '2026-10-24', name: 'A', exercises: [] } },
      undefined,
    )
    assert.equal(adopted.changed, true)
    assert.equal(adopted.clock[recordKey('planned_session', 'plan-a')]?.h, 'abc')
    assert.equal(adopted.clock[recordKey('planned_session', '2026-10-24')]?.h, 'abc')
  })
})
