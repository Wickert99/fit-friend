import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { HrIntervalMark, WorkoutSession } from '../../types.ts'
import { emptyState, normalizeState } from '../../store/normalize.ts'
import { applyChanges, integrateRemote, recordKey, recordsForSync } from '../../lib/sync/records.ts'
import { pauseSession } from '../session/logic.ts'
import { bluetoothHeartRateSupported, parseHeartRateMeasurement } from './bluetooth.ts'
import {
  applyIntervalProgress,
  BRISTOL_INTERVAL,
  buildPhases,
  clampRounds,
  formatClock,
  formatZone,
  markInRange,
  matchHrInterval,
  maxHrCaption,
  patchProfileHr,
  phaseView,
  recommendedRounds,
  resolveMaxHr,
  resultCopy,
  sessionLengthSec,
  pinVisibleRemaining,
  startInterval,
  structureLine,
  tanakaMaxHr,
  thawHrInterval,
  tickInterval,
  type HrIntervalProgram,
} from './engine.ts'

const short: HrIntervalProgram = {
  id: 'prog-short',
  title: 'Short',
  programIds: ['prog-short'],
  namePattern: /short intervals/i,
  warmupSec: 10,
  warmupRestSec: 0,
  workSec: 10,
  restSec: 10,
  lowPct: 70,
  highPct: 80,
  defaultRounds: 2,
  minRounds: 1,
  maxRounds: 4,
  warmupDetail: 'Easy',
  workDetail: 'Hold',
  restDetail: 'Spin easy',
  warmupExerciseId: 'ex-airbike-steady',
  workExerciseId: 'ex-biker',
}

function session(rounds = 6, overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 's1',
    name: 'Bristol Method',
    programId: 'prog-bristol-method',
    dateKey: '2026-10-23',
    status: 'in_progress',
    exercises: [
      {
        exerciseId: 'ex-airbike-steady',
        setType: 'time',
        sets: [{ setNumber: 1, reps: 0, loadKg: 0, completed: false, durationSec: 240 }],
      },
      {
        exerciseId: 'ex-biker',
        setType: 'time',
        sets: Array.from({ length: rounds }, (_, index) => ({
          setNumber: index + 1,
          reps: 0,
          loadKg: 0,
          completed: false,
          durationSec: 240,
          restSec: 60,
        })),
      },
    ],
    ...overrides,
  }
}

function yesMarks(rounds: number): HrIntervalMark[] {
  return Array.from({ length: rounds }, (_, index) => ({ round: index + 1, inRange: true }))
}

