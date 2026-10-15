import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PlanBoard } from '../../types.ts'
import { addDay, addWeek, clearBoard, clearDay, deleteWeek, setDayFocus } from './boardOps.ts'

const board: PlanBoard = {
  id: 'b',
  name: 'Preseason',
  weeks: [
    {
      id: 'w',
      label: 'Week 1',
      days: [
        {
          id: 'd',
          name: 'Lower',
          focus: 'Strength',
          sessionPad: 'Brace.',
          exercises: [{ exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 4, reps: '5', restSec: 180 }],
        },
      ],
    },
  ],
}

describe('board edits', () => {
  it('clears content and keeps the week and day cards', () => {
    const cleared = clearBoard(board)
    assert.equal(cleared.weeks[0]?.id, 'w')
    assert.equal(cleared.weeks[0]?.days[0]?.id, 'd')
    assert.equal(cleared.weeks[0]?.days[0]?.exercises.length, 0)
    assert.equal(cleared.weeks[0]?.days[0]?.sessionPad, '')
    assert.equal(cleared.weeks.length, 1)
  })

  it('can delete down to an empty timeline and add a free-write day', () => {
    const emptied = deleteWeek(board, 'w')
    assert.equal(emptied.weeks.length, 0)
    const added = addWeek(emptied, 'w2')
    const day = addDay(added.board, 'w2', { name: 'Notes', focus: 'Free write' }, 'd2')
    assert.ok(day)
    assert.equal(day.board.weeks[0]?.days[0]?.isWhiteboard, true)
    const focused = setDayFocus(day.board.weeks[0]!.days[0]!, 'Strength')
    assert.equal(focused.isWhiteboard, false)
    assert.equal(focused.freeWrite, false)
    const wiped = clearDay(day.board, 'd2')
    assert.equal(wiped.weeks[0]?.days.length, 1)
    assert.equal(wiped.weeks[0]?.days[0]?.exercises.length, 0)
  })
})
