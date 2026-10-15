import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Exercise } from '../../types.ts'
import { exerciseMatches, searchExercises } from './search.ts'

function exercise(partial: Partial<Exercise> & Pick<Exercise, 'id' | 'name'>): Exercise {
  return {
    theme: 'Strength',
    sports: [],
    muscles: [],
    equipment: [],
    description: '',
    cues: [],
    source: 'seed',
    defaultSets: 3,
    defaultReps: '8',
    defaultRestSec: 90,
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    movementPattern: '',
    imageUrls: [],
    ...partial,
  }
}

describe('exercise search', () => {
  const library = [
    exercise({ id: 'ex-bsquat', name: 'Back squat', muscles: ['Quads'], aliases: ['BSQ'] }),
    exercise({ id: 'ex-ohp', name: 'Overhead press', aliases: ['OHP', 'military press'] }),
    exercise({ id: 'ex-rdl', name: 'Romanian deadlift', aliases: ['RDL'] }),
  ]

  it('matches names, aliases, and shorthand', () => {
    assert.equal(exerciseMatches(library[1]!, 'ohp'), true)
    assert.equal(exerciseMatches(library[2]!, 'rdl'), true)
    assert.equal(exerciseMatches(library[0]!, 'quads'), true)
    assert.equal(searchExercises(library, 'back squat')[0]?.id, 'ex-bsquat')
    assert.equal(searchExercises(library, 'zzzz').length, 0)
  })
})