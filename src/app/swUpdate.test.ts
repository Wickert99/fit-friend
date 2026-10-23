import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const worker = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
const page = readFileSync(new URL('./UpdateToast.tsx', import.meta.url), 'utf8')

describe('installed app updates', () => {
  it('lets a new service worker take over and reload open screens', () => {
    assert.match(worker, /self\.skipWaiting\(\)/)
    assert.match(worker, /key\.startsWith\('ff-shell-'\) && key !== SHELL/)
    assert.match(worker, /client\.navigate\(client\.url\)/)
    assert.match(worker, /fetch\(req, \{ cache: 'no-cache' \}\)/)
    assert.doesNotMatch(worker, /the new worker waits/i)
  })

  it('checks for a new worker without using the cached copy', () => {
    assert.match(page, /updateViaCache: 'none'/)
    assert.match(page, /registration\.update\(\)/)
    assert.match(page, /controllerchange/)
    assert.match(page, /window\.location\.reload\(\)/)
  })
})
