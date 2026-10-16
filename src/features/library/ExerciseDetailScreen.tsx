import { ArrowLeft, Play } from 'lucide-react'
import { useEffect } from 'react'
import { exerciseIdAliases } from '../../store/aliases.ts'
import { useStore } from '../../store/useStore.ts'
import type { PersonalRecord } from '../../types.ts'
import { Badge, Button, Card, IconButton } from '../../ui/index.ts'
import { EstimateMaxOffer, ExerciseMaxEditor } from '../progress/MaxesPanel.tsx'
import { ExerciseCarousel, ExerciseWatch } from './ExerciseMedia.tsx'
import { SessionConflict } from './SessionConflict.tsx'
import { useQuickStart } from './useQuickStart.ts'

function prLabel(record: PersonalRecord | undefined): string {
  if (!record || typeof record.loadKg !== 'number') return '—'
  return `${record.loadKg} kg × ${record.reps ?? '—'}`
}

export default function ExerciseDetailScreen() {
  const { nav, backToTab, state } = useStore()
  const rawId = nav.exerciseId
  const exerciseId = rawId ? (exerciseIdAliases[rawId] ?? rawId) : undefined
  const exercise = state.exercises.find((item) => item.id === exerciseId)
  const { conflict, dismissConflict, launch } = useQuickStart()

  useEffect(() => {
    if (!rawId || !exerciseId || exerciseId === rawId || !exercise) return
    if (!window.location.hash.startsWith('#/exercise/')) return
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#/exercise/${exerciseId}`)
  }, [rawId, exerciseId, exercise])

  if (!exercise) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-4 pb-nav">
        <h1 className="text-lg font-semibold">Exercise</h1>
        <Card>
          <p>Exercise not found.</p>
          <Button className="mt-3" onClick={backToTab}>
            Back
          </Button>
        </Card>
      </div>
    )
  }

  const record = state.prs.find((item) => item.exerciseId === exercise.id)
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-4 pb-nav">
      <header className="flex items-center gap-3">
        <IconButton label="Back" variant="outline" onClick={backToTab}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <h1 className="text-lg font-semibold">{exercise.name}</h1>
      </header>
      <ExerciseCarousel key={`carousel-${exercise.id}`} exercise={exercise} />
      <ExerciseWatch key={`watch-${exercise.id}`} exercise={exercise} />
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="lime">{exercise.theme}</Badge>
        {exercise.sports.map((sport) => (
          <Badge key={sport}>{sport}</Badge>
        ))}
      </div>
      <Card>
        <p className="text-sm text-muted">{exercise.description}</p>
        <p className="mt-3 text-[11px] tracking-wider text-muted uppercase">Source</p>
        <p className="text-sm text-ink">{exercise.source}</p>
      </Card>
      <Card>
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">Coaching cues</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {exercise.cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted">Muscles</p>
            <p className="mt-1">{exercise.muscles.join(', ')}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Equipment</p>
            <p className="mt-1">{exercise.equipment.join(', ')}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Default</p>
            <p className="mt-1">
              {exercise.defaultSets} × {exercise.defaultReps}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Your PR</p>
            <p className="mt-1 text-lime-dim">{prLabel(record)}</p>
          </div>
        </div>
        <ExerciseMaxEditor className="mt-4" exerciseId={exercise.id} exerciseName={exercise.name} />
        {record && typeof record.loadKg === 'number' && typeof record.reps === 'number' ? (
          <div className="mt-3">
            <EstimateMaxOffer exerciseId={exercise.id} exerciseName={exercise.name} loadKg={record.loadKg} reps={record.reps} />
          </div>
        ) : null}
      </Card>
      <Button
        size="lg"
        className="w-full"
        data-start-exercise="true"
        onClick={() => launch(exercise.name, [exercise.id], 'return')}
      >
        <Play className="h-5 w-5" /> Start as quick workout
      </Button>
      <SessionConflict
        session={conflict?.session ?? null}
        startName={exercise.name}
        onDismiss={dismissConflict}
        onResume={() => {
          if (conflict) launch(conflict.name, conflict.exerciseIds, 'resume')
        }}
        onSaveLater={() => {
          if (conflict) launch(conflict.name, conflict.exerciseIds, 'pause')
        }}
        onDiscard={() => {
          if (conflict) launch(conflict.name, conflict.exerciseIds, 'replace')
        }}
      />
    </div>
  )
}
