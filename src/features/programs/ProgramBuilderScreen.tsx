import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import { createId } from '../../store/id.ts'
import type { Prescription, ProgramDay } from '../../types.ts'
import { resolveMax } from '../../lib/personalize/maxes.ts'
import { DAY_FOCUSES } from '../../lib/personalize/index.ts'
import { Button, Input, Page, ScreenHeader, Select, Stepper, TextArea } from '../../ui/index.ts'
import { PrescriptionEditor } from '../plan/PrescriptionEditor.tsx'
import { prescriptionFromExercise } from '../plan/importApply.ts'

const SPORTS = ['General Athletic', 'Rugby', 'AFL', 'Running', 'CrossFit', 'Basketball', 'Swimming', 'Cycling', 'Yoga']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface DraftDay {
  id: string
  name: string
  weekday?: number
  focus: string
  exercises: Prescription[]
}

interface Draft {
  name: string
  description: string
  theme: string
  sport: string
  weeks: number
  days: DraftDay[]
}

function emptyDraft(): Draft {
  return {
    name: 'My Custom Program',
    description: 'Personal training plan built in Fit Friend.',
    theme: 'Strength',
    sport: 'General Athletic',
    weeks: 4,
    days: [{ id: createId('pd'), name: 'Day 1', weekday: 1, focus: 'Strength', exercises: [] }],
  }
}

export default function ProgramBuilderScreen() {
  const { state, go, backToTab, registerLeaveGuard, createProgram } = useStore()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const baseline = useRef(JSON.stringify(draft))
  const dirty = JSON.stringify(draft) !== baseline.current
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  useEffect(() => {
    return registerLeaveGuard(() => {
      if (!dirtyRef.current) return true
      return window.confirm('You have unsaved changes. Leave without saving?')
    })
  }, [registerLeaveGuard])

  const canSave = draft.name.trim().length > 0 && draft.days.some((day) => day.exercises.some((exercise) => exercise.exerciseId))

  function updateDay(id: string, recipe: (day: DraftDay) => DraftDay) {
    setDraft((current) => ({ ...current, days: current.days.map((day) => (day.id === id ? recipe(day) : day)) }))
  }

  function save() {
    if (!canSave) return
    const days: ProgramDay[] = draft.days
      .map((day) => ({
        id: day.id,
        name: day.name.trim() || 'Day',
        weekday: day.weekday,
        focus: day.focus,
        exercises: day.exercises.filter((exercise) => exercise.exerciseId),
      }))
      .filter((day) => day.exercises.length > 0)
    dirtyRef.current = false
    const id = createProgram({
      name: draft.name.trim(),
      description: draft.description.trim() || 'Personal training plan built in Fit Friend.',
      theme: draft.theme,
      sports: [draft.sport],
      weeks: draft.weeks,
      days,
    })
    go('program-detail', { programId: id })
  }

  return (
    <Page>
      <ScreenHeader
        title="Program builder"
        subtitle="Back to Plan"
        action={
          <Button variant="secondary" onClick={() => backToTab()}>
            Back to Plan
          </Button>
        }
      />
      <label className="block text-xs text-muted">
        Name
        <Input aria-label="Program name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      </label>
      <label className="block text-xs text-muted">
        Description
        <TextArea
          aria-label="Program description"
          value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </label>
      <label className="block text-xs text-muted">
        Theme
        <Select aria-label="Theme" value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value })}>
          {['Strength', 'Power', 'Hypertrophy', 'Endurance', 'Mobility'].map((theme) => (
            <option key={theme}>{theme}</option>
          ))}
        </Select>
      </label>
      <label className="block text-xs text-muted">
        Sport
        <Select aria-label="Sport" value={draft.sport} onChange={(event) => setDraft({ ...draft, sport: event.target.value })}>
          {SPORTS.map((sport) => (
            <option key={sport}>{sport}</option>
          ))}
        </Select>
      </label>
      <Stepper label="Weeks" min={1} max={16} value={draft.weeks} onChange={(weeks) => setDraft({ ...draft, weeks })} />
      {draft.days.map((day, index) => (
        <DayEditor
          key={day.id}
          day={day}
          exercises={state.exercises}
          weightUnit={state.weightUnit}
          liftMaxes={state.liftMaxes}
          onChange={(next) => updateDay(day.id, () => next)}
          onRemove={
            draft.days.length > 1
              ? () => setDraft((current) => ({ ...current, days: current.days.filter((item) => item.id !== day.id) }))
              : undefined
          }
          index={index}
        />
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          setDraft((current) => ({
            ...current,
            days: [
              ...current.days,
              { id: createId('pd'), name: `Day ${current.days.length + 1}`, weekday: 1, focus: 'Strength', exercises: [] },
            ],
          }))
        }
      >
        Add day
      </Button>
      <Button className="w-full" disabled={!canSave} onClick={save}>
        Save program
      </Button>
    </Page>
  )
}

