import { useStore } from '../../store/useStore.ts'
import { Badge, Card } from '../../ui/index.ts'
import { ProgressSubNav } from '../TabSubNav.tsx'
import { FeatureStub } from './stub.tsx'

export default function MaxesScreen() {
  const { state } = useStore()
  const count = Object.keys(state.liftMaxes).length
  return (
    <FeatureStub
      title="Maxes"
      subtitle="Strength, running, and benchmarks"
      owner="WP5 · progress"
      note="Lift families, run trials, benchmark WODs, the unit toggle, and the Epley + Brzycki calculator are the progress package."
      subnav={<ProgressSubNav value="maxes" />}
    >
      <Card>
        <div className="flex flex-wrap gap-2">
          <Badge>Weight unit {state.weightUnit}</Badge>
          <Badge tone={count ? 'lime' : 'neutral'}>{count} maxes</Badge>
        </div>
        <p className="mt-2 text-sm text-muted">Set a max from the panel once it lands. Family fallbacks stay in the lift-family catalog.</p>
      </Card>
    </FeatureStub>
  )
}
