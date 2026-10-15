import type { Exercise, LiftMax, PlanDay, WeightUnit } from '../../types.ts'
import { resolveMax } from '../../lib/personalize/maxes.ts'
import { Button, Input, Select, TextArea } from '../../ui/index.ts'
import { setDayFocus } from './boardOps.ts'
import { FOCUS_OPTIONS, focusColor, setTypePill } from './focus.ts'
import { PrescriptionEditor } from './PrescriptionEditor.tsx'

export function DayCard({
  day,
  weekLabel,
  exercises,
  weightUnit,
  liftMaxes,
  onChange,
  onClear,
  onDelete,
  onEditSets,
}: {
  day: PlanDay
  weekLabel: string
  exercises: Exercise[]
  weightUnit: WeightUnit
  liftMaxes: Record<string, LiftMax>
  onChange: (day: PlanDay) => void
  onClear: () => void
  onDelete: () => void
  onEditSets: () => void
}) {
  const tone = focusColor(day.focus)
  const free = day.focus === 'Free write' || day.isWhiteboard
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  return (
    <article
      data-day-card={day.id}
      className="space-y-3 rounded-2xl border p-3 shadow-card"
      style={{ background: tone.soft, borderColor: tone.border }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-32 flex-1 text-xs font-medium" style={{ color: tone.text }}>
          Day
          <Input aria-label="Day name" value={day.name} onChange={(event) => onChange({ ...day, name: event.target.value })} />
        </label>
        <label className="min-w-36 flex-1 text-xs font-medium" style={{ color: tone.text }}>
          Focus
          <Select
            aria-label="Day focus"
            value={FOCUS_OPTIONS.includes(day.focus as (typeof FOCUS_OPTIONS)[number]) ? day.focus : day.focus || 'Strength'}
            onChange={(event) => onChange(setDayFocus(day, event.target.value))}
          >
            {FOCUS_OPTIONS.map((focus) => (
              <option key={focus} value={focus}>
                {focus}
              </option>
            ))}
            {day.focus && !FOCUS_OPTIONS.includes(day.focus as (typeof FOCUS_OPTIONS)[number]) ? (
              <option value={day.focus}>{day.focus}</option>
            ) : null}
          </Select>
        </label>
      </div>
      <label className="block text-xs font-medium" style={{ color: tone.text }}>
        {free ? 'Free-write pad' : 'Session pad'}
        <TextArea
          data-session-pad={day.id}
          className="plan-pad font-hand mt-1 min-h-24 text-lg leading-8"
          placeholder={free ? 'Write the session in your own words…' : 'Cues, warm-up, anything to remember…'}
          value={day.sessionPad ?? day.pad ?? ''}
          onChange={(event) => onChange({ ...day, sessionPad: event.target.value, pad: event.target.value })}
        />
      </label>
      {free ? (
        <p className="text-xs" style={{ color: tone.text }}>
          Switching the focus away from Free write adds an exercise list to this card.
        </p>
      ) : (
        <ul className="space-y-2">
          {day.exercises.map((prescription, index) => {
            const exercise = prescription.exerciseId ? (byId.get(prescription.exerciseId) ?? null) : null
            const name = exercise?.name || prescription.placeholder || 'Custom exercise'
            const pill = setTypePill(prescription.setType)
            return (
              <li key={prescription.id ?? `${prescription.exerciseId}-${index}`} className="rounded-xl bg-charcoal/80 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-ink">{name}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${pill.className}`}>{pill.label}</span>
                </div>
                {!prescription.exerciseId ? (
                  <Input
                    aria-label="Custom exercise name"
                    className="mb-2"
                    value={prescription.placeholder ?? ''}
                    onChange={(event) => {
                      const exercisesNext = day.exercises.slice()
                      exercisesNext[index] = { ...prescription, placeholder: event.target.value }
                      onChange({ ...day, exercises: exercisesNext })
                    }}
                  />
                ) : null}
                <PrescriptionEditor
                  variant="compact"
                  prescription={prescription}
                  exercise={exercise}
                  weightUnit={weightUnit}
                  maxKg={prescription.exerciseId ? (resolveMax(prescription.exerciseId, liftMaxes)?.maxKg ?? null) : null}
                  onChange={(next) => {
                    const exercisesNext = day.exercises.slice()
                    exercisesNext[index] = next
                    onChange({ ...day, exercises: exercisesNext })
                  }}
                  onRemove={() => onChange({ ...day, exercises: day.exercises.filter((_, item) => item !== index) })}
                  onMove={(direction) => {
                    const next = index + direction
                    if (next < 0 || next >= day.exercises.length) return
                    const exercisesNext = day.exercises.slice()
                    const current = exercisesNext[index]
                    const swap = exercisesNext[next]
                    if (!current || !swap) return
                    exercisesNext[index] = swap
                    exercisesNext[next] = current
                    onChange({ ...day, exercises: exercisesNext })
                  }}
                />
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {free ? null : (
          <Button size="sm" variant="secondary" onClick={onEditSets}>
            Sets & reps
          </Button>
        )}
        <Button size="sm" variant="ghost" data-clear-day={day.id} onClick={onClear}>
          Clear day
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          Delete day
        </Button>
      </div>
      <p className="sr-only">
        {day.name} in {weekLabel}
      </p>
    </article>
  )
}
