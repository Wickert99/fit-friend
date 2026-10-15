import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { repairJson } from './corrupt.ts'
import { clearAllSchedule, createBoard, deleteSession, setLiftMax, upsertExercise } from './actions.ts'
import { runMigrations } from './migrate.ts'
import { emptyState, mergeWithSeed, normalizeState, remapExerciseAliases } from './normalize.ts'
import type { AppState, Exercise, WorkoutSession } from '../types.ts'

describe('migrations', () => {
  it('fills a partial v1 blob and remaps legacy exercise ids at v2', () => {
    const { state, applied } = runMigrations(
      {
        profile: { name: 'Ada' },
        sessions: [{ id: 's1', name: 'Legs', dateKey: '2026-10-01', exercises: [{ exerciseId: 'ex-kb-turkish', sets: [{ reps: 5 }] }] }],
      },
      0,
      { 'ex-kb-turkish': 'ex-turkish' },
    )
    assert.deepEqual(applied, ['core-collections', 'alias-remap-and-catalog'])
    assert.equal(state.profile.name, 'Ada')
    assert.equal(state.weightUnit, 'kg')
    assert.equal(state.sessions[0]?.exercises[0]?.exerciseId, 'ex-turkish')
    assert.equal(state.sessions[0]?.exercises[0]?.sets[0]?.setNumber, 1)
    assert.equal(state.sessions[0]?.exercises[0]?.sets[0]?.completed, false)
    assert.equal(state.planBoards.length, 0)
  })

  it('skips migrations that are already applied', () => {
    const { applied } = runMigrations(emptyState(), 2, {})
    assert.deepEqual(applied, [])
  })

  it('drops a legacy catalog id and keeps a custom copy', () => {
    const base = emptyState()
    const custom = {
      ...exercise('ex-kb-turkish'),
      source: 'custom',
      name: 'My get-up',
    }
    const seeded = {
      ...exercise('ex-kb-turkish'),
      source: 'curated',
    }
    const next = remapExerciseAliases({ ...base, exercises: [custom, seeded] }, { 'ex-kb-turkish': 'ex-turkish' })
    assert.deepEqual(
      next.exercises.map((item) => item.id),
      ['custom-ex-kb-turkish'],
    )
  })
})

describe('seed merge', () => {
  it('keeps logs and custom exercises while refreshing templates', () => {
    const seed = emptyState()
    seed.exercises = [exercise('ex-bsquat')]
    seed.programs = [
      {
        id: 'prog-1',
        name: 'Fresh template',
        description: '',
        theme: 'Strength',
        sports: [],
        weeks: 1,
        isTemplate: true,
        isMine: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        days: [],
      },
    ]
    seed.profile.name = 'Hugh'
    const user = emptyState()
    user.profile.name = 'Ada'
    user.exercises = [{ ...exercise('ex-custom'), source: 'custom' }]
    user.sessions = normalizeState({
      sessions: [{ id: 'logged', name: 'Push', dateKey: '2026-10-02', status: 'completed', exercises: [] }],
    }).sessions
    user.programs = [
      {
        ...seed.programs[0]!,
        name: 'My edited copy',
        isMine: true,
        isTemplate: false,
      },
    ]
    const merged = mergeWithSeed(user, seed, {})
    assert.equal(merged.profile.name, 'Ada')
    assert.equal(merged.sessions[0]?.id, 'logged')
    assert.equal(merged.programs[0]?.name, 'My edited copy')
    assert.ok(merged.exercises.some((item) => item.id === 'ex-custom'))
    assert.ok(merged.exercises.some((item) => item.id === 'ex-bsquat'))
  })
})

describe('actions', () => {
  it('stores a board, a custom exercise, and a lift max', () => {
    let state: AppState = emptyState()
    const created = createBoard(state, 'Pre-season', 'board-1')
    state = created.state
    state = upsertExercise(state, { ...exercise('ex-custom'), source: 'custom', name: 'Sled' })
    state = setLiftMax(state, {
      familyId: 'back_squat',
      name: 'Back Squat',
      kind: 'strength',
      maxKg: 140,
      updatedAt: '2026-10-15T00:00:00.000Z',
    })
    assert.equal(created.id, 'board-1')
    assert.equal(state.activeBoardId, 'board-1')
    assert.equal(state.exercises[0]?.name, 'Sled')
    assert.equal(state.liftMaxes.back_squat?.maxKg, 140)
  })
})

describe('schedule and log maintenance', () => {
  it('rebuilds PRs and the streak when a session is deleted or the schedule is cleared', () => {
    const logged: WorkoutSession = {
      id: 's1',
      name: 'Lower',
      dateKey: '2026-10-15',
      status: 'completed',
      exercises: [
        {
          exerciseId: 'ex-bsquat',
          setType: 'reps_load',
          sets: [{ setNumber: 1, reps: 5, loadKg: 100, completed: true }],
        },
      ],
    }
    const base: AppState = {
      ...emptyState(),
      sessions: [logged],
      prs: [{ exerciseId: 'ex-bsquat', loadKg: 100, reps: 5, dateKey: '2026-10-15', sessionId: 's1' }],
      commitmentDays: ['2026-10-15'],
      activity: [{ id: 'a1', text: 'done', createdAt: '2026-10-15T18:00:00.000Z', sessionId: 's1' }],
      scheduled: { '2026-10-16': 'day-1' },
      plannedSessions: { '2026-10-16': { id: 'p1', dateKey: '2026-10-16', name: 'Next', exercises: [] } },
      programInstances: [
        {
          id: 'i1',
          programId: 'prog-1',
          startKey: '2026-10-12',
          firstSessionKey: '2026-10-12',
          lastSessionKey: '2026-10-16',
          weeks: 1,
          committedAt: '2026-10-12T00:00:00.000Z',
          source: 'program',
        },
      ],
      profile: { ...emptyState().profile, streak: 3 },
    }
    const when = new Date('2026-10-15T20:00:00')
    const deleted = deleteSession(base, 's1', when)
    assert.equal(deleted.sessions.length, 0)
    assert.equal(deleted.prs.length, 0)
    assert.deepEqual(deleted.commitmentDays, [])
    assert.equal(deleted.activity.length, 0)
    assert.equal(deleted.profile.streak, 0)
    const cleared = clearAllSchedule(base, when)
    assert.deepEqual(cleared.scheduled, {})
    assert.deepEqual(cleared.plannedSessions, {})
    assert.deepEqual(cleared.programInstances, [])
    assert.equal(cleared.sessions.length, 1)
    assert.equal(cleared.prs.length, 1)
    assert.equal(cleared.profile.streak, 1)
  })
})

describe('corrupt json', () => {
  it('closes a truncated object', () => {
    const repaired = repairJson('{"profile":{"name":"Ada"},"sessions":[')
    assert.equal(typeof repaired, 'object')
    assert.equal((repaired as { profile: { name: string } }).profile.name, 'Ada')
  })
})

function exercise(id: string): Exercise {
  return {
    id,
    name: id,
    theme: 'Strength',
    sports: [],
    muscles: [],
    equipment: [],
    description: '',
    cues: [],
    source: 'curated',
    defaultSets: 3,
    defaultReps: '8',
    defaultRestSec: 90,
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    movementPattern: 'squat',
    imageUrls: [],
  }
}
