import { Volume2, VolumeX } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { Exercise, LiftFamily, LiftMax, SessionExercise, SessionTimer, WeightUnit, WorkoutSession } from '../../types.ts'
import { buildFocusSteps, clockLabel, restWarningAt, sessionToCue, type FocusStep } from '../../lib/cues/index.ts'
import { SET_TYPE_LABELS, logShape, resolveSetType } from '../../lib/setTypes/index.ts'
import { kgToUnit, unitToKg } from '../../lib/setTypes/units.ts'
import { Badge, Button, Card, IconButton, Select, Stepper } from '../../ui/index.ts'
import { buzz, speak, useWakeLock } from './browser.ts'
import {
  addSet,
  changeSetType,
  displayPointer,
  editSet,
  logSet,
  removeLastSet,
  sessionCounts,
  setAt,
  thawTimer,
  undoSet,
  type SetPatch,
  type SetPointer,
} from './logic.ts'

export interface FocusSnapshot {
  pointer: SetPointer | null
  patch: SetPatch
  timer: SessionTimer
}

export interface FocusHandle {
  flush: () => void
  snapshot: () => FocusSnapshot
}

interface Draft {
  reps: number
  loadKg: number
  rpe: number | null
  durationSec: number
  distanceM: number
  rounds: number
}

type Phase =
  | { name: 'ready' }
  | { name: 'count-in'; endsAt: number; left: number; spoken: number }
  | { name: 'work'; mode: 'down' | 'up'; startedAt: number; endsAt: number; cap: number }
  | { name: 'rest'; endsAt: number; total: number; warned: boolean; warning?: string }

