export const GOAL_OPTIONS = [
  { id: 'strength', label: 'Strength' },
  { id: 'power', label: 'Power / explosiveness' },
  { id: 'hypertrophy', label: 'Muscle / hypertrophy' },
  { id: 'endurance', label: 'Aerobic capacity' },
  { id: 'mobility', label: 'Mobility / movement quality' },
  { id: 'speed', label: 'Sprint / speed' },
  { id: 'rehab', label: 'Return-to-play support' },
  { id: 'body_control', label: 'Core / body control (Pilates-style)' },
] as const

export const SEASON_OPTIONS = [
  { id: 'offseason', label: 'Off-season' },
  { id: 'preseason', label: 'Pre-season' },
  { id: 'inseason', label: 'In-season' },
  { id: 'return', label: 'Return / rebuild' },
] as const

export const EXPERIENCE_OPTIONS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
] as const

export const COACH_SPORTS = [
  'Rugby',
  'AFL',
  'Running',
  'CrossFit',
  'General Athletic',
  'Basketball',
  'Swimming',
  'Cycling',
  'Yoga',
  'Other',
] as const

export type GoalId = (typeof GOAL_OPTIONS)[number]['id']
export type SeasonId = (typeof SEASON_OPTIONS)[number]['id']
export type ExperienceId = (typeof EXPERIENCE_OPTIONS)[number]['id']

export interface CoachProfile {
  goals: string[]
  sport: string
  season: SeasonId
  experience: ExperienceId
  competitionDate?: string
}

export function goalLabel(id: string): string {
  return GOAL_OPTIONS.find((goal) => goal.id === id)?.label ?? id
}

export function isSeasonId(value: string | undefined): value is SeasonId {
  return SEASON_OPTIONS.some((season) => season.id === value)
}

export function isExperienceId(value: string | undefined): value is ExperienceId {
  return EXPERIENCE_OPTIONS.some((level) => level.id === value)
}