describe('heart-rate interval engine', () => {
  it('builds the Bristol Method as a warm-up, an off-bike minute, then work and rest rounds', () => {
    const phases = buildPhases(BRISTOL_INTERVAL, 6, '150 to 159 bpm')
    assert.equal(phases.length, 14)
    assert.equal(phases[0]?.title, 'Warm-up')
    assert.equal(phases[0]?.seconds, 240)
    assert.equal(phases[0]?.speak, 'Warm-up. Easy for 4 minutes.')
    assert.equal(phases[1]?.title, 'Rest')
    assert.equal(phases[1]?.seconds, 60)
    assert.equal(phases[1]?.speak, 'Rest. Off the bike.')
    assert.equal(phases[2]?.title, 'Work round 1 of 6')
    assert.equal(phases[2]?.seconds, 240)
    assert.equal(phases[2]?.speak, 'Work. Round 1 of 6. 150 to 159 bpm.')
    assert.equal(phases[3]?.title, 'Rest')
    assert.equal(phases[13]?.title, 'Rest')
    assert.equal(phases[12]?.title, 'Work round 6 of 6')
    assert.equal(sessionLengthSec(BRISTOL_INTERVAL, 6), 35 * 60)
    assert.equal(formatClock(sessionLengthSec(BRISTOL_INTERVAL, 6)), '35:00')
    assert.equal(structureLine(BRISTOL_INTERVAL, 6), '4:00 easy, 1:00 off, then 6 \u00d7 4:00 work and 1:00 off')
    assert.equal(clampRounds(BRISTOL_INTERVAL, 20), 12)
    assert.equal(clampRounds(BRISTOL_INTERVAL, 0), 1)
  })

  it('reuses the same phase builder for a different percent band and no rest after warm-up', () => {
    const phases = buildPhases(short, 2, '120 to 140 bpm')
    assert.deepEqual(
      phases.map((phase) => phase.kind),
      ['warmup', 'work', 'rest', 'work', 'rest'],
    )
    assert.equal(phases[1]?.title, 'Work round 1 of 2')
    assert.equal(phases[1]?.speak, 'Work. Round 1 of 2. 120 to 140 bpm.')
    assert.equal(formatZone(180, 70, 80), '70\u201380% = 126\u2013144 bpm')
    assert.equal(matchHrInterval({ programId: 'prog-short' }), null)
    assert.equal(matchHrInterval({ name: 'Saturday Bristol Method' })?.id, BRISTOL_INTERVAL.id)
    assert.equal(matchHrInterval({ name: 'Morning Bristol' }), null)
    assert.equal(matchHrInterval({ programId: 'prog-bristol-method' })?.id, 'prog-bristol-method')
  })

  it('resolves max heart rate from a manual value, then Whoop, then 208 − 0.7 × age', () => {
    assert.equal(tanakaMaxHr(30), 187)
    assert.equal(tanakaMaxHr(40), 180)
    assert.equal(tanakaMaxHr(35), 184)
    assert.equal(formatZone(187, 80, 85), '80\u201385% = 150\u2013159 bpm')
    const manual = resolveMaxHr({ manual: 190, whoop: 180, age: 40 })
    assert.equal(manual.bpm, 190)
    assert.equal(manual.source, 'manual')
    const whoop = resolveMaxHr({ whoop: 184, age: 40, manual: 50 })
    assert.equal(whoop.bpm, 184)
    assert.equal(whoop.source, 'whoop')
    const aged = resolveMaxHr({ age: 40 })
    assert.equal(aged.bpm, 180)
    assert.equal(aged.assumedAge, false)
    assert.match(maxHrCaption(aged), /208 \u2212 0\.7 \u00d7 age 40/)
    const fallback = resolveMaxHr({})
    assert.equal(fallback.bpm, 187)
    assert.equal(fallback.assumedAge, true)
    assert.equal(fallback.ageUsed, 30)
    assert.match(maxHrCaption(fallback), /age 30/)
  })

  it('keeps age and max heart rate on the profile and in settings user records', () => {
    const profile = patchProfileHr(
      { ...emptyState().profile, age: 30, maxHeartRate: 190, whoopMaxHeartRate: 184 },
      { age: null },
    )
    assert.equal(profile.age, undefined)
    assert.equal(profile.maxHeartRate, 190)
    const normalized = normalizeState({
      profile: { name: 'Ada', age: '40', maxHeartRate: 180, whoopMaxHeartRate: 50 },
    })
    assert.equal(normalized.profile.name, 'Ada')
    assert.equal(normalized.profile.age, 40)
    assert.equal(normalized.profile.maxHeartRate, 180)
    assert.equal(normalized.profile.whoopMaxHeartRate, undefined)
    const state = emptyState()
    state.profile = { ...state.profile, age: 40, maxHeartRate: 180 }
    const records = recordsForSync(state)
    assert.deepEqual(records.get(recordKey('settings', 'profile.age'))?.data, { v: 40 })
    assert.deepEqual(records.get(recordKey('settings', 'profile.maxHeartRate'))?.data, { v: 180 })
    const remote = integrateRemote(
      [
        {
          kind: 'settings',
          id: 'profile.age',
          data: { v: 36 },
          updated_at: '2026-10-23T00:00:00.000Z',
          deleted_at: null,
          rev: 2,
        },
      ],
      {},
      {},
    )
    const applied = normalizeState(applyChanges(emptyState(), remote.apply))
    assert.equal(applied.profile.age, 36)
  })

  it('shows the target, the next phase, and the in-range prompt on the clock', () => {
    const started = startInterval(session(), BRISTOL_INTERVAL, 6, resolveMaxHr({ age: 30 }), 1_000_000)
    const hr = started.hrInterval
    assert.ok(hr)
    const resting = { ...hr, phaseIndex: 3, endsAt: 2_000_000 }
    const view = phaseView(BRISTOL_INTERVAL, resting, 2_000_000 - 30_000)
    assert.equal(view.title, 'Rest')
    assert.equal(view.clock, '0:30')
    assert.equal(view.zone, '80\u201385% = 150\u2013159 bpm')
    assert.equal(view.next, 'Next: Work round 2 of 6 \u00b7 4:00')
    assert.equal(view.promptRound, 1)
    const answered = phaseView(BRISTOL_INTERVAL, markInRange(resting, 1, true), 2_000_000 - 30_000)
    assert.equal(answered.promptRound, null)
    const work = phaseView(BRISTOL_INTERVAL, { ...hr, phaseIndex: 2, endsAt: 2_000_000 }, 2_000_000 - 10_000)
    assert.equal(work.title, 'Work round 1 of 6')
    assert.equal(work.warning, true)
    assert.equal(work.promptRound, null)
    assert.match(work.next, /Rest/)
  })

  it('warns once at 10 seconds, catches up phases, and finishes on the clock', () => {
    const started = startInterval(session(1), BRISTOL_INTERVAL, 1, resolveMaxHr({ age: 30 }), 5_000_000)
    const hr = started.hrInterval
    assert.ok(hr)
    const quiet = tickInterval(hr, BRISTOL_INTERVAL, 5_000_000 + 1_000)
    assert.equal(quiet.state, hr)
    assert.deepEqual(quiet.cues, [])
    const warnAt = { ...hr, endsAt: 8_000_000 + 10_000, phaseIndex: 2 }
    const warned = tickInterval(warnAt, BRISTOL_INTERVAL, 8_000_000)
    assert.equal(warned.cues[0]?.kind, 'warn')
    assert.equal(warned.cues[0]?.speak, '10 seconds.')
    assert.equal(warned.state.warned, true)
    const again = tickInterval(warned.state, BRISTOL_INTERVAL, 8_000_000 + 400)
    assert.equal(again.state, warned.state)
    assert.deepEqual(again.cues, [])

    const jumped = tickInterval({ ...hr, endsAt: 5_000_000 }, BRISTOL_INTERVAL, 5_000_000 + 65_000)
    assert.equal(jumped.state.phaseIndex, 2)
    assert.equal(jumped.cues[0]?.kind, 'phase')
    assert.match(jumped.cues[0]?.speak ?? '', /Round 1 of 1/)

    const finished = tickInterval({ ...hr, endsAt: 5_000_000 }, BRISTOL_INTERVAL, 5_000_000 + 60 * 60 * 1000)
    assert.equal(finished.state.run, 'done')
    assert.equal(finished.cues[0]?.kind, 'done')
    assert.equal(finished.state.endsAt, undefined)
    const doneView = phaseView(BRISTOL_INTERVAL, finished.state, 5_000_000)
    assert.equal(doneView.title, 'Done')
    assert.equal(doneView.progress, 1)
  })

  it('resizes work rounds and marks sets as phases complete', () => {
    const started = startInterval(session(6), BRISTOL_INTERVAL, 8, resolveMaxHr({ age: 30 }), 1_000)
    assert.equal(started.exercises[1]?.sets.length, 8)
    const fewer = startInterval(session(6), BRISTOL_INTERVAL, 4, resolveMaxHr({ age: 30 }), 1_000)
    assert.equal(fewer.exercises[1]?.sets.length, 4)
    const hr = fewer.hrInterval
    assert.ok(hr)
    const afterFirstWork = applyIntervalProgress(fewer, BRISTOL_INTERVAL, { ...hr, phaseIndex: 3 }, 2_000)
    assert.equal(afterFirstWork.exercises[0]?.sets[0]?.completed, true)
    assert.equal(afterFirstWork.exercises[1]?.sets[0]?.completed, true)
    assert.equal(afterFirstWork.exercises[1]?.sets[1]?.completed, false)
    const done = tickInterval({ ...hr, endsAt: 1_000 }, BRISTOL_INTERVAL, 1_000 + 60 * 60 * 1000)
    const logged = applyIntervalProgress(fewer, BRISTOL_INTERVAL, done.state, 9_000)
    assert.equal(logged.exercises[1]?.sets.every((set) => set.completed), true)
  })

  it('adds a round only when every work round stayed in range, and caps at 12', () => {
    assert.equal(resultCopy(6, yesMarks(6), BRISTOL_INTERVAL).nextRounds, 7)
    assert.match(resultCopy(6, yesMarks(6), BRISTOL_INTERVAL).detail, /Next time, try 7/)
    assert.equal(resultCopy(6, [{ round: 1, inRange: false }], BRISTOL_INTERVAL).nextRounds, 6)
    assert.equal(resultCopy(6, yesMarks(5), BRISTOL_INTERVAL).nextRounds, 6)
    assert.equal(resultCopy(12, yesMarks(12), BRISTOL_INTERVAL).nextRounds, 12)
    assert.match(resultCopy(12, yesMarks(12), BRISTOL_INTERVAL).detail, /top of this build/)
    const history = [
      {
        id: 'am',
        status: 'completed',
        programId: 'prog-bristol-method',
        name: 'Bristol Method',
        completedAt: '2026-10-23T09:00:00.000Z',
        hrInterval: {
          programId: 'prog-bristol-method',
          rounds: 6,
          lowPct: 80,
          highPct: 85,
          phaseIndex: 14,
          run: 'done' as const,
          marks: yesMarks(6),
        },
      },
      {
        id: 'pm',
        status: 'completed',
        programId: 'prog-bristol-method',
        name: 'Bristol Method',
        completedAt: '2026-10-23T18:00:00.000Z',
        hrInterval: {
          programId: 'prog-bristol-method',
          rounds: 7,
          lowPct: 80,
          highPct: 85,
          phaseIndex: 16,
          run: 'done' as const,
          marks: [{ round: 2, inRange: false }],
        },
      },
    ]
    assert.equal(recommendedRounds([history[0]!], BRISTOL_INTERVAL, 'next').rounds, 7)
    assert.match(recommendedRounds([history[0]!], BRISTOL_INTERVAL, 'next').detail ?? '', /starts at 7/)
    assert.equal(recommendedRounds(history, BRISTOL_INTERVAL, 'next').rounds, 7)
    assert.equal(recommendedRounds([], BRISTOL_INTERVAL).rounds, 6)
    const open = recommendedRounds(
      [{ ...history[0]!, id: 'open', status: 'in_progress', completedAt: '2026-10-23T20:00:00.000Z' }],
      BRISTOL_INTERVAL,
    )
    assert.equal(open.rounds, 6)
  })

  it('freezes the clock on pause and keeps two same-day workouts as separate records', () => {
    const started = startInterval(session(), BRISTOL_INTERVAL, 6, resolveMaxHr({ age: 30 }), 1_000_000)
    const hr = started.hrInterval
    assert.ok(hr)
    const state = emptyState()
    state.sessions = [{ ...started, hrInterval: { ...hr, endsAt: 1_000_000 + 90_000, phaseIndex: 2, marks: [{ round: 1, inRange: true }] } }]
    const paused = pauseSession(state, started.id, (item) => item, new Date(1_000_000))
    const frozen = paused.sessions[0]?.hrInterval
    assert.equal(paused.sessions[0]?.status, 'paused')
    assert.equal(frozen?.remainingSec, 90)
    assert.equal(frozen?.endsAt, undefined)
    assert.equal(frozen?.marks[0]?.inRange, true)
    const thawed = thawHrInterval(frozen!, 2_000_000)
    assert.equal(thawed.endsAt, 2_090_000)
    assert.equal(thawed.remainingSec, undefined)

    const shown = pinVisibleRemaining({ ...hr, endsAt: 1_000_000 + 90_000 }, 191)
    assert.equal(shown.remainingSec, 191)
    assert.equal(shown.endsAt, undefined)
    const stale = emptyState()
    stale.sessions = [{ ...started, hrInterval: shown }]
    const kept = pauseSession(stale, started.id, (item) => item, new Date(1_000_000 + 50_000))
    assert.equal(kept.sessions[0]?.hrInterval?.remainingSec, 191)
    assert.equal(thawHrInterval(kept.sessions[0]!.hrInterval!, 5_000_000).endsAt, 5_191_000)
    assert.equal(pinVisibleRemaining({ ...shown, run: 'done' }, 10).run, 'done')

    const second = startInterval(session(6, { id: 's2', name: 'Bristol Method' }), BRISTOL_INTERVAL, 7, resolveMaxHr({ age: 30 }), 3_000_000)
    const saved = emptyState()
    saved.sessions = [
      { ...started, status: 'completed', completedAt: '2026-10-23T09:00:00.000Z' },
      { ...second, status: 'paused', pausedAt: '2026-10-23T18:10:00.000Z' },
    ]
    const records = recordsForSync(saved)
    const morning = records.get(recordKey('session', 's1'))?.data as WorkoutSession
    const evening = records.get(recordKey('session', 's2'))?.data as WorkoutSession
    assert.equal(morning.hrInterval?.rounds, 6)
    assert.equal(evening.hrInterval?.rounds, 7)
    assert.equal(morning.dateKey, evening.dateKey)
    assert.notEqual(morning.id, evening.id)
    const normalized = normalizeState({ sessions: [morning, evening] })
    assert.equal(normalized.sessions.find((item) => item.id === 's2')?.hrInterval?.rounds, 7)
    assert.equal(normalized.sessions.find((item) => item.id === 's2')?.status, 'paused')
  })

  it('parses Bluetooth heart-rate measurements and hides the control when the API is missing', () => {
    assert.equal(bluetoothHeartRateSupported(undefined), false)
    assert.equal(bluetoothHeartRateSupported({}), false)
    assert.equal(bluetoothHeartRateSupported({ bluetooth: { requestDevice() {} } }), true)
    assert.equal(parseHeartRateMeasurement(new DataView(new Uint8Array([0x00, 72]).buffer)), 72)
    assert.equal(parseHeartRateMeasurement(new DataView(new Uint8Array([0x08, 88]).buffer)), 88)
    assert.equal(parseHeartRateMeasurement(new DataView(new Uint8Array([0x01, 0xb4, 0x00]).buffer)), 180)
    assert.equal(parseHeartRateMeasurement(new DataView(new Uint8Array([0x00]).buffer)), null)
    assert.equal(parseHeartRateMeasurement(new DataView(new Uint8Array([0x00, 0]).buffer)), null)
  })
})
