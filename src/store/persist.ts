import type { AppState, StorageNotice } from '../types.ts'
import { exerciseIdAliases } from './aliases.ts'
import { saveCorruptBackup } from './corrupt.ts'
import {
  CATALOG_KEY,
  FORMAT_KEY,
  FORMAT_VERSION,
  HOT_SEQ_FIELD,
  LEGACY_STATE_KEYS,
  PREMIGRATE_KEY,
  SEED_VERSION,
  SEED_VERSION_KEY,
  STATE_KEY,
} from './keys.ts'
import { runMigrations } from './migrate.ts'
import { isRecord, normalizeState } from './normalize.ts'
import type { KeyValueStore } from './storage.ts'

export interface LoadResult {
  state: AppState | null
  needsSeedMerge: boolean
  hotSeq: number
  notice: StorageNotice | null
  appliedMigrations: string[]
}

interface FormatDoc {
  v: number
  seedVersion?: string
}

function readFormat(storage: KeyValueStore): FormatDoc | null {
  try {
    const parsed = JSON.parse(storage.getItem(FORMAT_KEY) ?? 'null') as unknown
    if (isRecord(parsed) && typeof parsed.v === 'number') {
      return { v: parsed.v, seedVersion: typeof parsed.seedVersion === 'string' ? parsed.seedVersion : undefined }
    }
  } catch {
    /* ignore a broken format stamp */
  }
  return null
}

function parseBlob(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const value = JSON.parse(raw) as unknown
    return isRecord(value) ? { ok: true, value } : { ok: false }
  } catch {
    return { ok: false }
  }
}

function writeItem(storage: KeyValueStore, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch {
    for (let i = storage.length - 1; i >= 0; i--) {
      const name = storage.key(i)
      if (name?.startsWith('fit-friend-corrupt-')) storage.removeItem(name)
    }
    storage.setItem(key, value)
  }
}

export function loadPersisted(storage: KeyValueStore, aliases: Record<string, string> = exerciseIdAliases): LoadResult {
  const noticeKeys: string[] = []
  let recovered: StorageNotice['recovered'] = 'none'
  let stateBlob: Record<string, unknown> | null = null
  let catalogBlob: Record<string, unknown> | null = null
  let sawAnything = false

  const stateRaw = storage.getItem(STATE_KEY)
  if (stateRaw) {
    sawAnything = true
    const parsed = parseBlob(stateRaw)
    if (parsed.ok) stateBlob = parsed.value
    else {
      const key = saveCorruptBackup(storage, stateRaw, '')
      if (key) noticeKeys.push(key)
      storage.removeItem(STATE_KEY)
    }
  }

  const catalogRaw = storage.getItem(CATALOG_KEY)
  if (catalogRaw) {
    sawAnything = true
    const parsed = parseBlob(catalogRaw)
    if (parsed.ok && Array.isArray(parsed.value.exercises) && Array.isArray(parsed.value.programs)) {
      catalogBlob = parsed.value
    } else {
      const key = saveCorruptBackup(storage, catalogRaw, '-catalog')
      if (key) noticeKeys.push(key)
      storage.removeItem(CATALOG_KEY)
    }
  }

  if (!stateBlob) {
    for (const legacyKey of LEGACY_STATE_KEYS) {
      const raw = storage.getItem(legacyKey)
      if (!raw) continue
      sawAnything = true
      const parsed = parseBlob(raw)
      if (parsed.ok) {
        stateBlob = parsed.value
        break
      }
      const key = saveCorruptBackup(storage, raw, '-legacy')
      if (key) noticeKeys.push(key)
    }
  }

  const notice: StorageNotice | null = noticeKeys.length
    ? {
        kind: 'corrupt',
        message: 'We couldn\u2019t read your saved data. A backup copy was kept.',
        backupKeys: noticeKeys,
        recovered: stateBlob ? 'activity' : catalogBlob ? 'catalog' : recovered,
      }
    : null

  if (!stateBlob && !catalogBlob) {
    return { state: null, needsSeedMerge: true, hotSeq: 0, notice, appliedMigrations: [] }
  }

  const format = readFormat(storage)
  const fromVersion = stateBlob && storage.getItem(STATE_KEY) && format ? format.v : 0
  const combined: Record<string, unknown> = { ...(stateBlob ?? {}) }
  delete combined[HOT_SEQ_FIELD]
  if (catalogBlob) {
    combined.exercises = catalogBlob.exercises
    combined.programs = catalogBlob.programs
  }
  const hotSeq = stateBlob && typeof stateBlob[HOT_SEQ_FIELD] === 'number' ? (stateBlob[HOT_SEQ_FIELD] as number) : 0
  const migrated = runMigrations(combined, fromVersion, aliases)
  const storedSeed = storage.getItem(SEED_VERSION_KEY)
  const needsSeedMerge = storedSeed !== SEED_VERSION || !sawAnything
  if (fromVersion < FORMAT_VERSION && stateRaw && !storage.getItem(PREMIGRATE_KEY)) {
    try {
      storage.setItem(PREMIGRATE_KEY, stateRaw)
    } catch {
      /* a missing premigrate copy is not fatal */
    }
  }
  return {
    state: migrated.state,
    needsSeedMerge,
    hotSeq,
    notice,
    appliedMigrations: migrated.applied,
  }
}

export function savePersisted(
  storage: KeyValueStore,
  state: AppState,
  options: { hotSeq?: number; seedVersion?: string } = {},
): void {
  const normalized = normalizeState(state)
  const { exercises, programs, ...rest } = normalized
  const programsToSave = programs.map((program) => {
    if (!program.activeInstance) return program
    const copy = { ...program }
    delete copy.activeInstance
    return copy
  })
  const body = options.hotSeq ? { ...rest, [HOT_SEQ_FIELD]: options.hotSeq } : rest
  writeItem(storage, STATE_KEY, JSON.stringify(body))
  writeItem(storage, CATALOG_KEY, JSON.stringify({ exercises, programs: programsToSave }))
  writeItem(
    storage,
    FORMAT_KEY,
    JSON.stringify({ v: FORMAT_VERSION, seedVersion: options.seedVersion ?? SEED_VERSION }),
  )
  writeItem(storage, SEED_VERSION_KEY, options.seedVersion ?? SEED_VERSION)
  for (const legacy of LEGACY_STATE_KEYS) storage.removeItem(legacy)
}
