import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Prescription, SetScheme } from '../../types.ts'
import { changePrescriptionType, patchPrescription, replaceSchemes } from './prescription.ts'

function base(partial: Partial<Prescription> = {}): Prescription {
  return {
    exerciseId: 'ex-bench',
    setType: 'reps_load',
    sets: 3,
    reps: '5',
    restSec: 180,
    ...partial,
  }
}

describe('prescription editor contract', () => {
  it('switches set type and keeps the exercise id', () => {
    const next = changePrescriptionType(base(), 'emom')
    assert.equal(next.exerciseId, 'ex-bench')
    assert.equal(next.setType, 'emom')
    assert.equal(next.restSec, 0)
    assert.equal(next.rounds, next.sets)
    assert.ok(next.emomIntervalSec)
  })

  it('mirrors percent and rir aliases onto the canonical fields', () => {
    const percent = patchPrescription(base(), { percent1RM: 80, targetLoadKg: undefined })
    assert.equal(percent.targetPercent1RM, 80)
    assert.equal(percent.percent1RM, 80)
    const rir = patchPrescription(base(), { rir: 2 })
    assert.equal(rir.targetRir, 2)
    assert.equal(rir.rir, 2)
  })

  it('keeps a single wave in sync with the compact row', () => {
    const seeded = changePrescriptionType(base({ targetLoadKg: 100 }), 'reps_load')
    const next = patchPrescription(seeded, { sets: 4, reps: '3', targetLoadKg: 110 })
    assert.equal(next.sets, 4)
    assert.equal(next.reps, '3')
    assert.equal(next.schemes?.[0]?.sets, 4)
    assert.equal(next.schemes?.[0]?.reps, '3')
    assert.equal(next.schemes?.[0]?.targetLoadKg, 110)
    assert.deepEqual(next.waves, next.schemes)
  })

  it('edits the first wave when a compact row changes total sets', () => {
    const schemes: SetScheme[] = [
      { id: 'a', sets: 3, reps: '5', restSec: 180, targetLoadKg: 100 },
      { id: 'b', sets: 3, reps: '3', restSec: 180, targetLoadKg: 110 },
    ]
    const seeded = replaceSchemes(base(), schemes)
    const next = patchPrescription(seeded, { sets: 8 })
    assert.equal(next.sets, 8)
    assert.equal(next.schemes?.[0]?.sets, 5)
    assert.equal(next.schemes?.[1]?.sets, 3)
    assert.equal(next.schemes?.[1]?.reps, '3')
  })

  it('clears a percent alias when the row switches back to an absolute load', () => {
    const seeded = patchPrescription(base(), { targetPercent1RM: 70 })
    const next = patchPrescription(seeded, { targetPercent1RM: undefined, targetLoadKg: 80 })
    assert.equal(next.targetPercent1RM, undefined)
    assert.equal(next.percent1RM, undefined)
    assert.equal(next.targetLoadKg, 80)
  })
})
