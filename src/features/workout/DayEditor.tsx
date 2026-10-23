import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import type { Exercise, PlannedSession, Prescription } from '../../types.ts'
import { dayFocusOptions, exerciseAliases, liftFamilies } from '../../store/catalog.ts'
import { createId, todayKey } from '../../store/id.ts'
import { useStore } from '../../store/useStore.ts'
import { Badge, Button, Card, Chip, EmptyState, IconButton, Input, ScreenHeader, SectionLabel, Sheet, TextArea, useConfirm } from '../../ui/index.ts'
import { applyStart } from '../session/context.ts'
import { ConflictDialog } from '../session/ConflictDialog.tsx'
import { resolveMax } from '../session/families.ts'
import { plansOnDate, putPlan, removePlan } from '../../store/dayPlans.ts'
import { blankPlanned, defaultPrescription, findProgramDay, plannedFromProgramDay } from '../session/logic.ts'
import { parseKey, shiftKey } from './dates.ts'
import PrescriptionEditor from './PrescriptionEditor.tsx'
import { searchExercises } from './search.ts'
import { TrainSubNav } from '../../app/TabSubNav.tsx'

const FOCUSES = [...dayFocusOptions, 'Custom focus', 'Free write']

function signature(plan: PlannedSession): string {
  return JSON.stringify({
    name: plan.name,
    focus: plan.focus ?? '',
    sessionPad: plan.sessionPad ?? '',
    exercises: plan.exercises,
  })
}

