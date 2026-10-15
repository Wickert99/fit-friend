import { useStore } from '../../store/useStore.ts'
import { EmptyState } from '../../ui/index.ts'
import { ProgressSubNav } from '../TabSubNav.tsx'
import { FeatureStub } from './stub.tsx'

export default function ProgressScreen() {
  const { state } = useStore()
  return (
    <FeatureStub
      title="Progress"
      subtitle="Cycles, maxes, PRs, and history"
      owner="WP5 · progress"
      note="History, PR detection, and the training-cycles sheet are the progress package."
      subnav={<ProgressSubNav value="log" />}
    >
      <EmptyState
        title={state.prs.length ? `${state.prs.length} PRs saved` : 'No PRs yet'}
        body="Complete workouts with load to unlock PRs."
      />
    </FeatureStub>
  )
}
