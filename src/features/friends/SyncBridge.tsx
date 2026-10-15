import { useEffect } from 'react'
import { notifySyncStateChange, registerSyncReplacer } from '../../lib/sync/engine.ts'
import { useStore } from '../../store/useStore.ts'

/** Applies remote sync into the store for the whole session, not only while Friends is open. */
export function SyncBridge() {
  const { state, update } = useStore()
  useEffect(() => {
    return registerSyncReplacer((next) => {
      update(() => next)
    })
  }, [update])
  useEffect(() => {
    notifySyncStateChange(state)
  }, [state])
  return null
}
