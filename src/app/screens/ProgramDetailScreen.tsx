import { useStore } from '../../store/useStore.ts'
import { Badge, Button, EmptyState } from '../../ui/index.ts'
import { FeatureStub } from './stub.tsx'

export default function ProgramDetailScreen() {
  const { nav, backToTab, state, setActiveProgram } = useStore()
  const program = state.programs.find((item) => item.id === nav.programId)
  return (
    <FeatureStub
      title={program?.name ?? 'Program'}
      subtitle={program?.audience ? `For: ${program.audience}` : nav.programId}
      owner="WP4 · programs"
      note="Week and day detail, set as active, and clone are partly available from the store. Import, commit, and the share sheet are later packages."
    >
      {program ? (
        <div className="flex flex-wrap gap-2">
          {program.isTemplate ? <Badge>Template</Badge> : null}
          {state.activeProgramId === program.id ? <Badge tone="success">Active</Badge> : null}
          <Badge>{program.weeks} weeks</Badge>
        </div>
      ) : (
        <EmptyState title="Program not found" body="That id isn’t in the library on this device." />
      )}
      <div className="flex flex-wrap gap-2">
        {program ? (
          <Button
            onClick={() => {
              setActiveProgram(program.id)
            }}
          >
            Set as active
          </Button>
        ) : null}
        <Button variant="secondary" onClick={backToTab}>
          Back
        </Button>
      </div>
    </FeatureStub>
  )
}
