import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AppState, Exercise, LiftFamily, LiftMax, PlannedSession } from '../../types.ts'
import { emptyState } from '../../store/normalize.ts'
import { estimate1Rm, roundLoadKg } from '../../lib/setTypes/units.ts'
import { displayPointer, finishSession, logSet, sessionExerciseFromPrescription, startFromPlan, summarizeSession, undoSet } from './logic.ts'
import type { TrainingContext } from './logic.ts'

const families: LiftFamily[] = [
  { id: 'back_squat', name: 'Back Squat', primaryExerciseId: 'ex-bsquat', members: ['ex-bsquat'] },
  { id: 'front_squat', name: 'Front Squat', primaryExerciseId: 'ex-fsquat', members: ['ex-fsquat'] },
]

const squat: Exercise = {
  id: 'ex-bsquat',
  name: 'Back squat',
  theme: 'Strength',
  sports: [],
  muscles: ['Quads'],
  equipment: ['Barbell'],
  description: '',
  cues: ['Brace.'],
  source: 'seed',
  defaultSets: 3,
  defaultReps: '5',
  defaultRestSec: 180,
  aliases: [],
  primaryMuscles: ['Quads'],
  secondaryMuscles: [],
  movementPattern: 'squat',
  imageUrls: [],
}

function ctx(maxKg?: number): TrainingContext {
  const liftMaxes: Record<string, LiftMax> = {}
  if (maxKg) {
    liftMaxes.back_squat = {
      familyId: 'back_squat',
      name: 'Back Squat',
      kind: 'strength',
      maxKg,
      estimated: false,
      updatedAt: '2026-10-01T00:00:00.000Z',
    }
  }
  return { exercises: [squat], liftMaxes, weightUnit: 'kg', families }
}

function stateWith(partial: Partial<AppState> = {}): AppState {
  return { ...emptyState(), exercises: [squat], ...partial }
}

