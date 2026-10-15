import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import type { Exercise, Program } from '../../../types.ts'
import { generateMusclePlan, generateSession } from './generate.ts'

const exercises = JSON.parse(readFileSync(new URL('../../../../data/exercises.json', import.meta.url), 'utf8')) as Exercise[]

const base = {
  equipment: ['barbell', 'dumbbell', 'bodyweight'],
  exercises,
  seed: 3,
  now: '2026-10-15T00:00:00.000Z',
}

describe('muscle session generator', () => {
  it('writes the strength and hypertrophy scheme lines', () => {
    const strength = generateSession(
      { ...base, muscles: ['quads', 'glutes'], goal: 'strength', minutes: 45 },
      ['quads', 'glutes'],
      3,
    )
    assert.match(strength.rationale, /^Strength: 4–5 × 5–6/)
    assert.ok(strength.exercises.length > 0)
    const hypertrophy = generateSession(
      { ...base, muscles: ['chest', 'lats'], goal: 'hypertrophy', minutes: 45 },
      ['chest', 'lats'],
      4,
    )
    assert.match(hypertrophy.rationale, /^Hypertrophy: 3–4 × 8–12 at RIR 1–2\./)
  })

  it('splits a short multi-muscle block into upper and lower days', () => {
    const plan = generateMusclePlan({
      ...base,
      muscles: ['chest', 'lats', 'quads', 'hamstrings', 'glutes', 'abs'],
      goal: 'hypertrophy',
      minutes: 45,
      weeks: 4,
    })
    assert.equal(plan.kind, 'program')
    if (plan.kind !== 'program') return
    assert.equal(plan.program.weeks, 4)
    assert.ok(plan.sessions.some((session) => session.day.name.includes('Upper')))
    assert.ok(plan.sessions.some((session) => session.day.name.includes('Lower + core')))
    assert.match(plan.rationale, /upper \/ lower split/)
  })

  it('warns when nothing is selected', () => {
    const plan = generateMusclePlan({ ...base, muscles: [], goal: 'strength', minutes: 30, weeks: 0 })
    assert.equal(plan.kind, 'session')
    if (plan.kind !== 'session') return
    assert.ok(plan.warnings.includes('No muscles selected.'))
  })
})
