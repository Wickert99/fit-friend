import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Exercise, Prescription, PrescriptionEditorProps, SetScheme, SetType, WeightUnit } from '../../types.ts'
import { SET_TYPES } from '../../types.ts'
import {
  REST_CHOICES,
  SET_TYPE_DESCRIPTIONS,
  SET_TYPE_LABELS,
  formatDuration,
  freshScheme,
  readPercent,
  readRir,
  schemesOf,
} from '../../lib/setTypes/index.ts'
import { formatPlateLoad, kgToUnit, percentToLoadKg, unitToKg } from '../../lib/setTypes/units.ts'
import { createId } from '../../store/id.ts'
import { IconButton, Input, Select, TextArea } from '../../ui/index.ts'
import { changePrescriptionType, isWaveType, patchPrescription, replaceSchemes } from './prescription.ts'

export function PrescriptionEditor({
  prescription,
  onChange,
  exercise,
  weightUnit,
  maxKg,
  variant = 'full',
  disabled,
  onRemove,
  onMove,
  onSwapExercise,
}: PrescriptionEditorProps) {
  const patch = (next: Partial<Prescription>) => onChange(patchPrescription(prescription, next))
  const setType = (value: SetType) => onChange(changePrescriptionType(prescription, value))

  return (
    <fieldset
      disabled={disabled}
      data-prescription-editor
      data-variant={variant}
      data-set-type={prescription.setType}
      className="min-w-0 space-y-3 border-0 p-0 disabled:opacity-60"
    >
      {variant === 'compact' ? (
        <CompactRow
          prescription={prescription}
          exercise={exercise}
          weightUnit={weightUnit}
          maxKg={maxKg}
          onPatch={patch}
          onType={setType}
          onMove={onMove}
          onRemove={onRemove}
        />
      ) : (
        <FullEditor
          prescription={prescription}
          exercise={exercise}
          weightUnit={weightUnit}
          maxKg={maxKg}
          onPatch={patch}
          onType={setType}
          onChange={onChange}
          onMove={onMove}
          onRemove={onRemove}
          onSwapExercise={onSwapExercise}
        />
      )}
    </fieldset>
  )
}

export default PrescriptionEditor

function CompactRow({
  prescription,
  exercise,
  weightUnit,
  maxKg,
  onPatch,
  onType,
  onMove,
  onRemove,
}: {
  prescription: Prescription
  exercise: Exercise | null
  weightUnit: WeightUnit
  maxKg?: number | null
  onPatch: (patch: Partial<Prescription>) => void
  onType: (setType: SetType) => void
  onMove?: (direction: -1 | 1) => void
  onRemove?: () => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Set type" className="min-w-36 flex-1">
        <TypeSelect prescription={prescription} onType={onType} />
      </Field>
      <Field label="Sets" className="w-16">
        <Input
          aria-label={`Sets for ${exercise?.name ?? 'exercise'}`}
          inputMode="numeric"
          min={1}
          value={prescription.sets}
          onChange={(event) => onPatch({ sets: Math.max(1, Number(event.target.value) || 1) })}
        />
      </Field>
      <Field label="Reps" className="min-w-20 flex-1">
        <Input
          aria-label={`Reps for ${exercise?.name ?? 'exercise'}`}
          value={prescription.reps}
          onChange={(event) => onPatch({ reps: event.target.value })}
        />
      </Field>
      <LoadControl prescription={prescription} weightUnit={weightUnit} maxKg={maxKg} onPatch={onPatch} />
      <div className="flex shrink-0">
        {onMove ? (
          <>
            <IconButton label="Move up" onClick={() => onMove(-1)}>
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton label="Move down" onClick={() => onMove(1)}>
              <ArrowDown className="h-4 w-4" />
            </IconButton>
          </>
        ) : null}
        {onRemove ? (
          <IconButton label="Remove exercise" variant="danger" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        ) : null}
      </div>
    </div>
  )
}

