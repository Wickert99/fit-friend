import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applySetType,
  brzycki,
  defaultsForSetType,
  epley,
  estimate1Rm,
  formatPlateLoad,
  formatPrescription,
  inferSetType,
  logShape,
  parseDistanceM,
  parseDurationSec,
  parseForTimeDistance,
  percentToLoadKg,
  prescriptionIsPerSide,
  resolveSetType,
  roundLoadKg,
  schemesOf,
  unitToKg,
} from './index.ts'

describe('set types', () => {
  it('infers all eight set types from reps text', () => {
    assert.equal(inferSetType(''), 'reps_load')
    assert.equal(inferSetType('8'), 'reps_load')
    assert.equal(inferSetType('AMRAP 10'), 'amrap')
    assert.equal(inferSetType('EMOM 10'), 'emom')
    assert.equal(inferSetType('5k for time'), 'for_time')
    assert.equal(inferSetType('400m TT'), 'for_time')
    assert.equal(inferSetType('45s'), 'time')
    assert.equal(inferSetType('2 min'), 'time')
    assert.equal(inferSetType('40m'), 'distance')
    assert.equal(inferSetType('5 km'), 'distance')
    assert.equal(inferSetType('8/leg'), 'per_leg')
    assert.equal(inferSetType('8/side'), 'each_side')
    assert.equal(inferSetType('10 each arm'), 'each_side')
  })

  it('corrects a stored type when the reps string disagrees', () => {
    assert.equal(resolveSetType('time', 'for time'), 'for_time')
    assert.equal(resolveSetType('time', '1'), 'for_time')
    assert.equal(resolveSetType('time', '1', 30), 'time')
    assert.equal(resolveSetType('each_side', '30s'), 'time')
    assert.equal(resolveSetType('per_leg', '8'), 'per_leg')
  })

  it('parses duration, distance, and per-side flags', () => {
    assert.equal(parseDurationSec('45s'), 45)
    assert.equal(parseDurationSec('2 min'), 120)
    assert.equal(parseDistanceM('1.5 km'), 1500)
    assert.equal(parseDistanceM('40m'), 40)
    assert.equal(parseForTimeDistance('5k'), 5000)
    assert.equal(parseForTimeDistance('8'), 0)
    assert.equal(prescriptionIsPerSide({ setType: 'time', reps: '30s/side' }), true)
    assert.equal(prescriptionIsPerSide({ setType: 'reps_load', reps: '8', perSide: false }), false)
  })

  it('formats every set type and wave chains', () => {
    assert.equal(formatPrescription({ setType: 'reps_load', sets: 3, reps: '8', restSec: 90, targetLoadKg: 100 }, 'kg'), '3 × 8 @ 100 kg')
    assert.equal(formatPrescription({ setType: 'time', sets: 3, reps: '45s', restSec: 45, timeCapSec: 45 }, 'kg'), '3 × 45s')
    assert.equal(formatPrescription({ setType: 'distance', sets: 4, reps: '40m', restSec: 75, distanceM: 40 }, 'kg'), '4 × 40 m')
    assert.equal(formatPrescription({ setType: 'amrap', sets: 1, reps: 'AMRAP', restSec: 0, timeCapSec: 600 }, 'kg'), 'AMRAP 10m')
    assert.equal(formatPrescription({ setType: 'emom', sets: 10, reps: '5', restSec: 0, rounds: 10, emomIntervalSec: 60 }, 'kg'), 'EMOM 10 × 1m · 5')
    assert.equal(formatPrescription({ setType: 'each_side', sets: 3, reps: '8', restSec: 60 }, 'kg'), '3 × 8 / side')
    assert.equal(formatPrescription({ setType: 'per_leg', sets: 3, reps: '8/leg', restSec: 90 }, 'kg'), '3 × 8 / leg')
    assert.equal(formatPrescription({ setType: 'for_time', sets: 1, reps: '5k for time', restSec: 0, distanceM: 5000, timeCapSec: 1800 }, 'kg'), '5 km for time (cap 30m)')
    assert.match(
      formatPrescription({
        setType: 'reps_load',
        sets: 5,
        reps: '5',
        restSec: 120,
        schemes: [
          { sets: 3, reps: '5', restSec: 120, targetPercent1RM: 75 },
          { sets: 2, reps: '3', restSec: 180, targetPercent1RM: 85 },
        ],
      }),
      /3×5 @ 75% → 2×3 @ 85%/,
    )
  })

  it('seeds defaults and keeps a single scheme for strength types', () => {
    const time = defaultsForSetType('time', { reps: '30s' })
    assert.equal(time.timeCapSec, 30)
    assert.equal(time.restSec, 45)
    const next = applySetType(
      { exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 5, reps: '5', restSec: 180, targetLoadKg: 100 },
      'amrap',
    )
    assert.equal(next.setType, 'amrap')
    assert.equal(next.sets, 1)
    assert.equal(next.reps, 'AMRAP')
    assert.equal(next.schemes, undefined)
    assert.equal(schemesOf({ sets: 4, reps: '6', restSec: 90 })[0]?.sets, 4)
  })

  it('hides load on bodyweight movements and names side reps', () => {
    const body = logShape({ setType: 'reps_load', reps: '8', sets: [] }, { equipment: ['Bodyweight'] })
    assert.equal(body.bodyweight, true)
    assert.deepEqual(body.fields, ['reps'])
    const side = logShape({ setType: 'each_side', reps: '8', targetLoadKg: 20, sets: [] }, { equipment: ['Dumbbell'] })
    assert.equal(side.repsLabel, 'Reps / side')
    assert.deepEqual(side.fields, ['loadKg', 'reps'])
    const timed = logShape({ setType: 'amrap', reps: 'AMRAP', timeCapSec: 600, sets: [] }, null)
    assert.deepEqual(timed.fields, ['rounds', 'reps'])
    assert.equal(timed.repsLabel, 'Extra reps')
  })
})

describe('1RM estimates', () => {
  it('averages Epley and Brzycki and plate-rounds', () => {
    assert.equal(epley(100, 1), 100)
    assert.equal(brzycki(100, 1), 100)
    assert.equal(estimate1Rm(100, 1), 100)
    const estimate = estimate1Rm(100, 5)
    assert.ok(Math.abs(estimate - (100 * (1 + 5 / 30) + 100 * (36 / 32)) / 2) < 1e-9)
    assert.equal(roundLoadKg(estimate, 'kg'), 115)
    assert.equal(formatPlateLoad(estimate, 'kg'), '115 kg')
    assert.equal(percentToLoadKg(80, 100, 'kg'), 80)
    assert.equal(unitToKg(220, 'lb') > 99, true)
  })
})
