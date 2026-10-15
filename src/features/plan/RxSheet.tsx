import { useState } from 'react'
import type { Exercise, LiftMax, PlanDay, WeightUnit } from '../../types.ts'
import { createId } from '../../store/id.ts'
import { resolveMax } from '../../lib/personalize/maxes.ts'
import { Button, Input, Select, Sheet } from '../../ui/index.ts'
import { useToast } from '../../ui/Toast.tsx'
import { blankPrescription } from './boardOps.ts'
import { prescriptionFromExercise } from './importApply.ts'
import { PrescriptionEditor } from './PrescriptionEditor.tsx'

export function RxSheet({
  day,
  exercises,
  weightUnit,
  liftMaxes,
  open,
  onClose,
  onChange,
}: {
  day: PlanDay | null
  exercises: Exercise[]
  weightUnit: WeightUnit
  liftMaxes: Record<string, LiftMax>
  open: boolean
  onClose: () => void
  onChange: (day: PlanDay) => void
}) {
  const toast = useToast()
  const [custom, setCustom] = useState('')
  const [pick, setPick] = useState('')
  if (!day) return null
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  return (
    <Sheet open={open} onClose={onClose} title="Sets & reps" subtitle="default 3×8 is fine">
      <div data-add-rx-sheet="true" className="space-y-4">
        {day.exercises.length === 0 ? <p className="text-sm text-muted">No exercises on this day yet.</p> : null}
        {day.exercises.map((prescription, index) => {
          const exercise = prescription.exerciseId ? (byId.get(prescription.exerciseId) ?? null) : null
          return (
            <div key={prescription.id ?? index} className="rounded-xl border border-charcoal-4 p-2">
              <p className="mb-2 text-sm font-semibold">{exercise?.name || prescription.placeholder || 'Custom exercise'}</p>
              <PrescriptionEditor
                variant="full"
                prescription={prescription}
                exercise={exercise}
                weightUnit={weightUnit}
                maxKg={prescription.exerciseId ? (resolveMax(prescription.exerciseId, liftMaxes)?.maxKg ?? null) : null}
                onChange={(next) => {
                  const list = day.exercises.slice()
                  list[index] = next
                  onChange({ ...day, exercises: list })
                }}
                onRemove={() => onChange({ ...day, exercises: day.exercises.filter((_, item) => item !== index) })}
              />
            </div>
          )
        })}
        <div className="flex gap-2">
          <Input
            aria-label="Custom exercise name"
            placeholder="Custom exercise name"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
          />
          <Button
            variant="secondary"
            onClick={() => {
              const name = custom.trim()
              if (!name) {
                toast({ tone: 'error', text: 'Give this custom exercise a name before saving.' })
                return
              }
              onChange({
                ...day,
                exercises: [...day.exercises, { ...blankPrescription({ placeholder: name }), id: createId('pex') }],
              })
              setCustom('')
            }}
          >
            Add custom
          </Button>
        </div>
        <label className="block text-xs text-muted">
          Library
          <Select
            aria-label="Add exercise"
            value={pick}
            onChange={(event) => {
              const id = event.target.value
              setPick('')
              const exercise = byId.get(id)
              if (!exercise) return
              onChange({
                ...day,
                exercises: [...day.exercises, { ...prescriptionFromExercise(exercise), id: createId('pex'), exerciseId: exercise.id }],
              })
            }}
          >
            <option value="">Add exercise…</option>
            {exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </Select>
        </label>
      </div>
    </Sheet>
  )
}
