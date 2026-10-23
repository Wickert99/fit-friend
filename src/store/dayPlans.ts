import type { CompletedPlanRecord, PlannedSession, WorkoutSession } from '../types.ts'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export function isDateKey(value: string | undefined | null): value is string {
  return !!value && DATE_KEY.test(value)
}

function uniqueId(base: string, used: Set<string>): string {
  const root = base || 'workout'
  if (!used.has(root)) return root
  let n = 2
  while (used.has(`${root}~${n}`)) n += 1
  return `${root}~${n}`
}

/**
 * One entry per workout. The map key is the plan id, never the calendar day.
 * A colliding id keeps the first plan and gives the later one a new id.
 */
export function indexPlanList(entries: { key: string; plan: PlannedSession }[]): Record<string, PlannedSession> {
  const next: Record<string, PlannedSession> = {}
  const used = new Set<string>()
  for (const { key, plan } of entries) {
    const dateKey = plan.dateKey || (isDateKey(key) ? key : '')
    if (!dateKey) continue
    let id = plan.id || (isDateKey(key) ? `plan-${key}` : key)
    if (!id || used.has(id)) id = uniqueId(id || `plan-${dateKey}`, used)
    used.add(id)
    next[id] = { ...plan, id, dateKey }
  }
  return next
}

export function indexPlansById(plans: Record<string, PlannedSession> | undefined): Record<string, PlannedSession> {
  return indexPlanList(Object.entries(plans ?? {}).map(([key, plan]) => ({ key, plan })))
}

export function plansOnDate(plans: Record<string, PlannedSession> | undefined, dateKey: string): PlannedSession[] {
  const found: PlannedSession[] = []
  const seen = new Set<string>()
  for (const [key, plan] of Object.entries(plans ?? {})) {
    if (!plan) continue
    const date = plan.dateKey || (isDateKey(key) ? key : '')
    if (date !== dateKey) continue
    const id = plan.id || key
    if (seen.has(id)) continue
    seen.add(id)
    found.push({ ...plan, id, dateKey: date })
  }
  return found.sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '') || a.id.localeCompare(b.id))
}

/** Insert or replace one plan. Other workouts on the same day stay. */
export function putPlan(plans: Record<string, PlannedSession> | undefined, plan: PlannedSession): Record<string, PlannedSession> {
  const next = { ...(plans ?? {}) }
  for (const [key, existing] of Object.entries(next)) {
    if (key !== plan.id && existing?.id === plan.id) delete next[key]
  }
  if (isDateKey(plan.dateKey) && next[plan.dateKey]?.id === plan.id) delete next[plan.dateKey]
  next[plan.id] = plan
  return next
}

export function removePlan(plans: Record<string, PlannedSession> | undefined, id: string): Record<string, PlannedSession> {
  const next = { ...(plans ?? {}) }
  for (const [key, plan] of Object.entries(next)) {
    if (key === id || plan?.id === id) delete next[key]
  }
  return next
}

export function removePlansOnDate(plans: Record<string, PlannedSession> | undefined, dateKey: string): Record<string, PlannedSession> {
  const next = { ...(plans ?? {}) }
  for (const [key, plan] of Object.entries(next)) {
    const date = plan?.dateKey || (isDateKey(key) ? key : '')
    if (date === dateKey) delete next[key]
  }
  return next
}

/**
 * Split workouts that share an id. The last copy keeps the id (that is the row
 * sync already upserted). Earlier copies get a new id and are not dropped.
 */
export function uniqueSessionIds(sessions: WorkoutSession[]): WorkoutSession[] {
  const totals = new Map<string, number>()
  for (const session of sessions) totals.set(session.id || '', (totals.get(session.id || '') ?? 0) + 1)
  const seen = new Map<string, number>()
  const used = new Set<string>()
  return sessions.map((session, index) => {
    const original = session.id || ''
    const total = totals.get(original) ?? 1
    const nth = (seen.get(original) ?? 0) + 1
    seen.set(original, nth)
    let id = original
    if (!original || nth !== total || used.has(original)) {
      const base = original ? `${original}~${nth}` : `ses-${index + 1}`
      id = used.has(base) ? uniqueId(base, used) : base
    }
    used.add(id)
    return id === session.id ? session : { ...session, id }
  })
}

export function indexCompletedPlans(
  records: Record<string, CompletedPlanRecord> | undefined,
): Record<string, CompletedPlanRecord> | undefined {
  if (!records) return records
  const next: Record<string, CompletedPlanRecord> = {}
  const used = new Set<string>()
  for (const [key, record] of Object.entries(records)) {
    const plan = record?.plan
    let id = plan?.id || (isDateKey(key) ? `plan-${key}` : key)
    if (!id || used.has(id)) id = uniqueId(id || `plan-${key}`, used)
    used.add(id)
    if (plan) {
      const dateKey = plan.dateKey || (isDateKey(key) ? key : plan.dateKey)
      next[id] = { ...record, plan: { ...plan, id, dateKey } }
    } else {
      next[id] = record
    }
  }
  return next
}

/** Store a cloud planned_session under its own id. A date-keyed legacy row does not wipe other workouts that day. */
export function applyPlannedRecord(
  plans: Record<string, PlannedSession> | undefined,
  id: string,
  data: PlannedSession | null,
): Record<string, PlannedSession> {
  if (data == null) return removePlan(plans, id)
  const dateKey = data.dateKey || (isDateKey(id) ? id : '')
  const planId = data.id || (isDateKey(id) ? `plan-${id}` : id)
  if (!dateKey || !planId) return plans ?? {}
  const next = putPlan(plans, { ...data, id: planId, dateKey })
  if (id !== planId) delete next[id]
  return next
}
