import { useStore } from '../../store/useStore.ts'
import { Badge, Button, EmptyState } from '../../ui/index.ts'
import { FeatureStub } from './stub.tsx'

export default function WorkoutModeScreen() {
  const { go } = useStore()
  return (
    <FeatureStub
      title="Focus mode"
      subtitle="Workout mode"
      owner="WP3 · workouts"
      note="This route redirects into today’s session once a workout is planned. The redirect is not wired yet."
    >
      <Badge tone="lime">Workout mode is now Focus mode</Badge>
      <EmptyState
        title="Nothing planned today"
        body="Log each set on one screen with voice cues, a rest timer and a summary at the end."
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => go('workout')}>Set up today’s workout</Button>
            <Button variant="secondary" onClick={() => go('today')}>
              Back to Today
            </Button>
          </div>
        }
      />
    </FeatureStub>
  )
}
