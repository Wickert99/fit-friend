import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { LiftMax, Program } from '../../types.ts'
import { importDefaults } from './importDefaults.ts'

const programs = JSON.parse(readFileSync(new URL('../../../data/programs.json', import.meta.url), 'utf8')) as Program[]

describe('program import defaults', () => {
  it('offers a preparation week only when maxes are missing on a trainable block', () => {
    const strength = programs.find((program) => program.id === 'prog-strength-base')
    const testing = programs.find((program) => program.id === 'prog-1rm-testing')
    assert.ok(strength && testing)
    const open = importDefaults(strength, {})
    assert.equal(open.prepWeek, true)
    assert.equal(open.retestWeek, false)
    assert.equal(open.testing, false)
    assert.ok(open.missing.length > 0)
    const squat: LiftMax = {
      familyId: 'back_squat',
      name: 'Back Squat',
      kind: 'strength',
      maxKg: 140,
      updatedAt: '2026-10-15T00:00:00.000Z',
    }
    const withMax = importDefaults(strength, { back_squat: squat })
    assert.ok(withMax.missing.every((lift) => lift.familyId !== 'back_squat'))
    const testBlock = importDefaults(testing, {})
    assert.equal(testBlock.testing, true)
    assert.equal(testBlock.prepWeek, false)
  })
})
