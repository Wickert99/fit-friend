import type { Exercise, Program } from '../../types.ts'

/** Query shorthand from the recovered exercise search chunk. */
const ABBREVIATIONS: Record<string, string[]> = {
  ohp: ['overhead', 'press', 'shoulder'],
  oh: ['overhead'],
  bb: ['barbell'],
  db: ['dumbbell'],
  kb: ['kettlebell'],
  rdl: ['romanian', 'deadlift'],
  sdl: ['stiff', 'deadlift'],
  bsq: ['back', 'squat'],
  fsq: ['front', 'squat'],
  mil: ['military'],
  military: ['military', 'press', 'shoulder'],
  'shoulder press': ['overhead', 'press'],
  'strict press': ['overhead', 'press'],
  'military press': ['overhead', 'press', 'shoulder'],
}

export const THEMES = ['Strength', 'Power', 'Hypertrophy', 'Endurance', 'Mobility'] as const

export const LIBRARY_SPORTS = [
  'Rugby',
  'AFL',
  'Running',
  'CrossFit',
  'General Athletic',
  'Basketball',
  'Swimming',
  'Cycling',
  'Yoga',
] as const

export const MUSCLES = [
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Core',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Full Body',
  'Hip',
  'Ankle',
] as const

export const EQUIPMENT = [
  'Barbell',
  'Dumbbell',
  'Kettlebell',
  'Bodyweight',
  'Cable',
  'Machine',
  'Band',
  'Medicine Ball',
  'Pull-up Bar',
  'Box',
  'Sled',
  'None',
] as const

export interface ExerciseQuery {
  query: string
  theme: string
  sport: string
  muscle: string
  equipment: string
}

export interface ProgramQuery {
  query: string
  theme: string
  sport: string
}

export function normalizeQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/[&/]/g, ' ')
    .replace(/[^a-z0-9\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Shorthand tokens only. The raw query is checked separately, so "ohp" can hit "overhead press". */
function expansions(query: string): string[] {
  const normalized = normalizeQuery(query)
  if (!normalized) return []
  const extra: string[] = []
  for (const [key, tokens] of Object.entries(ABBREVIATIONS)) {
    if (normalized === key || normalized.includes(key)) extra.push(...tokens)
  }
  return [...new Set(extra)]
}

function haystack(exercise: Exercise): string {
  return normalizeQuery(
    [
      exercise.name,
      exercise.description,
      exercise.theme,
      ...exercise.muscles,
      ...exercise.equipment,
      ...exercise.sports,
      ...(exercise.aliases ?? []),
    ].join(' '),
  )
}

/** True when the query is empty or the exercise matches name, alias, tokens, or shorthand. */
export function exerciseMatches(exercise: Exercise, query: string): boolean {
  const normalized = normalizeQuery(query)
  if (!normalized) return true
  const text = haystack(exercise)
  const aliases = (exercise.aliases ?? []).map(normalizeQuery)
  const name = normalizeQuery(exercise.name)
  if (name.includes(normalized) || normalized.includes(name)) return true
  for (const alias of aliases) {
    if (alias && (alias.includes(normalized) || normalized.includes(alias))) return true
  }
  const tokens = normalized.split(' ').filter(Boolean)
  if (tokens.length > 0 && tokens.every((token) => text.includes(token))) return true
  const expanded = expansions(query)
  if (expanded.length > 0 && expanded.every((token) => text.includes(token))) return true
  const title = normalizeQuery([exercise.name, ...(exercise.aliases ?? [])].join(' '))
  const longTokens = tokens.filter((token) => token.length >= 3)
  return longTokens.length >= 2 && longTokens.filter((token) => title.includes(token)).length >= Math.ceil(longTokens.length * 0.75)
}

/** Higher is a closer name/alias hit. Match-only results score 30. */
export function scoreExercise(exercise: Exercise, query: string): number {
  const normalized = normalizeQuery(query)
  if (!normalized) return 0
  const name = normalizeQuery(exercise.name)
  const aliases = (exercise.aliases ?? []).map(normalizeQuery)
  if (name === normalized) return 100
  if (aliases.some((alias) => alias === normalized)) return 95
  if (name.startsWith(normalized) || aliases.some((alias) => alias.startsWith(normalized))) return 85
  if (name.includes(normalized)) return 75
  if (aliases.some((alias) => alias.includes(normalized) || normalized.includes(alias))) return 70
  const tokens = normalized.split(' ').filter(Boolean)
  const title = normalizeQuery([exercise.name, ...(exercise.aliases ?? [])].join(' '))
  if (tokens.length > 0 && tokens.every((token) => title.includes(token))) return 60
  return exerciseMatches(exercise, query) ? 30 : 0
}

export function filterExercises(exercises: Exercise[], query: ExerciseQuery): Exercise[] {
  const matched = exercises.filter((exercise) => {
    if (query.theme !== 'All' && exercise.theme !== query.theme) return false
    if (query.sport !== 'All' && !exercise.sports.includes(query.sport)) return false
    if (query.muscle !== 'All' && !exercise.muscles.includes(query.muscle)) return false
    if (query.equipment !== 'All' && !exercise.equipment.includes(query.equipment)) return false
    if (query.query.trim() && !exerciseMatches(exercise, query.query)) return false
    return true
  })
  if (!query.query.trim()) return matched
  return [...matched].sort(
    (left, right) => scoreExercise(right, query.query) - scoreExercise(left, query.query) || left.name.localeCompare(right.name),
  )
}

export function filterPrograms(programs: Program[], query: ProgramQuery): Program[] {
  const needle = query.query.trim().toLowerCase()
  return programs
    .filter((program) => {
      if (query.theme !== 'All' && program.theme !== query.theme) return false
      if (query.sport !== 'All' && !program.sports.includes(query.sport)) return false
      if (needle && !`${program.name} ${program.description}`.toLowerCase().includes(needle)) return false
      return true
    })
    .sort((left, right) => {
      if (left.isTemplate === right.isTemplate) return left.name.localeCompare(right.name)
      return left.isTemplate ? -1 : 1
    })
}

export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
