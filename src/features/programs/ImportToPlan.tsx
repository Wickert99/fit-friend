import { useEffect, useState } from 'react'
import type { LiftMax, LoadMode, Program } from '../../types.ts'
import { setLiftMax as writeLiftMax } from '../../store/actions.ts'
import { useStore } from '../../store/useStore.ts'
import {
  estimatedMaxFromSet,
  expandProgramToBoard,
  makeLiftMax,
  maxRepCount,
} from '../../lib/personalize/index.ts'
import { toKg } from '../../lib/personalize/maxes.ts'
import { Button, Input, Sheet } from '../../ui/index.ts'
import { useToast } from '../../ui/Toast.tsx'
import { importDefaults } from './importDefaults.ts'

const MODES: { id: LoadMode; label: string; detail: string }[] = [
  { id: 'find_working', label: 'Find working weights', detail: 'Keeps the % and adds a note to find a weight you can own.' },
  { id: 'estimate', label: 'Estimate from a set', detail: 'A recent set becomes an estimated 1RM (Epley), then % becomes kg.' },
  { id: 'rpe', label: 'Use RPE', detail: 'Main-lift percentages become an RPE and RIR target.' },
  { id: 'resolve', label: 'Resolve % to kg', detail: 'Uses saved maxes. Missing maxes stay as %.' },
  { id: 'enter_maxes', label: 'Enter maxes', detail: 'Type a 1RM for each lift, then resolve the board.' },
]

export function ImportToPlan({ program, open, onClose }: { program: Program | null; open: boolean; onClose: () => void }) {
  const { state, update, go } = useStore()
  const toast = useToast()
  const defaults = program ? importDefaults(program, state.liftMaxes) : null
  const [mode, setMode] = useState<LoadMode>('resolve')
  const [prep, setPrep] = useState(false)
  const [retest, setRetest] = useState(false)
  const [loads, setLoads] = useState<Record<string, string>>({})
  const [reps, setReps] = useState<Record<string, string>>({})
  const [maxes, setMaxes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !program) return
    const next = importDefaults(program, state.liftMaxes)
    setMode(next.mode)
    setPrep(next.prepWeek)
    setRetest(false)
    setLoads({})
    setReps({})
    setMaxes({})
  }, [open, program])

  if (!program || !defaults) return null

  function readMaxes(): LiftMax[] | null {
    const created: LiftMax[] = []
    for (const lift of defaults?.missing ?? []) {
      if (mode === 'enter_maxes') {
        const value = Number(maxes[lift.familyId])
        if (!Number.isFinite(value) || value <= 0) return null
        created.push(
          makeLiftMax({
            familyId: lift.familyId,
            name: lift.familyName,
            maxKg: toKg(value, state.weightUnit),
            sourceExerciseId: lift.exerciseId,
            now: new Date().toISOString(),
          }),
        )
      }
      if (mode === 'estimate') {
        const load = Number(loads[lift.familyId])
        const count = maxRepCount(reps[lift.familyId] ?? '') ?? Number(reps[lift.familyId])
        if (!Number.isFinite(load) || load <= 0 || !Number.isFinite(count) || count <= 0) return null
        created.push(
          makeLiftMax({
            familyId: lift.familyId,
            name: lift.familyName,
            maxKg: estimatedMaxFromSet(load, count, state.weightUnit),
            estimated: true,
            sourceExerciseId: lift.exerciseId,
            notes: `Estimated from ${load} ${state.weightUnit} × ${count}`,
            now: new Date().toISOString(),
          }),
        )
      }
    }
    return created
  }

  function apply() {
    const fresh = mode === 'estimate' || mode === 'enter_maxes' ? readMaxes() : []
    if (!fresh) {
      toast({ tone: 'error', text: 'Enter a load for each lift, or pick another load mode.' })
      return
    }
    const now = new Date().toISOString()
    update((current) => {
      let next = current
      for (const max of fresh) next = writeLiftMax(next, max)
      const board = expandProgramToBoard(program as Program, {
        mode,
        maxes: next.liftMaxes,
        weightUnit: next.weightUnit,
        prepWeek: defaults?.testing ? false : prep,
        retestWeek: retest,
        now,
      })
      return { ...next, planBoards: [...next.planBoards, board], activeBoardId: board.id }
    })
    toast({ tone: 'ok', text: 'Imported onto a new plan board.' })
    onClose()
    go('plan', { planView: 'board' })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Import to Plan" subtitle={program.name}>
      <div className="space-y-3" data-program-import="true">
        {MODES.map((item) => (
          <label key={item.id} className="flex min-h-11 items-start gap-2 rounded-xl border border-charcoal-4 px-3 py-2">
            <input type="radio" name="load-mode" className="mt-1" checked={mode === item.id} onChange={() => setMode(item.id)} />
            <span>
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block text-xs text-muted">{item.detail}</span>
            </span>
          </label>
        ))}
        {defaults.testing ? (
          <p className="text-xs text-muted">Testing programs skip the preparation week.</p>
        ) : (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={prep} onChange={(event) => setPrep(event.target.checked)} />
            Preparation week
          </label>
        )}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={retest} onChange={(event) => setRetest(event.target.checked)} />
          Retest week
        </label>
        {mode === 'estimate' && defaults.missing.length > 0 ? (
          <div className="space-y-2">
            {defaults.missing.map((lift) => (
              <div key={lift.familyId} className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted">
                  {lift.familyName} ({state.weightUnit})
                  <Input
                    aria-label={`${lift.familyName} load`}
                    inputMode="decimal"
                    value={loads[lift.familyId] ?? ''}
                    onChange={(event) => setLoads({ ...loads, [lift.familyId]: event.target.value })}
                  />
                </label>
                <label className="text-xs text-muted">
                  Reps
                  <Input
                    aria-label={`${lift.familyName} reps`}
                    inputMode="numeric"
                    value={reps[lift.familyId] ?? ''}
                    onChange={(event) => setReps({ ...reps, [lift.familyId]: event.target.value })}
                  />
                </label>
              </div>
            ))}
          </div>
        ) : null}
        {mode === 'enter_maxes' && defaults.missing.length > 0 ? (
          <div className="space-y-2">
            {defaults.missing.map((lift) => (
              <label key={lift.familyId} className="block text-xs text-muted">
                {lift.familyName} 1RM ({state.weightUnit})
                <Input
                  aria-label={`${lift.familyName} max`}
                  inputMode="decimal"
                  value={maxes[lift.familyId] ?? ''}
                  onChange={(event) => setMaxes({ ...maxes, [lift.familyId]: event.target.value })}
                />
              </label>
            ))}
          </div>
        ) : null}
        {defaults.missing.length === 0 ? <p className="text-xs text-muted">Saved maxes cover every %1RM lift in this program.</p> : null}
        <Button className="w-full" onClick={apply}>
          Import to board
        </Button>
      </div>
    </Sheet>
  )
}
