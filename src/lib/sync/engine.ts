import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppState } from '../../types.ts'
import { exerciseIdAliases } from '../../store/aliases.ts'
import { CATALOG_KEY, HOT_SEQ_FIELD, STATE_KEY, SYNC_KEYS } from '../../store/keys.ts'
import { remapExerciseAliases } from '../../store/normalize.ts'
import { savePersisted } from '../../store/persist.ts'
import { browserStorage } from '../../store/storage.ts'
import { isSupabaseConfigured, loadSupabase } from '../supabase/client.ts'
import { deleteOwnPostBySession } from '../../features/friends/progressApi.ts'
import {
  MAX_RECORD_BYTES,
  attachSeedCatalog,
  backfillClock,
  baselineHashes,
  byteSize,
  bumpTime,
  chunk,
  contentHash,
  cursorOf,
  deletedSessionIds,
  hashRecords,
  integrateRemote,
  markDeleted,
  massDelete,
  missingFromLocal,
  noteLocalEdits,
  parseRecordKey,
  protectMatches,
  pushPayloads,
  recordKey,
  recordsForSync,
  skipEcho,
  syncBaselineState,
  tombstones,
  applyChanges,
  type Clock,
  type Meta,
  type PushRecord,
  type RemoteRecord,
} from './records.ts'

export type SyncPhase = 'off' | 'synced' | 'syncing' | 'offline' | 'error' | 'paused'

export interface SyncStatus {
  phase: SyncPhase
  lastSyncedAt: string | null
  error?: string
  pending?: number
}

export interface BackupSummary {
  id: string
  created_at: string
  size_bytes: number
  device_label: string | null
}

interface MetaDoc {
  uid: string | null
  cursor: number
  recs: Meta
  paused?: 'cloud-deleted'
}

const PAGE = 1000
const OVERLAP = 100
const DEBOUNCE_MS = 2000
const POLL_MS = 60_000
const REMOVED_KEYS = [SYNC_KEYS.outbox, SYNC_KEYS.force]

class StaleSync extends Error {}

const listeners = new Set<(status: SyncStatus) => void>()
let status: SyncStatus = readStatus()
if (status.phase === 'syncing') status = { ...status, phase: 'off' }

let clientPromise: Promise<SupabaseClient | null> | null = null
let replacer: ((state: AppState) => void) | null = null
let memory: AppState | null = null
let quiet: AppState | null = null
let uid: string | null = null
let leader = false
let started = false
let booting = false
let firstSync = false
let resetPending = false
let channel: BroadcastChannel | null = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let running: Promise<void> | null = null
let rerun = false
let retryMs = 2000
const tabId = Math.random().toString(36).slice(2)
let protectedAt = new Map<string, string>()
let diskTimer: ReturnType<typeof setTimeout> | null = null