function FullEditor({
  prescription,
  exercise,
  weightUnit,
  maxKg,
  onPatch,
  onType,
  onChange,
  onMove,
  onRemove,
  onSwapExercise,
}: {
  prescription: Prescription
  exercise: Exercise | null
  weightUnit: WeightUnit
  maxKg?: number | null
  onPatch: (patch: Partial<Prescription>) => void
  onType: (setType: SetType) => void
  onChange: (next: Prescription) => void
  onMove?: (direction: -1 | 1) => void
  onRemove?: () => void
  onSwapExercise?: () => void
}) {
  const wave = isWaveType(prescription.setType)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Set type" className="min-w-36 flex-1">
          <TypeSelect prescription={prescription} onType={onType} />
        </Field>
        <div className="flex shrink-0">
          {onSwapExercise ? (
            <button type="button" className="min-h-11 px-2 text-xs font-semibold text-lime-dim" onClick={onSwapExercise}>
              Change
            </button>
          ) : null}
          {onMove ? (
            <>
              <IconButton label="Move up" onClick={() => onMove(-1)}>
                <ArrowUp className="h-4 w-4" />
              </IconButton>
              <IconButton label="Move down" onClick={() => onMove(1)}>
                <ArrowDown className="h-4 w-4" />
              </IconButton>
            </>
          ) : null}
          {onRemove ? (
            <IconButton label="Remove exercise" variant="danger" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted">{SET_TYPE_DESCRIPTIONS[prescription.setType]}</p>
      {wave ? (
        <>
          {prescription.setType === 'time' ? (
            <DurationField
              label="Duration"
              seconds={prescription.timeCapSec ?? 45}
              onChange={(seconds) => {
                const reps = `${seconds}s`
                const schemes = schemesOf(prescription).map((scheme) => ({ ...scheme, reps }))
                onChange(replaceSchemes({ ...prescription, timeCapSec: seconds, reps }, schemes))
              }}
            />
          ) : null}
          {prescription.setType === 'distance' ? (
            <MetresField
              metres={prescription.distanceM ?? 40}
              onChange={(metres) => {
                const reps = `${metres}m`
                const schemes = schemesOf(prescription).map((scheme) => ({ ...scheme, reps }))
                onChange(replaceSchemes({ ...prescription, distanceM: metres, reps }, schemes))
              }}
            />
          ) : null}
          <SchemeList prescription={prescription} weightUnit={weightUnit} maxKg={maxKg} onChange={onChange} />
        </>
      ) : (
        <TypedFields prescription={prescription} weightUnit={weightUnit} maxKg={maxKg} onPatch={onPatch} />
      )}
      <Field label="Notes">
        <TextArea
          aria-label={`Notes for ${exercise?.name ?? 'exercise'}`}
          className="min-h-20"
          value={prescription.notes ?? ''}
          placeholder="Cue, tempo, or warm-up note"
          onChange={(event) => onPatch({ notes: event.target.value })}
        />
      </Field>
    </div>
  )
}

function TypedFields({
  prescription,
  weightUnit,
  maxKg,
  onPatch,
}: {
  prescription: Prescription
  weightUnit: WeightUnit
  maxKg?: number | null
  onPatch: (patch: Partial<Prescription>) => void
}) {
  if (prescription.setType === 'amrap') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <DurationField
          label="Time cap"
          seconds={prescription.timeCapSec ?? 0}
          onChange={(seconds) => onPatch({ timeCapSec: seconds > 0 ? seconds : undefined, sets: 1, reps: 'AMRAP', restSec: 0 })}
        />
        <Field label="Rounds target">
          <Input
            aria-label="AMRAP rounds"
            inputMode="numeric"
            min={0}
            value={prescription.rounds ?? ''}
            placeholder="Optional"
            onChange={(event) => {
              const rounds = Number(event.target.value)
              onPatch({ rounds: event.target.value === '' || !Number.isFinite(rounds) ? undefined : Math.max(0, rounds) })
            }}
          />
        </Field>
      </div>
    )
  }
  if (prescription.setType === 'emom') {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Field label="Rounds">
          <Input
            aria-label="EMOM rounds"
            inputMode="numeric"
            min={1}
            value={prescription.rounds ?? prescription.sets}
            onChange={(event) => {
              const rounds = Math.max(1, Number(event.target.value) || 1)
              onPatch({ rounds, sets: rounds, restSec: 0 })
            }}
          />
        </Field>
        <Field label="Reps each round">
          <Input aria-label="EMOM reps" value={prescription.reps} onChange={(event) => onPatch({ reps: event.target.value })} />
        </Field>
        <Field label="Interval" className="col-span-2">
          <Select
            aria-label="EMOM interval"
            value={prescription.emomIntervalSec ?? 60}
            onChange={(event) => onPatch({ emomIntervalSec: Number(event.target.value), restSec: 0 })}
          >
            {intervalChoices(prescription.emomIntervalSec ?? 60).map((seconds) => (
              <option key={seconds} value={seconds}>
                Every {formatDuration(seconds)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="col-span-2">
          <LoadControl prescription={prescription} weightUnit={weightUnit} maxKg={maxKg} onPatch={onPatch} />
        </div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Sets">
        <Input
          aria-label="For time sets"
          inputMode="numeric"
          min={1}
          value={prescription.sets}
          onChange={(event) => onPatch({ sets: Math.max(1, Number(event.target.value) || 1) })}
        />
      </Field>
      <MetresField
        metres={prescription.distanceM ?? 0}
        onChange={(metres) => onPatch({ distanceM: metres > 0 ? metres : undefined, reps: metres > 0 ? `${metres}m for time` : 'for time' })}
      />
      <DurationField
        label="Time cap"
        seconds={prescription.timeCapSec ?? 0}
        onChange={(seconds) => onPatch({ timeCapSec: seconds > 0 ? seconds : undefined })}
      />
      <RestField restSec={prescription.restSec} onChange={(restSec) => onPatch({ restSec })} />
    </div>
  )
}

function SchemeList({
  prescription,
  weightUnit,
  maxKg,
  onChange,
}: {
  prescription: Prescription
  weightUnit: WeightUnit
  maxKg?: number | null
  onChange: (next: Prescription) => void
}) {
  const schemes = schemesOf(prescription)
  const strength = prescription.setType === 'reps_load' || prescription.setType === 'each_side' || prescription.setType === 'per_leg'
  const update = (index: number, patch: Partial<SetScheme>) => {
    const next = schemes.map((scheme, schemeIndex) => (schemeIndex === index ? { ...scheme, ...patch } : scheme))
    onChange(replaceSchemes(prescription, next))
  }
  return (
    <div data-schemes-editor className="space-y-2">
      {schemes.map((scheme, index) => (
        <div key={scheme.id ?? index} className="space-y-2 rounded-xl border border-charcoal-4 bg-charcoal-2/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Wave {index + 1}</p>
            {schemes.length > 1 ? (
              <button
                type="button"
                className="min-h-11 px-2 text-xs font-semibold text-danger"
                onClick={() => onChange(replaceSchemes(prescription, schemes.filter((_, schemeIndex) => schemeIndex !== index)))}
              >
                Remove wave
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sets">
              <Input
                aria-label={`Wave ${index + 1} sets`}
                inputMode="numeric"
                min={1}
                value={scheme.sets}
                onChange={(event) => update(index, { sets: Math.max(1, Number(event.target.value) || 1) })}
              />
            </Field>
            {strength ? (
              <Field label={prescription.setType === 'per_leg' ? 'Reps / leg' : prescription.setType === 'each_side' ? 'Reps / side' : 'Reps'}>
                <Input
                  aria-label={`Wave ${index + 1} reps`}
                  value={scheme.reps}
                  onChange={(event) => update(index, { reps: event.target.value })}
                />
              </Field>
            ) : (
              <RestField restSec={scheme.restSec ?? prescription.restSec} onChange={(restSec) => update(index, { restSec })} />
            )}
            {strength ? (
              <div className="col-span-2">
                <LoadControl
                  prescription={{ ...prescription, ...scheme }}
                  weightUnit={weightUnit}
                  maxKg={maxKg}
                  onPatch={(patch) =>
                    update(index, {
                      targetLoadKg: 'targetLoadKg' in patch ? patch.targetLoadKg : scheme.targetLoadKg,
                      targetPercent1RM: 'targetPercent1RM' in patch ? patch.targetPercent1RM : readPercent(scheme),
                      percent1RM: 'targetPercent1RM' in patch ? patch.targetPercent1RM : readPercent(scheme),
                    })
                  }
                />
              </div>
            ) : null}
            {strength ? (
              <RestField restSec={scheme.restSec ?? prescription.restSec} onChange={(restSec) => update(index, { restSec })} />
            ) : null}
            {strength ? (
              <>
                <Field label="RPE">
                  <Input
                    aria-label={`Wave ${index + 1} RPE`}
                    inputMode="decimal"
                    min={1}
                    max={10}
                    value={scheme.targetRpe ?? ''}
                    placeholder="—"
                    onChange={(event) => {
                      const targetRpe = Number(event.target.value)
                      update(index, { targetRpe: event.target.value === '' || !Number.isFinite(targetRpe) ? undefined : Math.min(10, Math.max(1, targetRpe)) })
                    }}
                  />
                </Field>
                <Field label="RIR">
                  <Input
                    aria-label={`Wave ${index + 1} RIR`}
                    inputMode="numeric"
                    min={0}
                    max={10}
                    value={readRir(scheme) ?? ''}
                    placeholder="—"
                    onChange={(event) => {
                      const targetRir = Number(event.target.value)
                      update(index, {
                        targetRir: event.target.value === '' || !Number.isFinite(targetRir) ? undefined : Math.max(0, targetRir),
                        rir: event.target.value === '' || !Number.isFinite(targetRir) ? undefined : Math.max(0, targetRir),
                      })
                    }}
                  />
                </Field>
              </>
            ) : null}
          </div>
        </div>
      ))}
      <button
        type="button"
        data-add-wave
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-lime-dim"
        onClick={() => {
          const last = schemes[schemes.length - 1]
          const added = freshScheme(
            {
              sets: last?.sets ?? prescription.sets,
              reps: last?.reps ?? prescription.reps,
              restSec: last?.restSec ?? prescription.restSec,
              targetLoadKg: last?.targetLoadKg,
              targetPercent1RM: readPercent(last),
              targetRpe: last?.targetRpe,
              targetRir: readRir(last),
            },
            createId('sch'),
          )
          onChange(replaceSchemes(prescription, [...schemes, added]))
        }}
      >
        <Plus className="h-4 w-4" />
        Add wave
      </button>
    </div>
  )
}

function LoadControl({
  prescription,
  weightUnit,
  maxKg,
  onPatch,
}: {
  prescription: Prescription
  weightUnit: WeightUnit
  maxKg?: number | null
  onPatch: (patch: Partial<Prescription>) => void
}) {
  const percent = readPercent(prescription)
  const mode = percent != null && percent > 0 ? 'percent' : 'load'
  const resolved = percent != null && percent > 0 && maxKg != null && maxKg > 0 ? percentToLoadKg(percent, maxKg, weightUnit) : 0
  return (
    <div className="min-w-36 flex-1">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{mode === 'percent' ? '%1RM' : `Load (${weightUnit})`}</span>
        <button
          type="button"
          className="text-xs font-semibold text-lime-dim"
          onClick={() => {
            if (mode === 'percent') {
              onPatch({ targetPercent1RM: undefined, percent1RM: undefined, targetLoadKg: resolved > 0 ? resolved : prescription.targetLoadKg })
            } else {
              onPatch({ targetPercent1RM: 70, percent1RM: 70, targetLoadKg: maxKg ? percentToLoadKg(70, maxKg, weightUnit) : undefined })
            }
          }}
        >
          {mode === 'percent' ? `Use ${weightUnit}` : 'Use %'}
        </button>
      </div>
      {mode === 'percent' ? (
        <Input
          aria-label="Percent of 1RM"
          inputMode="decimal"
          min={1}
          max={100}
          value={percent ?? ''}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (!Number.isFinite(next) || next <= 0) {
              onPatch({ targetPercent1RM: undefined, percent1RM: undefined })
              return
            }
            onPatch({
              targetPercent1RM: next,
              percent1RM: next,
              targetLoadKg: maxKg && maxKg > 0 ? percentToLoadKg(next, maxKg, weightUnit) : undefined,
            })
          }}
        />
      ) : (
        <Input
          aria-label={`Load in ${weightUnit}`}
          inputMode="decimal"
          min={0}
          value={prescription.targetLoadKg ? roundDisplay(kgToUnit(prescription.targetLoadKg, weightUnit), weightUnit) : ''}
          placeholder="Bodyweight"
          onChange={(event) => {
            const next = Number(event.target.value)
            onPatch({
              targetLoadKg: event.target.value === '' || !Number.isFinite(next) || next <= 0 ? undefined : unitToKg(next, weightUnit),
              targetPercent1RM: undefined,
              percent1RM: undefined,
            })
          }}
        />
      )}
      {mode === 'percent' ? (
        <p className="mt-1 text-xs text-muted">
          {resolved > 0 ? `≈ ${formatPlateLoad(resolved, weightUnit)}` : 'No 1RM stored for this lift'}
        </p>
      ) : null}
    </div>
  )
}

function TypeSelect({ prescription, onType }: { prescription: Prescription; onType: (setType: SetType) => void }) {
  return (
    <Select aria-label="Set type" value={prescription.setType} onChange={(event) => onType(event.target.value as SetType)}>
      {SET_TYPES.map((type) => (
        <option key={type} value={type}>
          {SET_TYPE_LABELS[type]}
        </option>
      ))}
    </Select>
  )
}

function DurationField({ label, seconds, onChange }: { label: string; seconds: number; onChange: (seconds: number) => void }) {
  return (
    <Field label={`${label} (sec)`}>
      <Input
        aria-label={label}
        inputMode="numeric"
        min={0}
        value={seconds || ''}
        placeholder="0"
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
      />
      <span className="mt-1 block text-xs text-muted">{seconds > 0 ? formatDuration(seconds) : 'No cap'}</span>
    </Field>
  )
}

function MetresField({ metres, onChange }: { metres: number; onChange: (metres: number) => void }) {
  return (
    <Field label="Metres">
      <Input
        aria-label="Distance in metres"
        inputMode="numeric"
        min={0}
        value={metres || ''}
        placeholder="0"
        onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))}
      />
    </Field>
  )
}

function RestField({ restSec, onChange }: { restSec: number; onChange: (restSec: number) => void }) {
  const choices = Array.from(new Set([restSec, ...REST_CHOICES])).sort((a, b) => a - b)
  return (
    <Field label="Rest">
      <Select aria-label="Rest" value={restSec} onChange={(event) => onChange(Number(event.target.value))}>
        {choices.map((seconds) => (
          <option key={seconds} value={seconds}>
            {seconds === 0 ? 'None' : formatDuration(seconds)}
          </option>
        ))}
      </Select>
    </Field>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={className ? `block text-xs text-muted ${className}` : 'block text-xs text-muted'}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function intervalChoices(current: number): number[] {
  return Array.from(new Set([current, 30, 45, 60, 90, 120])).sort((a, b) => a - b)
}

function roundDisplay(value: number, unit: WeightUnit): string {
  const factor = unit === 'lb' ? 10 : 100
  return String(Math.round(value * factor) / factor)
}
