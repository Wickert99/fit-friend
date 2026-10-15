import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { hashFor, parseHash, resolveGo, tabMemory } from '../app/router.ts'
import type {
  Exercise,
  GoOptions,
  GoTarget,
  LeaveGuard,
  LiftMax,
  NavState,
  PlanBoard,
  PlannedSession,
  Program,
  SeasonGoals,
  StorageNotice,
  StoreApi,
  WeightUnit,
  WorkoutSession,
  WorkoutTab,
} from '../types.ts'
import * as actions from './actions.ts'
import { deleteCorruptBackup, listCorruptBackups, mergeBackup, readBackup } from './corrupt.ts'
import { journalLiftMaxes, journalSessions, reconcileJournal, reconcileLiftMaxes } from './hotJournal.ts'
import { createId } from './id.ts'
import { SEED_VERSION } from './keys.ts'
import { loadPersisted, savePersisted } from './persist.ts'
import { StoreContext } from './storeContext.ts'
import { browserStorage } from './storage.ts'

const storage = browserStorage()

export function StoreProvider({ children }: { children: ReactNode }) {
  const boot = useState(() => loadPersisted(storage))[0]
  const [state, setState] = useState(boot.state)
  const [ready, setReady] = useState(boot.state != null && !boot.needsSeedMerge)
  const [notice, setNotice] = useState<StorageNotice | null>(boot.notice)
  const [storageRevision, setStorageRevision] = useState(0)
  const [nav, setNav] = useState<NavState>(() =>
    parseHash(typeof window === 'undefined' ? '' : window.location.hash),
  )
  const backRef = useRef<NavState>(tabMemory(nav))
  const navRef = useRef(nav)
  navRef.current = nav
  const guardRef = useRef<LeaveGuard | null>(null)
  const pendingHash = useRef<string | null>(null)
  const hotSeq = useRef(boot.hotSeq)
  const liftRef = useRef(boot.state?.liftMaxes)

  useEffect(() => {
    let cancel = false
    if (boot.state && !boot.needsSeedMerge) {
      setReady(true)
      return
    }
    void import('./seed.ts').then(({ buildSeedState, mergeWithSeed }) => {
      if (cancel) return
      setState((prev) => {
        const seed = buildSeedState()
        if (!boot.state) return seed
        return mergeWithSeed(prev ?? boot.state, seed)
      })
      setReady(true)
    })
    return () => {
      cancel = true
    }
  }, [boot])

  useEffect(() => {
    if (!ready || !state) return
    savePersisted(storage, state, { hotSeq: hotSeq.current, seedVersion: SEED_VERSION })
    const active = state.sessions.filter((session) => session.status === 'in_progress')
    if (active.length) {
      hotSeq.current = Math.max(Date.now(), hotSeq.current + 1)
      void journalSessions(active, hotSeq.current)
    }
    if (liftRef.current !== state.liftMaxes) {
      liftRef.current = state.liftMaxes
      void journalLiftMaxes(state.liftMaxes, hotSeq.current)
    }
  }, [ready, state])

  useEffect(() => {
    if (!ready) return
    let cancel = false
    void reconcileJournal(boot.hotSeq).then((sessions) => {
      if (cancel || sessions.length === 0) return
      setState((prev) => {
        if (!prev) return prev
        const incoming = new Map(sessions.map((session) => [session.id, session]))
        const known = new Set(prev.sessions.map((session) => session.id))
        const added = sessions.filter((session) => !known.has(session.id))
        return {
          ...prev,
          sessions: [...added, ...prev.sessions.map((session) => incoming.get(session.id) ?? session)],
        }
      })
    })
    void reconcileLiftMaxes(boot.hotSeq).then((liftMaxes) => {
      if (cancel || !liftMaxes) return
      setState((prev) => (prev ? { ...prev, liftMaxes } : prev))
    })
    return () => {
      cancel = true
    }
  }, [ready, boot.hotSeq])

  const applyNav = useCallback((next: NavState) => {
    if (next.screen !== 'session' && next.screen !== 'workout-mode' && next.screen !== 'program-detail' && next.screen !== 'program-builder' && next.screen !== 'exercise-detail') {
      backRef.current = tabMemory(next)
    }
    setNav(next)
    const hash = hashFor(next)
    if (!hash || window.location.hash === hash) return
    pendingHash.current = hash
    window.location.hash = hash
  }, [])

  const runGuard = useCallback((next: NavState, accept: () => void, reject?: () => void) => {
    const guard = guardRef.current
    if (!guard) {
      accept()
      return
    }
    let result: boolean | Promise<boolean> = true
    try {
      result = guard(next)
    } catch {
      result = true
    }
    if (typeof result === 'boolean') {
      if (result) accept()
      else reject?.()
      return
    }
    void Promise.resolve(result)
      .then((ok) => (ok ? accept() : reject?.()))
      .catch(() => accept())
  }, [])

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash
      const next = parseHash(hash)
      if (hash === pendingHash.current) {
        pendingHash.current = null
        setNav(next)
        return
      }
      const current = navRef.current
      runGuard(
        next,
        () => {
          if (next.screen !== 'workout-mode' && next.screen !== 'session' && next.screen !== 'program-detail' && next.screen !== 'program-builder' && next.screen !== 'exercise-detail') {
            backRef.current = tabMemory(next)
          }
          setNav(next)
        },
        () => {
          const previous = hashFor(current)
          if (previous && window.location.hash !== previous) {
            pendingHash.current = previous
            window.location.hash = previous
          }
        },
      )
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [runGuard])

  const go = useCallback(
    (target: GoTarget, params?: Partial<NavState>, options?: GoOptions) => {
      const next = resolveGo(target, params)
      const accept = () => applyNav(next)
      if (options?.skipLeaveGuard) accept()
      else runGuard(next, accept)
    },
    [applyNav, runGuard],
  )

  const backToTab = useCallback(() => {
    const next = backRef.current
    runGuard(next, () => applyNav(next))
  }, [applyNav, runGuard])

  const registerLeaveGuard = useCallback((guard: LeaveGuard) => {
    guardRef.current = guard
    return () => {
      if (guardRef.current === guard) guardRef.current = null
    }
  }, [])

  const update = useCallback((recipe: (current: NonNullable<typeof state>) => NonNullable<typeof state>) => {
    setState((prev) => (prev ? recipe(prev) : prev))
  }, [])

  const api = useMemo<StoreApi | null>(() => {
    if (!state) return null
    return {
      state,
      nav,
      storageNotice: notice,
      storageRevision,
      go,
      backToTab,
      registerLeaveGuard,
      update,
      dismissStorageNotice: () => setNotice(null),
      listCorruptBackups: () => listCorruptBackups(storage),
      restoreFromBackup: (key) => {
        const result = readBackup(storage, key)
        if (result.ok && result.data) {
          setState((prev) => (prev ? mergeBackup(prev, result.data!) : prev))
          setStorageRevision((value) => value + 1)
        }
        return result
      },
      deleteBackup: (key) => {
        const ok = deleteCorruptBackup(storage, key)
        if (ok) setStorageRevision((value) => value + 1)
        return ok
      },
      resetToSeed: async () => {
        const { buildSeedState } = await import('./seed.ts')
        setState(buildSeedState())
      },
      setActiveProgram: (id) => setState((prev) => (prev ? actions.setActiveProgram(prev, id) : prev)),
      updateSeasonGoals: (patch: Partial<SeasonGoals>) =>
        setState((prev) => (prev ? actions.updateSeasonGoals(prev, patch) : prev)),
      upsertExercise: (exercise: Exercise) =>
        setState((prev) => (prev ? actions.upsertExercise(prev, exercise) : prev)),
      setLiftMax: (max: LiftMax) => setState((prev) => (prev ? actions.setLiftMax(prev, max) : prev)),
      deleteLiftMax: (familyId) => setState((prev) => (prev ? actions.deleteLiftMax(prev, familyId) : prev)),
      setWeightUnit: (unit: WeightUnit) => setState((prev) => (prev ? actions.setWeightUnit(prev, unit) : prev)),
      setActiveBoard: (id) => setState((prev) => (prev ? actions.setActiveBoard(prev, id) : prev)),
      createBoard: (name) => {
        const id = createId('board')
        setState((prev) => (prev ? actions.createBoard(prev, name, id).state : prev))
        return id
      },
      upsertBoard: (board: PlanBoard) => setState((prev) => (prev ? actions.upsertBoard(prev, board) : prev)),
      deleteBoard: (id) => setState((prev) => (prev ? actions.deleteBoard(prev, id) : prev)),
      scheduleDay: (dateKey, programDayId) =>
        setState((prev) => (prev ? actions.scheduleDay(prev, dateKey, programDayId) : prev)),
      clearSchedule: (dateKey) => setState((prev) => (prev ? actions.clearSchedule(prev, dateKey) : prev)),
      clearAllSchedule: () => setState((prev) => (prev ? actions.clearAllSchedule(prev) : prev)),
      savePlannedSession: (session: PlannedSession) =>
        setState((prev) => (prev ? actions.savePlannedSession(prev, session) : prev)),
      deleteSession: (id) => setState((prev) => (prev ? actions.deleteSession(prev, id) : prev)),
      updateSession: (id, recipe: (session: WorkoutSession) => WorkoutSession) =>
        setState((prev) => (prev ? actions.updateSession(prev, id, recipe) : prev)),
      setSessionNotes: (id, notes) => setState((prev) => (prev ? actions.setSessionNotes(prev, id, notes) : prev)),
      setSessionPad: (id, pad) => setState((prev) => (prev ? actions.setSessionPad(prev, id, pad) : prev)),
      createProgram: (partial) => {
        const id = partial?.id ?? createId('prog')
        setState((prev) => (prev ? actions.createProgram(prev, partial, id).state : prev))
        return id
      },
      updateProgram: (id, recipe: (program: Program) => Program) =>
        setState((prev) => (prev ? actions.updateProgram(prev, id, recipe) : prev)),
      deleteProgram: (id) => setState((prev) => (prev ? actions.deleteProgram(prev, id) : prev)),
      cloneProgram: (id) => {
        const nextId = createId('prog')
        let created = false
        setState((prev) => {
          if (!prev) return prev
          const result = actions.cloneProgram(prev, id, nextId)
          created = result.id != null
          return result.state
        })
        return created ? nextId : null
      },
      openWorkout: (dateKey, workoutTab?: WorkoutTab) => go('workout', { dateKey, workoutTab }),
    }
  }, [state, nav, notice, storageRevision, go, backToTab, registerLeaveGuard, update])

  if (!ready || !api) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="grid min-h-dvh place-items-center bg-charcoal-2 text-sm text-muted"
      >
        Loading…
      </div>
    )
  }

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}