export function DayEditor() {
  const { state, nav, go, registerLeaveGuard, update, upsertExercise } = useStore()
  const confirm = useConfirm()
  const dateKey = nav.dateKey || todayKey()
  const dayPlans = plansOnDate(state.plannedSessions, dateKey)
  const scheduledId = state.scheduled[dateKey] ?? ''
  const savedStamp = dayPlans.map((plan) => `${plan.id}:${plan.updatedAt ?? ''}`).join('|')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PlannedSession | null>(null)
  const [baseline, setBaseline] = useState('')
  const [picker, setPicker] = useState<Picker | null>(null)
  const [query, setQuery] = useState('')
  const [customName, setCustomName] = useState('')
  const [conflict, setConflict] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    const current = state
    const list = plansOnDate(current.plannedSessions, dateKey)
    const chosen = list.find((plan) => plan.id === selectedId) ?? list[0]
    if (chosen) {
      const plan = structuredClone(chosen)
      setDraft(plan)
      setBaseline(signature(plan))
      return
    }
    const found = findProgramDay(current, dateKey)
    if (found) {
      const plan = plannedFromProgramDay(dateKey, found.program, found.day)
      setDraft(plan)
      setBaseline(signature(plan))
      return
    }
    setDraft(null)
    setBaseline('')
    // Reload when the saved workouts or the scheduled program day change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, savedStamp, scheduledId, selectedId])

  const dirty = draft != null && signature(draft) !== baseline
  useEffect(() => {
    if (!dirty) return
    return registerLeaveGuard(() => window.confirm('You have unsaved changes. Leave without saving?'))
  }, [dirty, registerLeaveGuard])

  const results = useMemo(() => searchExercises(state.exercises, query, 30), [state.exercises, query])
  const knownFocus = new Set<string>([...dayFocusOptions, 'Free write'])

  function shift(days: number) {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return
    go('workout', { dateKey: shiftKey(dateKey, days), workoutTab: 'day' }, { skipLeaveGuard: true })
  }

  function save(plan: PlannedSession) {
    const next = { ...plan, updatedAt: new Date().toISOString() }
    update((current) => ({
      ...current,
      plannedSessions: putPlan(current.plannedSessions, next),
      scheduleUserOwned: true,
    }))
    setSelectedId(next.id)
    setDraft(next)
    setBaseline(signature(next))
  }

  function addWorkout() {
    const plan = blankPlanned(dateKey)
    update((current) => {
      const kept = draft ? putPlan(current.plannedSessions, { ...draft, updatedAt: draft.updatedAt ?? new Date().toISOString() }) : current.plannedSessions
      return { ...current, plannedSessions: putPlan(kept, plan), scheduleUserOwned: true }
    })
    setSelectedId(plan.id)
    setDraft(plan)
    setBaseline(signature(plan))
  }

  function begin(plan: PlannedSession, mode: 'return' | 'replace' | 'resume' | 'pause') {
    const result = applyStart(state, plan, mode)
    if (result.kind === 'conflict') {
      setConflict({ id: result.session.id, name: result.session.name })
      return
    }
    update(() => result.state)
    setBaseline(signature(plan))
    go('session', { sessionId: result.sessionId }, { skipLeaveGuard: true })
  }

  async function clearDay() {
    const ok = await confirm(
      dayPlans.length > 1
        ? 'Clear this workout?\n\nThe other workouts on this day stay.'
        : 'Clear this day?\n\nRemoves the planned workout and any program scheduled here. Logged sessions stay.',
    )
    if (!ok) return
    update((current) => {
      if (!draft) return current
      const plannedSessions = removePlan(current.plannedSessions, draft.id)
      const remaining = plansOnDate(plannedSessions, dateKey)
      const scheduled = { ...current.scheduled }
      if (!remaining.some((plan) => plan.programDayId && plan.programDayId === scheduled[dateKey])) delete scheduled[dateKey]
      return { ...current, plannedSessions, scheduled, scheduleUserOwned: true }
    })
    setSelectedId(null)
    setDraft(null)
    setBaseline('')
  }

  function addExercise(exercise: Exercise, prescription: Prescription) {
    if (!draft) return
    setDraft({
      ...draft,
      exercises: [...draft.exercises, { ...prescription, id: createId('pe'), exerciseId: exercise.id }],
    })
    setPicker(null)
    setQuery('')
    setCustomName('')
  }

  function createCustom() {
    const name = customName.trim()
    if (!name) return
    const exercise: Exercise = {
      id: createId('ex'),
      name,
      theme: 'Custom',
      sports: [],
      muscles: [],
      equipment: [],
      description: '',
      cues: [],
      source: 'custom',
      defaultSets: 3,
      defaultReps: '8',
      defaultRestSec: 90,
      aliases: [],
      primaryMuscles: [],
      secondaryMuscles: [],
      movementPattern: '',
      imageUrls: [],
    }
    upsertExercise(exercise)
    if (picker?.mode === 'swap' && picker.index != null && draft) {
      const exercises = draft.exercises.map((item, index) => (index === picker.index ? { ...item, exerciseId: exercise.id } : item))
      setDraft({ ...draft, exercises })
      setPicker(null)
      setCustomName('')
      return
    }
    setPicker({ mode: 'add', stage: 'sets', exercise, prescription: defaultPrescription(exercise) })
    setCustomName('')
  }

  const dateLabel = format(parseKey(dateKey), 'EEE d MMM')
  const canStart = !!draft && (draft.exercises.length > 0 || !!draft.sessionPad?.trim())

  return (
    <div className="mx-auto flex w-full max-w-lg min-w-0 flex-col gap-4 px-4 pt-5 pb-nav" data-day-editor>
      <ScreenHeader
        title={dateLabel}
        subtitle="My day"
        action={
          <div className="flex">
            <IconButton label="Previous day" onClick={() => shift(-1)}>
              <ChevronLeft className="h-5 w-5" />
            </IconButton>
            <IconButton label="Next day" onClick={() => shift(1)}>
              <ChevronRight className="h-5 w-5" />
            </IconButton>
          </div>
        }
      />
      <TrainSubNav value="day" />
      {draft ? (
        <>
          {dayPlans.length > 0 ? (
            <div className="flex flex-wrap gap-2" data-day-workouts={dayPlans.length}>
              {dayPlans.map((plan) => (
                <Chip key={plan.id} active={draft?.id === plan.id} onClick={() => setSelectedId(plan.id)}>
                  {plan.name || 'Workout'}
                </Chip>
              ))}
              <Button variant="secondary" data-add-workout onClick={addWorkout}>
                Add workout
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dirty ? 'warn' : 'success'}>{dirty ? 'Unsaved' : 'Saved'}</Badge>
            {draft.programName ? <Badge>{draft.programName}</Badge> : null}
            <Button variant="ghost" className="ml-auto" onClick={() => go('log')}>
              Log
            </Button>
            <Button variant="danger" onClick={() => void clearDay()}>
              {dayPlans.length > 1 ? 'Clear workout' : 'Clear day'}
            </Button>
          </div>
          <Input aria-label="Workout name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <div className="h-scroll" aria-label="Focus">
            {FOCUSES.map((focus) => {
              const active = focus === 'Custom focus' ? !knownFocus.has(draft.focus ?? '') : draft.focus === focus
              return (
                <Chip
                  key={focus}
                  active={active}
                  onClick={() => setDraft({ ...draft, focus: focus === 'Custom focus' ? (knownFocus.has(draft.focus ?? '') ? 'Custom' : draft.focus) : focus })}
                >
                  {focus === 'Custom focus' ? 'Custom' : focus}
                </Chip>
              )
            })}
          </div>
          {!knownFocus.has(draft.focus ?? '') ? (
            <Input aria-label="Custom focus" value={draft.focus ?? ''} onChange={(event) => setDraft({ ...draft, focus: event.target.value })} />
          ) : null}
          <TextArea
            aria-label="Session pad"
            className="font-hand min-h-24 text-lg"
            placeholder="Session pad"
            value={draft.sessionPad ?? ''}
            onChange={(event) => setDraft({ ...draft, sessionPad: event.target.value })}
          />
          <SectionLabel>Exercises</SectionLabel>
          {draft.exercises.length === 0 ? (
            <p className="text-sm text-muted">No exercises yet. Add one from the library, or write the session on the pad.</p>
          ) : (
            draft.exercises.map((prescription, index) => {
              const exercise = state.exercises.find((item) => item.id === prescription.exerciseId) ?? null
              const max = resolveMax(prescription.exerciseId, state.liftMaxes, liftFamilies, exerciseAliases)
              return (
                <Card key={prescription.id ?? `${prescription.exerciseId}-${index}`}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{exercise?.name ?? 'Custom exercise'}</p>
                      {exercise && exercise.equipment.length > 0 ? <p className="text-xs text-muted">{exercise.equipment.join(' · ')}</p> : null}
                    </div>
                    {max == null ? (
                      <Button variant="ghost" size="sm" onClick={() => go('maxes')}>
                        Set max
                      </Button>
                    ) : null}
                  </div>
                  <PrescriptionEditor
                    variant="full"
                    prescription={prescription}
                    exercise={exercise}
                    weightUnit={state.weightUnit}
                    maxKg={max?.maxKg ?? null}
                    onChange={(next) => {
                      const exercises = draft.exercises.map((item, itemIndex) => (itemIndex === index ? next : item))
                      setDraft({ ...draft, exercises })
                    }}
                    onRemove={() => setDraft({ ...draft, exercises: draft.exercises.filter((_, itemIndex) => itemIndex !== index) })}
                    onMove={(direction) => {
                      const nextIndex = index + direction
                      if (nextIndex < 0 || nextIndex >= draft.exercises.length) return
                      const exercises = draft.exercises.slice()
                      const [moved] = exercises.splice(index, 1)
                      if (!moved) return
                      exercises.splice(nextIndex, 0, moved)
                      setDraft({ ...draft, exercises })
                    }}
                    onSwapExercise={() => {
                      setQuery('')
                      setPicker({ mode: 'swap', index, stage: 'search' })
                    }}
                  />
                </Card>
              )
            })
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setQuery('')
              setCustomName('')
              setPicker({ mode: 'add', stage: 'search' })
            }}
          >
            Add exercise
          </Button>
          <div className="flex flex-col gap-2 pb-2">
            <Button onClick={() => begin(draft, 'return')} disabled={!canStart}>
              Start session
            </Button>
            <Button variant="secondary" onClick={() => save(draft)} disabled={!dirty}>
              Save
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          title="No workout planned"
          body="Build a session for this day, pull from your plan, or browse the library."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  const plan = blankPlanned(dateKey)
                  setDraft(plan)
                  setBaseline('')
                }}
              >
                Create workout
              </Button>
              <Button variant="secondary" onClick={() => go('plan')}>
                Open Plan
              </Button>
              <Button variant="secondary" onClick={() => go('workout', { dateKey, workoutTab: 'library' })}>
                Browse library
              </Button>
              <Button variant="ghost" onClick={() => shift(1)}>
                Pick another day
              </Button>
            </div>
          }
        />
      )}
      <Sheet
        open={picker != null}
        title={picker?.stage === 'sets' ? 'Sets & reps' : 'Add exercise'}
        subtitle={picker?.stage === 'sets' ? picker.exercise.name : 'Library or custom'}
        onClose={() => setPicker(null)}
      >
        {picker?.stage === 'sets' ? (
          <div className="space-y-3">
            <PrescriptionEditor
              variant="full"
              prescription={picker.prescription}
              exercise={picker.exercise}
              weightUnit={state.weightUnit}
              maxKg={resolveMax(picker.exercise.id, state.liftMaxes, liftFamilies, exerciseAliases)?.maxKg ?? null}
              onChange={(next) => setPicker({ ...picker, prescription: next })}
            />
            <Button onClick={() => addExercise(picker.exercise, picker.prescription)}>Add to day</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Input aria-label="Search exercises" placeholder="Search exercises" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {results.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-left hover:bg-charcoal-2"
                  onClick={() => {
                    if (picker?.mode === 'swap' && picker.index != null && draft) {
                      const exercises = draft.exercises.map((item, index) => (index === picker.index ? { ...item, exerciseId: exercise.id } : item))
                      setDraft({ ...draft, exercises })
                      setPicker(null)
                      return
                    }
                    setPicker({ mode: 'add', stage: 'sets', exercise, prescription: defaultPrescription(exercise) })
                  }}
                >
                  <span className="text-sm font-medium text-ink">{exercise.name}</span>
                  <span className="text-xs text-muted">{exercise.equipment[0] ?? exercise.theme}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input aria-label="Custom exercise name" placeholder="Custom exercise" value={customName} onChange={(event) => setCustomName(event.target.value)} />
              <Button variant="secondary" onClick={createCustom} disabled={!customName.trim()}>
                Add custom
              </Button>
            </div>
          </div>
        )}
      </Sheet>
      {conflict ? (
        <ConflictDialog
          name={conflict.name}
          onCancel={() => setConflict(null)}
          onResume={() => {
            setConflict(null)
            if (draft) begin(draft, 'resume')
          }}
          onSaveLater={() => {
            setConflict(null)
            if (draft) begin(draft, 'pause')
          }}
          onDiscard={() => {
            setConflict(null)
            if (draft) begin(draft, 'replace')
          }}
        />
      ) : null}
    </div>
  )
}

type Picker =
  | { mode: 'add'; stage: 'search' }
  | { mode: 'swap'; index: number; stage: 'search' }
  | { mode: 'add'; stage: 'sets'; exercise: Exercise; prescription: Prescription }
