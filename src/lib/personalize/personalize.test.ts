import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { LiftMax, Program } from '../../types.ts'
import {
  expandProgramToBoard,
  isBodyweight,
  isMainLift,
  missingMaxes,
  percentToKg,
  progressedPercent,
  weekStep,
} from './index.ts'

const programs = JSON.parse(readFileSync(new URL('../../../data/programs.json', import.meta.url), 'utf8')) as Program[]
const strength = programs.find((program) => program.id === 'prog-strength-base')
if (!strength) throw new Error('missing strength base')

function ids() {
  let n = 0
  return (prefix: string) => `${prefix}-${++n}`
}

const squatMax: LiftMax = {
  familyId: 'back_squat',
  name: 'Back Squat',
  kind: 'strength',
  maxKg: 140,
  estimated: false,
  updatedAt: '2026-10-15T00:00:00.000Z',
}

describe('template expansion', () => {
  it('resolves week-1 %1RM to kilograms and deloads the last week', () => {
    const board = expandProgramToBoard(strength, {
      mode: 'resolve',
      maxes: { back_squat: squatMax },
      weightUnit: 'kg',
      id: ids(),
      now: '2026-10-15T00:00:00.000Z',
    })
    assert.equal(board.weeks.length, 4)
    assert.equal(board.weeks[3]?.label, 'Week 4 · deload')
    assert.equal(board.sourceProgramId, 'prog-strength-base')
    const week1 = board.weeks[0]?.days[0]?.exercises.find((exercise) => exercise.exerciseId === 'ex-bsquat')
    const week4 = board.weeks[3]?.days[0]?.exercises.find((exercise) => exercise.exerciseId === 'ex-bsquat')
    assert.ok(week1 && week4)
    assert.equal(week1.targetPercent1RM, 74.5)
    assert.equal(week1.targetLoadKg, percentToKg(74.5, 140, 'kg'))
    assert.equal(week1.targetLoadKg, 105)
    assert.ok((week4.targetPercent1RM ?? 0) < (week1.targetPercent1RM ?? 0))
    assert.ok(week4.sets < week1.sets)
    assert.equal(week4.sets, 2)
    assert.equal(weekStep(3, { percentPerWeek: 3.5, deloadEvery: 4, deloadPct: 10, deloadSetFactor: 0.6 }).isDeload, true)
    const expected = progressedPercent(74.5, 3, { percentPerWeek: 3.5, deloadEvery: 4, maxPercent: 92.5, deloadPct: 10, deloadSetFactor: 0.6 }, '5')
    assert.equal(week4.targetPercent1RM, expected)
  })

  it('prepends a preparation week and appends a retest week', () => {
    const board = expandProgramToBoard(strength, {
      mode: 'resolve',
      maxes: { back_squat: squatMax, conventional_dl: { ...squatMax, familyId: 'conventional_dl', name: 'Deadlift', maxKg: 180 } },
      prepWeek: true,
      retestWeek: true,
      id: ids(),
      now: '2026-10-15T00:00:00.000Z',
    })
    assert.equal(board.weeks[0]?.label, 'Preparation')
    assert.equal(board.weeks.at(-1)?.label, 'Retest')
    assert.equal(board.weeks.length, 6)
    const prepExercises = board.weeks[0]?.days.flatMap((day) => day.exercises) ?? []
    assert.ok(prepExercises.some((exercise) => exercise.exerciseId === 'ex-bsquat'))
    assert.ok(prepExercises.some((exercise) => exercise.exerciseId === 'ex-catcow'))
    const squat = prepExercises.find((exercise) => exercise.exerciseId === 'ex-bsquat')
    assert.ok((squat?.schemes?.length ?? 0) >= 6)
    assert.equal(board.loadImport?.prepWeek, true)
    assert.equal(board.loadImport?.retestWeek, true)
  })

  it('keeps the percent and drops invented kilograms when the max is missing', () => {
    const board = expandProgramToBoard(strength, { mode: 'enter_maxes', id: ids(), now: '2026-10-15T00:00:00.000Z' })
    const squat = board.weeks[0]?.days[0]?.exercises.find((exercise) => exercise.exerciseId === 'ex-bsquat')
    assert.equal(squat?.targetPercent1RM, 74.5)
    assert.equal(squat?.targetLoadKg, undefined)
    assert.ok(missingMaxes(strength, {}).some((lift) => lift.familyId === 'back_squat'))
  })

  it('converts a bodyweight percent prescription into RIR', () => {
    const program: Program = {
      id: 'prog-pull',
      name: 'Pull',
      description: '',
      theme: 'Strength',
      sports: ['General Athletic'],
      weeks: 1,
      isTemplate: true,
      isMine: false,
      createdAt: '2026-10-15T00:00:00.000Z',
      days: [
        {
          id: 'd1',
          name: 'Pull',
          weekday: 1,
          focus: 'Strength',
          exercises: [
            {
              exerciseId: 'ex-pullup',
              setType: 'reps_load',
              sets: 4,
              reps: '6',
              restSec: 120,
              targetPercent1RM: 70,
            },
          ],
        },
      ],
    }
    assert.equal(isBodyweight('ex-pullup'), true)
    assert.equal(isMainLift('ex-bsquat'), true)
    const board = expandProgramToBoard(program, { mode: 'resolve', id: ids(), now: '2026-10-15T00:00:00.000Z' })
    const pull = board.weeks[0]?.days[0]?.exercises[0]
    assert.equal(pull?.targetPercent1RM, undefined)
    assert.equal(pull?.targetLoadKg, undefined)
    assert.equal(typeof pull?.targetRir, 'number')
    assert.match(pull?.notes ?? '', /RIR/)
  })

  it('writes a working-weight note on week 1', () => {
    const board = expandProgramToBoard(strength, {
      mode: 'find_working',
      id: ids(),
      now: '2026-10-15T00:00:00.000Z',
    })
    assert.match(board.weeks[0]?.label ?? '', /working weights/)
    const squat = board.weeks[0]?.days[0]?.exercises.find((exercise) => exercise.exerciseId === 'ex-bsquat')
    assert.match(squat?.notes ?? '', /Find working weight/)
    assert.equal(squat?.targetLoadKg, undefined)
    assert.equal(squat?.targetPercent1RM, 74.5)
  })
})
