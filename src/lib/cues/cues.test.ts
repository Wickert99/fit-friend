import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildFocusSteps, restWarningAt } from './index.ts'
import type { CueExercise } from './index.ts'

function exercise(partial: Partial<CueExercise> & Pick<CueExercise, 'exerciseId' | 'setType'>): CueExercise {
  return { sets: 3, reps: '8', restSec: 90, ...partial }
}

describe('focus cues', () => {
  it('builds strength steps and a rest handoff', () => {
    const steps = buildFocusSteps(
      [exercise({ exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 2, reps: '5', restSec: 120, targetLoadKg: 100 })],
      { 'ex-bsquat': 'Back squat' },
    )
    assert.equal(steps.length, 2)
    assert.equal(steps[0]?.role, 'strength_set')
    assert.match(steps[0]?.headline ?? '', /5 reps/)
    assert.match(steps[0]?.headline ?? '', /100 kg/)
    assert.equal(steps[0]?.restSec, 120)
    assert.match(steps[0]?.restStart ?? '', /^Rest\. 2 minutes\.$/)
    assert.match(steps[0]?.restWarning ?? '', /Rest's up\. Next, Back squat, set 2/)
    assert.equal(steps[1]?.restSec, 0)
    assert.match(steps[0]?.beforeWork.join(' ') ?? '', /Back squat/)
  })

  it('splits timed work into left and right sides', () => {
    const steps = buildFocusSteps(
      [exercise({ exerciseId: 'ex-side', setType: 'time', sets: 1, reps: '30s/side', restSec: 20, timeCapSec: 30, perSide: true })],
      { 'ex-side': 'Side plank' },
    )
    assert.equal(steps.length, 2)
    assert.equal(steps[0]?.side, 'left')
    assert.equal(steps[0]?.restSec, 0)
    assert.match(steps[0]?.finish ?? '', /Switch sides/)
    assert.match(steps[0]?.beforeWork.join(' ') ?? '', /Left side/)
    assert.equal(steps[1]?.side, 'right')
    assert.equal(steps[1]?.restSec, 0)
    assert.equal(steps[0]?.workSec, 30)
  })

  it('speaks AMRAP caps, EMOM intervals, and for-time clocks', () => {
    const steps = buildFocusSteps(
      [
        exercise({ exerciseId: 'ex-a', setType: 'amrap', sets: 1, reps: 'AMRAP', timeCapSec: 600, restSec: 0 }),
        exercise({ exerciseId: 'ex-e', setType: 'emom', sets: 2, reps: '8', rounds: 2, emomIntervalSec: 60, restSec: 0 }),
        exercise({ exerciseId: 'ex-f', setType: 'for_time', sets: 1, reps: '1 km for time', distanceM: 1000, timeCapSec: 300, restSec: 0 }),
      ],
      { 'ex-a': 'Burpee', 'ex-e': 'Thruster', 'ex-f': 'Run' },
    )
    const amrap = steps.find((step) => step.role === 'amrap')
    assert.match(amrap?.beforeWork.join(' ') ?? '', /AMRAP, 10 minutes/)
    assert.equal(amrap?.finish, "Time. That's the cap.")
    const emom = steps.filter((step) => step.role === 'emom_interval')
    assert.equal(emom.length, 2)
    assert.match(emom[0]?.beforeWork.join(' ') ?? '', /Every 1 minute/)
    assert.equal(emom[0]?.restSec, 0)
    const timed = steps.find((step) => step.role === 'for_time')
    assert.equal(timed?.clock, 'count_up')
    assert.match(timed?.beforeWork.join(' ') ?? '', /1 kilometre/)
    assert.match(timed?.beforeWork.join(' ') ?? '', /For time/)
  })

  it('warns earlier on short rests', () => {
    assert.equal(restWarningAt(30), 10)
    assert.equal(restWarningAt(12), 5)
    assert.equal(restWarningAt(5), 3)
    assert.equal(restWarningAt(2), 1)
    assert.equal(restWarningAt(1), null)
  })
})
