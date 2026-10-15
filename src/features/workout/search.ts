import type { Exercise } from '../../types.ts'

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[&/]/g, ' ')
    .replace(/[^a-z0-9\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const EXPANSIONS: Record<string, string[]> = {
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

function tokens(query: string): string[] {
  const text = normalize(query)
  if (!text) return []
  const extra: string[] = []
  for (const [key, words] of Object.entries(EXPANSIONS)) {
    if (text === key || text.includes(key)) extra.push(...words)
  }
  return [...new Set([...text.split(' ').filter(Boolean), ...extra])]
}

function haystack(exercise: Exercise): string {
  return normalize([exercise.name, exercise.description, exercise.theme, ...exercise.muscles, ...exercise.equipment, ...exercise.sports, ...(exercise.aliases ?? [])].join(' '))
}

export function exerciseMatches(exercise: Exercise, query: string): boolean {
  const text = normalize(query)
  if (!text) return true
  const name = normalize(exercise.name)
  const aliases = (exercise.aliases ?? []).map(normalize)
  const blob = haystack(exercise)
  if (name.includes(text) || text.includes(name)) return true
  for (const alias of aliases) if (alias && (alias.includes(text) || text.includes(alias))) return true
  const parts = text.split(' ').filter(Boolean)
  if (parts.length > 0 && parts.every((part) => blob.includes(part))) return true
  const expanded = tokens(query)
  if (expanded.length > 0 && expanded.every((part) => blob.includes(part))) return true
  const identity = normalize([exercise.name, ...(exercise.aliases ?? [])].join(' '))
  const long = parts.filter((part) => part.length >= 3)
  return long.length >= 2 && long.filter((part) => identity.includes(part)).length >= Math.ceil(long.length * 0.75)
}

export function exerciseScore(exercise: Exercise, query: string): number {
  const text = normalize(query)
  if (!text) return 0
  const name = normalize(exercise.name)
  const aliases = (exercise.aliases ?? []).map(normalize)
  if (name === text) return 100
  if (aliases.some((alias) => alias === text)) return 95
  if (name.startsWith(text) || aliases.some((alias) => alias.startsWith(text))) return 85
  if (name.includes(text)) return 75
  if (aliases.some((alias) => alias.includes(text) || text.includes(alias))) return 70
  const parts = text.split(' ').filter(Boolean)
  const identity = normalize([exercise.name, ...(exercise.aliases ?? [])].join(' '))
  if (parts.length && parts.every((part) => identity.includes(part))) return 60
  return exerciseMatches(exercise, query) ? 30 : 0
}

export function searchExercises(exercises: Exercise[], query: string, limit = 40): Exercise[] {
  const ranked = exercises
    .map((exercise) => ({ exercise, score: exerciseScore(exercise, query) }))
    .filter((item) => item.score > 0 || !normalize(query))
  if (!normalize(query)) return exercises.slice(0, limit)
  return ranked.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name)).slice(0, limit).map((item) => item.exercise)
}
