import { useEffect } from 'react'
import { finishWhoopCallback } from './api.ts'
import { readWhoopCallback } from './model.ts'

let whoopCallbackConsumed = false

/** Exchanges a Whoop redirect that landed on #/whoop-callback, then leaves the code out of the URL. */
export function WhoopCallbackBridge() {
  useEffect(() => {
    if (whoopCallbackConsumed) return
    const callback = readWhoopCallback(window.location.hash)
    if (!callback) return
    whoopCallbackConsumed = true
    try {
      const next = `${window.location.pathname}${window.location.search}#/friends`
      window.history.replaceState(window.history.state, '', next)
    } catch {
      /* private mode */
    }
    void finishWhoopCallback(callback)
  }, [])
  return null
}
