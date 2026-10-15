import { format, parseISO } from 'date-fns'
import { useStore } from '../../store/useStore.ts'
import { Button, EmptyState } from '../../ui/index.ts'
import { FeatureStub } from './stub.tsx'
import { TrainSubNav } from '../TabSubNav.tsx'

const COPY = {
  day: {
    title: 'My day',
    note: 'The day editor, exercise picker, and shared prescription editor are the workout package. Set types, waves, and the leave-without-saving guard plug in here.',
  },
  library: {
    title: 'Library',
    note: 'Exercise and program browse, filters, and custom exercises are the library package.',
  },
  programs: {
    title: 'Programs',
    note: 'Program templates you can view and clone land with the library package. Building one from a board is the plan package.',
  },
  coach: {
    title: 'Coach',
    note: 'Season goals, competition dates, and the rules recommender are the coach package. With no API key it stays rules-only.',
  },
  maxes: {
    title: 'My day',
    note: '',
  },
} as const

export default function TrainScreen() {
  const { nav, go, state } = useStore()
  const tab = nav.workoutTab && nav.workoutTab !== 'maxes' ? nav.workoutTab : 'day'
  const copy = COPY[tab]
  const dateLabel = nav.dateKey ? format(parseISO(nav.dateKey), 'EEE d MMM') : 'Today'
  return (
    <FeatureStub
      title={tab === 'day' ? dateLabel : copy.title}
      subtitle={tab === 'day' ? 'My day' : 'Exercises & curated program templates'}
      owner={tab === 'day' ? 'WP3 · workouts' : 'WP2 · library & coach'}
      note={copy.note}
      subnav={<TrainSubNav value={tab} />}
    >
      {tab === 'day' ? (
        <EmptyState
          title="No workout planned"
          body="Build a session for this day, pull from your plan, or browse the library."
          action={
            <Button variant="secondary" onClick={() => go('workout', { dateKey: nav.dateKey, workoutTab: 'library' })}>
              Library
            </Button>
          }
        />
      ) : null}
      {tab === 'library' ? (
        <EmptyState
          title="Library is ready"
          body={`${state.exercises.length} exercises and ${state.programs.length} program templates are seeded. Search and filters arrive with the library package.`}
        />
      ) : null}
      {tab === 'programs' ? (
        <EmptyState
          title={state.programs.length ? `${state.programs.length} templates` : 'No programs yet'}
          body="Build a plan on the whiteboard and use Use as program, or create one in Program builder."
          action={
            <Button variant="secondary" onClick={() => go('program-builder')}>
              Program builder
            </Button>
          }
        />
      ) : null}
      {tab === 'coach' ? (
        <EmptyState
          title="Smart matches from seeded templates"
          body="Goals, season, and experience stay in your profile. Recommend programs is not wired yet."
        />
      ) : null}
    </FeatureStub>
  )
}
