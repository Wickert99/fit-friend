import { useState } from 'react'
import { PlanSubNav } from '../../app/TabSubNav.tsx'
import { todayKey } from '../../store/id.ts'
import { useStore } from '../../store/useStore.ts'
import type { Program } from '../../types.ts'
import { Badge, Button, Chip, EmptyState, Page, ScreenHeader, Segmented, Sheet, Stepper } from '../../ui/index.ts'
import { useToast } from '../../ui/Toast.tsx'
import { BodyMap } from './muscles/BodyMap.tsx'
import { generateMusclePlan, type GeneratedProgram, type GeneratedSession, type MuscleGoal } from './muscles/generate.ts'
import { muscleGroups, muscleIds, muscleLabels } from './muscles/labels.ts'

const EQUIPMENT = [
  { id: 'barbell', label: 'Barbell' },
  { id: 'dumbbell', label: 'Dumbbell' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'machine', label: 'Machine' },
  { id: 'cable', label: 'Cable' },
  { id: 'bands', label: 'Bands' },
  { id: 'bodyweight', label: 'Bodyweight' },
]

const MINUTES = [15, 30, 45, 60]

function sessionOf(result: GeneratedSession | GeneratedProgram): GeneratedSession | null {
  if (result.kind === 'session') return result
  return result.sessions[0] ?? null
}

