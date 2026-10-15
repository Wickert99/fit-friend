import { useMemo, useState } from 'react'
import type { Exercise, PlanBoard, PlanDay, Prescription, Program, WeightUnit } from '../../types.ts'
import { createId } from '../../store/id.ts'
import { Button, Input, Segmented, Select, Sheet } from '../../ui/index.ts'
import { findDay, updateDay } from './boardOps.ts'
import {
  filterDayTemplates,
  filterExercises,
  importExercises,
  importWholeDay,
  prescriptionFromExercise,
  type ImportMode,
} from './importApply.ts'
import { PrescriptionEditor } from './PrescriptionEditor.tsx'

export function ImportSheet({
  board,
  open,
  exercises,
  programs,
  weightUnit,
  onClose,
  onBoard,
}: {
  board: PlanBoard | null
  open: boolean
  exercises: Exercise[]
  programs: Program[]
  weightUnit: WeightUnit
  onClose: () => void
  onBoard: (board: PlanBoard) => void
}) {
  const [mode, setMode] = useState<ImportMode>('exercise')
  const [query, setQuery] = useState('')
  const [targetId, setTargetId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [dayKey, setDayKey] = useState('')
  const [rx, setRx] = useState<Prescription>(prescriptionFromExercise(null))
  const [rxTouched, setRxTouched] = useState(false)

  const targets = useMemo(() => {
    if (!board) return []
    return board.weeks.flatMap((week) => week.days.map((day) => ({ week, day })))
  }, [board])
  const target = targetId || targets[0]?.day.id || ''
  const matches = useMemo(
    () => (mode === 'day' ? [] : filterExercises(exercises, mode, query).slice(0, 40)),
    [exercises, mode, query],
  )
  const days = useMemo(() => (mode === 'day' ? filterDayTemplates(programs, query).slice(0, 40) : []), [programs, mode, query])
  const byId = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise])), [exercises])

  function chooseExercise(id: string) {
    setSelected((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      if (!rxTouched) {
        const first = byId.get(next[0] ?? '')
        if (first) setRx(prescriptionFromExercise(first))
      }
      return next
    })
  }

  function apply() {
    if (!board || !target) return
    const located = findDay(board, target)
    if (!located) return
    let nextDay: PlanDay = located.day
    if (mode === 'day') {
      const template = days.find((row) => `${row.programId}:${row.day.id}` === dayKey)
      if (!template) return
      nextDay = importWholeDay(located.day, template.day, createId)
    } else {
      const picked = selected.map((id) => byId.get(id)).filter((exercise): exercise is Exercise => !!exercise)
      if (picked.length === 0) return
      nextDay = importExercises(located.day, picked, rx, createId)
    }
    onBoard(updateDay(board, target, () => nextDay))
    setSelected([])
    setDayKey('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Import from library" subtitle="Exercise, movement, or a whole day">
      <div data-plan-import-sheet="true" className="space-y-3">
        <Segmented
          label="Import mode"
          value={mode}
          onChange={(next) => {
            setMode(next)
            setSelected([])
            setDayKey('')
            setQuery('')
          }}
          options={[
            { id: 'exercise', label: 'Exercise' },
            { id: 'movement', label: 'Movement' },
            { id: 'day', label: 'Whole day' },
          ]}
        />
        <Input aria-label="Search library" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
        <label className="block text-xs text-muted">
          Target day
          <Select aria-label="Target day" value={target} onChange={(event) => setTargetId(event.target.value)}>
            {targets.length === 0 ? <option value="">Add a day first</option> : null}
            {targets.map(({ week, day }) => (
              <option key={day.id} value={day.id}>
                {week.label} · {day.name || 'Day'}
              </option>
            ))}
          </Select>
        </label>
        <ul data-import-list="true" className="max-h-52 space-y-1 overflow-y-auto">
          {mode === 'day'
            ? days.map((row) => {
                const key = `${row.programId}:${row.day.id}`
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-pressed={dayKey === key}
                      className={`min-h-11 w-full rounded-xl border px-3 text-left text-sm ${dayKey === key ? 'border-lime bg-lime/8' : 'border-charcoal-4'}`}
                      onClick={() => setDayKey(key)}
                    >
                      <span className="font-medium">{row.day.name}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {row.programName} · {row.day.focus} · {row.day.exercises.length} exercises
                      </span>
                    </button>
                  </li>
                )
              })
            : matches.map((exercise) => {
                const on = selected.includes(exercise.id)
                return (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      className={`min-h-11 w-full rounded-xl border px-3 text-left text-sm ${on ? 'border-lime bg-lime/8' : 'border-charcoal-4'}`}
                      onClick={() => chooseExercise(exercise.id)}
                    >
                      {exercise.name}
                    </button>
                  </li>
                )
              })}
        </ul>
        {mode === 'day' ? null : (
          <div data-import-rx="true">
            <p className="mb-1 text-xs font-medium text-muted">Sets & reps for selected</p>
            <PrescriptionEditor
              variant="compact"
              prescription={rx}
              exercise={byId.get(selected[0] ?? '') ?? null}
              weightUnit={weightUnit}
              onChange={(next) => {
                setRxTouched(true)
                setRx(next)
              }}
            />
          </div>
        )}
        <Button className="w-full" disabled={!target || (mode === 'day' ? !dayKey : selected.length === 0)} onClick={apply}>
          {mode === 'day' ? 'Copy day' : `Add ${selected.length || ''}`.trim()}
        </Button>
      </div>
    </Sheet>
  )
}