function DayEditor({
  day,
  exercises,
  weightUnit,
  liftMaxes,
  onChange,
  onRemove,
  index,
}: {
  day: DraftDay
  exercises: ReturnType<typeof useStore>['state']['exercises']
  weightUnit: ReturnType<typeof useStore>['state']['weightUnit']
  liftMaxes: ReturnType<typeof useStore>['state']['liftMaxes']
  onChange: (day: DraftDay) => void
  onRemove?: () => void
  index: number
}) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = needle ? exercises.filter((exercise) => exercise.name.toLowerCase().includes(needle)) : exercises
    return rows.slice(0, 40)
  }, [exercises, query])
  return (
    <section className="space-y-2 rounded-2xl border border-charcoal-4 bg-charcoal p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Day {index + 1}</p>
        {onRemove ? (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove day
          </Button>
        ) : null}
      </div>
      <Input aria-label={`Day ${index + 1} name`} value={day.name} onChange={(event) => onChange({ ...day, name: event.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label={`Day ${index + 1} weekday`}
          value={day.weekday ?? ''}
          onChange={(event) => {
            const value = event.target.value
            onChange({ ...day, weekday: value === '' ? undefined : Number(value) })
          }}
        >
          <option value="">Flexible</option>
          {WEEKDAYS.map((label, weekday) => (
            <option key={label} value={weekday}>
              {label}
            </option>
          ))}
        </Select>
        <Select aria-label={`Day ${index + 1} focus`} value={day.focus} onChange={(event) => onChange({ ...day, focus: event.target.value })}>
          {DAY_FOCUSES.map((focus) => (
            <option key={focus}>{focus}</option>
          ))}
        </Select>
      </div>
      {day.exercises.map((prescription, exerciseIndex) => {
        const exercise = exercises.find((item) => item.id === prescription.exerciseId) ?? null
        return (
          <div key={prescription.id ?? exerciseIndex} className="rounded-xl bg-charcoal-2 p-2">
            <p className="mb-1 text-sm font-medium">{exercise?.name ?? 'Exercise'}</p>
            <PrescriptionEditor
              variant="compact"
              prescription={prescription}
              exercise={exercise}
              weightUnit={weightUnit}
              maxKg={resolveMax(prescription.exerciseId, liftMaxes)?.maxKg ?? null}
              onChange={(next) => {
                const list = day.exercises.slice()
                list[exerciseIndex] = next
                onChange({ ...day, exercises: list })
              }}
              onRemove={() => onChange({ ...day, exercises: day.exercises.filter((_, item) => item !== exerciseIndex) })}
              onMove={(direction) => {
                const next = exerciseIndex + direction
                if (next < 0 || next >= day.exercises.length) return
                const list = day.exercises.slice()
                const current = list[exerciseIndex]
                const swap = list[next]
                if (!current || !swap) return
                list[exerciseIndex] = swap
                list[next] = current
                onChange({ ...day, exercises: list })
              }}
            />
          </div>
        )
      })}
      <Input aria-label={`Search exercises for day ${index + 1}`} placeholder="Search exercises" value={query} onChange={(event) => setQuery(event.target.value)} />
      <Select
        aria-label={`Add exercise to day ${index + 1}`}
        value=""
        onChange={(event) => {
          const exercise = exercises.find((item) => item.id === event.target.value)
          if (!exercise) return
          onChange({
            ...day,
            exercises: [...day.exercises, { ...prescriptionFromExercise(exercise), id: createId('pex') }],
          })
        }}
      >
        <option value="">Add exercise…</option>
        {matches.map((exercise) => (
          <option key={exercise.id} value={exercise.id}>
            {exercise.name}
          </option>
        ))}
      </Select>
    </section>
  )
}
