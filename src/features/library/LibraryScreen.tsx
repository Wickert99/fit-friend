import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import goalLabelsJson from '../../../data/goal-labels.json'
import { createId } from '../../store/id.ts'
import { useStore } from '../../store/useStore.ts'
import type { Program } from '../../types.ts'
import { TrainSubNav } from '../../app/TabSubNav.tsx'
import { Badge, Button, Card, Chip, EmptyState, Input, Page, ScreenHeader, SectionLabel, Select, Sheet, useToast } from '../../ui/index.ts'
import CommitToCalendar from '../calendar/CommitToCalendar.tsx'
import { ImportToPlan } from '../programs/ImportToPlan.tsx'
import { buildCustomExercise } from './customExercise.ts'
import { ExerciseThumb } from './ExerciseMedia.tsx'
import {
  countLabel,
  EQUIPMENT,
  filterExercises,
  filterPrograms,
  LIBRARY_SPORTS,
  MUSCLES,
  THEMES,
} from './search.ts'
import { SessionConflict } from './SessionConflict.tsx'
import { useQuickStart } from './useQuickStart.ts'

const adaptationLabels = goalLabelsJson as Record<string, string>

export default function LibraryScreen({ section }: { section: 'exercises' | 'programs' }) {
  const { state, go, cloneProgram, upsertExercise } = useStore()
  const toast = useToast()
  const { conflict, dismissConflict, launch } = useQuickStart()
  const [query, setQuery] = useState('')
  const [theme, setTheme] = useState('All')
  const [sport, setSport] = useState('All')
  const [muscle, setMuscle] = useState('All')
  const [equipment, setEquipment] = useState('All')
  const [selected, setSelected] = useState<string[]>([])
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customMuscle, setCustomMuscle] = useState('Full Body')
  const [customEquipment, setCustomEquipment] = useState('None')
  const [customNotes, setCustomNotes] = useState('')
  const [importProgram, setImportProgram] = useState<Program | null>(null)
  const [commitProgram, setCommitProgram] = useState<Program | null>(null)

  const exercises = useMemo(
    () => filterExercises(state.exercises, { query, theme, sport, muscle, equipment }),
    [state.exercises, query, theme, sport, muscle, equipment],
  )
  const programs = useMemo(
    () => filterPrograms(state.programs, { query, theme, sport }),
    [state.programs, query, theme, sport],
  )

  const toggle = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  const startSelected = (mode: 'return' | 'resume' | 'replace') => {
    const ids = conflict && mode !== 'return' ? conflict.exerciseIds : selected
    const name = `Custom · ${countLabel(ids.length, 'exercise')}`
    const result = launch(name, ids, mode)
    if (result === 'started') setSelected([])
  }

  const saveCustom = () => {
    const exercise = buildCustomExercise({
      id: createId('ex'),
      name: customName,
      muscle: customMuscle,
      equipment: customEquipment,
      notes: customNotes,
    })
    if (!exercise) {
      window.alert('Enter an exercise name.')
      return
    }
    upsertExercise(exercise)
    setSelected((current) => (current.includes(exercise.id) ? current : [...current, exercise.id]))
    setCustomOpen(false)
    setCustomName('')
    setCustomNotes('')
    setCustomMuscle('Full Body')
    setCustomEquipment('None')
    toast({ text: 'Added to your library.', tone: 'ok' })
  }

  return (
    <Page className={section === 'exercises' && selected.length > 0 ? 'pb-above-nav-actions' : undefined}>
      <ScreenHeader
        title={section === 'programs' ? 'Programs' : 'Library'}
        subtitle="Exercises & curated program templates"
      />
      <TrainSubNav value={section === 'programs' ? 'programs' : 'library'} />
      <div className="relative">
        <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-muted" />
        <Input
          className="pl-9"
          placeholder={section === 'exercises' ? 'Search exercises…' : 'Search programs…'}
          aria-label={section === 'exercises' ? 'Search exercises' : 'Search programs'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <SectionLabel>Theme</SectionLabel>
        <div className="h-scroll pb-1">
          <Chip active={theme === 'All'} onClick={() => setTheme('All')}>
            All
          </Chip>
          {THEMES.map((item) => (
            <Chip key={item} active={theme === item} onClick={() => setTheme(item)}>
              {item}
            </Chip>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <SectionLabel>Sport</SectionLabel>
        <div className="h-scroll pb-1">
          <Chip active={sport === 'All'} onClick={() => setSport('All')}>
            All
          </Chip>
          {LIBRARY_SPORTS.map((item) => (
            <Chip key={item} active={sport === item} onClick={() => setSport(item)}>
              {item}
            </Chip>
          ))}
        </div>
      </div>
      {section === 'exercises' ? (
        <>
          <details className="rounded-xl border border-charcoal-4 bg-charcoal-2 px-3">
            <summary className="-mx-3 flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm font-medium text-muted hover:text-ink">
              More filters
            </summary>
            <div className="mt-1 space-y-3 pb-3">
              <div>
                <SectionLabel>Muscle</SectionLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip active={muscle === 'All'} onClick={() => setMuscle('All')}>
                    All
                  </Chip>
                  {MUSCLES.map((item) => (
                    <Chip key={item} active={muscle === item} onClick={() => setMuscle(item)}>
                      {item}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <SectionLabel>Equipment</SectionLabel>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip active={equipment === 'All'} onClick={() => setEquipment('All')}>
                    All
                  </Chip>
                  {EQUIPMENT.map((item) => (
                    <Chip key={item} active={equipment === item} onClick={() => setEquipment(item)}>
                      {item}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </details>
          <p className="text-xs text-muted">{countLabel(exercises.length, 'exercise')}</p>
          <Button variant="secondary" className="w-full" onClick={() => setCustomOpen(true)}>
            <Plus className="h-4 w-4" /> Custom exercise
          </Button>
          <div className="space-y-2">
            {exercises.length === 0 ? (
              <EmptyState
                title={state.exercises.length === 0 ? 'Empty library' : 'No matches'}
                body={
                  state.exercises.length === 0
                    ? 'No exercises yet. Add custom names on the Plan whiteboard, or free-write a day and export as a program.'
                    : 'Try clearing filters or searching a different term.'
                }
                action={
                  state.exercises.length === 0 ? (
                    <Button size="sm" onClick={() => go('plan')}>
                      Open Plan
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              exercises.map((exercise) => {
                const picked = selected.includes(exercise.id)
                return (
                  <Card key={exercise.id} className={picked ? 'border-lime/50' : undefined}>
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 gap-3 text-left"
                        onClick={() => go('exercise-detail', { exerciseId: exercise.id })}
                      >
                        <ExerciseThumb exercise={exercise} name={exercise.name} size={48} />
                        <span className="block min-w-0 flex-1">
                          <span className="flex flex-wrap gap-1.5">
                            <Badge tone="lime">{exercise.theme}</Badge>
                            {exercise.sports.slice(0, 2).map((item) => (
                              <Badge key={item}>{item}</Badge>
                            ))}
                          </span>
                          <span className="mt-2 block font-semibold">{exercise.name}</span>
                          <span className="mt-1 line-clamp-2 block text-xs text-muted">{exercise.description}</span>
                          <span className="mt-2 block text-[11px] text-muted">
                            {exercise.muscles.join(' · ')} · {exercise.defaultSets}×{exercise.defaultReps}
                          </span>
                        </span>
                      </button>
                      <Button
                        size="sm"
                        variant={picked ? 'primary' : 'secondary'}
                        aria-label="Add to quick workout"
                        aria-pressed={picked}
                        onClick={() => toggle(exercise.id)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                )
              })
            )}
          </div>
          {selected.length > 0 ? (
            <div className="bottom-above-nav fixed z-30 mx-auto flex max-w-lg justify-center px-4">
              <Button size="lg" className="w-full shadow-raised" onClick={() => startSelected('return')}>
                Start workout · {selected.length} selected
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {countLabel(programs.length, 'program')}
              {state.programs.length > 0 ? ' · your library' : ' · start from Plan'}
            </p>
            <Button size="sm" variant="secondary" data-open-builder="true" onClick={() => go('program-builder')}>
              <Plus className="h-3.5 w-3.5" /> Build program
            </Button>
          </div>
          <div className="space-y-3">
            {programs.length === 0 ? (
              <EmptyState
                title={state.programs.length === 0 ? 'No programs yet' : 'No programs'}
                body={
                  state.programs.length === 0
                    ? 'Build a plan on the whiteboard and use Use as program, or create one in Program builder.'
                    : 'Try clearing filters, or open Coach for recommendations.'
                }
                action={
                  <Button size="sm" onClick={() => go(state.programs.length === 0 ? 'plan' : 'coach')}>
                    {state.programs.length === 0 ? 'Open Plan' : 'Open Coach'}
                  </Button>
                }
              />
            ) : (
              programs.map((program) => {
                const active = state.activeProgramId === program.id
                return (
                  <Card key={program.id}>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="lime">{program.theme}</Badge>
                      {(program.adaptations ?? []).slice(0, 3).map((item) => (
                        <Badge key={item}>{adaptationLabels[item] ?? item}</Badge>
                      ))}
                      {program.isTemplate ? <Badge tone="steel">Template</Badge> : null}
                      {program.sports.slice(0, 2).map((item) => (
                        <Badge key={item}>{item}</Badge>
                      ))}
                      {active ? <Badge tone="success">Active</Badge> : null}
                    </div>
                    <button
                      type="button"
                      className="mt-2 w-full text-left"
                      onClick={() => go('program-detail', { programId: program.id })}
                    >
                      <p className="font-semibold">{program.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{program.description}</p>
                      <p className="mt-2 text-[11px] text-muted">
                        {program.weeks} weeks · {program.days.length} days
                      </p>
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => go('program-detail', { programId: program.id })}>
                        View
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setCommitProgram(program)}>
                        Commit
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setImportProgram(program)}>
                        Import to Plan
                      </Button>
                      {!program.isMine ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const id = cloneProgram(program.id)
                            if (id) go('program-detail', { programId: id })
                          }}
                        >
                          Clone
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        </>
      )}
      <Sheet open={customOpen} title="New custom exercise" subtitle="Saved on this device" onClose={() => setCustomOpen(false)}>
        <div className="space-y-3" data-custom-exercise="true">
          <Input
            autoFocus
            placeholder="Exercise name"
            aria-label="Custom exercise name"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">Muscle</span>
              <Select value={customMuscle} onChange={(event) => setCustomMuscle(event.target.value)} aria-label="Muscle">
                {MUSCLES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">Equipment</span>
              <Select value={customEquipment} onChange={(event) => setCustomEquipment(event.target.value)} aria-label="Equipment">
                {EQUIPMENT.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <Input
            placeholder="Notes (optional)"
            aria-label="Custom exercise notes"
            value={customNotes}
            onChange={(event) => setCustomNotes(event.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={saveCustom}>
              Save exercise
            </Button>
          </div>
        </div>
      </Sheet>
      <ImportToPlan program={importProgram} open={importProgram != null} onClose={() => setImportProgram(null)} />
      {commitProgram ? (
        <CommitToCalendar source={{ kind: 'program', program: commitProgram }} onClose={() => setCommitProgram(null)} />
      ) : null}
      <SessionConflict
        session={conflict?.session ?? null}
        startName={conflict ? `Custom · ${countLabel(conflict.exerciseIds.length, 'exercise')}` : undefined}
        onDismiss={dismissConflict}
        onResume={() => startSelected('resume')}
        onReplace={() => startSelected('replace')}
      />
    </Page>
  )
}
