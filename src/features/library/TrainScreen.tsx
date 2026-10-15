import { useStore } from '../../store/useStore.ts'
import CoachScreen from '../coach/CoachScreen.tsx'
import { DayEditor } from '../workout/DayEditor.tsx'
import LibraryScreen from './LibraryScreen.tsx'

/** Train tabs: My day, library, programs, and coach. */
export default function TrainScreen() {
  const { nav } = useStore()
  const tab = nav.workoutTab && nav.workoutTab !== 'maxes' ? nav.workoutTab : 'day'
  if (tab === 'coach') return <CoachScreen />
  if (tab === 'library') return <LibraryScreen section="exercises" />
  if (tab === 'programs') return <LibraryScreen section="programs" />
  return <DayEditor />
}