describe('session logging', () => {
  it('resolves %1RM onto working sets and walks the pointer', () => {
    const plan: PlannedSession = {
      id: 'plan-1',
      dateKey: '2026-10-15',
      name: 'Squat day',
      exercises: [
        {
          id: 'pe-1',
          exerciseId: 'ex-bsquat',
          setType: 'reps_load',
          sets: 3,
          reps: '5',
          restSec: 120,
          targetPercent1RM: 80,
          schemes: [
            { id: 'w1', sets: 2, reps: '5', restSec: 120, targetPercent1RM: 70 },
            { id: 'w2', sets: 1, reps: '3', restSec: 180, targetPercent1RM: 80 },
          ],
        },
      ],
    }
    const started = startFromPlan(stateWith(), plan, ctx(100))
    assert.equal(started.kind, 'started')
    if (started.kind !== 'started') return
    const block = started.state.sessions[0]?.exercises[0]
    assert.equal(block?.sets.length, 3)
    assert.equal(block?.sets[0]?.loadKg, 70)
    assert.equal(block?.sets[2]?.loadKg, 80)
    assert.equal(block?.sets[2]?.reps, 3)
    assert.equal(block?.coachCue, 'Brace.')
    let session = started.state.sessions[0]!
    assert.deepEqual(displayPointer(session), { exerciseIndex: 0, setIndex: 0 })
    session = logSet(session, { exerciseIndex: 0, setIndex: 0 }, { reps: 5, loadKg: 70 })
    assert.equal(session.sets ? false : session.exercises[0]?.sets[0]?.completed, true)
    assert.deepEqual(displayPointer(session), { exerciseIndex: 0, setIndex: 1 })
    session = undoSet(session, { exerciseIndex: 0, setIndex: 0 })
    assert.equal(session.exercises[0]?.sets[0]?.completed, false)
    assert.deepEqual(session.currentSet, { exerciseIndex: 0, setIndex: 0 })
  })

  it('detects a PR and offers an opt-in 1RM above the stored max', () => {
    const built = sessionExerciseFromPrescription(
      { exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 1, reps: '5', restSec: 120, targetLoadKg: 100 },
      ctx(),
    )
    built.sets = [{ setNumber: 1, reps: 5, loadKg: 100, completed: true }]
    const session = {
      id: 'ses-1',
      name: 'Test',
      dateKey: '2026-10-15',
      status: 'completed' as const,
      exercises: [built],
    }
    const prior = {
      ...session,
      id: 'ses-0',
      dateKey: '2026-10-01',
      exercises: [{ ...built, sets: [{ setNumber: 1, reps: 1, loadKg: 100, completed: true }] }],
    }
    const summary = summarizeSession(session, stateWith({ sessions: [prior, session], liftMaxes: { back_squat: { familyId: 'back_squat', name: 'Back Squat', kind: 'strength', maxKg: 100, estimated: false, updatedAt: '2026-10-01' } } }), ctx())
    assert.equal(summary.prs.length, 1)
    assert.equal(summary.prs[0]?.previous?.reps, 1)
    assert.equal(summary.maxOffers.length, 1)
    assert.equal(summary.maxOffers[0]?.estimateKg, roundLoadKg(estimate1Rm(100, 5), 'kg'))
    assert.equal(summary.maxOffers[0]?.liftName, 'Back Squat')
    assert.equal(summary.maxOffers[0]?.currentKg, 100)
  })

  it('skips the 1RM offer when the estimate does not beat the stored max', () => {
    const built = sessionExerciseFromPrescription(
      { exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 1, reps: '5', restSec: 90, targetLoadKg: 80 },
      ctx(200),
    )
    built.sets = [{ setNumber: 1, reps: 5, loadKg: 80, completed: true }]
    const session = { id: 'ses-2', name: 'Easy', dateKey: '2026-10-15', status: 'in_progress' as const, exercises: [built] }
    const summary = summarizeSession(
      session,
      stateWith({
        sessions: [session],
        liftMaxes: { back_squat: { familyId: 'back_squat', name: 'Back Squat', kind: 'strength', maxKg: 200, estimated: false, updatedAt: '2026-10-01' } },
      }),
      ctx(200),
    )
    assert.equal(summary.maxOffers.length, 0)
    assert.equal(summary.prs[0]?.previous, undefined)
  })

  it('finishes into the log, records the PR, and clears the plan', () => {
    const plan: PlannedSession = {
      id: 'plan-9',
      dateKey: '2026-10-15',
      name: 'Squat day',
      exercises: [{ exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 1, reps: '5', restSec: 90, targetLoadKg: 100 }],
    }
    const started = startFromPlan(stateWith({ plannedSessions: { '2026-10-15': plan }, scheduled: { '2026-10-15': 'day-1' } }), plan, ctx())
    assert.equal(started.kind, 'started')
    if (started.kind !== 'started') return
    let session = started.state.sessions[0]!
    session = logSet(session, { exerciseIndex: 0, setIndex: 0 }, { reps: 5, loadKg: 100 })
    const withLog = { ...started.state, sessions: [session] }
    const done = finishSession(withLog, session.id, true, new Date('2026-10-15T12:00:00'))
    const saved = done.sessions.find((item) => item.id === session.id)
    assert.equal(saved?.status, 'completed')
    assert.equal(saved?.shared, true)
    assert.equal(done.prs[0]?.loadKg, 100)
    assert.equal(done.prs[0]?.reps, 5)
    assert.equal(done.plannedSessions['2026-10-15'], undefined)
    assert.equal(done.commitmentDays.includes('2026-10-15'), true)
    assert.match(done.activity[0]?.text ?? '', /shared from Fit Friend/)
    const conflict = startFromPlan(done, { ...plan, id: 'plan-other' }, ctx(), 'return')
    assert.equal(conflict.kind, 'started')
  })

  it('returns a conflict while another workout is open', () => {
    const plan: PlannedSession = {
      id: 'plan-a',
      dateKey: '2026-10-15',
      name: 'A',
      exercises: [{ exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 1, reps: '5', restSec: 90 }],
    }
    const first = startFromPlan(stateWith(), plan, ctx())
    assert.equal(first.kind, 'started')
    if (first.kind !== 'started') return
    const second = startFromPlan(first.state, { ...plan, id: 'plan-b', name: 'B' }, ctx(), 'return')
    assert.equal(second.kind, 'conflict')
    const replaced = startFromPlan(first.state, { ...plan, id: 'plan-b', name: 'B' }, ctx(), 'replace')
    assert.equal(replaced.kind, 'started')
    if (replaced.kind !== 'started') return
    assert.equal(replaced.state.sessions.filter((session) => session.status === 'in_progress').length, 1)
    assert.equal(replaced.state.sessions[0]?.name, 'B')
  })
})
