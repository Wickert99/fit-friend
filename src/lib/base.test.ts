import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { appBase, withBase } from './base.ts'

describe('app base', () => {
  it('stays at the site root when Vite has not set a base', () => {
    assert.equal(appBase(), '/')
    assert.equal(withBase('/exercise-images/ex-bsquat-0.webp'), '/exercise-images/ex-bsquat-0.webp')
    assert.equal(withBase('https://example.com/a.jpg'), 'https://example.com/a.jpg')
  })

  it('prefixes root paths for the GitHub Pages subpath', () => {
    assert.equal(withBase('/exercise-images/ex-bsquat-0.webp', '/fit-friend/'), '/fit-friend/exercise-images/ex-bsquat-0.webp')
    assert.equal(withBase('/favicon.svg', '/fit-friend'), '/fit-friend/favicon.svg')
    assert.equal(withBase('/', '/fit-friend/'), '/fit-friend/')
    assert.equal(withBase('/pwa-192.png', '/'), '/pwa-192.png')
    assert.equal(withBase('/fit-friend/sw.js', '/fit-friend/'), '/fit-friend/sw.js')
  })
})
