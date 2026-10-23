import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { Exercise, Program } from '../../types.ts'
import { filterPrograms } from './search.ts'

function load(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
}

function bristolFrom(programs: Program[]): Program {
  const program = programs.find((item) => item.id === 'prog-bristol-method')
  assert.ok(program, 'Bristol Method template missing')
  assert.equal(program.name, 'Bristol Method')
  assert.equal(program.isTemplate, true)
  assert.equal(program.isMine, false)
  assert.equal(program.theme, 'Endurance')
  assert.equal(program.days.length, 1)
  const day = program.days[0]
  assert.ok(day)
  assert.equal(day.name, 'Bristol Method')
  assert.equal(day.focus, 'Endurance')
  assert.equal(day.exercises.length, 2)
  const [warm, work] = day.exercises
  assert.ok(warm && work)
  assert.equal(warm.exerciseId, 'ex-airbike-steady')
  assert.equal(warm.setType, 'time')
  assert.equal(warm.sets, 1)
  assert.equal(warm.reps, '4 min')
  assert.equal(warm.restSec, 60)
  assert.equal(work.exerciseId, 'ex-biker')
  assert.equal(work.setType, 'time')
  assert.equal(work.sets, 6)
  assert.equal(work.reps, '4 min')
  assert.equal(work.restSec, 60)
  const notes = [program.description, program.coachNotes, day.sessionPad, warm.notes, work.notes].join(' ')
  assert.match(notes, /80–85%/)
  assert.match(notes, /off the bike/i)
  assert.match(notes, /add one round/i)
  assert.match(notes, /45–60/)
  assert.equal(program.progression?.percentPerWeek, 0)
  return program
}

describe('Bristol Method library session', () => {
  it('matches a short search for Bris', () => {
    const programs = load('../../../data/programs.json') as Program[]
    const found = filterPrograms(programs, { query: 'Bris', theme: 'All', sport: 'All' })
    assert.equal(found.some((program) => program.id === 'prog-bristol-method'), true)
  })

  it('keeps the same air-bike session in every app-side catalog', () => {
    const programs = load('../../../data/programs.json') as Program[]
    const extra = load('../../../data/programs-extra-subset.json') as Program[]
    const initial = load('../../../data/initial-state.json') as { programs: Program[]; exercises: Exercise[] }
    const fromPrograms = bristolFrom(programs)
    const fromExtra = extra.find((item) => item.id === 'prog-bristol-method')
    const fromSeed = initial.programs.find((item) => item.id === 'prog-bristol-method')
    assert.deepEqual(fromExtra, fromPrograms)
    assert.deepEqual(fromSeed, fromPrograms)
    const ids = new Set(initial.exercises.map((exercise) => exercise.id))
    for (const exercise of fromPrograms.days[0]?.exercises ?? []) {
      assert.equal(ids.has(exercise.exerciseId), true, exercise.exerciseId)
    }
  })
})