export const FocusMode = forwardRef<FocusHandle, {
  session: WorkoutSession
  exercises: Exercise[]
  unit: WeightUnit
  families: LiftFamily[]
  aliases: Record<string, string>
  liftMaxes: Record<string, LiftMax>
  muted: boolean
  onToggleMute: () => void
  onChange: (recipe: (session: WorkoutSession) => WorkoutSession) => void
  onDirty: (dirty: boolean) => void
  onDone: () => void
  onPause: () => void
}>(function FocusMode({ session, exercises, unit, families, aliases, liftMaxes, muted, onToggleMute, onChange, onDirty, onDone, onPause }, ref) {
  const names = useMemo(() => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise.name])), [exercises])
  const steps = useMemo(
    () => buildFocusSteps(session.exercises.map(sessionToCue), names, unit, { unit, families, aliases, liftMaxes, exercises }),
    [session.exercises, names, unit, families, aliases, liftMaxes, exercises],
  )
  const pointer = displayPointer(session)
  const exercise = pointer ? session.exercises[pointer.exerciseIndex] : undefined
  const library = exercises.find((item) => item.id === exercise?.exerciseId) ?? null
  const group = pointer && exercise ? stepsFor(steps, pointer.exerciseIndex, pointer.setIndex, exercise.exerciseId) : []
  const [sideIndex, setSideIndex] = useState(() => session.timer?.sideIndex ?? 0)
  const step = group[sideIndex] ?? group[0]
  const [draft, setDraft] = useState<Draft>(() => draftFrom(session))
  const [phase, setPhase] = useState<Phase>(() => phaseFrom(session.timer))
  const [now, setNow] = useState(() => Date.now())
  const [undo, setUndo] = useState<SetPointer | null>(null)
  const [openList, setOpenList] = useState(false)
  const spokenId = useRef('')
  const lock = useRef(false)
  const handoff = useRef(false)
  const phaseRef = useRef(phase)
  const stepRef = useRef(step)
  const pointerRef = useRef(pointer)
  const sideRef = useRef(sideIndex)
  const mutedRef = useRef(muted)
  const onChangeRef = useRef(onChange)
  phaseRef.current = phase
  stepRef.current = step
  pointerRef.current = pointer
  sideRef.current = sideIndex
  mutedRef.current = muted
  onChangeRef.current = onChange

  const shape = logShape(
    {
      setType: exercise?.setType,
      targetReps: exercise?.targetReps,
      timeCapSec: exercise?.timeCapSec,
      targetLoadKg: exercise?.targetLoadKg,
      targetPercent1RM: exercise?.targetPercent1RM,
      sets: exercise?.sets,
    },
    library,
  )

  const patch = (): SetPatch => {
    const next: SetPatch = {}
    if (shape.fields.includes('reps')) next.reps = draft.reps
    if (shape.fields.includes('loadKg')) next.loadKg = draft.loadKg
    if (shape.fields.includes('durationSec')) next.durationSec = draft.durationSec
    if (shape.fields.includes('distanceM')) next.distanceM = draft.distanceM
    if (shape.fields.includes('rounds')) next.rounds = draft.rounds
    if (draft.rpe != null) next.rpe = draft.rpe
    return next
  }
  const patchRef = useRef(patch)
  patchRef.current = patch

  const readSnapshot = (): FocusSnapshot => ({
    pointer: pointerRef.current,
    patch: patchRef.current(),
    timer: liveTimer(phaseRef.current, sideRef.current),
  })

  useImperativeHandle(ref, () => ({
    flush: () => {
      const snap = readSnapshot()
      if (!snap.pointer) return
      onChangeRef.current((item) => editSet(item, snap.pointer as SetPointer, snap.patch))
    },
    snapshot: () => readSnapshot(),
  }))

  useWakeLock(true)
  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  const pointerKey = pointer ? `${pointer.exerciseIndex}:${pointer.setIndex}` : 'none'
  const setType = exercise?.setType
  const seenPointer = useRef<string | null>(null)
  useEffect(() => {
    if (seenPointer.current == null) seenPointer.current = pointerKey
    else if (seenPointer.current !== pointerKey) {
      seenPointer.current = pointerKey
      setSideIndex(0)
    }
    const current = pointerRef.current
    const logged = current ? setAt(session, current) : undefined
    setDraft({
      reps: logged?.reps ?? 0,
      loadKg: logged?.loadKg ?? 0,
      rpe: logged?.rpe ?? null,
      durationSec: logged?.durationSec ?? 0,
      distanceM: logged?.distanceM ?? 0,
      rounds: logged?.rounds ?? 0,
    })
    // Reset the open set when the pointer or set type changes, not on every logged field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointerKey, setType])

  useEffect(() => {
    if (phase.name === 'rest' || !step) return
    if (spokenId.current === step.id) return
    spokenId.current = step.id
    speak(step.beforeWork.join(' '), muted)
  }, [step, phase.name, muted])

  useEffect(() => {
    if (phase.name !== 'work') lock.current = false
    if (phase.name === 'ready' || phase.name === 'rest') handoff.current = false
  }, [phase])

  useEffect(() => {
    const id = window.setInterval(() => {
      const time = Date.now()
      setNow(time)
      const current = phaseRef.current
      if (current.name === 'count-in') {
        const left = Math.max(0, Math.ceil((current.endsAt - time) / 1000))
        if (left <= 0) {
          if (!handoff.current) {
            handoff.current = true
            startWork()
          }
          return
        }
        if (left !== current.spoken) {
          speak(String(left), mutedRef.current)
          setPhase({ ...current, left, spoken: left })
        }
        return
      }
      if (current.name === 'work' && current.mode === 'down' && time >= current.endsAt) {
        finishWork()
        return
      }
      if (current.name === 'work' && current.mode === 'up' && current.cap > 0) {
        const elapsed = Math.floor((time - current.startedAt) / 1000)
        if (elapsed >= current.cap) finishWork("Time. That's the cap.")
        return
      }
      if (current.name === 'rest') {
        const left = Math.ceil((current.endsAt - time) / 1000)
        if (!current.warned && current.warning) {
          const at = restWarningAt(current.total)
          if (at != null && left <= at && left > 0) {
            speak(current.warning, mutedRef.current)
            setPhase({ ...current, warned: true })
          }
        }
        if (left <= 0) {
          lock.current = true
          buzz([220, 120, 220])
          setPhase({ name: 'ready' })
        }
      }
    }, 200)
    return () => window.clearInterval(id)
    // Tick loop reads the latest phase through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!undo) return
    const id = window.setTimeout(() => setUndo(null), 8000)
    return () => window.clearTimeout(id)
  }, [undo])

  const logged = pointer ? setAt(session, pointer) : undefined
  const fieldDirty = !!logged && (draft.reps !== logged.reps || draft.loadKg !== logged.loadKg || (draft.rpe ?? null) !== (logged.rpe ?? null) || draft.durationSec !== (logged.durationSec ?? 0) || draft.distanceM !== (logged.distanceM ?? 0) || draft.rounds !== (logged.rounds ?? 0))
  const dirty = fieldDirty || phase.name === 'work' || phase.name === 'count-in'
  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])

  useEffect(() => {
    const timer = liveTimer(phase, sideIndex)
    onChangeRef.current((item) => {
      if (item.status === 'paused' || item.status === 'completed') return item
      const restEndsAt = timer.phase === 'rest' ? (timer.endsAt ?? null) : null
      if (sameTimer(item.timer, timer) && (item.restEndsAt ?? null) === restEndsAt) return item
      return { ...item, timer, restEndsAt }
    })
  }, [phase, sideIndex, session.status])

  const counts = sessionCounts(session)
  const finished = counts.planned > 0 && counts.done >= counts.planned && phase.name === 'ready'
  useEffect(() => {
    if (finished && !undo) onDone()
  }, [finished, undo, onDone])

  function startWork() {
    const current = stepRef.current
    if (!current) return
    speak(current.startWord, mutedRef.current)
    if (current.clock === 'countdown' && (current.workSec ?? 0) > 0) {
      const total = current.workSec ?? 0
      setPhase({ name: 'work', mode: 'down', startedAt: Date.now(), endsAt: Date.now() + total * 1000, cap: 0 })
      return
    }
    if (current.clock === 'count_up') {
      setPhase({ name: 'work', mode: 'up', startedAt: Date.now(), endsAt: Date.now(), cap: current.capSec ?? 0 })
      return
    }
    setPhase({ name: 'ready' })
  }

  function logAndRest(duration: number | undefined, fromTimer: boolean) {
    const current = stepRef.current
    const at = pointerRef.current
    if (!current || !at) return
    const nextPatch = patchRef.current()
    if (duration != null) nextPatch.durationSec = duration
    onChangeRef.current((item) => logSet(item, at, nextPatch))
    if (!fromTimer) buzz(40)
    setUndo({ ...at })
    if (current.restSec > 0) {
      speak(current.restStart || 'Rest.', mutedRef.current)
      setPhase({
        name: 'rest',
        endsAt: Date.now() + current.restSec * 1000,
        total: current.restSec,
        warned: false,
        warning: current.restWarning,
      })
      return
    }
    setPhase({ name: 'ready' })
  }

  function finishWork(capLine?: string) {
    if (lock.current) return
    lock.current = true
    const current = stepRef.current
    const running = phaseRef.current
    const duration =
      running.name === 'work' && running.mode === 'up'
        ? Math.max(0, Math.round((Date.now() - running.startedAt) / 1000))
        : current?.workSec ?? undefined
    speak(capLine || current?.finish || '', mutedRef.current)
    buzz([220, 120, 220])
    if (current?.side === 'left') {
      setSideIndex(1)
      setPhase({ name: 'ready' })
      return
    }
    logAndRest(duration, true)
  }

  function onPrimary() {
    const current = stepRef.current
    const running = phaseRef.current
    if (!current || running.name === 'rest') return
    if (running.name === 'work') {
      finishWork()
      return
    }
    if (current.clock === 'none') {
      if (current.side === 'left') {
        speak(current.finish || 'Switch sides.', muted)
        buzz([220, 120, 220])
        setSideIndex(1)
        return
      }
      logAndRest(undefined, false)
      return
    }
    if (current.countdown) {
      speak('3', muted)
      setPhase({ name: 'count-in', endsAt: Date.now() + 3000, left: 3, spoken: 3 })
      return
    }
    startWork()
  }

  function undoLast() {
    if (!undo) return
    onChange((item) => undoSet(item, undo))
    setUndo(null)
    setPhase({ name: 'ready' })
  }

  const restLeft = phase.name === 'rest' ? Math.max(0, Math.ceil((phase.endsAt - now) / 1000)) : 0
  const workText = clockText(phase, now, step)
  const exerciseName = exercise ? names[exercise.exerciseId] || 'Exercise' : session.name

  return (
    <div className="space-y-4" data-focus>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Focus</p>
          <h1 className="text-xl font-semibold text-ink">{exerciseName}</h1>
          <p className="text-sm text-muted">
            {counts.done}/{counts.planned} sets
            {step ? ` · ${step.detail}` : ''}
          </p>
        </div>
        <IconButton label={muted ? 'Unmute cues' : 'Mute cues'} onClick={onToggleMute}>
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </IconButton>
      </div>
      {finished ? (
        <Card className="space-y-3">
          <p className="text-lg font-semibold">All sets logged</p>
          <Button onClick={onDone}>Review</Button>
          {undo ? (
            <Button variant="secondary" onClick={undoLast}>
              Undo
            </Button>
          ) : null}
        </Card>
      ) : phase.name === 'rest' ? (
        <Card className="space-y-3 text-center">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Rest</p>
          <p className="text-6xl font-semibold tabular-nums text-ink">{clockLabel(restLeft)}</p>
          <p className="text-sm text-muted">{step ? `Next, ${step.exerciseName}` : 'Last set'}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => bumpRest(setPhase, -15)}>
              −15s
            </Button>
            <Button variant="secondary" onClick={() => bumpRest(setPhase, 30)}>
              +30s
            </Button>
            <Button
              onClick={() => {
                lock.current = true
                buzz([220, 120, 220])
                setPhase({ name: 'ready' })
              }}
            >
              Skip
            </Button>
          </div>
        </Card>
      ) : step ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {step.side ? <Badge tone="lime">{step.side === 'left' ? 'Left' : 'Right'}</Badge> : null}
            <Badge>{SET_TYPE_LABELS[step.setType]}</Badge>
          </div>
          <div className="text-center">
            <p className="text-5xl font-semibold tabular-nums text-ink">{workText}</p>
            <p className="mt-1 text-sm text-ink">{step.headline}</p>
            {step.intensity ? <p className="mt-1 text-sm text-muted">{step.intensity}</p> : null}
            {exercise?.coachCue ? <p className="mt-2 text-sm text-muted">{exercise.coachCue}</p> : null}
          </div>
          <SetFields draft={draft} shapeFields={shape.fields} repsLabel={shape.repsLabel} unit={unit} onChange={setDraft} />
          <Button onClick={onPrimary} disabled={phase.name === 'count-in'}>
            {primaryLabel(phase, step)}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-3">
          <p className="font-semibold">Nothing to log yet</p>
          <p className="text-sm text-muted">{session.sessionPad?.trim() || 'Add exercises on the day, or finish this free-write session.'}</p>
          <Button onClick={onDone}>Review</Button>
        </Card>
      )}
      <Button variant="secondary" className="w-full" data-pause-session onClick={onPause}>
        Pause / Save for later
      </Button>
      {undo && !finished && phase.name !== 'rest' ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-charcoal-4 bg-charcoal px-3 py-2">
          <p className="text-sm text-ink">Set logged</p>
          <Button size="sm" variant="secondary" onClick={undoLast}>
            Undo
          </Button>
        </div>
      ) : null}
      <button type="button" className="min-h-11 text-left text-sm font-semibold text-lime-dim" onClick={() => setOpenList((open) => !open)}>
        {openList ? 'Hide sets' : 'All sets'}
      </button>
      {openList ? (
        <AllSets
          session={session}
          names={names}
          unit={unit}
          onChange={onChange}
          onJump={(next) => onChange((item) => ({ ...item, currentSet: next }))}
        />
      ) : null}
    </div>
  )
})

