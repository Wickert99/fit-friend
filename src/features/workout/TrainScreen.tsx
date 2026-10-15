import { useStore } from '../../store/useStore.ts'
import { Button, EmptyState, Page, ScreenHeader } from '../../ui/index.ts'
import { TrainSubNav } from '../../app/TabSubNav.tsx'
import { DayEditor } from './DayEditor.tsx'

export default function TrainScreen() {
  const { nav } = useStore()
  const tab = nav.workoutTab && nav.workoutTab !== 'maxes' ? nav.workoutTab : 'day'
  if (tab === 'day') return <DayEditor />
  return <Placeholder tab={tab} />
}

function Placeholder({ tab }: { tab: 'library' | 'programs' | 'coach' }) {
  const { state, go } = useStore()
  const copy = {
    library: {
      title: 'Library',
      subtitle: 'Exercises & curated program templates',
      emptyTitle: 'Library is ready',
      body: `${state.exercises.length} exercises and ${state.programs.length} program templates are seeded. Search and filters arrive with the library package.`,
    },
    programs: {
      title: 'Programs',
      subtitle: 'Exercises & curated program templates',
      emptyTitle: state.programs.length ? `${state.programs.length} templates` : 'No programs yet',
      body: 'Build a plan on the whiteboard and use Use as program, or create one in Program builder.',
    },
    coach: {
      title: 'Coach',
      subtitle: 'Exercises & curated program templates',
      emptyTitle: 'Smart matches from seeded templates',
      body: 'Goals, season, and experience stay in your profile. Recommend programs is not wired yet.',
    },
  }[tab]
  return (
    <Page>
      <ScreenHeader title={copy.title} subtitle={copy.subtitle} />
      <TrainSubNav value={tab} />
      <EmptyState
        title={copy.emptyTitle}
        body={copy.body}
        action={
          tab === 'programs' ? (
            <Button variant="secondary" onClick={() => go('program-builder')}>
              Program builder
            </Button>
          ) : undefined
        }
      />
    </Page>
  )
}
