import { FeatureStub } from './stub.tsx'
import { PlanSubNav } from '../TabSubNav.tsx'
import { EmptyState } from '../../ui/index.ts'

export default function CalendarScreen() {
  return (
    <FeatureStub
      title="Calendar"
      subtitle="Scheduled and logged days"
      owner="WP5 · calendar"
      note="The month grid, day sheet, and commit mapping are the calendar package. Clearing a day will go through the store."
      subnav={<PlanSubNav value="calendar" />}
    >
      <EmptyState title="Nothing planned" body="Create a workout for this day, or commit a plan or program once the calendar is in." />
    </FeatureStub>
  )
}