function SetFields({
  draft,
  shapeFields,
  repsLabel,
  unit,
  onChange,
}: {
  draft: Draft
  shapeFields: ReturnType<typeof logShape>['fields']
  repsLabel: string
  unit: WeightUnit
  onChange: (next: Draft) => void
}) {
  return (
    <div className="space-y-3">
      {shapeFields.includes('loadKg') ? (
        <Stepper
          label="Load"
          suffix={unit}
          min={0}
          step={unit === 'lb' ? 5 : 2.5}
          value={shownLoad(draft.loadKg, unit)}
          onChange={(value) => onChange({ ...draft, loadKg: value <= 0 ? 0 : unitToKg(value, unit) })}
        />
      ) : null}
      {shapeFields.includes('reps') ? (
        <Stepper label={repsLabel} min={0} step={1} value={draft.reps} onChange={(reps) => onChange({ ...draft, reps })} />
      ) : null}
      {shapeFields.includes('rounds') ? (
        <Stepper label="Rounds" min={0} step={1} value={draft.rounds} onChange={(rounds) => onChange({ ...draft, rounds })} />
      ) : null}
      {shapeFields.includes('distanceM') ? (
        <Stepper label="Metres" suffix="m" min={0} step={10} value={draft.distanceM} onChange={(distanceM) => onChange({ ...draft, distanceM })} />
      ) : null}
      {shapeFields.includes('durationSec') ? (
        <Stepper label="Seconds" suffix="s" min={0} step={5} value={draft.durationSec} onChange={(durationSec) => onChange({ ...draft, durationSec })} />
      ) : null}
      <label className="block text-xs text-muted">
        RPE
        <Select
          aria-label="RPE"
          className="mt-1"
          value={draft.rpe ?? ''}
          onChange={(event) => onChange({ ...draft, rpe: event.target.value === '' ? null : Number(event.target.value) })}
        >
          <option value="">No RPE</option>
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </label>
    </div>
  )
}