function emptyMeta(): MetaDoc {
  return { uid: null, cursor: 0, recs: {} }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function readMeta(): MetaDoc {
  return readJson(SYNC_KEYS.state, emptyMeta())
}

function writeMeta(meta: MetaDoc): void {
  writeJson(SYNC_KEYS.state, meta)
}

function readClock(): Clock {
  return readJson(SYNC_KEYS.clock, {})
}

function writeClock(clock: Clock): void {
  writeJson(SYNC_KEYS.clock, clock)
}

function readGen(): string {
  return localStorage.getItem(SYNC_KEYS.gen) ?? '0'
}

function bumpGen(): void {
  localStorage.setItem(SYNC_KEYS.gen, String(Number(readGen()) + 1))
}

function readStatus(): SyncStatus {
  return readJson(SYNC_KEYS.status, { phase: 'off', lastSyncedAt: null })
}

function publish(patch: Partial<SyncStatus>, persist = true): void {
  status = { ...status, ...patch }
  if (patch.phase && patch.phase !== 'error') delete status.error
  if (persist) {
    try {
      writeJson(SYNC_KEYS.status, status)
    } catch {
      /* quota */
    }
  }
  listeners.forEach((listener) => listener(status))
}

export function getSyncStatus(): SyncStatus {
  return status
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isSyncAvailable(): boolean {
  return isSupabaseConfigured
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function nowIso(): string {
  return new Date().toISOString()
}

function hashesOf(state: AppState): Map<string, string> {
  return hashRecords(recordsForSync(state, baselineHashes()))
}

function sameHashes(left: Map<string, string>, right: Map<string, string>): boolean {
  if (left.size !== right.size) return false
  for (const [key, hash] of left) if (right.get(key) !== hash) return false
  return true
}

function rememberProtection(clock: Clock, hashes: Map<string, string>): void {
  protectedAt = protectMatches(clock, hashes)
}

export function readDiskState(): AppState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    const catalogRaw = localStorage.getItem(CATALOG_KEY)
    if (!raw && !catalogRaw) return null
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    delete parsed[HOT_SEQ_FIELD]
    if (catalogRaw) {
      const catalog = JSON.parse(catalogRaw) as { exercises?: unknown; programs?: unknown }
      if (Array.isArray(catalog.exercises)) parsed.exercises = catalog.exercises
      if (Array.isArray(catalog.programs)) parsed.programs = catalog.programs
    }
    if (!parsed.profile || typeof parsed.profile !== 'object') return null
    return parsed as unknown as AppState
  } catch {
    return null
  }
}

function commit(next: AppState): void {
  quiet = next
  memory = next
  rememberProtection(readClock(), hashesOf(next))
  if (replacer) replacer(next)
  else savePersisted(browserStorage(), next)
}

function broadcast(message: { type: string }): void {
  channel?.postMessage({ ...message, from: tabId })
}

function client(): Promise<SupabaseClient | null> {
  clientPromise ??= loadSupabase()
  return clientPromise
}

function deviceLabel(reason?: string): string {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const os = /iPhone|iPad/.test(agent)
    ? 'iOS'
    : /Android/.test(agent)
      ? 'Android'
      : /Mac/.test(agent)
        ? 'Mac'
        : /Windows/.test(agent)
          ? 'Windows'
          : 'Browser'
  return (reason ? `${os} · ${reason}` : os).slice(0, 80)
}

async function insertBackup(state: AppState, reason?: string): Promise<void> {
  const supabase = await client()
  if (!supabase || !uid) throw new Error('Not signed in')
  const { error } = await supabase.from('user_backups').insert({
    payload: state,
    schema_version: 5,
    device_label: deviceLabel(reason),
  })
  if (error) throw error
}

function schedule(delay = DEBOUNCE_MS): void {
  if (!uid || !leader) return
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void runLoop()
  }, delay)
}

function onUserState(next: AppState): void {
  if (next === quiet) {
    quiet = null
    memory = next
    rememberProtection(readClock(), hashesOf(next))
    return
  }
  const previous = memory
  const previousHashes = previous ? hashesOf(previous) : null
  memory = next
  if (!uid) return
  const nextHashes = hashesOf(next)
  if (previous && previous !== quiet && previousHashes && !sameHashes(previousHashes, nextHashes)) {
    const clock = readClock()
    const skip = (key: string) => skipEcho(key, clock, previousHashes.get(key), protectedAt.get(key))
    writeClock(noteLocalEdits(previousHashes, nextHashes, clock, nowIso(), skip))
    rememberProtection(readClock(), nextHashes)
  } else {
    rememberProtection(readClock(), nextHashes)
  }
  broadcast({ type: 'state' })
  schedule()
}

export function notifySyncStateChange(state: AppState): void {
  ensureSyncEngine()
  onUserState(state)
}

export function registerSyncReplacer(apply: (state: AppState) => void): () => void {
  replacer = apply
  ensureSyncEngine()
  if (memory) apply(memory)
  schedule(0)
  return () => {
    if (replacer === apply) replacer = null
  }
}

function scheduleAdopt(): void {
  if (diskTimer) clearTimeout(diskTimer)
  diskTimer = setTimeout(() => {
    diskTimer = null
    adoptDisk()
  }, 50)
}

function adoptDisk(): void {
  const disk = readDiskState()
  if (!disk) return
  if (resetPending) {
    resetPending = false
    commit(disk)
    return
  }
  if (!memory) {
    memory = disk
    rememberProtection(readClock(), hashesOf(disk))
    return
  }
  const before = hashesOf(memory)
  const after = hashesOf(disk)
  if (sameHashes(before, after)) return
  onUserState(disk)
}

