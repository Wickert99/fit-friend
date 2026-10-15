import { useStore } from '../../store/useStore.ts'
import { Button, EmptyState } from '../../ui/index.ts'
import { FeatureStub } from './stub.tsx'

export default function SessionScreen() {
  const { nav, backToTab, state } = useStore()
  const session = state.sessions.find((item) => item.id === nav.sessionId)
  return (
    <FeatureStub
      title={session?.name ?? 'Focus mode'}
      subtitle={nav.sessionId ? `Session ${nav.sessionId}` : 'No session id'}
      owner="WP3 · focus mode"
      note="Current set, rest timer, voice cues, wake lock, and the summary are the session package."
    >
      <EmptyState
        title={session ? session.status === 'completed' ? 'Completed' : 'In progress' : 'Session not found'}
        body="Log each set on one screen with voice cues, a rest timer and a summary at the end."
        action={
          <Button variant="secondary" onClick={backToTab}>
            Back to Today
          </Button>
        }
      />
    </FeatureStub>
  )
}
