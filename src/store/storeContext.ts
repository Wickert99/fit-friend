import { createContext } from 'react'
import type { StoreApi } from '../types.ts'

export const StoreContext = createContext<StoreApi | null>(null)
