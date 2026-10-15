import type { LiftMax, WorkoutSession } from '../types.ts'
import { HOT_DB_NAME, HOT_DB_VERSION } from './keys.ts'

const SESSIONS = 'sessions'
const MAXES = 'maxes'
const MAXES_KEY = 'liftMaxes'

interface SessionRow {
  id: string
  seq: number
  savedAt: string
  session: WorkoutSession
}

interface MaxesRow {
  id: string
  seq: number
  savedAt: string
  liftMaxes: Record<string, LiftMax>
}

let database: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  database ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null)
        return
      }
      const request = indexedDB.open(HOT_DB_NAME, HOT_DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(MAXES)) db.createObjectStore(MAXES, { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return database
}

function transaction(db: IDBDatabase, mode: IDBTransactionMode, stores: string[]): IDBTransaction {
  try {
    return db.transaction(stores, mode, { durability: mode === 'readwrite' ? 'strict' : 'default' })
  } catch {
    return db.transaction(stores, mode)
  }
}

function done(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
    tx.onabort = () => resolve(false)
  })
}

export async function journalSessions(sessions: WorkoutSession[], seq: number): Promise<boolean> {
  if (!sessions.length) return true
  try {
    const db = await openDb()
    if (!db) return false
    const tx = transaction(db, 'readwrite', [SESSIONS])
    const store = tx.objectStore(SESSIONS)
    const savedAt = new Date().toISOString()
    for (const session of sessions) store.put({ id: session.id, seq, savedAt, session } satisfies SessionRow)
    return done(tx)
  } catch {
    return false
  }
}

export async function journalLiftMaxes(liftMaxes: Record<string, LiftMax>, seq: number): Promise<boolean> {
  try {
    const db = await openDb()
    if (!db) return false
    const tx = transaction(db, 'readwrite', [MAXES])
    tx.objectStore(MAXES).put({
      id: MAXES_KEY,
      seq,
      savedAt: new Date().toISOString(),
      liftMaxes,
    } satisfies MaxesRow)
    return done(tx)
  } catch {
    return false
  }
}

export async function reconcileJournal(seq: number): Promise<WorkoutSession[]> {
  try {
    const db = await openDb()
    if (!db) return []
    const rows = await new Promise<SessionRow[]>((resolve) => {
      const request = transaction(db, 'readonly', [SESSIONS]).objectStore(SESSIONS).getAll()
      request.onsuccess = () => resolve((request.result as SessionRow[] | undefined) ?? [])
      request.onerror = () => resolve([])
    })
    const fresh = rows.filter((row) => row.seq > seq && row.session && typeof row.session.id === 'string')
    const stale = rows.filter((row) => row.seq <= seq).map((row) => row.id)
    if (stale.length) {
      const tx = transaction(db, 'readwrite', [SESSIONS])
      const store = tx.objectStore(SESSIONS)
      for (const id of stale) store.delete(id)
      await done(tx)
    }
    return fresh.map((row) => row.session)
  } catch {
    return []
  }
}

export async function reconcileLiftMaxes(seq: number): Promise<Record<string, LiftMax> | null> {
  try {
    const db = await openDb()
    if (!db) return null
    const row = await new Promise<MaxesRow | undefined>((resolve) => {
      const request = transaction(db, 'readonly', [MAXES]).objectStore(MAXES).get(MAXES_KEY)
      request.onsuccess = () => resolve(request.result as MaxesRow | undefined)
      request.onerror = () => resolve(undefined)
    })
    if (!row) return null
    if (row.seq > seq && row.liftMaxes && typeof row.liftMaxes === 'object') return row.liftMaxes
    const tx = transaction(db, 'readwrite', [MAXES])
    tx.objectStore(MAXES).delete(MAXES_KEY)
    await done(tx)
    return null
  } catch {
    return null
  }
}
