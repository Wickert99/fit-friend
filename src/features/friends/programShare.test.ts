import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Program } from '../../types.ts'
import { materializeSharedProgram, shareSnapshot } from './programShare.ts'

const source: Program = {
  id: 'prog-theirs',
  name: 'Their block',
  description: 'Shared',
  theme: 'Strength',
  sports: ['Rugby'],
  weeks: 2,
  isTemplate: true,
  isMine: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  days: [
    {
      id: 'day-old',
      name: 'Lower',
      focus: 'Strength',
      exercises: [
        {
          exerciseId: 'ex-bsquat',
          setType: 'reps_load',
          sets: 3,
          reps: '5',
          restSec: 180,
          schemes: [{ id: 'sch-old', sets: 3, reps: '5' }],
        },
      ],
    },
  ],
}

describe('program shares', () => {
  it('copies a snapshot onto this device with new ids', () => {
    let n = 0
    const copy = materializeSharedProgram(source, (prefix) => `${prefix}-${++n}`)
    assert.equal(copy.name, 'Their block')
    assert.equal(copy.isMine, true)
    assert.equal(copy.isTemplate, false)
    assert.notEqual(copy.id, source.id)
    assert.notEqual(copy.days[0]?.id, 'day-old')
    assert.equal(copy.days[0]?.exercises[0]?.exerciseId, 'ex-bsquat')
    assert.notEqual(copy.days[0]?.exercises[0]?.schemes?.[0]?.id, 'sch-old')
    assert.equal(shareSnapshot({ ...source, activeInstance: undefined }).id, 'prog-theirs')
  })
})
