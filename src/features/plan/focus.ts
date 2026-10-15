import type { SetType } from '../../types.ts'

export interface FocusTone {
  id: string
  accent: string
  soft: string
  border: string
  text: string
  pill: string
}

export const FOCUS_OPTIONS = [
  'Speed',
  'Strength',
  'Power',
  'Hypertrophy',
  'Endurance',
  'Mobility',
  'Recovery',
  'Custom focus',
  'Free write',
  'Testing',
] as const

const TONES: Record<string, FocusTone> = {
  Speed: { id: 'Speed', accent: '#6a8f7a', soft: '#eef4ef', border: '#b9d0c0', text: '#3a5c48', pill: 'pill-reps' },
  Strength: { id: 'Strength', accent: '#a56b4e', soft: '#f5ebe4', border: '#d9b5a4', text: '#6e4330', pill: 'pill-amrap' },
  Power: { id: 'Power', accent: '#b07d5c', soft: '#f6eee6', border: '#b8a99a', text: '#6e4a35', pill: 'pill-distance' },
  Hypertrophy: { id: 'Hypertrophy', accent: '#9a6b78', soft: '#f6ecef', border: '#d9c0c8', text: '#5c3f48', pill: 'pill-reps' },
  Endurance: { id: 'Endurance', accent: '#8f6e52', soft: '#f6efe6', border: '#d8c4ae', text: '#5c4634', pill: 'pill-time' },
  Mobility: { id: 'Mobility', accent: '#5f8a6a', soft: '#eaf3ec', border: '#b9d4c0', text: '#2f5f42', pill: 'pill-reps' },
  Recovery: { id: 'Recovery', accent: '#8a7e70', soft: '#f3eee6', border: '#cbb7a6', text: '#5c5348', pill: 'pill-emom' },
  'Free write': { id: 'Free write', accent: '#a8903c', soft: '#faf6e8', border: '#e0d09a', text: '#6e5f28', pill: 'pill-time' },
  Testing: { id: 'Testing', accent: '#8f6e52', soft: '#f6efe6', border: '#d8c4ae', text: '#5c4634', pill: 'pill-amrap' },
}

const SESSION: FocusTone = {
  id: 'Session',
  accent: '#a56b4e',
  soft: '#f5efe6',
  border: '#b8a99a',
  text: '#2a241c',
  pill: 'pill-reps',
}

export function focusColor(focus?: string): FocusTone {
  if (!focus) return SESSION
  return TONES[focus] ?? { ...SESSION, id: focus }
}

const SET_PILLS: Record<SetType, { label: string; className: string }> = {
  reps_load: { label: 'Strength', className: 'pill-reps' },
  time: { label: 'Time', className: 'pill-time' },
  distance: { label: 'Distance', className: 'pill-distance' },
  amrap: { label: 'AMRAP', className: 'pill-amrap' },
  emom: { label: 'EMOM', className: 'pill-emom' },
  each_side: { label: 'Each', className: 'pill-side' },
  per_leg: { label: 'Per', className: 'pill-side' },
  for_time: { label: 'For', className: 'pill-time' },
}

export function setTypePill(setType: string): { label: string; className: string } {
  return SET_PILLS[setType as SetType] ?? { label: 'Set', className: 'pill-reps' }
}
