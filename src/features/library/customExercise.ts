import type { Exercise } from '../../types.ts'

export interface CustomExerciseInput {
  id: string
  name: string
  muscle: string
  equipment: string
  notes: string
}

/** Library shape for a user-authored exercise. Returns null when the name is blank. */
export function buildCustomExercise(input: CustomExerciseInput): Exercise | null {
  const name = input.name.trim()
  if (!name) return null
  const notes = input.notes.trim()
  return {
    id: input.id,
    name,
    theme: 'Strength',
    sports: ['General Athletic'],
    muscles: [input.muscle || 'Full Body'],
    equipment: [input.equipment || 'None'],
    description: notes || 'Custom exercise.',
    cues: notes ? [notes] : [],
    source: 'custom',
    defaultSets: 3,
    defaultReps: '8',
    defaultRestSec: 90,
    aliases: [],
    primaryMuscles: [input.muscle || 'Full Body'],
    secondaryMuscles: [],
    movementPattern: 'custom',
    imageUrls: [],
  }
}
