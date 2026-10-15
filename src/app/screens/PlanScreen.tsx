import { useStore } from '../../store/useStore.ts'
import { Button, EmptyState } from '../../ui/index.ts'
import { useToast } from '../../ui/Toast.tsx'
import { PlanSubNav } from '../TabSubNav.tsx'
import { FeatureStub } from './stub.tsx'

export default function PlanScreen() {
  const { nav, go, state, createBoard } = useStore()
  const toast = useToast()
  const muscles = nav.planView === 'muscles'
  if (muscles) {
    return (
      <FeatureStub
        title="Muscle map"
        subtitle="Pick what to train"
        owner="WP4 · plans"
        note="The front/back body map, goal and equipment filters, and generated sessions are the plan package."
        subnav={<PlanSubNav value="muscles" />}
      >
        <EmptyState title="No muscles selected" body="Tap a region to build a session once the muscle map is in." />
      </FeatureStub>
    )
  }
  return (
    <FeatureStub
      title="Plan"
      subtitle="Week timeline · colour-coded days"
      owner="WP4 · plans"
      note="Boards, weeks, free-write pads, and Use as program land here. Commit to calendar is the progress package."
      subnav={<PlanSubNav value="plan" />}
    >
      <EmptyState
        title={state.planBoards.length ? `${state.planBoards.length} board${state.planBoards.length === 1 ? '' : 's'} saved` : 'Blank timeline'}
        body="New board, rename, and the import-from-library sheet are not on this shell yet."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                createBoard()
                toast({ tone: 'ok', text: 'Board saved on this device.' })
              }}
            >
              New board
            </Button>
            <Button variant="secondary" onClick={() => go('program-builder')}>
              Program builder
            </Button>
          </div>
        }
      />
    </FeatureStub>
  )
}
