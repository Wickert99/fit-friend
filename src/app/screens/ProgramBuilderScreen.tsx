import { useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import { Button, Input, TextArea } from '../../ui/index.ts'
import { useToast } from '../../ui/Toast.tsx'
import { FeatureStub } from './stub.tsx'

export default function ProgramBuilderScreen() {
  const { createProgram, backToTab, go } = useStore()
  const toast = useToast()
  const [name, setName] = useState('My Custom Program')
  const [description, setDescription] = useState('Personal training plan built in Fit Friend.')
  return (
    <FeatureStub
      title="Program builder"
      subtitle="Back to Plan"
      owner="WP4 · programs"
      note="Days, weekdays, and the exercise picker are the program builder. Saving a named shell program already works."
    >
      <label className="block text-sm">
        <span className="font-medium">Name</span>
        <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Description</span>
        <TextArea className="mt-1 min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            const id = createProgram({ name: name.trim() || 'My Custom Program', description })
            toast({ tone: 'ok', text: 'Program saved on this device.' })
            go('program-detail', { programId: id })
          }}
        >
          Save program
        </Button>
        <Button variant="secondary" onClick={backToTab}>
          Back to Plan
        </Button>
      </div>
    </FeatureStub>
  )
}
