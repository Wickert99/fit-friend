import type { AppState, Exercise, PersonalRecord, PlannedSession, Program } from '../../types.ts'
import { applyPlannedRecord, isDateKey } from '../../store/dayPlans.ts'

/** Kinds the recovered sync engine reads and writes. */
export const SYNC_KINDS = [
  'exercise',
  'program',
  'session',
  'pr',
  'plan_board',
  'planned_session',
  'program_instance',
  'completed_plan',
  'settings',
] as const

export type SyncKind = (typeof SYNC_KINDS)[number]

const KIND_SET = new Set<string>(SYNC_KINDS)

const SETTING_SCALARS = ['activeProgramId', 'scheduleUserOwned', 'activeBoardId', 'weightUnit'] as const
const SETTING_MAPS = ['liftMaxes', 'scheduled', 'seasonGoals', 'profile'] as const

export const MAX_RECORD_BYTES = 65536
export const EPOCH = '1970-01-01T00:00:00.000Z'

export interface SyncRecord {
  kind: string
  id: string
  data: unknown
}

export interface ClockStamp {
  h: string
  t: string
  d?: 1
}

export interface MetaStamp {
  h: string
  u: string
  d?: 1
}

export interface RemoteRecord {
  kind: string
  id: string
  data: unknown
  updated_at: string
  deleted_at?: string | null
  rev?: number | string | null
}

export interface PushRecord {
  kind: string
  id: string
  data: unknown
  updated_at: string
  deleted_at: string | null
}

export interface ApplyChange {
  kind: string
  id: string
  data: unknown | null
}

export type Clock = Record<string, ClockStamp>
export type Meta = Record<string, MetaStamp>

export function recordKey(kind: string, id: string): string {
  return `${kind}/${id}`
}

export function parseRecordKey(key: string): { kind: string; id: string } {
  const slash = key.indexOf('/')
  return { kind: key.slice(0, slash), id: key.slice(slash + 1) }
}

