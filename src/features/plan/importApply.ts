import type { Exercise, PlanDay, Prescription, Program, ProgramDay } from '../../types.ts'

export type ImportMode = 'exercise' | 'movement' | 'day'

export function isMobilityExercise(exercise: Exercise): boolean {
  return exercise.theme === 'Mobility' || exercise.movementPattern === 'mobility' || exercise.movementPattern === 'mob'
}

export function filterExercises(exercises: Exercise[], mode: 'exercise' | 'movement', query: string): Exercise[] {
  const needle = query.trim().toLowerCase()
  return exercises.filter((exercise) => {
    const mobility = isMobilityExercise(exercise)
    if (mode === 'exercise' && mobility) return false
    if (mode === 'movement' && !mobility) return false
    if (!needle) return true
    const aliases = exercise.aliases ?? []
    return (
      exercise.name.toLowerCase().includes(needle) || aliases.some((alias) => alias.toLowerCase().includes(needle))
    )
  })
}

export interface DayTemplate {
  programId: string
  programName: string
  day: ProgramDay
}

export function filterDayTemplates(programs: Program[], query: string): DayTemplate[] {
  const needle = query.trim().toLowerCase()
  const rows: DayTemplate[] = []
  for (const program of programs) {
    for (const day of program.days) {
      const haystack = `${program.name} ${day.name} ${day.focus}`.toLowerCase()
      if (needle && !haystack.includes(needle)) continue
      rows.push({ programId: program.id, programName: program.name, day })
    }
  }
  return rows
}

export function prescriptionFromExercise(exercise: Exercise | null | undefined): Prescription {
  return {
    exerciseId: exercise?.id ?? '',
    setType: 'reps_load',
    sets: exercise?.defaultSets || 3,
    reps: exercise?.defaultReps || '8',
    restSec: exercise?.defaultRestSec ?? 90,
  }
}

export function importExercises(
  day: PlanDay,
  picked: Exercise[],
  rx: Prescription,
  id: (prefix: string) => string,
): PlanDay {
  return {
    ...day,
    exercises: [
      ...day.exercises,
      ...picked.map((exercise) => ({
        id: id('pex'),
        exerciseId: exercise.id,
        setType: rx.setType,
        sets: rx.sets,
        reps: rx.reps,
        restSec: rx.restSec,
        targetLoadKg: rx.targetLoadKg,
        targetPercent1RM: rx.targetPercent1RM,
        targetRpe: rx.targetRpe,
        targetRir: rx.targetRir,
        notes: rx.notes,
        schemes: rx.schemes,
      })),
    ],
  }
}

/** Whole-day import copies exercises (notes become the placeholder) and fills an empty card's name, focus, and pad. */
export function importWholeDay(day: PlanDay, source: ProgramDay, id: (prefix: string) => string): PlanDay {
  const pad = (day.sessionPad ?? day.pad ?? '').trim()
  const empty = day.exercises.length === 0 && !pad
  const copied: Prescription[] = source.exercises.map((exercise) => ({
    ...exercise,
    id: id('pex'),
    exerciseId: exercise.exerciseId || '',
    placeholder: exercise.placeholder || exercise.notes || undefined,
  }))
  return {
    ...day,
    name: empty ? source.name || day.name : day.name,
    focus: empty ? source.focus || day.focus : day.focus,
    sessionPad: pad ? day.sessionPad : source.sessionPad,
    exercises: [...day.exercises, ...copied],
  }
}