export default function MusclesScreen() {
  const { state, go, createProgram, savePlannedSession } = useStore()
  const toast = useToast()
  const [sex, setSex] = useState<'male' | 'female'>('male')
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [selected, setSelected] = useState<string[]>([])
  const [goal, setGoal] = useState<MuscleGoal>('strength')
  const [minutes, setMinutes] = useState(45)
  const [weeks, setWeeks] = useState(0)
  const [equipment, setEquipment] = useState<string[]>(['barbell', 'dumbbell', 'bodyweight'])
  const [result, setResult] = useState<GeneratedSession | GeneratedProgram | null>(null)

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function toggleGroup(ids: string[]) {
    setSelected((current) => {
      const all = ids.every((id) => current.includes(id))
      if (all) return current.filter((id) => !ids.includes(id))
      return [...new Set([...current, ...ids])]
    })
  }

  function toggleGear(id: string) {
    setEquipment((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function build() {
    const generated = generateMusclePlan({
      muscles: selected,
      goal,
      minutes,
      weeks,
      equipment,
      exercises: state.exercises,
      liftMaxes: state.liftMaxes,
      unit: state.weightUnit,
      seed: Math.floor(Math.random() * 1_000_000_000),
      now: new Date().toISOString(),
    })
    setResult(generated)
  }

  function persistProgram(program: Program): string {
    return createProgram({
      id: program.id,
      name: program.name,
      description: program.description,
      theme: program.theme,
      sports: program.sports,
      weeks: program.weeks,
      days: program.days,
      progression: program.progression,
      createdAt: program.createdAt,
    })
  }

  function saveToday(openFocus: boolean) {
    if (!result) return
    const session = sessionOf(result)
    if (!session) return
    const dateKey = todayKey()
    savePlannedSession({
      id: `plan-${dateKey}`,
      dateKey,
      name: session.name,
      focus: session.focus,
      programId: session.program.id,
      programDayId: session.day.id,
      programName: session.program.name,
      exercises: session.exercises,
    })
    if (openFocus) {
      toast({ tone: 'info', text: 'Saved today’s plan. Focus mode logging is the workout package.' })
      go('workout-mode', { dateKey })
      return
    }
    toast({ tone: 'ok', text: 'Saved to today on this device.' })
  }

  function addToCalendar() {
    if (!result) return
    const program = result.kind === 'session' ? result.program : result.program
    const id = persistProgram(program)
    toast({
      tone: 'info',
      text: `Saved “${program.name}”. Putting it on the calendar is the progress package — use Commit on the program once that lands.`,
    })
    setResult(null)
    go('program-detail', { programId: id })
  }

  return (
    <Page>
      <ScreenHeader title="Muscle map" subtitle="Pick what to train" />
      <PlanSubNav value="muscles" />
      <Segmented
        label="Body map figure"
        value={sex}
        onChange={setSex}
        options={[
          { id: 'male', label: 'Male' },
          { id: 'female', label: 'Female' },
        ]}
      />
      <Segmented
        label="Body map side"
        value={side}
        onChange={setSide}
        options={[
          { id: 'front', label: 'Front' },
          { id: 'back', label: 'Back' },
        ]}
      />
      <BodyMap sex={sex} side={side} selected={selected} onToggle={toggle} />
      <p className="text-xs text-muted">Side delts, hip flexors and abductors: pick from the List.</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(muscleGroups).map(([name, ids]) => (
          <Chip key={name} active={ids.every((id) => selected.includes(id))} onClick={() => toggleGroup(ids)}>
            {name}
          </Chip>
        ))}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">List</p>
        <div className="flex flex-wrap gap-2">
          {muscleIds.map((id) => (
            <Chip key={id} active={selected.includes(id)} onClick={() => toggle(id)}>
              {muscleLabels[id]}
            </Chip>
          ))}
        </div>
      </div>
      <Segmented
        label="Goal"
        value={goal}
        onChange={setGoal}
        options={[
          { id: 'strength', label: 'Strength' },
          { id: 'hypertrophy', label: 'Hypertrophy' },
          { id: 'endurance', label: 'Endurance' },
          { id: 'mobility', label: 'Mobility' },
        ]}
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Session length">
        {MINUTES.map((value) => (
          <Chip key={value} active={minutes === value} onClick={() => setMinutes(value)}>
            {value} min
          </Chip>
        ))}
      </div>
      <Stepper label="Weeks" value={weeks} min={0} max={16} onChange={setWeeks} suffix={weeks === 0 ? 'session' : 'wk'} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Equipment">
        {EQUIPMENT.map((item) => (
          <Chip key={item.id} active={equipment.includes(item.id)} onClick={() => toggleGear(item.id)}>
            {item.label}
          </Chip>
        ))}
      </div>
      <Button className="w-full" onClick={build}>
        Build session
      </Button>
      <p className="text-[11px] leading-relaxed text-muted">
        Body map adapted from react-native-body-highlighter © 2022 ELABBASSI Hicham, MIT. Exercise images from
        free-exercise-db, Unlicense.
      </p>
      {selected.length === 0 ? <EmptyState title="No muscles selected" body="Tap a region or a list chip, then build a session." /> : null}
      <Sheet
        open={result != null}
        onClose={() => setResult(null)}
        title={result?.kind === 'program' ? result.program.name : (result?.name ?? 'Session')}
        subtitle={result ? `${'estimatedMinutes' in result ? result.estimatedMinutes : result.sessions[0]?.estimatedMinutes} min` : undefined}
      >
        {result ? (
          <div className="space-y-3" data-muscle-result="true">
            <p className="text-sm text-ink">{result.rationale}</p>
            {result.warnings.map((warning) => (
              <p key={warning} className="text-xs text-warn-ink">
                {warning}
              </p>
            ))}
            <ul className="space-y-2">
              {(result.kind === 'session' ? result.items : result.sessions.flatMap((session) => session.items)).map((item, index) => (
                <li key={`${item.exerciseId}-${index}`} className="rounded-xl border border-charcoal-4 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{item.name}</p>
                    <Badge>{item.role}</Badge>
                  </div>
                  <p className="text-xs text-muted">{item.rationale}</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => saveToday(false)}>
                Save to plan
              </Button>
              <Button size="sm" variant="secondary" onClick={() => saveToday(true)}>
                Start in Focus
              </Button>
              <Button size="sm" variant="secondary" onClick={addToCalendar}>
                Add to calendar
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </Page>
  )
}
