import type { Program, ProgramShare, SupabaseProfile } from '../../types.ts'
import { createId } from '../../store/id.ts'

export interface ShareView extends ProgramShare {
  from_profile?: SupabaseProfile | null
  to_profile?: SupabaseProfile | null
}

/** Copy a shared snapshot into a new "my program" with fresh ids. */
export function materializeSharedProgram(snapshot: Program, id: (prefix: string) => string = createId): Program {
  const createdAt = new Date().toISOString()
  return {
    ...snapshot,
    id: id('prog'),
    name: snapshot.name,
    isMine: true,
    isTemplate: false,
    createdAt,
    activeInstance: undefined,
    days: (snapshot.days ?? []).map((day) => ({
      ...day,
      id: id('pd'),
      exercises: (day.exercises ?? []).map((exercise) => ({
        ...exercise,
        schemes: exercise.schemes?.map((scheme) => ({ ...scheme, id: id('sch') })),
      })),
    })),
  }
}

export function shareSnapshot(program: Program): Program {
  const { activeInstance: _active, ...rest } = program
  return rest
}
