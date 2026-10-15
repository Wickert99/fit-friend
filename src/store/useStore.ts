import { useContext } from 'react'
import type { StoreApi } from '../types.ts'
import { StoreContext } from './storeContext.ts'

export function useStore(): StoreApi {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used within StoreProvider')
  return store
}
