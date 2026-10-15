import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { benchmarkRecords, liftFamilies, liftFamilyNote, runRecords } from '../../store/catalog.ts'
import { useStore } from '../../store/useStore.ts'
import type { LiftMax, ScoreRecordDef, WeightUnit } from '../../types.ts'
import { Badge, Button, Card, Input, Select, cn } from '../../ui/index.ts'
import { estimate1rm } from '../../lib/maxes/estimate.ts'
import { familyIdForExercise, familyLabel, resolveFamilyMax } from '../../lib/maxes/families.ts'
import {
  amrapRecord,
  estimatedStrengthMax,
  formatDuration,
  formatRecord,
  formatWeight,
  parseDuration,
  roundToPlate,
  strengthMax,
  timeRecord,
  unitToKg,
} from '../../lib/maxes/index.ts'

type Section = 'strength' | 'run' | 'benchmark'

const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: 'strength', label: 'Strength 1RM', hint: 'Barbell / lift families used for % prescriptions' },
  { id: 'run', label: 'Running', hint: 'Distance time-trial PRs (lower is better)' },
  { id: 'benchmark', label: 'Benchmarks', hint: 'Classic WODs & engine tests (Fran, Cindy, Murph…)' },
]

export function MaxesPanel({ className, highlightFamilyId, compact }: { className?: string; highlightFamilyId?: string; compact?: boolean }) {
  const { state, setLiftMax, deleteLiftMax, setWeightUnit } = useStore()
  const unit = state.weightUnit ?? 'kg'
  const [section, setSection] = useState<Section>('strength')
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<string | null>(highlightFamilyId ?? null)
  const [draft, setDraft] = useState('')
  const [rounds, setRounds] = useState('')
  const [extra, setExtra] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const scores = section === 'run' ? runRecords : section === 'benchmark' ? benchmarkRecords : []
  const query = filter.trim().toLowerCase()
  const lifts = useMemo(
    () => liftFamilies.filter((family) => !query || family.name.toLowerCase().includes(query) || family.id.includes(query)),
    [query],
  )
  const listed = useMemo(
    () =>
      scores.filter(
        (record) =>
          !query ||
          record.name.toLowerCase().includes(query) ||
          record.id.includes(query) ||
          (record.blurb ?? '').toLowerCase().includes(query),
      ),
    [scores, query],
  )
  const hint = SECTIONS.find((item) => item.id === section)?.hint
  const orphans = Object.values(state.liftMaxes ?? {}).filter((record) => {
    if ((record.kind ?? 'strength') !== section) return false
    if (section === 'strength') return !liftFamilies.some((family) => family.id === record.familyId)
    return !scores.some((item) => item.id === record.familyId)
  })

  const resetEditor = () => {
    setEditing(null)
    setDraft('')
    setRounds('')
    setExtra('')
  }

  const openStrength = (id: string) => {
    setEditing(id)
    const current = state.liftMaxes[id]
    if (current?.maxKg && current.maxKg > 0) {
      const display = unit === 'lb' ? current.maxKg * 2.2046226218 : current.maxKg
      const rounded = Math.round(display * 10) / 10
      setDraft(Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1))
    } else setDraft('')
  }

  const openTime = (id: string) => {
    setEditing(id)
    const current = state.liftMaxes[id]
    setDraft(current?.bestTimeSec && current.bestTimeSec > 0 ? formatDuration(current.bestTimeSec).replace(/s$/, '') : '')
  }

  const openAmrap = (id: string) => {
    setEditing(id)
    const current = state.liftMaxes[id]
    setRounds(current?.bestRounds == null ? '' : String(current.bestRounds))
    setExtra(current?.bestExtraReps == null ? '' : String(current.bestExtraReps))
  }

  const saveStrength = (id: string, name: string) => {
    const value = Number(draft)
    if (!Number.isFinite(value) || value <= 0) return
    const current = state.liftMaxes[id]
    setLiftMax(
      strengthMax(id, name, value, unit, current?.notes, current?.sourceExerciseId),
    )
    resetEditor()
  }

  const saveTime = (record: ScoreRecordDef) => {
    const seconds = parseDuration(draft)
    if (seconds == null) return
    const current = state.liftMaxes[record.id]
    setLiftMax(
      timeRecord(
        record.id,
        record.name,
        seconds,
        record.kind === 'run' ? 'run' : 'benchmark',
        current?.notes,
        record.primaryExerciseId ?? current?.sourceExerciseId,
      ),
    )
    resetEditor()
  }

  const saveAmrap = (record: ScoreRecordDef) => {
    const roundCount = Number(rounds)
    const extraCount = extra.trim() === '' ? undefined : Number(extra)
    if (!Number.isFinite(roundCount) || roundCount < 0 || (extraCount != null && (!Number.isFinite(extraCount) || extraCount < 0))) return
    const current = state.liftMaxes[record.id]
    setLiftMax(
      amrapRecord(record.id, record.name, roundCount, extraCount, current?.notes, record.primaryExerciseId ?? current?.sourceExerciseId),
    )
    resetEditor()
  }

  return (
    <div className={cn('space-y-3', className)} data-maxes-panel>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Maxes</h2>
          <p className="mt-1 text-xs text-muted">{hint}</p>
        </div>
        {section === 'strength' ? (
          <Select aria-label="Weight unit" value={unit} className="w-auto px-2 py-1.5 text-sm" onChange={(event) => setWeightUnit(event.target.value === 'lb' ? 'lb' : 'kg')}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </Select>
        ) : null}
      </div>
      <div className="flex gap-1 rounded-xl border border-charcoal-4 bg-charcoal-2 p-1" role="tablist" aria-label="Maxes sections" data-maxes-tabs>
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            data-maxes-tab={item.id}
            className={cn(
              'hit-slop-sm min-h-11 flex-1 rounded-lg px-2 py-2 text-xs font-medium transition',
              section === item.id ? 'bg-charcoal text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
            onClick={() => {
              setSection(item.id)
              setFilter('')
              resetEditor()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <Input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder={section === 'strength' ? 'Filter lifts…' : section === 'run' ? 'Filter distances…' : 'Filter benchmarks…'}
        className="text-sm"
        aria-label="Filter maxes"
      />
      <div className={cn('space-y-2', compact && 'max-h-72 overflow-y-auto')} data-maxes-section={section}>
        {section === 'strength'
          ? lifts.map((family) => {
              const record = state.liftMaxes[family.id]
              const open = editing === family.id
              return (
                <Card
                  key={family.id}
                  data-max-row={family.id}
                  className={cn('border-charcoal-4 bg-charcoal p-3 shadow-none', highlightFamilyId === family.id && 'ring-2 ring-lime/50')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{family.name}</p>
                      <p className="text-[11px] text-muted">
                        {family.members.length > 1 ? `${family.members.length} variations share this max` : 'Single lift family'}
                      </p>
                    </div>
                    {record && record.maxKg > 0 ? (
                      <div className="text-right">
                        <p className="text-sm font-semibold text-ink tabular-nums">{formatWeight(record.maxKg, unit)}</p>
                        {record.estimated ? <Badge>estimated</Badge> : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">Not set</p>
                    )}
                  </div>
                  {open ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        step={unit === 'lb' ? 5 : 2.5}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        className="w-28 px-2 py-1.5 text-center tabular-nums"
                        placeholder={`1RM (${unit})`}
                        aria-label={`${family.name} 1RM`}
                        autoFocus
                      />
                      <Button size="sm" onClick={() => saveStrength(family.id, family.name)}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={resetEditor}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openStrength(family.id)}>
                        {record && record.maxKg > 0 ? 'Edit' : 'Set max'}
                      </Button>
                      {record && record.maxKg > 0 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Clear ${family.name} 1RM`}
                          onClick={() => {
                            if (window.confirm(`Clear 1RM for ${family.name}?`)) deleteLiftMax(family.id)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  )}
                </Card>
              )
            })
          : listed.map((record) => (
              <ScoreRow
                key={record.id}
                record={record}
                stored={state.liftMaxes[record.id]}
                unit={unit}
                open={editing === record.id}
                draft={draft}
                rounds={rounds}
                extra={extra}
                onDraft={setDraft}
                onRounds={setRounds}
                onExtra={setExtra}
                onEdit={() => (record.scoreType === 'amrap' ? openAmrap(record.id) : openTime(record.id))}
                onCancel={resetEditor}
                onSave={() => (record.scoreType === 'amrap' ? saveAmrap(record) : saveTime(record))}
                onClear={() => {
                  if (window.confirm(`Clear record for ${record.name}?`)) deleteLiftMax(record.id)
                }}
              />
            ))}
      </div>
      {orphans.map((record) => (
        <Card key={record.familyId} className="border-charcoal-4 bg-charcoal p-3 shadow-none">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium text-ink">{record.name}</p>
              <p className="text-[11px] text-muted">Custom</p>
            </div>
            <p className="text-sm font-semibold tabular-nums">{formatRecord(record, unit)}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => {
              if (window.confirm(`Clear record for ${record.name}?`)) deleteLiftMax(record.familyId)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
        </Card>
      ))}
      {section === 'strength' ? (
        <>
          <EstimateCalculator unit={unit} />
          <button
            type="button"
            className="-my-2 inline-flex min-h-11 items-center self-start text-left text-[11px] text-muted underline-offset-2 hover:underline"
            aria-expanded={showNotes}
            onClick={() => setShowNotes((open) => !open)}
          >
            {showNotes ? 'Hide mapping notes' : 'How mapping works'}
          </button>
          {showNotes ? <p className="rounded-xl border border-charcoal-4 bg-charcoal-2 p-3 text-[11px] leading-relaxed text-muted">{liftFamilyNote}</p> : null}
        </>
      ) : null}
    </div>
  )
}

function ScoreRow({
  record,
  stored,
  unit,
  open,
  draft,
  rounds,
  extra,
  onDraft,
  onRounds,
  onExtra,
  onEdit,
  onCancel,
  onSave,
  onClear,
}: {
  record: ScoreRecordDef
  stored: LiftMax | undefined
  unit: WeightUnit
  open: boolean
  draft: string
  rounds: string
  extra: string
  onDraft: (value: string) => void
  onRounds: (value: string) => void
  onExtra: (value: string) => void
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
  onClear: () => void
}) {
  const value = formatRecord(stored, unit)
  const amrap = record.scoreType === 'amrap'
  return (
    <Card data-max-row={record.id} className="border-charcoal-4 bg-charcoal p-3 shadow-none">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">{record.name}</p>
          {record.blurb ? <p className="text-[11px] text-muted">{record.blurb}</p> : null}
        </div>
        <p className={cn('shrink-0 text-sm font-semibold tabular-nums', value === 'Not set' ? 'font-normal text-muted' : 'text-ink')}>{value}</p>
      </div>
      {open && amrap ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input type="number" min={0} step={1} value={rounds} onChange={(event) => onRounds(event.target.value)} className="w-20 px-2 py-1.5 text-center tabular-nums" placeholder="Rounds" aria-label={`${record.name} rounds`} autoFocus />
          <span className="text-xs text-muted">+</span>
          <Input type="number" min={0} step={1} value={extra} onChange={(event) => onExtra(event.target.value)} className="w-20 px-2 py-1.5 text-center tabular-nums" placeholder="Reps" aria-label={`${record.name} extra reps`} />
          <Button size="sm" onClick={onSave}>Save</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      ) : open ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input type="text" inputMode="decimal" value={draft} onChange={(event) => onDraft(event.target.value)} className="w-32 px-2 py-1.5 text-center tabular-nums" placeholder="m:ss or ss.s" aria-label={`${record.name} time`} autoFocus />
          <Button size="sm" onClick={onSave}>Save</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <p className="w-full text-[10px] text-muted">e.g. 12.4 · 1:23.5 · 18:32</p>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onEdit}>
            {value === 'Not set' ? (amrap ? 'Set score' : 'Set time') : 'Edit'}
          </Button>
          {value !== 'Not set' ? (
            <Button size="sm" variant="ghost" aria-label={`Clear ${record.name} record`} onClick={onClear}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  )
}

function EstimateCalculator({ unit }: { unit: WeightUnit }) {
  const { state, setLiftMax } = useStore()
  const [familyId, setFamilyId] = useState(liftFamilies[0]?.id ?? 'back_squat')
  const [load, setLoad] = useState('')
  const [reps, setReps] = useState('')
  const loadValue = Number(load)
  const repValue = Number(reps)
  const kg = Number.isFinite(loadValue) ? unitToKg(loadValue, unit) : 0
  const estimate = Number.isFinite(repValue) && repValue > 0 && repValue <= 12 && kg > 0 ? roundToPlate(estimate1rm(kg, repValue), 'kg') : 0
  const family = liftFamilies.find((item) => item.id === familyId)
  const current = state.liftMaxes[familyId]
  if (!family) return null
  return (
    <Card data-estimate-max-offer className="border-charcoal-4 bg-charcoal p-3 text-sm shadow-none">
      <p className="font-medium text-ink">Estimated 1RM</p>
      <p className="mt-1 text-[11px] text-muted">Average of Epley + Brzycki. Will not overwrite an existing max without confirmation.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select aria-label="Lift family" value={familyId} className="w-auto min-w-36 px-2 py-1.5 text-sm" onChange={(event) => setFamilyId(event.target.value)}>
          {liftFamilies.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Input type="number" min={0} step={unit === 'lb' ? 5 : 2.5} value={load} onChange={(event) => setLoad(event.target.value)} className="w-24 px-2 py-1.5 text-center tabular-nums" placeholder={unit} aria-label="Estimate load" />
        <Input type="number" min={1} max={12} step={1} value={reps} onChange={(event) => setReps(event.target.value)} className="w-20 px-2 py-1.5 text-center tabular-nums" placeholder="Reps" aria-label="Estimate reps" />
      </div>
      {estimate > 0 ? (
        <p className="mt-2 text-ink">
          Estimated 1RM from {formatWeight(kg, unit)} × {repValue}: <span className="font-semibold tabular-nums">{formatWeight(estimate, unit)}</span>
        </p>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        disabled={estimate <= 0}
        onClick={() => {
          if (estimate <= 0) return
          if (current && current.maxKg > 0 && !window.confirm(`Replace ${family.name} max (${formatWeight(current.maxKg, unit)}) with estimated ${formatWeight(estimate, unit)}?`)) return
          setLiftMax(estimatedStrengthMax(family.id, family.name, estimate))
        }}
      >
        {current && current.maxKg > 0 ? 'Replace with estimate' : 'Use estimate as max'}
      </Button>
    </Card>
  )
}

export function ExerciseMaxEditor({ exerciseId, exerciseName, className }: { exerciseId: string; exerciseName?: string; className?: string }) {
  const { state, setLiftMax, deleteLiftMax } = useStore()
  const unit = state.weightUnit ?? 'kg'
  const familyId = familyIdForExercise(exerciseId, liftFamilies)
  const name = familyLabel(familyId, liftFamilies) || exerciseName || familyId
  const current = state.liftMaxes[familyId]
  const [draft, setDraft] = useState(() => {
    if (!current?.maxKg) return ''
    const display = unit === 'lb' ? current.maxKg * 2.2046226218 : current.maxKg
    const rounded = Math.round(display * 10) / 10
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  })
  return (
    <div className={cn('space-y-2', className)} data-exercise-max-editor>
      <p className="text-[10px] font-semibold tracking-wider text-muted uppercase">1RM · {name}</p>
      {current && current.maxKg > 0 ? (
        <p className="text-sm text-ink">
          Current: <span className="font-semibold tabular-nums">{formatWeight(current.maxKg, unit)}</span>
          {current.estimated ? ' (estimated)' : ''}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input type="number" min={0} step={unit === 'lb' ? 5 : 2.5} value={draft} onChange={(event) => setDraft(event.target.value)} className="w-28 px-2 py-1.5 text-center tabular-nums" placeholder={unit} aria-label="1RM value" />
        <Button
          size="sm"
          onClick={() => {
            const value = Number(draft)
            if (!Number.isFinite(value) || value <= 0) return
            setLiftMax(strengthMax(familyId, name, value, unit, current?.notes, exerciseId))
          }}
        >
          Save max
        </Button>
        {current && current.maxKg > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => deleteLiftMax(familyId)}>
            Clear
          </Button>
        ) : null}
      </div>
      <ResolvedHint exerciseId={exerciseId} unit={unit} />
    </div>
  )
}

function ResolvedHint({ exerciseId, unit }: { exerciseId: string; unit: WeightUnit }) {
  const { state } = useStore()
  const resolved = resolveFamilyMax(familyIdForExercise(exerciseId, liftFamilies), state.liftMaxes)
  if (!resolved?.viaFallback) return null
  return <p className="text-[11px] text-muted">{resolved.fallbackNote} · working max {formatWeight(resolved.maxKg, unit)}</p>
}

export function EstimateMaxOffer({ exerciseId, exerciseName, loadKg, reps }: { exerciseId: string; exerciseName?: string; loadKg: number; reps: number }) {
  const { state, setLiftMax } = useStore()
  const unit = state.weightUnit ?? 'kg'
  if (loadKg <= 0 || reps <= 0 || reps > 12) return null
  const estimate = roundToPlate(estimate1rm(loadKg, reps), 'kg')
  if (estimate <= 0) return null
  const familyId = familyIdForExercise(exerciseId, liftFamilies)
  const name = familyLabel(familyId, liftFamilies) || exerciseName || familyId
  const current = state.liftMaxes[familyId]
  return (
    <div className="rounded-xl border border-charcoal-4 bg-charcoal p-3 text-sm" data-estimate-max-offer>
      <p className="text-ink">
        Estimated 1RM from {formatWeight(loadKg, unit)} × {reps}: <span className="font-semibold tabular-nums">{formatWeight(estimate, unit)}</span>
      </p>
      <p className="mt-1 text-[11px] text-muted">Average of Epley + Brzycki. Will not overwrite an existing max without confirmation.</p>
      <Button
        size="sm"
        className="mt-2"
        variant="secondary"
        onClick={() => {
          if (current && current.maxKg > 0 && !window.confirm(`Replace ${name} max (${formatWeight(current.maxKg, unit)}) with estimated ${formatWeight(estimate, unit)}?`)) return
          setLiftMax(estimatedStrengthMax(familyId, name, estimate, exerciseId))
        }}
      >
        {current ? 'Replace with estimate' : 'Use estimate as max'}
      </Button>
    </div>
  )
}
