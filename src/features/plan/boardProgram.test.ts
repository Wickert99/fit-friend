import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PlanBoard } from '../../types.ts'
import { boardExportSummary, boardToProgram } from './boardProgram.ts'

function ids() {
  let n = 0
  return (prefix: string) => `${prefix}-${++n}`
}

const board: PlanBoard = {
  id: 'board-1',
  name: 'Preseason',
  weeks: [
    {
      id: 'w1',
      label: 'Week 1',
      days: [
        {
          id: 'd1',
          name: 'Lower',
          focus: 'Strength',
          exercises: [
            { id: 'p1', exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 4, reps: '5', restSec: 180, targetPercent1RM: 75 },
            { id: 'p2', exerciseId: '', setType: 'reps_load', sets: 3, reps: '8', restSec: 90, placeholder: 'Sled march' },
          ],
        },
        { id: 'd-empty', name: 'Off', focus: 'Recovery', exercises: [] },
      ],
    },
    {
      id: 'w2',
      label: 'Week 2',
      days: [
        {
          id: 'd2',
          name: 'Lower',
          focus: 'Strength',
          exercises: [
            { id: 'p3', exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 4, reps: '5', restSec: 180 },
            { id: 'p4', exerciseId: '', setType: 'reps_load', sets: 3, reps: '8', restSec: 90, placeholder: 'Sled march' },
          ],
        },
        { id: 'd-empty-2', name: 'Off', focus: 'Recovery', exercises: [] },
      ],
    },
  ],
}

describe('board to program', () => {
  it('skips empty days, keeps the week count, and libraries custom names', () => {
    const summary = boardExportSummary(board)
    assert.ok(!('error' in summary))
    if ('error' in summary) return
    assert.equal(summary.emptyDays, 2)
    assert.equal(summary.customNames, 2)
    assert.equal(summary.keptDays, 2)
    assert.match(summary.message, /Use board as a program\?/)
    const draft = boardToProgram(board, ids(), '2026-10-15T00:00:00.000Z')
    assert.ok(draft)
    assert.equal(draft?.program.weeks, 2)
    assert.equal(draft?.program.days.length, 1)
    assert.equal(draft?.program.isMine, true)
    assert.equal(draft?.program.isTemplate, false)
    assert.equal(draft?.exercises.length, 1)
    assert.equal(draft?.exercises[0]?.name, 'Sled march')
    assert.equal(draft?.program.days[0]?.exercises[1]?.exerciseId, draft?.exercises[0]?.id)
    assert.equal(draft?.program.days[0]?.exercises[0]?.exerciseId, 'ex-bsquat')
  })

  it('flattens weeks that are not the same template', () => {
    const mixed: PlanBoard = {
      ...board,
      weeks: [
        board.weeks[0]!,
        {
          id: 'w-other',
          label: 'Week 2',
          days: [
            {
              id: 'upper',
              name: 'Upper',
              focus: 'Hypertrophy',
              sessionPad: 'Pump',
              exercises: [{ exerciseId: 'ex-bp', setType: 'reps_load', sets: 3, reps: '10', restSec: 90 }],
            },
          ],
        },
      ],
    }
    const draft = boardToProgram(mixed, ids(), '2026-10-15T00:00:00.000Z')
    assert.equal(draft?.program.weeks, 1)
    assert.equal(draft?.program.days.length, 2)
    assert.equal(draft?.program.days[1]?.sessionPad, 'Pump')
  })

  it('refuses a blank board', () => {
    const blank: PlanBoard = { id: 'b', name: 'Empty', weeks: [{ id: 'w', label: 'Week 1', days: [] }] }
    const summary = boardExportSummary(blank)
    assert.ok('error' in summary)
    assert.equal(boardToProgram(blank, ids()), null)
  })
})
