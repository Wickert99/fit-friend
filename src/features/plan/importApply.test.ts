import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Exercise, PlanDay, ProgramDay } from '../../types.ts'
import { importExercises, importWholeDay, isMobilityExercise, prescriptionFromExercise } from './importApply.ts'

const day: PlanDay = { id: 'd', name: 'Lower', focus: 'Strength', exercises: [], sessionPad: '' }

const squat: Exercise = {
  id: 'ex-bsquat',
  name: 'Back Squat',
  theme: 'Strength',
  sports: [],
  muscles: [],
  equipment: ['Barbell'],
  description: '',
  cues: [],
  source: 'seed',
  defaultSets: 5,
  defaultReps: '5',
  defaultRestSec: 180,
  aliases: [],
  primaryMuscles: ['quads'],
  secondaryMuscles: [],
  movementPattern: 'squat',
  imageUrls: [],
}

const flow: Exercise = { ...squat, id: 'ex-catcow', name: 'Cat Cow', theme: 'Mobility', movementPattern: 'mob', defaultSets: 1, defaultReps: '8', defaultRestSec: 0 }

describe('library import', () => {
  it('treats mobility themes and patterns as movements', () => {
    assert.equal(isMobilityExercise(squat), false)
    assert.equal(isMobilityExercise(flow), true)
  })

  it('copies a whole day onto an empty card and keeps a filled card name', () => {
    const source: ProgramDay = {
      id: 'pd',
      name: 'Squat day',
      focus: 'Strength',
      sessionPad: 'Warm up first.',
      exercises: [
        {
          exerciseId: 'ex-bsquat',
          setType: 'reps_load',
          sets: 4,
          reps: '5',
          restSec: 180,
          notes: 'Depth before load',
        },
      ],
    }
    let n = 0
    const imported = importWholeDay(day, source, (prefix) => `${prefix}-${++n}`)
    assert.equal(imported.name, 'Squat day')
    assert.equal(imported.focus, 'Strength')
    assert.equal(imported.sessionPad, 'Warm up first.')
    assert.equal(imported.exercises[0]?.placeholder, 'Depth before load')
    const filled = importWholeDay({ ...day, name: 'Mine', sessionPad: 'Keep me', exercises: imported.exercises }, source, (prefix) => `${prefix}-x`)
    assert.equal(filled.name, 'Mine')
    assert.equal(filled.sessionPad, 'Keep me')
    assert.equal(filled.exercises.length, 2)
  })

  it('applies the selected sets and reps to imported exercises', () => {
    const rx = { ...prescriptionFromExercise(squat), sets: 3, reps: '8' }
    const next = importExercises(day, [squat], rx, (prefix) => `${prefix}-1`)
    assert.equal(next.exercises[0]?.exerciseId, 'ex-bsquat')
    assert.equal(next.exercises[0]?.sets, 3)
    assert.equal(next.exercises[0]?.reps, '8')
    assert.equal(next.exercises[0]?.restSec, 180)
  })
})