function AllSets({
  session,
  names,
  unit,
  onChange,
  onJump,
}: {
  session: WorkoutSession
  names: Record<string, string>
  unit: WeightUnit
  onChange: (recipe: (session: WorkoutSession) => WorkoutSession) => void
  onJump: (pointer: SetPointer) => void
}) {
  return (
    <div className="space-y-3">
      {session.exercises.map((exercise, exerciseIndex) => (
        <Card key={`${exercise.exerciseId}-${exerciseIndex}`} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-ink">{names[exercise.exerciseId] || 'Exercise'}</p>
            <Select
              aria-label={`Set type for ${names[exercise.exerciseId] || 'exercise'}`}
              value={resolveSetType(exercise.setType, exercise.targetReps, exercise.timeCapSec)}
              onChange={(event) => onChange((item) => changeSetType(item, exerciseIndex, event.target.value as SessionExercise['setType']))}
            >
              {Object.entries(SET_TYPE_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          {exercise.sets.map((set, setIndex) => (
            <button
              key={`${set.setNumber}-${setIndex}`}
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm"
              onClick={() => onJump({ exerciseIndex, setIndex })}
            >
              <span className={set.completed ? 'text-ink' : 'text-muted'}>
                Set {set.setNumber} {set.completed ? '· logged' : ''}
              </span>
              <span className="text-muted">
                {set.reps > 0 ? `${set.reps} reps` : ''}
                {set.loadKg > 0 ? ` · ${shownLoad(set.loadKg, unit)} ${unit}` : ''}
              </span>
            </button>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => onChange((item) => addSet(item, exerciseIndex))}>
              Add set
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onChange((item) => removeLastSet(item, exerciseIndex))} disabled={exercise.sets.length === 0}>
              Remove last
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

function phaseFrom(timer: SessionTimer | null | undefined): Phase {
  const thawed = thawTimer(timer)
  if (thawed.phase === 'rest' && thawed.endsAt) {
    return { name: 'rest', endsAt: thawed.endsAt, total: thawed.total ?? 0, warned: !!thawed.warned, warning: thawed.warning }
  }
  if (thawed.phase === 'count-in' && thawed.endsAt) {
    return { name: 'count-in', endsAt: thawed.endsAt, left: thawed.left ?? 0, spoken: thawed.spoken ?? 0 }
  }
  if (thawed.phase === 'work' && thawed.mode === 'down' && thawed.endsAt) {
    return { name: 'work', mode: 'down', startedAt: Date.now(), endsAt: thawed.endsAt, cap: 0 }
  }
  if (thawed.phase === 'work' && thawed.mode === 'up' && thawed.startedAt) {
    return { name: 'work', mode: 'up', startedAt: thawed.startedAt, endsAt: thawed.startedAt, cap: thawed.cap ?? 0 }
  }
  return { name: 'ready' }
}

function liveTimer(phase: Phase, sideIndex: number, now = Date.now()): SessionTimer {
  const side = sideIndex > 0 ? { sideIndex } : {}
  if (phase.name === 'rest') {
    return { phase: 'rest', endsAt: phase.endsAt, total: phase.total, warned: phase.warned, warning: phase.warning, ...side }
  }
  if (phase.name === 'count-in') {
    return { phase: 'count-in', endsAt: phase.endsAt, left: phase.left, spoken: phase.spoken, ...side }
  }
  if (phase.name === 'work' && phase.mode === 'down') {
    return { phase: 'work', mode: 'down', endsAt: phase.endsAt, cap: phase.cap, ...side }
  }
  if (phase.name === 'work' && phase.mode === 'up') {
    return { phase: 'work', mode: 'up', startedAt: phase.startedAt, cap: phase.cap, elapsedSec: Math.max(0, Math.floor((now - phase.startedAt) / 1000)), ...side }
  }
  return { phase: 'ready', ...side }
}

function sameTimer(left: SessionTimer | null | undefined, right: SessionTimer): boolean {
  if (!left) return false
  return JSON.stringify(left) === JSON.stringify(right)
}

function draftFrom(session: WorkoutSession): Draft {
  const pointer = displayPointer(session)
  const logged = pointer ? setAt(session, pointer) : undefined
  return {
    reps: logged?.reps ?? 0,
    loadKg: logged?.loadKg ?? 0,
    rpe: logged?.rpe ?? null,
    durationSec: logged?.durationSec ?? 0,
    distanceM: logged?.distanceM ?? 0,
    rounds: logged?.rounds ?? 0,
  }
}

function stepsFor(steps: FocusStep[], exerciseIndex: number, setIndex: number, exerciseId: string): FocusStep[] {
  const id = `${exerciseIndex}-${exerciseId}-${setIndex + 1}`
  return steps.filter((step) => step.id === id || step.id === `${id}-R`)
}

function shownLoad(kg: number, unit: WeightUnit): number {
  const value = kgToUnit(kg, unit)
  const factor = unit === 'lb' ? 10 : 100
  return Math.round(value * factor) / factor
}

function clockText(phase: Phase, now: number, step: FocusStep | undefined): string {
  if (phase.name === 'count-in') return String(phase.left)
  if (phase.name === 'work' && phase.mode === 'down') return clockLabel(Math.max(0, Math.ceil((phase.endsAt - now) / 1000)))
  if (phase.name === 'work' && phase.mode === 'up') return clockLabel(Math.max(0, Math.floor((now - phase.startedAt) / 1000)))
  if (step?.clock === 'countdown' && step.workSec) return clockLabel(step.workSec)
  return step?.figure || '—'
}

function primaryLabel(phase: Phase, step: FocusStep): string {
  if (phase.name === 'work') return phase.mode === 'up' ? 'Done' : 'Done early'
  if (phase.name === 'count-in') return 'Get ready'
  if (step.clock === 'none') return step.side === 'left' ? 'Switch sides' : 'Log set'
  return 'Start'
}

function bumpRest(setPhase: (value: Phase | ((prev: Phase) => Phase)) => void, seconds: number) {
  setPhase((prev) => {
    if (prev.name !== 'rest') return prev
    const endsAt = prev.endsAt + seconds * 1000
    if (endsAt <= Date.now()) return { name: 'ready' }
    return { ...prev, endsAt }
  })
}