export function prKey(pr: Pick<PersonalRecord, 'exerciseId' | 'sessionId' | 'reps' | 'loadKg'>): string {
  return `${pr.exerciseId}|${pr.sessionId}|${pr.reps}|${pr.loadKg}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T
}

function wrapSetting(value: unknown): { v: unknown } {
  if (value === undefined) return { v: null }
  return { v: clone({ v: value }).v }
}

/** Canonical JSON. Object keys are sorted. Undefined object fields are omitted. */
export function canonicalString(value: unknown): string {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalString(item))).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalString(record[key])}`)
    .join(',')}}`
}

/** Drops null, '', false, 0, empty arrays, and empty objects. Array slots are kept. */
export function stripEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripEmpty(item))
  if (typeof value !== 'object' || value === null) return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = stripEmpty(child)
    if (next == null || next === '' || next === false || next === 0) continue
    if (Array.isArray(next) && next.length === 0) continue
    if (
      !next ||
      typeof next !== 'object' ||
      Array.isArray(next) ||
      Object.keys(next as Record<string, unknown>).length !== 0
    ) {
      out[key] = next
    }
  }
  return out
}

function cyrb53(text: string): string {
  let a = 3735928559
  let b = 1103547991
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    a = Math.imul(a ^ code, 2654435761)
    b = Math.imul(b ^ code, 1597334677)
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909)
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36)
}

/** Hash used as the sync identity of a record. Matches the recovered engine. */
export function contentHash(value: unknown): string {
  return cyrb53(canonicalString(stripEmpty(value)))
}

/** Older hash, without stripping empties. Used to migrate a clock entry in place. */
export function legacyHash(value: unknown): string {
  return cyrb53(canonicalString(value))
}

export function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

function time(value: string | undefined): number {
  return value ? Date.parse(value) || 0 : 0
}

export function isNewer(left: string, right: string): boolean {
  return time(left) > time(right)
}

/** Use `next` when it is newer. Otherwise bump the previous stamp by 1ms. */
export function bumpTime(previous: string | undefined, next: string): string {
  if (!previous || time(next) > time(previous)) return next
  return new Date(time(previous) + 1).toISOString()
}

export function toIso(value: string): string {
  return new Date(value).toISOString()
}

function recordTime(data: unknown): string {
  const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  const inner = source?.v && typeof source.v === 'object' ? (source.v as Record<string, unknown>) : null
  for (const key of ['updatedAt', 'completedAt', 'committedAt', 'createdAt', 'startedAt', 'date']) {
    const raw = source?.[key] ?? inner?.[key]
    if (typeof raw === 'string' && Number.isFinite(Date.parse(raw))) return new Date(raw).toISOString()
  }
  return EPOCH
}

/** Empty state the original engine hashed as the "unchanged default". */
export function syncBaselineState(): AppState {
  return {
    profile: {
      id: 'user-you',
      name: 'Hugh',
      handle: '@hugh',
      avatarColor: '#a56b4e',
      bio: 'S&C curious. Building consistency.',
      streak: 0,
      isYou: true,
    },
    friends: [],
    exercises: [],
    programs: [],
    sessions: [],
    prs: [],
    activity: [],
    activeProgramId: null,
    commitmentDays: [],
    scheduled: {},
    plannedSessions: {},
    scheduleUserOwned: true,
    planBoards: [],
    activeBoardId: null,
    seasonGoals: {},
    liftMaxes: {},
    weightUnit: 'kg',
    programInstances: [],
  }
}

export function extractRecords(state: Partial<AppState> | null | undefined): Map<string, SyncRecord> {
  const records = new Map<string, SyncRecord>()
  const put = (kind: string, id: string | undefined, data: unknown) => {
    if (!id) return
    records.set(recordKey(kind, id), { kind, id, data })
  }
  const source = state ?? {}
  for (const exercise of source.exercises ?? []) {
    if (exercise.source === 'custom') put('exercise', exercise.id, clone(exercise))
  }
  for (const program of source.programs ?? []) {
    if (!program.isMine) continue
    const { activeInstance: _active, ...rest } = program
    put('program', program.id, clone(rest))
  }
  for (const session of source.sessions ?? []) put('session', session.id, clone(session))
  for (const pr of source.prs ?? []) put('pr', prKey(pr), clone(pr))
  for (const board of source.planBoards ?? []) put('plan_board', board.id, clone(board))
  for (const planned of Object.values(source.plannedSessions ?? {})) {
    if (planned?.id) put('planned_session', planned.id, clone(planned))
  }
  for (const instance of source.programInstances ?? []) put('program_instance', instance.id, clone(instance))
  for (const [key, completed] of Object.entries(source.completedPlans ?? {})) {
    const id = completed?.plan?.id || key
    if (!id) continue
    const data = completed?.plan ? { ...completed, plan: { ...completed.plan, id } } : completed
    put('completed_plan', id, clone(data))
  }
  for (const key of SETTING_SCALARS) {
    if (key in (source as object)) put('settings', key, wrapSetting((source as Record<string, unknown>)[key]))
  }
  for (const key of SETTING_MAPS) {
    const map = ((source as Record<string, unknown>)[key] ?? {}) as Record<string, unknown>
    for (const [child, value] of Object.entries(map)) {
      if (value !== undefined) put('settings', `${key}.${child}`, wrapSetting(value))
    }
  }
  for (const day of source.commitmentDays ?? []) put('settings', `commitmentDays.${day}`, { v: true })
  return records
}

/** Drop records whose content still matches the baseline hash. */
export function recordsForSync(state: Partial<AppState>, baseline: Map<string, string> = baselineHashes()): Map<string, SyncRecord> {
  const records = extractRecords(state)
  for (const [key, record] of records) {
    if (baseline.get(key) === contentHash(record.data)) records.delete(key)
  }
  return records
}

export function hashRecords(records: Map<string, SyncRecord>): Map<string, string> {
  const hashes = new Map<string, string>()
  for (const [key, record] of records) hashes.set(key, contentHash(record.data))
  return hashes
}

let cachedBaseline: Map<string, string> | null = null

export function baselineHashes(): Map<string, string> {
  if (!cachedBaseline) cachedBaseline = hashRecords(extractRecords(syncBaselineState()))
  return cachedBaseline
}

function replaceBy<T>(list: T[] | undefined, idOf: (item: T) => string, id: string, next: T | null, front = false): T[] {
  const copy = [...(list ?? [])]
  const index = copy.findIndex((item) => idOf(item) === id)
  if (next === null) {
    if (index >= 0) copy.splice(index, 1)
    return copy
  }
  if (index >= 0) copy[index] = next
  else if (front) copy.unshift(next)
  else copy.push(next)
  return copy
}

function applyCompletedRecord(
  records: AppState['completedPlans'],
  id: string,
  data: NonNullable<AppState['completedPlans']>[string] | null,
): AppState['completedPlans'] {
  const next = { ...(records ?? {}) }
  if (data == null) {
    delete next[id]
    for (const [key, record] of Object.entries(next)) {
      if (record?.plan?.id === id) delete next[key]
    }
    return next
  }
  const planId = data.plan?.id || (isDateKey(id) ? `plan-${id}` : id)
  const plan = data.plan
    ? { ...data.plan, id: planId, dateKey: data.plan.dateKey || (isDateKey(id) ? id : data.plan.dateKey) }
    : undefined
  if (id !== planId) delete next[id]
  next[planId] = plan ? { ...data, plan } : data
  return next
}

/**
 * Copy a v3 date-keyed clock entry onto the workout's own id.
 * The date entry stays so an older cloud row is not applied back over a second workout.
 */
export function adoptLegacyPlanKeys(
  clock: Clock,
  meta: Meta,
  plans: Record<string, PlannedSession>,
  completed: AppState['completedPlans'],
): { clock: Clock; meta: Meta; changed: boolean } {
  const nextClock: Clock = { ...clock }
  const nextMeta: Meta = { ...meta }
  let changed = false
  const move = (kind: string, from: string, to: string) => {
    if (!from || from === to) return
    const oldKey = recordKey(kind, from)
    const newKey = recordKey(kind, to)
    if (!nextClock[oldKey] || nextClock[newKey]) return
    nextClock[newKey] = nextClock[oldKey]
    if (nextMeta[oldKey] && !nextMeta[newKey]) nextMeta[newKey] = nextMeta[oldKey]
    changed = true
  }
  const byDate = new Map<string, PlannedSession[]>()
  for (const plan of Object.values(plans)) {
    if (!plan?.dateKey) continue
    const list = byDate.get(plan.dateKey) ?? []
    list.push(plan)
    byDate.set(plan.dateKey, list)
  }
  for (const [date, list] of byDate) {
    if (list.length !== 1 || !list[0]) continue
    move('planned_session', date, list[0].id)
  }
  for (const [id, record] of Object.entries(completed ?? {})) {
    const date = record?.plan?.dateKey
    if (date) move('completed_plan', date, record.plan?.id || id)
  }
  return { clock: nextClock, meta: nextMeta, changed }
}

function applySetting(state: AppState, id: string, data: unknown, seed: AppState): AppState {
  const dot = id.indexOf('.')
  const head = dot < 0 ? id : id.slice(0, dot)
  const tail = dot < 0 ? '' : id.slice(dot + 1)
  const wrapped = data && typeof data === 'object' ? (data as { v?: unknown }).v : undefined
  const seedRecord = seed as unknown as Record<string, unknown>
  if ((SETTING_SCALARS as readonly string[]).includes(head) && !tail) {
    return { ...state, [head]: data ? wrapped : seedRecord[head] }
  }
  if ((SETTING_MAPS as readonly string[]).includes(head) && tail) {
    const current = { ...((state as unknown as Record<string, Record<string, unknown>>)[head] ?? {}) }
    const fallback = ((seedRecord[head] ?? {}) as Record<string, unknown>)[tail]
    if (data) current[tail] = wrapped
    else if (fallback === undefined) delete current[tail]
    else current[tail] = fallback
    return { ...state, [head]: current }
  }
  if (head === 'commitmentDays' && tail) {
    const days = new Set(state.commitmentDays ?? [])
    if (data) days.add(tail)
    else days.delete(tail)
    return { ...state, commitmentDays: [...days].sort() }
  }
  return state
}

export function applyChanges(state: AppState, changes: ApplyChange[], seed: AppState = syncBaselineState()): AppState {
  let next = { ...state }
  for (const change of changes) {
    const data = change.data
    switch (change.kind) {
      case 'exercise':
        next.exercises = replaceBy(next.exercises, (item) => item.id, change.id, data as Exercise | null)
        break
      case 'program':
        next.programs = replaceBy(next.programs, (item) => item.id, change.id, data as Program | null, true)
        break
      case 'session':
        next.sessions = replaceBy(next.sessions, (item) => item.id, change.id, data as AppState['sessions'][number] | null, true)
        break
      case 'pr':
        next.prs = replaceBy(next.prs, prKey, change.id, data as PersonalRecord | null)
        break
      case 'plan_board':
        next.planBoards = replaceBy(next.planBoards, (item) => item.id, change.id, data as AppState['planBoards'][number] | null)
        break
      case 'planned_session':
        next.plannedSessions = applyPlannedRecord(next.plannedSessions, change.id, data as PlannedSession | null)
        break
      case 'program_instance':
        next.programInstances = replaceBy(
          next.programInstances,
          (item) => item.id,
          change.id,
          data as AppState['programInstances'][number] | null,
        )
        break
      case 'completed_plan':
        next.completedPlans = applyCompletedRecord(next.completedPlans, change.id, data as NonNullable<AppState['completedPlans']>[string] | null)
        break
      case 'settings':
        next = applySetting(next, change.id, data, seed)
        break
      default:
        break
    }
  }
  if (changes.some((change) => change.kind === 'session')) {
    next.sessions = [...next.sessions].sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
  }
  return next
}

/** A legacy `settings/main` blob expands into one record per setting. */
export function expandRemote(rows: RemoteRecord[]): RemoteRecord[] {
  const out: RemoteRecord[] = []
  for (const row of rows) {
    if (row.kind !== 'settings' || row.id !== 'main') {
      out.push(row)
      continue
    }
    if (row.deleted_at) continue
    const nested = row.data && typeof row.data === 'object' ? (row.data as Partial<AppState>) : {}
    for (const record of extractRecords(nested).values()) {
      if (record.kind === 'settings') {
        out.push({ ...row, id: record.id, data: record.data })
      }
    }
  }
  return out
}

export function dedupeByRev(rows: RemoteRecord[]): RemoteRecord[] {
  const best = new Map<string, RemoteRecord>()
  for (const row of rows) {
    const key = recordKey(row.kind, row.id)
    const current = best.get(key)
    if (!current || Number(row.rev ?? 0) > Number(current.rev ?? 0)) best.set(key, row)
  }
  return [...best.values()]
}

export function integrateRemote(
  rows: RemoteRecord[],
  clock: Clock,
  meta: Meta,
  localHashes: Map<string, string> | Set<string> = new Set(),
): { apply: ApplyChange[]; clock: Clock; meta: Meta } {
  const nextClock: Clock = { ...clock }
  const nextMeta: Meta = { ...meta }
  const apply: ApplyChange[] = []
  for (const row of dedupeByRev(expandRemote(rows))) {
    if (!KIND_SET.has(row.kind)) continue
    const key = recordKey(row.kind, row.id)
    const stamp = toIso(row.updated_at)
    const deleted = !!row.deleted_at
    const hash = deleted ? '' : contentHash(row.data)
    nextMeta[key] = deleted ? { h: hash, u: stamp, d: 1 } : { h: hash, u: stamp }
    const local = nextClock[key]
    const current = localHashes instanceof Map ? localHashes.get(key) : localHashes.has(key) ? hash : undefined
    const hashDrift = !!local && !local.d && !deleted && local.h === hash && current !== hash
    if (!local || isNewer(stamp, local.t) || hashDrift) {
      nextClock[key] = deleted ? { h: hash, t: stamp, d: 1 } : { h: hash, t: hashDrift ? local.t : stamp }
      if (hashDrift) nextMeta[key] = { h: hash, u: local.t }
      apply.push({ kind: row.kind, id: row.id, data: deleted ? null : row.data })
    } else if (local.h === hash && !!local.d === deleted) {
      nextMeta[key] = deleted ? { h: hash, u: local.t, d: 1 } : { h: hash, u: local.t }
    }
  }
  return { apply, clock: nextClock, meta: nextMeta }
}

export function deletedSessionIds(changes: ApplyChange[]): string[] {
  return changes.filter((change) => change.kind === 'session' && change.data === null).map((change) => change.id)
}

export function pushPayloads(records: Map<string, SyncRecord>, clock: Clock, meta: Meta): PushRecord[] {
  const payloads: PushRecord[] = []
  for (const [key, stamp] of Object.entries(clock)) {
    const known = meta[key]
    if (known && !isNewer(stamp.t, known.u)) continue
    const { kind, id } = parseRecordKey(key)
    if (stamp.d) {
      if (!known || !known.d) {
        payloads.push({ kind, id, data: {}, updated_at: stamp.t, deleted_at: stamp.t })
      }
      continue
    }
    const record = records.get(key)
    if (record && contentHash(record.data) === stamp.h) {
      payloads.push({ kind, id, data: record.data, updated_at: stamp.t, deleted_at: null })
    }
  }
  return payloads
}

export function backfillClock(
  records: Map<string, SyncRecord>,
  clock: Clock,
  now: string,
  options: { backfill?: boolean; forceAll?: boolean } = {},
): Clock {
  const next: Clock = { ...clock }
  for (const [key, record] of records) {
    const hash = contentHash(record.data)
    const current = next[key]
    if (current && !current.d && current.h === hash && !options.forceAll) continue
    if (current && !current.d && !options.forceAll && current.h === legacyHash(record.data)) {
      next[key] = { ...current, h: hash }
      continue
    }
    const historical = recordTime(record.data)
    const useHistory =
      !current &&
      !!options.backfill &&
      (record.kind !== 'settings' || historical !== EPOCH)
    next[key] = { h: hash, t: useHistory ? historical : bumpTime(current?.t, now) }
  }
  return next
}

export function noteLocalEdits(
  previous: Map<string, string> | null,
  next: Map<string, string>,
  clock: Clock,
  now: string,
  skip: (key: string) => boolean = () => false,
): Clock {
  if (!previous) return clock
  const updated: Clock = { ...clock }
  for (const [key, hash] of next) {
    if (previous.get(key) === hash || skip(key)) continue
    updated[key] = { h: hash, t: bumpTime(updated[key]?.t, now) }
  }
  for (const key of previous.keys()) {
    if (next.has(key) || skip(key)) continue
    updated[key] = { h: '', t: bumpTime(updated[key]?.t, now), d: 1 }
  }
  return updated
}

/** True when a disk echo should not restamp the clock. */
export function skipEcho(key: string, clock: Clock, previousHash: string | undefined, protectedAt: string | undefined): boolean {
  const stamp = clock[key]
  if (!stamp || protectedAt === undefined) return false
  return isNewer(stamp.t, protectedAt) && (stamp.d ? previousHash !== undefined : stamp.h !== previousHash)
}

export function protectMatches(clock: Clock, hashes: Map<string, string>): Map<string, string> {
  const protectedAt = new Map<string, string>()
  for (const [key, stamp] of Object.entries(clock)) {
    const matches = stamp.d ? !hashes.has(key) : hashes.get(key) === stamp.h
    if (matches) protectedAt.set(key, stamp.t)
  }
  return protectedAt
}

export function mergeDiskState(
  local: AppState,
  disk: AppState,
  clock: Clock,
  baseline: Map<string, string>,
  seed: AppState,
): AppState {
  const localRecords = recordsForSync(local, baseline)
  const diskRecords = recordsForSync(disk, baseline)
  const changes: ApplyChange[] = []
  const keys = new Set([...localRecords.keys(), ...diskRecords.keys(), ...Object.keys(clock)])
  for (const key of keys) {
    const stamp = clock[key]
    const here = localRecords.get(key)
    const there = diskRecords.get(key)
    const { kind, id } = parseRecordKey(key)
    if (stamp?.d) {
      if (here) changes.push({ kind, id, data: null })
      continue
    }
    if (!there) continue
    const diskHash = contentHash(there.data)
    if (!here) {
      changes.push({ kind, id, data: there.data })
      continue
    }
    const localHash = contentHash(here.data)
    if (localHash !== diskHash) {
      if (stamp && diskHash === stamp.h) {
        changes.push({ kind, id, data: there.data })
        continue
      }
      if (!(stamp && localHash === stamp.h) && diskHash > localHash) {
        changes.push({ kind, id, data: there.data })
      }
    }
  }
  return changes.length ? applyChanges(local, changes, seed) : local
}

export function missingFromLocal(records: Map<string, SyncRecord>, clock: Clock): string[] {
  return Object.entries(clock)
    .filter(([key, stamp]) => !stamp.d && !records.has(key))
    .map(([key]) => key)
}

export function markDeleted(clock: Clock, keys: string[], now: string): Clock {
  const next: Clock = { ...clock }
  for (const key of keys) next[key] = { h: '', t: bumpTime(next[key]?.t, now), d: 1 }
  return next
}

export function chunk<T>(items: T[], size = 500): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size))
  return batches
}

/** Backup before applying a cloud delete wave. */
export function massDelete(deletedPresentLocally: number, localCount: number): boolean {
  return deletedPresentLocally >= 20 || (deletedPresentLocally > 0 && deletedPresentLocally * 2 >= localCount)
}

export function tombstones(rows: Array<Pick<RemoteRecord, 'kind' | 'id' | 'updated_at'>>, now: string): PushRecord[] {
  return rows.map((row) => {
    const stamp = bumpTime(new Date(row.updated_at).toISOString(), now)
    return { kind: row.kind, id: row.id, data: {}, updated_at: stamp, deleted_at: stamp }
  })
}

export function hasSeedCatalog(state: Partial<AppState> | null | undefined): boolean {
  if (!state) return false
  return (state.exercises ?? []).some((exercise) => exercise.source !== 'custom') || (state.programs ?? []).some((program) => !program.isMine)
}

/** A user-only backup gets the seed exercises and template programs spliced back on. */
export function attachSeedCatalog(incoming: AppState | null, waitingForSeed: boolean, current: AppState | null): AppState | null {
  if (!incoming) return null
  if (!waitingForSeed && hasSeedCatalog(incoming)) return incoming
  if (!current) return null
  return {
    ...incoming,
    exercises: [
      ...current.exercises.filter((exercise) => exercise.source !== 'custom'),
      ...(incoming.exercises ?? []).filter((exercise) => exercise.source === 'custom'),
    ],
    programs: [
      ...current.programs.filter((program) => !program.isMine),
      ...(incoming.programs ?? []).filter((program) => program.isMine),
    ],
  }
}

export function cursorOf(rows: Array<{ rev?: number | string | null }>, current = 0): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.rev) || 0), current)
}