function installHooks(): void {
  if (started || typeof window === 'undefined') return
  started = true
  for (const key of REMOVED_KEYS) localStorage.removeItem(key)
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(SYNC_KEYS.channel)
    channel.onmessage = (event: MessageEvent<{ type?: string; from?: string }>) => {
      if (!event.data || event.data.from === tabId) return
      if (event.data.type === 'reset') {
        resetPending = true
        protectedAt = new Map()
      }
      if (event.data.type === 'state' || event.data.type === 'reset') scheduleAdopt()
      if (event.data.type === 'kick') schedule(0)
    }
  }
  window.addEventListener('storage', (event) => {
    if (event.key === STATE_KEY || event.key === CATALOG_KEY) scheduleAdopt()
    if (event.key === SYNC_KEYS.status && event.newValue && !leader) {
      try {
        publish(JSON.parse(event.newValue) as SyncStatus, false)
      } catch {
        /* ignore */
      }
    }
  })
  const storageProto = Storage.prototype
  const originalSet = storageProto.setItem
  storageProto.setItem = function setItem(key: string, value: string) {
    originalSet.call(this, key, value)
    if (this === localStorage && (key === STATE_KEY || key === CATALOG_KEY)) scheduleAdopt()
  }
  window.addEventListener('online', () => schedule(0))
  window.addEventListener('offline', () => {
    if (uid) publish({ phase: 'offline' })
  })
  window.addEventListener('focus', () => {
    scheduleAdopt()
    schedule(0)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleAdopt()
      schedule(0)
    }
  })
  const locks = navigator.locks
  if (locks?.request) {
    void locks.request(SYNC_KEYS.leader, () => {
      leader = true
      schedule(0)
      return new Promise(() => {})
    })
  } else {
    leader = true
  }
  void client().then((supabase) => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setUid(data.session?.user?.id ?? null))
    supabase.auth.onAuthStateChange((_event, session) => setUid(session?.user?.id ?? null))
  })
}

function setUid(next: string | null): void {
  if (next === uid) return
  uid = next
  if (!uid) {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    publish({ phase: 'off' })
    return
  }
  firstSync = true
  protectedAt = new Map()
  if (memory) rememberProtection(readClock(), hashesOf(memory))
  publish({ phase: online() ? 'syncing' : 'offline' })
  pollTimer ??= setInterval(() => {
    if (document.visibilityState === 'visible') schedule(0)
  }, POLL_MS)
  schedule(0)
}

export function ensureSyncEngine(): void {
  if (booting || typeof window === 'undefined') return
  booting = true
  installHooks()
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message)
  return 'Sync failed'
}

async function runLoop(): Promise<void> {
  if (running) {
    rerun = true
    return running
  }
  running = (async () => {
    try {
      do {
        rerun = false
        await cycle()
      } while (rerun)
      retryMs = 2000
    } catch (error) {
      if (error instanceof StaleSync) return
      publish(online() ? { phase: 'error', error: messageOf(error) } : { phase: 'offline' })
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = setTimeout(() => void runLoop(), retryMs)
      retryMs = Math.min(retryMs * 2, POLL_MS)
    } finally {
      running = null
    }
  })()
  return running
}

async function fetchPage(supabase: SupabaseClient, afterRev: number, liveOnly = false): Promise<RemoteRecord[]> {
  const rows: RemoteRecord[] = []
  let cursor = afterRev
  for (;;) {
    let query = supabase
      .from('user_records')
      .select(liveOnly ? 'kind,id,updated_at,rev' : 'kind,id,data,updated_at,deleted_at,rev')
      .gt('rev', cursor)
      .order('rev', { ascending: true })
      .limit(PAGE)
    if (liveOnly) query = query.is('deleted_at', null)
    const { data, error } = await query
    if (error) throw error
    const page = (data ?? []) as unknown as RemoteRecord[]
    rows.push(...page)
    if (page.length < PAGE) return rows
    cursor = Number(page[page.length - 1]?.rev) || cursor
  }
}

