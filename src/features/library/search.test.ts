import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Exercise, Program } from '../../types.ts'
import { buildCustomExercise } from './customExercise.ts'
import { exerciseMatches, filterExercises, filterPrograms, scoreExercise } from './search.ts'

function exercise(partial: Partial<Exercise> & Pick<Exercise, 'id' | 'name'>): Exercise {
  return {
    theme: 'Strength',
    sports: ['General Athletic'],
    muscles: ['Quads'],
    equipment: ['Barbell'],
    description: '',
    cues: [],
    source: 'curated',
    defaultSets: 3,
    defaultReps: '8',
    defaultRestSec: 90,
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    movementPattern: 'squat',
    imageUrls: [],
    ...partial,
  }
}

function program(partial: Partial<Program> & Pick<Program, 'id' | 'name'>): Program {
  return {
    description: '',
    theme: 'Strength',
    sports: ['General Athletic'],
    weeks: 4,
    isTemplate: true,
    isMine: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    days: [],
    ...partial,
  }
}

describe('exercise search', () => {
  const squat = exercise({
    id: 'ex-bsquat',
    name: 'Back Squat',
    aliases: ['BSQ'],
    muscles: ['Quads', 'Glutes'],
    sports: ['Rugby'],
    description: 'Bilateral squat',
  })
  const press = exercise({
    id: 'ex-ohp',
    name: 'Overhead Press',
    theme: 'Strength',
    muscles: ['Shoulders'],
    equipment: ['Barbell'],
    description: 'Strict press',
  })

  it('matches names, aliases, and shorthand', () => {
    assert.equal(exerciseMatches(squat, ''), true)
    assert.equal(exerciseMatches(squat, 'back squat'), true)
    assert.equal(scoreExercise(squat, 'back squat'), 100)
    assert.equal(scoreExercise(squat, 'bsq'), 95)
    assert.equal(exerciseMatches(press, 'ohp'), true)
    assert.equal(scoreExercise(press, 'ohp'), 30)
    assert.equal(exerciseMatches(squat, 'zzzz'), false)
    assert.equal(scoreExercise(squat, 'zzzz'), 0)
  })

  it('keeps a partial token hit when most long words match the title', () => {
    const romanian = exercise({ id: 'ex-rdl', name: 'Romanian Deadlift', aliases: ['RDL'] })
    assert.equal(exerciseMatches(romanian, 'romanian deadlift pause extra'), true)
    assert.equal(scoreExercise(romanian, 'rdl'), 95)
  })

  it('filters theme and sorts a query by score', () => {
    const listed = filterExercises([press, squat], { query: 'squat', theme: 'All', sport: 'All', muscle: 'All', equipment: 'All' })
    assert.deepEqual(listed.map((item) => item.id), ['ex-bsquat'])
    const themed = filterExercises([squat], { query: '', theme: 'Power', sport: 'All', muscle: 'All', equipment: 'All' })
    assert.equal(themed.length, 0)
  })

  it('lists templates before custom programs and searches name plus description', () => {
    const custom = program({ id: 'mine', name: 'Aardvark', isTemplate: false, isMine: true, description: 'rugby prep' })
    const template = program({ id: 'tmpl', name: 'Zebra Rugby', description: 'in season' })
    const found = filterPrograms([custom, template], { query: 'rugby', theme: 'All', sport: 'All' })
    assert.deepEqual(found.map((item) => item.id), ['tmpl', 'mine'])
    const strength = filterPrograms([template], { query: '', theme: 'Mobility', sport: 'All' })
    assert.equal(strength.length, 0)
  })
})

describe('custom exercise', () => {
  it('requires a name and stores notes as the cue', () => {
    assert.equal(buildCustomExercise({ id: 'ex-1', name: '  ', muscle: 'Core', equipment: 'None', notes: '' }), null)
    const exercise = buildCustomExercise({
      id: 'ex-1',
      name: ' Sandbag carry ',
      muscle: 'Core',
      equipment: 'None',
      notes: 'Short steps',
    })
    assert.equal(exercise?.name, 'Sandbag carry')
    assert.equal(exercise?.source, 'custom')
    assert.deepEqual(exercise?.cues, ['Short steps'])
    assert.equal(exercise?.description, 'Short steps')
  })
})
