import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { brzycki, epley, estimate1rm } from './estimate.ts'
import { familyIdForExercise, loadFromPercent, resolveFamilyMax } from './families.ts'
import { LIFT_FALLBACKS } from './fallbacks.ts'
import { countsForPr, recomputePrs } from './prs.ts'
import { formatDuration, formatRecord, formatRounds, parseDuration } from './scores.ts'
import { formatWeight, roundToPlate } from './units.ts'
import type { LiftFamily, LiftMax, WorkoutSession } from '../../types.ts'

const families: LiftFamily[] = [
  { id: 'back_squat', name: 'Back Squat', primaryExerciseId: 'ex-bsquat', members: ['ex-bsquat', 'ex-pause-bsquat'] },
  { id: 'front_squat', name: 'Front Squat', primaryExerciseId: 'ex-fsquat', members: ['ex-fsquat'] },
  { id: 'oh_squat', name: 'Overhead Squat', primaryExerciseId: 'ex-ohsquat', members: ['ex-ohsquat'] },
  { id: 'conventional_dl', name: 'Conventional Deadlift', primaryExerciseId: 'ex-dl', members: ['ex-dl'] },
  { id: 'rdl', name: 'Romanian Deadlift', primaryExerciseId: 'ex-rdl', members: ['ex-rdl'] },
]

function max(familyId: string, maxKg: number, estimated = false): LiftMax {
  return { familyId, name: familyId, kind: 'strength', maxKg, estimated, updatedAt: '2026-10-01T00:00:00.000Z' }
}

describe('1RM estimate', () => {
  it('averages Epley and Brzycki and treats a single as the weight', () => {
    assert.equal(epley(100, 5), 100 * (1 + 5 / 30))
    assert.equal(brzycki(100, 5), 100 * (36 / 32))
    assert.equal(estimate1rm(100, 5), (epley(100, 5) + brzycki(100, 5)) / 2)
    assert.equal(estimate1rm(140, 1), 140)
    assert.equal(estimate1rm(0, 5), 0)
    assert.equal(epley(80, 20), 80 * (1 + 12 / 30))
  })
})

describe('lift family fallbacks', () => {
  it('uses a stored max before any related lift', () => {
    const resolved = resolveFamilyMax('front_squat', {
      back_squat: max('back_squat', 100),
      front_squat: max('front_squat', 70),
    })
    assert.equal(resolved?.maxKg, 70)
    assert.equal(resolved?.viaFallback, false)
  })

  it('estimates front squat, RDL, and overhead squat from the parent lift', () => {
    const maxes = { back_squat: max('back_squat', 200), conventional_dl: max('conventional_dl', 180) }
    assert.equal(resolveFamilyMax('front_squat', maxes)?.maxKg, 170)
    assert.equal(resolveFamilyMax('front_squat', maxes)?.factor, 0.85)
    assert.equal(resolveFamilyMax('rdl', maxes)?.maxKg, 135)
    assert.equal(resolveFamilyMax('oh_squat', maxes)?.maxKg, 130)
    assert.match(resolveFamilyMax('oh_squat', maxes)?.fallbackNote ?? '', /65%/)
  })

  it('prefers the front-squat max for overhead squat when one is stored', () => {
    const resolved = resolveFamilyMax('oh_squat', {
      back_squat: max('back_squat', 200),
      front_squat: max('front_squat', 150),
    })
    assert.equal(resolved?.maxKg, 120)
    assert.equal(resolved?.sourceFamilyId, 'front_squat')
  })

  it('does not chain a fallback through another fallback', () => {
    const resolved = resolveFamilyMax('oh_squat', { back_squat: max('back_squat', 200) })
    assert.equal(resolved?.sourceFamilyId, 'back_squat')
    assert.notEqual(resolved?.factor, 0.8)
  })

  it('maps member exercises onto the family and rounds percent loads', () => {
    assert.equal(familyIdForExercise('ex-pause-bsquat', families), 'back_squat')
    assert.equal(familyIdForExercise('ex-kb-turkish', families, { 'ex-kb-turkish': 'ex-turkish' }), 'ex:ex-turkish')
    assert.equal(loadFromPercent(80, 100, 'kg'), 80)
    assert.equal(roundToPlate(101, 'kg'), 100)
    assert.equal(formatWeight(100, 'kg'), '100 kg')
  })

  it('covers every fallback target that exists in the lift catalog', () => {
    const catalog = JSON.parse(readFileSync(new URL('../../../data/lift-families.json', import.meta.url), 'utf8')) as { id: string }[]
    const ids = new Set(catalog.map((family) => family.id))
    for (const rule of LIFT_FALLBACKS) {
      assert.equal(ids.has(rule.target), true, rule.target)
      assert.equal(ids.has(rule.source), true, rule.source)
    }
    const benchmarks = JSON.parse(readFileSync(new URL('../../../data/benchmark-records.json', import.meta.url), 'utf8')) as { id: string }[]
    assert.deepEqual(
      benchmarks.map((item) => item.id),
      ['wod_fran', 'wod_cindy', 'wod_murph', 'wod_helen', 'row_2k', 'wod_dt'],
    )
  })
})

describe('run and benchmark scores', () => {
  it('parses and prints times and AMRAP scores', () => {
    assert.equal(parseDuration('12.4'), 12.4)
    assert.equal(parseDuration('12.4s'), 12.4)
    assert.equal(parseDuration('1:23.5'), 83.5)
    assert.equal(parseDuration('18:32'), 18 * 60 + 32)
    assert.equal(parseDuration('1:02:03'), 3723)
    assert.equal(parseDuration('1:60'), null)
    assert.equal(formatDuration(12.4), '12.4s')
    assert.equal(formatDuration(83.5), '1:23.5')
    assert.equal(formatDuration(18 * 60 + 32), '18:32')
    assert.equal(formatRounds(8, 4), '8 + 4')
    assert.equal(formatRounds(12), '12 rounds')
    assert.equal(
      formatRecord({ familyId: 'wod_fran', name: 'Fran', kind: 'benchmark', maxKg: 0, bestTimeSec: 187, updatedAt: '' }, 'kg'),
      '3:07',
    )
    assert.equal(formatRecord(undefined, 'kg'), 'Not set')
  })
})

describe('personal records', () => {
  it('keeps the heaviest estimated set per exercise and ignores light warm-ups', () => {
    const session: WorkoutSession = {
      id: 's1',
      name: 'Lower',
      dateKey: '2026-10-14',
      status: 'completed',
      exercises: [
        {
          exerciseId: 'ex-bsquat',
          setType: 'reps_load',
          sets: [
            { setNumber: 1, reps: 5, loadKg: 60, completed: true },
            { setNumber: 2, reps: 3, loadKg: 140, completed: true },
            { setNumber: 3, reps: 5, loadKg: 100, completed: false },
          ],
        },
        {
          exerciseId: 'ex-row',
          setType: 'reps_load',
          notes: 'Warm-up ramp',
          sets: [{ setNumber: 1, reps: 8, loadKg: 40, completed: true }],
        },
      ],
    }
    const prs = recomputePrs([session])
    assert.equal(prs.length, 1)
    assert.equal(prs[0]?.exerciseId, 'ex-bsquat')
    assert.equal(prs[0]?.loadKg, 140)
    assert.equal(prs[0]?.reps, 3)
    assert.equal(countsForPr(session.exercises[1]!, session.exercises[1]!.sets[0]!), false)
  })
})
