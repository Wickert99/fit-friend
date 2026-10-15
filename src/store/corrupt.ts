import type { AppState, CorruptBackup, RestoreResult } from '../types.ts'
import { CORRUPT_PREFIX } from './keys.ts'
import { isRecord, normalizeState } from './normalize.ts'
import type { KeyValueStore } from './storage.ts'

export function listCorruptBackups(storage: KeyValueStore): CorruptBackup[] {
  const found: CorruptBackup[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key?.startsWith(CORRUPT_PREFIX)) continue
    const rest = key.slice(CORRUPT_PREFIX.length)
    const kind = rest.endsWith('-catalog') ? 'catalog' : 'state'
    found.push({
      key,
      at: Number.parseInt(rest, 10) || 0,
      kind,
      bytes: (storage.getItem(key) ?? '').length,
    })
  }
  return found.sort((a, b) => b.at - a.at)
}

export function deleteCorruptBackup(storage: KeyValueStore, key: string): boolean {
  if (!key.startsWith(CORRUPT_PREFIX) || storage.getItem(key) == null) return false
  storage.removeItem(key)
  return true
}

export function saveCorruptBackup(storage: KeyValueStore, raw: string, suffix: string): string | null {
  const key = `${CORRUPT_PREFIX}${Date.now()}${suffix}`
  try {
    storage.setItem(key, raw)
    return key
  } catch {
    for (const backup of listCorruptBackups(storage)) storage.removeItem(backup.key)
    try {
      storage.setItem(key, raw)
      return key
    } catch {
      return null
    }
  }
}

/** Close truncated JSON the way the original recovery path does, enough to salvage a prefix. */
export function repairJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    /* try to close an interrupted write */
  }
  let text = raw.trim()
  for (let attempt = 0; attempt < 200 && text.length > 1; attempt++) {
    const stack: string[] = []
    let inString = false
    let escaped = false
    for (const char of text) {
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') inString = true
      else if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']')
      else if (char === '}' || char === ']') stack.pop()
    }
    const closed = `${(inString ? `${text}"` : text).replace(/[,:]\s*$/, '')}${stack.reverse().join('')}`
    try {
      return JSON.parse(closed)
    } catch {
      const cut = Math.max(text.lastIndexOf(','), text.lastIndexOf('{'), text.lastIndexOf('['))
      if (cut <= 0) break
      text = text.slice(0, text[cut] === ',' ? cut : cut + 1)
    }
  }
  return undefined
}

export function readBackup(storage: KeyValueStore, key: string): RestoreResult {
  const raw = key.startsWith(CORRUPT_PREFIX) ? storage.getItem(key) : null
  if (raw == null) return { ok: false, key, error: 'Backup not found.' }
  const kind = key.endsWith('-catalog') ? 'catalog' : 'state'
  let repaired = false
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = repairJson(raw)
    repaired = true
  }
  if (!isRecord(parsed)) {
    return { ok: false, key, error: "The backup couldn't be read or repaired." }
  }
  const data: Partial<AppState> = {}
  if (Array.isArray(parsed.exercises)) {
    data.exercises = normalizeState({ exercises: parsed.exercises }).exercises
  }
  if (Array.isArray(parsed.programs)) {
    data.programs = normalizeState({ programs: parsed.programs }).programs
  }
  if (kind === 'state') {
    const { exercises: _exercises, programs: _programs, ...rest } = parsed
    Object.assign(data, normalizeState(rest))
    if (data.exercises && parsed.exercises) data.exercises = normalizeState({ exercises: parsed.exercises }).exercises
    if (data.programs && parsed.programs) data.programs = normalizeState({ programs: parsed.programs }).programs
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, key, error: 'The backup has nothing that can be restored.' }
  }
  const summary = [
    data.sessions ? `${data.sessions.length} sessions` : '',
    data.exercises ? `${data.exercises.length} exercises` : '',
    data.programs ? `${data.programs.length} programs` : '',
  ]
    .filter(Boolean)
    .join(', ')
  return { ok: true, key, kind, repaired, data, summary: summary || 'settings' }
}

export function mergeBackup(current: AppState, patch: Partial<AppState>): AppState {
  const byId = <T extends { id: string }>(base: T[], extra: T[] | undefined): T[] => {
    if (!extra) return base
    const map = new Map(base.map((item) => [item.id, item]))
    for (const item of extra) map.set(item.id, item)
    return [...map.values()]
  }
  return normalizeState({
    ...current,
    ...patch,
    sessions: byId(current.sessions, patch.sessions),
    exercises: byId(current.exercises, patch.exercises),
    programs: byId(current.programs, patch.programs),
  })
}