async function pull(supabase: SupabaseClient, userId: string, check: () => void): Promise<void> {
  const meta = readMeta()
  const rows = await fetchPage(supabase, Math.max(0, (meta.cursor || 0) - OVERLAP))
  const state = memory
  if (!state) return
  const records = recordsForSync(state, baselineHashes())
  const clock = readClock()
  const drifted = Object.entries(clock)
    .filter(([key, stamp]) => {
      const record = records.get(key)
      return !!record && !stamp.d && contentHash(record.data) !== stamp.h && meta.recs[key]?.h === stamp.h
    })
    .map(([key]) => key)
  const needed = [...missingFromLocal(records, clock), ...drifted].filter(
    (key) => !rows.some((row) => recordKey(row.kind, row.id) === key),
  )
  if (needed.length > 0) {
    const ids = [...new Set(needed.map((key) => parseRecordKey(key).id))].slice(0, 200)
    const { data, error } = await supabase.from('user_records').select('kind,id,data,updated_at,deleted_at,rev').in('id', ids)
    if (error) throw error
    for (const row of (data ?? []) as unknown as RemoteRecord[]) {
      if (needed.includes(recordKey(row.kind, row.id))) rows.push(row)
    }
  }
  check()
  const current = memory ?? state
  const localRecords = recordsForSync(current, baselineHashes())
  const integrated = integrateRemote(rows, readClock(), readMeta().recs, hashesOf(current))
  const removing = integrated.apply.filter((change) => change.data === null && localRecords.has(recordKey(change.kind, change.id))).length
  if (massDelete(removing, localRecords.size)) {
    await insertBackup(current, 'before cloud deletes')
    check()
  }
  const cursor = cursorOf(rows, meta.cursor || 0)
  writeClock(integrated.clock)
  writeMeta({ ...readMeta(), uid: userId, cursor, recs: integrated.meta })
  if (integrated.apply.length === 0) return
  const applied = applyChanges(current, integrated.apply, syncBaselineState())
  const before = hashesOf(current)
  const remapped = remapExerciseAliases(applied, exerciseIdAliases)
  const after = hashesOf(remapped)
  if (!sameHashes(before, after)) writeClock(noteLocalEdits(before, after, readClock(), nowIso()))
  commit(remapped)
  for (const id of deletedSessionIds(integrated.apply)) void deleteOwnPostBySession(id)
  if (!sameHashes(before, after)) schedule()
}

async function push(supabase: SupabaseClient, check: () => void): Promise<number> {
  if (!memory) return 0
  const ready = pushPayloads(recordsForSync(memory, baselineHashes()), readClock(), readMeta().recs).filter(
    (row) => byteSize(row.data) <= MAX_RECORD_BYTES,
  )
  for (const part of chunk(ready)) {
    const { error } = await supabase.rpc('upsert_user_records', { records: part })
    if (error) throw error
    check()
    const meta = readMeta()
    for (const row of part) {
      const key = recordKey(row.kind, row.id)
      meta.recs[key] = row.deleted_at ? { h: '', u: row.updated_at, d: 1 } : { h: contentHash(row.data), u: row.updated_at }
    }
    writeMeta(meta)
  }
  return ready.length
}

async function cycle(): Promise<void> {
  if (!replacer) return
  const supabase = await client()
  const userId = uid
  const state = memory ?? readDiskState()
  if (!supabase || !userId || !state) return
  if (!memory) memory = state
  const gen = readGen()
  const check = () => {
    if (readGen() !== gen || uid !== userId) throw new StaleSync()
  }
  let meta = readMeta()
  if (meta.paused && meta.uid === userId) {
    publish({ phase: 'paused' })
    return
  }
  if (!online()) {
    publish({ phase: 'offline' })
    return
  }
  publish({ phase: 'syncing' })
  const records = recordsForSync(memory ?? state, baselineHashes())
  const uidChanged = meta.uid !== userId
  if (uidChanged) meta = { uid: userId, cursor: 0, recs: {} }
  let clock = readClock()
  if (firstSync || uidChanged) {
    clock = backfillClock(records, uidChanged ? {} : clock, nowIso(), { backfill: uidChanged })
    if (uidChanged && records.size > 0 && memory) await insertBackup(memory, 'before first sync')
    check()
    writeClock(clock)
    writeMeta(meta)
    firstSync = false
  }
  await pull(supabase, userId, check)
  await push(supabase, check)
  await pull(supabase, userId, check)
  const pending = memory ? pushPayloads(recordsForSync(memory, baselineHashes()), readClock(), readMeta().recs) : []
  const oversized = pending.filter((row) => byteSize(row.data) > MAX_RECORD_BYTES).length
  publish(
    oversized
      ? {
          phase: 'error',
          error: `${oversized} record(s) over 64 KB not synced`,
          lastSyncedAt: nowIso(),
          pending: pending.length,
        }
      : { phase: 'synced', lastSyncedAt: nowIso(), pending: pending.length },
  )
}

