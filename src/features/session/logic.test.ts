import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AppState, Exercise, LiftFamily, LiftMax, PlannedSession } from '../../types.ts'
import { emptyState } from '../../store/normalize.ts'
import { estimate1Rm, roundLoadKg } from '../../lib/setTypes/units.ts'
import { displayPointer, finishSession, freezeTimer, logSet, pauseSession, resumeSession, sessionExerciseFromPrescription, startFromPlan, summarizeSession, thawTimer, undoSet } from './logic.ts'
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
    assert.equal(replaced.state.sessions.some((session) => session.name === 'A'), false)
  })

  it('pauses a workout in place and keeps it out of PRs, streaks, and history until finish', () => {
    const plan: PlannedSession = {
      id: 'plan-a',
      dateKey: '2026-10-15',
      name: 'A',
      exercises: [{ exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 2, reps: '5', restSec: 90, targetLoadKg: 100 }],
    }
    const other: PlannedSession = { ...plan, id: 'plan-b', name: 'B' }
    const started = startFromPlan(stateWith(), plan, ctx(), 'return', new Date('2026-10-15T10:00:00.000Z'))
    assert.equal(started.kind, 'started')
    if (started.kind !== 'started') return
    let session = started.state.sessions[0]!
    session = logSet(session, { exerciseIndex: 0, setIndex: 0 }, { reps: 5, loadKg: 140 })
    const logging = { ...started.state, sessions: [session] }
    const now = new Date('2026-10-15T10:05:00.000Z')
    const paused = pauseSession(
      logging,
      session.id,
      (item) => ({
        ...item,
        timer: { phase: 'rest', endsAt: now.getTime() + 45_000, total: 90 },
        currentSet: { exerciseIndex: 0, setIndex: 1 },
      }),
      now,
    )
    const held = paused.sessions.find((item) => item.id === session.id)
    assert.equal(held?.status, 'paused')
    assert.equal(held?.pausedAt, now.toISOString())
    assert.equal(held?.exercises[0]?.sets[0]?.completed, true)
    assert.equal(held?.exercises[0]?.sets[0]?.loadKg, 140)
    assert.deepEqual(held?.currentSet, { exerciseIndex: 0, setIndex: 1 })
    assert.equal(held?.timer?.phase, 'rest')
    assert.equal(held?.timer?.remainingSec, 45)
    assert.equal(held?.timer?.endsAt, undefined)
    assert.equal(held?.restEndsAt, null)
    assert.equal(paused.prs.length, 0)
    assert.deepEqual(paused.commitmentDays, [])
    assert.equal(paused.profile.streak, 0)
    assert.equal(paused.activity.length, 0)
    const summary = summarizeSession(held!, paused, ctx())
    assert.equal(summary.prs.length, 1)
    const openAgain = resumeSession(paused, session.id)
    const saved = startFromPlan(openAgain, other, ctx(), 'pause', new Date('2026-10-15T11:00:00.000Z'))
    assert.equal(saved.kind, 'started')
    if (saved.kind !== 'started') return
    assert.equal(saved.state.sessions.find((item) => item.name === 'A')?.status, 'paused')
    assert.equal(saved.state.sessions.find((item) => item.name === 'A')?.exercises[0]?.sets[0]?.loadKg, 140)
    assert.equal(saved.state.sessions.find((item) => item.name === 'B')?.status, 'in_progress')
    assert.equal(saved.state.prs.length, 0)
    const resumed = resumeSession(pauseSession(saved.state, saved.sessionId), session.id)
    assert.equal(resumed.sessions.find((item) => item.id === session.id)?.status, 'in_progress')
    assert.equal(resumed.sessions.find((item) => item.id === session.id)?.pausedAt, undefined)
    assert.equal(resumed.sessions.find((item) => item.name === 'B')?.status, 'paused')
    const done = finishSession(resumed, session.id, false, new Date('2026-10-15T12:00:00.000Z'))
    const finished = done.sessions.find((item) => item.id === session.id)
    assert.equal(finished?.status, 'completed')
    assert.equal(finished?.timer, undefined)
    assert.equal(done.prs[0]?.loadKg, 140)
    assert.equal(done.commitmentDays.includes('2026-10-15'), true)
    assert.equal(done.sessions.find((item) => item.name === 'B')?.status, 'paused')
    assert.equal(done.sessions.filter((item) => item.status === 'completed').map((item) => item.id).includes(session.id), true)
  })

  it('freezes a running clock and thaws the same time left', () => {
    const now = 1_700_000_000_000
    const frozen = freezeTimer({ phase: 'rest', endsAt: now + 12_400, total: 90, warned: false }, now)
    assert.equal(frozen?.phase, 'rest')
    assert.equal(frozen?.remainingSec, 13)
    assert.equal(frozen?.endsAt, undefined)
    const thawed = thawTimer(frozen, now + 60_000)
    assert.equal(thawed.phase, 'rest')
    assert.equal(thawed.endsAt, now + 60_000 + 13_000)
    const elapsed = freezeTimer({ phase: 'work', mode: 'up', startedAt: now - 8_000, cap: 0 }, now)
    assert.equal(elapsed?.elapsedSec, 8)
    assert.equal(thawTimer(elapsed, now + 30_000).startedAt, now + 30_000 - 8_000)
  })
})
