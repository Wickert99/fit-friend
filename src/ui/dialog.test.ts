import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pointerOutside } from './dialog.ts'

describe('dialog light-dismiss geometry', () => {
  const rect = { left: 20, right: 300, top: 400, bottom: 700 }

  it('treats the backdrop as outside the dialog box', () => {
    assert.equal(pointerOutside(rect, 10, 500), true)
    assert.equal(pointerOutside(rect, 160, 100), true)
    assert.equal(pointerOutside(rect, 320, 500), true)
    assert.equal(pointerOutside(rect, 160, 720), true)
  })

  it('keeps presses on the dialog, including its padding, from counting as outside', () => {
    assert.equal(pointerOutside(rect, 20, 400), false)
    assert.equal(pointerOutside(rect, 160, 550), false)
    assert.equal(pointerOutside(rect, 300, 700), false)
  })
})