export async function backupNow(): Promise<void> {
  const state = memory ?? readDiskState()
  if (!state) throw new Error('Nothing to back up')
  await insertBackup(state)
}

export async function listBackups(): Promise<BackupSummary[]> {
  const supabase = await client()
  if (!supabase || !uid) throw new Error('Not signed in')
  const { data, error } = await supabase
    .from('user_backups')
    .select('id,created_at,size_bytes,device_label')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return (data ?? []) as BackupSummary[]
}

export async function restoreBackup(id: string): Promise<void> {
  const supabase = await client()
  if (!supabase || !uid) throw new Error('Not signed in')
  const { data, error } = await supabase.from('user_backups').select('payload').eq('id', id).single()
  if (error) throw error
  const payload = (data as { payload?: unknown } | null)?.payload
  if (!payload || typeof payload !== 'object') throw new Error('Backup is empty')
  const previous = memory ?? readDiskState()
  const previousRecords = previous ? recordsForSync(previous, baselineHashes()) : new Map()
  const restored = attachSeedCatalog(payload as AppState, false, previous)
  if (!restored) throw new Error('Backup could not be read back')
  const records = recordsForSync(restored, baselineHashes())
  const now = nowIso()
  let clock = backfillClock(records, readClock(), now, { forceAll: true })
  clock = markDeleted(
    clock,
    [...previousRecords.keys()].filter((key) => !records.has(key)),
    now,
  )
  writeClock(clock)
  commit(restored)
  broadcast({ type: 'kick' })
  schedule(0)
}

export function prepareSyncForLocalReset(): void {
  if (syncTimer) clearTimeout(syncTimer)
  if (retryTimer) clearTimeout(retryTimer)
  syncTimer = null
  retryTimer = null
  bumpGen()
  writeMeta(emptyMeta())
  localStorage.removeItem(SYNC_KEYS.clock)
  protectedAt = new Map()
  quiet = null
  memory = null
  broadcast({ type: 'reset' })
  if (uid) publish({ phase: online() ? 'syncing' : 'offline' })
}

export async function deleteMyCloudData(): Promise<number> {
  const supabase = await client()
  const userId = uid
  if (!supabase || !userId) throw new Error('Not signed in')
  if (!online()) throw new Error('You are offline')
  await runLoop()
  if (syncTimer) clearTimeout(syncTimer)
  if (retryTimer) clearTimeout(retryTimer)
  syncTimer = null
  retryTimer = null
  bumpGen()
  const state = memory ?? readDiskState()
  if (!state) throw new Error('Nothing to back up')
  await insertBackup(state, 'before cloud delete')
  const live = await fetchPage(supabase, 0, true)
  const rows = tombstones(live, nowIso())
  for (const part of chunk(rows)) {
    const { error } = await supabase.rpc('upsert_user_records', { records: part as PushRecord[] })
    if (error) throw error
  }
  const recs: Meta = {}
  for (const row of rows) recs[recordKey(row.kind, row.id)] = { h: '', u: row.updated_at, d: 1 }
  const cursor = live.reduce((max, row) => Math.max(max, Number(row.rev) || 0), readMeta().cursor || 0)
  writeMeta({ uid: userId, cursor, recs, paused: 'cloud-deleted' })
  publish({ phase: 'paused', lastSyncedAt: nowIso() })
  return rows.length
}

export function resumeSyncing(): void {
  const meta = readMeta()
  delete meta.paused
  writeMeta(meta)
  const state = memory ?? readDiskState()
  if (!state) {
    schedule(0)
    return
  }
  const records = recordsForSync(state, baselineHashes())
  let clock = readClock()
  const now = nowIso()
  for (const [key, record] of records) {
    clock = {
      ...clock,
      [key]: { h: contentHash(record.data), t: bumpTime(meta.recs[key]?.u ?? clock[key]?.t, now) },
    }
  }
  writeClock(clock)
  schedule(0)
}
