import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AppState, Exercise, WorkoutSession } from '../../types.ts'
import { inferSetType, planQuickStart, sessionExerciseFromLibrary } from './quickSession.ts'

function exercise(partial: Partial<Exercise> & Pick<Exercise, 'id' | 'name' | 'defaultReps'>): Exercise {
  return {
    theme: 'Strength',
    sports: [],
    muscles: [],
    equipment: [],
    description: '',
    cues: ['Brace'],
    source: 'curated',
    defaultSets: 4,
    defaultRestSec: 120,
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    movementPattern: '',
    imageUrls: [],
    ...partial,
  }
}

function state(exercises: Exercise[], sessions: WorkoutSession[] = []): AppState {
  return {
    profile: { id: 'user-you', name: 'A', handle: '@a', avatarColor: '#000', bio: '', streak: 0, isYou: true },
    friends: [],
    exercises,
    programs: [],
    sessions,
    prs: [],
    activity: [],
    activeProgramId: null,
    commitmentDays: [],
    scheduled: {},
    plannedSessions: {},
    scheduleUserOwned: false,
    planBoards: [],
    activeBoardId: null,
    seasonGoals: {},
    liftMaxes: {},
    weightUnit: 'kg',
    programInstances: [],
  }
}

describe('quick session', () => {
  it('infers set type from the default rep string', () => {
    assert.equal(inferSetType('5'), 'reps_load')
    assert.equal(inferSetType('8/side'), 'each_side')
    assert.equal(inferSetType('8/leg'), 'per_leg')
    assert.equal(inferSetType('45s'), 'time')
    assert.equal(inferSetType('500m'), 'distance')
    assert.equal(inferSetType('AMRAP 20'), 'amrap')
    assert.equal(inferSetType('1km TT'), 'for_time')
  })

  it('builds unlogged sets from the library defaults', () => {
    const row = sessionExerciseFromLibrary('ex-bsquat', exercise({ id: 'ex-bsquat', name: 'Back Squat', defaultReps: '5' }))
    assert.equal(row.setType, 'reps_load')
    assert.equal(row.sets.length, 4)
    assert.equal(row.sets[0]?.reps, 5)
    assert.equal(row.sets[0]?.completed, false)
    assert.equal(row.notes, 'Brace')
    assert.equal(row.restSec, 120)
  })

  it('returns a conflict, resumes, or replaces the open session', () => {
    const squat = exercise({ id: 'ex-bsquat', name: 'Back Squat', defaultReps: '5' })
    const open: WorkoutSession = {
      id: 'ses-open',
      name: 'Legs',
      dateKey: '2026-10-15',
      status: 'in_progress',
      exercises: [],
    }
    const base = state([squat], [open])
    const conflict = planQuickStart(base, {
      name: 'Custom · 1 exercise',
      exerciseIds: ['ex-bsquat'],
      mode: 'return',
      sessionId: 'ses-new',
      dateKey: '2026-10-15',
    })
    assert.equal(conflict.kind, 'conflict')
    assert.equal(conflict.next, base)
    const resumed = planQuickStart(base, {
      name: 'Custom · 1 exercise',
      exerciseIds: ['ex-bsquat'],
      mode: 'resume',
      sessionId: 'ses-new',
      dateKey: '2026-10-15',
    })
    assert.equal(resumed.kind, 'resumed')
    assert.equal(resumed.sessionId, 'ses-open')
    const replaced = planQuickStart(base, {
      name: 'Custom · 1 exercise',
      exerciseIds: ['ex-bsquat'],
      mode: 'replace',
      sessionId: 'ses-new',
      dateKey: '2026-10-15',
    })
    assert.equal(replaced.kind, 'started')
    assert.deepEqual(replaced.next.sessions.map((session) => session.id), ['ses-new'])
    assert.equal(replaced.next.sessions[0]?.exercises[0]?.exerciseId, 'ex-bsquat')
    const saved = planQuickStart(base, {
      name: 'Custom · 1 exercise',
      exerciseIds: ['ex-bsquat'],
      mode: 'pause',
      sessionId: 'ses-new',
      dateKey: '2026-10-15',
    })
    assert.equal(saved.kind, 'started')
    assert.equal(saved.next.sessions.find((session) => session.id === 'ses-open')?.status, 'paused')
    assert.equal(saved.next.sessions.find((session) => session.id === 'ses-new')?.status, 'in_progress')
  })
})
