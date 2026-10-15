import type { Exercise, LiftMax, Prescription, Program, ProgramDay, SetType, WeightUnit } from '../../../types.ts'
import { isBodyweight, isMainLift, repAwareCap, themeProgression } from '../../../lib/personalize/index.ts'
import { familyIdForExercise, resolveMax } from '../../../lib/personalize/maxes.ts'
import { parseSeconds } from '../../../lib/personalize/reps.ts'
import { muscleLabels } from './labels.ts'

const COMPOUND = new Set(['squat', 'hinge', 'lunge', 'h_push', 'v_push', 'h_pull', 'v_pull', 'olympic', 'plyo', 'carry'])
const SETUP_SEC = 40
const GOAL_LABEL = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  endurance: 'Endurance',
  mobility: 'Mobility',
} as const

const REGION: Record<string, string> = {
  chest: 'upper_push',
  front_delts: 'upper_push',
  side_delts: 'upper_push',
  triceps: 'arms',
  rear_delts: 'upper_pull',
  lats: 'upper_pull',
  mid_back: 'upper_pull',
  upper_traps: 'upper_pull',
  biceps: 'arms',
  forearms: 'arms',
  neck: 'neck',
  abs: 'core',
  obliques: 'core',
  lower_back: 'core',
  hip_flexors: 'hips',
  glutes: 'hips',
  adductors: 'hips',
  abductors: 'hips',
  quads: 'legs',
  hamstrings: 'legs',
  calves: 'legs',
  tibialis: 'legs',
}

const SMALL = new Set([
  'forearms',
  'neck',
  'tibialis',
  'calves',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'abductors',
  'adductors',
  'hip_flexors',
])

const EQUIPMENT: Record<string, string[]> = {
  barbell: ['Barbell'],
  dumbbell: ['Dumbbell'],
  kettlebell: ['Kettlebell'],
  machine: ['Machine', 'Sled', 'Medicine Ball'],
  cable: ['Cable'],
  bands: ['Band'],
  bodyweight: ['Bodyweight', 'Pull-up Bar', 'Box', 'None'],
}

const SKIP = new Set([
  'ex-kb-turkish',
  'ex-kb-windmill',
  'ex-suitcase-carry',
  'ex-hollow-hold',
  'ex-ring-row',
  'ex-lying-leg-curl',
  'ex-leg-ext-m',
  'ex-standing-calf-m',
  'ex-cable-face-pull',
  'ex-arch-hold',
  'ex-straight-arm-pushdown',
  'ex-row-2k-tt',
  'ex-hang-power-clean',
  'ex-bb-shoulder-press',
  'ex-strict-shoulder',
  'ex-military-press',
  'ex-hack-squat-m',
  'ex-db-seal-row',
  'ex-db-row-bench',
  'ex-helms-row',
  'ex-nordic-partner',
  'ex-pistol-assist',
])

const ADVANCED = new Set(
  'ex-muscle-up.ex-ring-muscle-up.ex-hspu.ex-pistol-squat.ex-shrimp-squat.ex-snatch-balance.ex-jerk-balance.ex-depth.ex-depthjump.ex-hurdlehop.ex-oh-lunge.ex-ohsquat.ex-zercher-squat.ex-anderson-squat.ex-jefferson.ex-svend.ex-bradford-press.ex-l-sit.ex-hanging-windshield.ex-wall-walk.ex-hsphold.ex-kroc-row.ex-spoto.ex-pin-press.ex-board-press.ex-deficit-dl.ex-pause-dl.ex-tempo-bsquat.ex-pause-bsquat.ex-box-squat'.split(
    '.',
  ),
)

const CARDIO = [
  { id: 'ex-bikezone2', needs: ['Machine'] },
  { id: 'ex-rower-steady', needs: ['Machine'] },
  { id: 'ex-jumprope', needs: ['None'] },
  { id: 'ex-jumping-jack', needs: ['Bodyweight'] },
]

const WEEKDAYS: Record<number, number[]> = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5] }

export type MuscleGoal = keyof typeof GOAL_LABEL

export interface MusclePlanInput {
  muscles: string[]
  goal: MuscleGoal
  minutes: number
  equipment: string[]
  weeks?: number
  exercises: Exercise[]
  liftMaxes?: Record<string, LiftMax>
  unit?: WeightUnit
  seed?: number
  now?: string
}

export interface GeneratedItem {
  exerciseId: string
  name: string
  role: string
  primary: string[]
  secondary: string[]
  estSec: number
  rationale: string
}

export interface MuscleCoverage {
  primary: number
  secondary: number
}

export interface GeneratedSession {
  kind: 'session'
  name: string
  focus: string
  exercises: Prescription[]
  day: ProgramDay
  program: Program
  items: GeneratedItem[]
  estimatedMinutes: number
  coverage: Record<string, MuscleCoverage>
  rationale: string
  warnings: string[]
}

export interface GeneratedProgram {
  kind: 'program'
  program: Program
  sessions: GeneratedSession[]
  daysPerWeek: number
  weeklyCoverage: Record<string, MuscleCoverage>
  rationale: string
  warnings: string[]
}

interface Tag {
  pattern: string
  primary: string[]
  secondary: string[]
}

interface Candidate {
  ex: Exercise
  tag: Tag
  compound: boolean
  main: boolean
  family: string
}

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function jitter(seed: number, exerciseId: string): number {
  return (hash(`${seed}:${exerciseId}`) % 10000) / 10000
}

function allowedNames(equipment: string[]): Set<string> {
  const names = new Set(['None', 'Bodyweight'])
  for (const key of equipment) for (const name of EQUIPMENT[key] ?? []) names.add(name)
  if (equipment.some((key) => key === 'barbell' || key === 'machine' || key === 'cable')) {
    names.add('Pull-up Bar')
    names.add('Box')
  }
  return names
}

function equipmentOk(exercise: Exercise, allowed: Set<string>): boolean {
  const gear = exercise.equipment
  const bars = gear.filter((item) => item === 'Pull-up Bar' || item === 'Box')
  const other = gear.filter((item) => item !== 'Pull-up Bar' && item !== 'Box' && item !== 'Bodyweight' && item !== 'None')
  if (bars.length && !other.length) return bars.some((item) => allowed.has(item))
  return gear.some((item) => allowed.has(item))
}

function tagOf(exercise: Exercise): Tag {
  if (exercise.primaryMuscles || exercise.secondaryMuscles) {
    return {
      pattern: exercise.movementPattern || 'iso',
      primary: exercise.primaryMuscles ?? [],
      secondary: exercise.secondaryMuscles ?? [],
    }
  }
  return {
    pattern: exercise.theme === 'Mobility' ? 'mob' : exercise.theme === 'Endurance' ? 'cond' : 'iso',
    primary: [],
    secondary: [],
  }
}

function patternFits(goal: MuscleGoal, pattern: string, theme: string): boolean {
  if (pattern === 'test') return false
  if (goal === 'strength') return COMPOUND.has(pattern) ? pattern !== 'olympic' : pattern === 'iso' || pattern === 'core' || pattern === 'carry'
  if (goal === 'hypertrophy') return pattern !== 'olympic' && pattern !== 'plyo' && pattern !== 'cond' && pattern !== 'mob' && pattern !== 'carry'
  if (goal === 'endurance') return pattern !== 'olympic' && pattern !== 'mob'
  return pattern === 'mob' || (pattern === 'core' && theme === 'Mobility')
}

function candidates(input: MusclePlanInput, allowed: Set<string>): Candidate[] {
  const found: Candidate[] = []
  for (const exercise of input.exercises) {
    if (SKIP.has(exercise.id) || ADVANCED.has(exercise.id) || !equipmentOk(exercise, allowed)) continue
    const tag = tagOf(exercise)
    if (!tag.primary.length || !patternFits(input.goal, tag.pattern, exercise.theme)) continue
    if (input.goal === 'endurance' && tag.pattern === 'cond' && /min/i.test(exercise.defaultReps)) continue
    if (input.goal === 'endurance' && tag.pattern === 'plyo' && /\d+\s*m\b|fly/i.test(exercise.defaultReps)) continue
    const family = familyIdForExercise(exercise.id)
    found.push({
      ex: exercise,
      tag,
      compound: COMPOUND.has(tag.pattern),
      main: isMainLift(exercise.id) && !isBodyweight(exercise.id) && !family.startsWith('ex:'),
      family,
    })
  }
  return found.sort((left, right) => (left.ex.id < right.ex.id ? -1 : 1))
}

function perSide(exercise: Exercise): boolean {
  return /\/\s*(side|leg|arm)|each/i.test(exercise.defaultReps)
}

function estimateSeconds(prescription: Prescription, forceSide = false): number {
  const setType = prescription.setType ?? 'reps_load'
  const work =
    setType === 'time'
      ? parseSeconds(prescription.reps, 40) * (prescription.perSide ? 2 : 1)
      : Math.max(...(String(prescription.reps).match(/\d+/g) ?? ['8']).map(Number)) *
          3.2 *
          (setType === 'each_side' || setType === 'per_leg' || forceSide ? 2 : 1) +
        5
  return Math.round(prescription.sets * work + Math.max(0, prescription.sets - 1) * prescription.restSec + SETUP_SEC)
}

function loadFromPercent(
  exerciseId: string,
  percent: number,
  maxes: Record<string, LiftMax> | undefined,
  unit: WeightUnit,
): number | undefined {
  const max = resolveMax(exerciseId, maxes)
  if (!max || max.maxKg <= 0) return undefined
  const step = unit === 'lb' ? 5 * 0.45359237 : 2.5
  const raw = Math.floor(((percent / 100) * max.maxKg) / step) * step
  return raw > 0 ? Math.round(raw * 100) / 100 : undefined
}

function prescribe(
  candidate: Candidate,
  goal: MuscleGoal,
  placed: number,
  input: MusclePlanInput,
  circuit: boolean,
): { pe: Prescription; estSec: number } {
  const exercise = candidate.ex
  const side = perSide(exercise)
  const suffix = side ? (/leg/i.test(exercise.defaultReps) ? '/leg' : '/side') : ''
  const sideType: SetType = side ? (/leg/i.test(exercise.defaultReps) ? 'per_leg' : 'each_side') : 'reps_load'
  const timed =
    /^\d+\s*(-\s*\d+\s*)?s/i.test(exercise.defaultReps) || candidate.tag.pattern === 'mob' || exercise.id === 'ex-wallsit'
  const pe: Prescription = { exerciseId: exercise.id, setType: 'reps_load', sets: 3, reps: '8', restSec: 90 }
  const metres = exercise.defaultReps.match(/^(\d+)\s*m$/i)
  if (metres && (candidate.tag.pattern === 'iso' || candidate.tag.pattern === 'carry')) {
    pe.setType = 'distance'
    pe.reps = `${metres[1]}m`
    pe.distanceM = Number(metres[1])
    pe.sets = goal === 'mobility' ? 2 : 3
    pe.restSec = goal === 'mobility' ? 0 : 45
    return {
      pe,
      estSec: Math.round(pe.sets * (Number(metres[1]) * 0.9 + 10) + (pe.sets - 1) * pe.restSec + SETUP_SEC),
    }
  }
  if (goal === 'mobility') {
    if (timed || /breath/i.test(exercise.defaultReps)) {
      pe.setType = 'time'
      pe.reps = side || /side/i.test(exercise.defaultReps) ? '45s/side' : '45s'
      pe.perSide = /side/.test(pe.reps)
    } else {
      pe.setType = sideType
      pe.reps = `${Math.min(8, Math.max(5, Number.parseInt(exercise.defaultReps, 10) || 6))}`
    }
    pe.sets = 2
    pe.restSec = 0
    pe.notes = 'Easy and controlled: breathe, own the range, no rush.'
  } else if (goal === 'endurance') {
    if (timed || candidate.tag.pattern === 'cond' || candidate.tag.pattern === 'plyo') {
      pe.setType = 'time'
      pe.reps = candidate.tag.pattern === 'core' && timed ? '30s' : '40s'
      if (side && candidate.tag.pattern === 'core') {
        pe.reps += '/side'
        pe.perSide = true
      }
      pe.sets = 3
      pe.restSec = circuit ? 15 : 20
      pe.notes = 'Steady, repeatable effort (RPE 6–7).'
    } else {
      pe.setType = sideType
      pe.reps = `15-20${suffix}`
      pe.sets = placed < 2 ? 3 : 2
      pe.restSec = circuit ? 15 : 30
      pe.notes = 'Light load, smooth reps · RPE 6–7.'
    }
    if (circuit) pe.notes = `Circuit: move to the next exercise, rest after each round. ${pe.notes}`
  } else if (goal === 'strength') {
    if (timed) {
      pe.setType = 'time'
      pe.reps = '30s'
      pe.sets = 3
      pe.restSec = 60
      if (side) {
        pe.reps = '30s/side'
        pe.perSide = true
      }
      pe.notes = 'Strong, braced holds.'
    } else if (candidate.compound) {
      const reps = placed === 0 ? 5 : 6
      pe.setType = sideType
      pe.reps = `${side ? Math.min(reps + 2, 8) : reps}${suffix}`
      pe.sets = placed === 0 && input.minutes >= 30 ? 5 : 4
      pe.restSec = placed === 0 ? 180 : 150
      if (candidate.main && !side) {
        const cap = repAwareCap(pe.reps, themeProgression('Strength')?.maxPercent) ?? 80
        const percent = Math.min(placed === 0 ? 80 : 77.5, cap)
        pe.targetPercent1RM = percent
        const load = loadFromPercent(exercise.id, percent, input.liftMaxes, input.unit ?? 'kg')
        if (load) pe.targetLoadKg = load
        pe.notes = `${percent}% 1RM (cap ${cap}% for ${pe.reps} reps).`
      } else if (isBodyweight(exercise.id)) {
        pe.targetRir = 2
        pe.notes = `Bodyweight @ RIR 2. Add load (belt / vest) once every set hits ${reps + 3} reps.`
      } else {
        pe.targetRpe = 7.5
        pe.notes = 'RPE 7–8: 2–3 reps in reserve.'
      }
    } else {
      pe.setType = sideType
      pe.reps = `8${suffix}`
      pe.sets = 3
      pe.restSec = 90
      pe.targetRpe = 8
      pe.notes = 'RPE 8 accessory.'
    }
  } else if (timed) {
    pe.setType = 'time'
    pe.reps = side ? '40s/side' : '40s'
    pe.perSide = side
    pe.sets = 3
    pe.restSec = 45
    pe.notes = 'Hard but clean holds.'
  } else if (candidate.compound) {
    pe.setType = sideType
    pe.reps = `8-10${suffix}`
    pe.sets = placed === 0 && input.minutes >= 30 ? 4 : 3
    pe.restSec = 120
    pe.targetRir = 2
    pe.notes = 'RIR 2: stop 2 reps short of failure.'
  } else {
    pe.setType = sideType
    pe.reps = `10-12${suffix}`
    pe.sets = 3
    pe.restSec = 75
    pe.targetRir = 1
    pe.notes = 'RIR 1–2, controlled eccentric.'
  }
  if (candidate.tag.primary.includes('neck') && goal !== 'mobility' && pe.setType !== 'time') {
    pe.reps = '12-15'
    pe.restSec = 60
    delete pe.targetRir
    pe.targetRpe = 7
    pe.notes = 'Light load, slow reps, never to failure.'
  }
  if (!pe.perSide) delete pe.perSide
  return { pe, estSec: estimateSeconds(pe, side) }
}

function isUpper(muscle: string): boolean {
  const region = REGION[muscle]
  return region === 'upper_push' || region === 'upper_pull' || region === 'arms' || region === 'neck'
}

function label(muscle: string): string {
  return muscleLabels[muscle] ?? muscle
}

interface Built {
  pe: Prescription
  estSec: number
}

export function generateSession(
  input: MusclePlanInput,
  muscles: string[],
  seed: number,
  extras: { avoid?: Set<string>; boost?: Set<string>; dayName?: string } = {},
): GeneratedSession {
  const goal = input.goal
  const warnings: string[] = []
  const budget = Math.round(Math.min(180, Math.max(5, input.minutes || 30)) * 60)
  const selected = new Set(muscles)
  const allowed = allowedNames(input.equipment ?? [])
  const library = new Map(input.exercises.map((exercise) => [exercise.id, exercise]))
  const pool = candidates(input, allowed)
  for (const muscle of muscles) {
    if (pool.some((candidate) => candidate.tag.primary.includes(muscle))) continue
    if (pool.some((candidate) => candidate.tag.secondary.includes(muscle))) {
      warnings.push(`No ${goal} exercise trains ${label(muscle)} as a primary with this equipment; covered as a secondary only.`)
    } else {
      warnings.push(`Nothing in the library trains ${label(muscle)} for ${goal} with this equipment.`)
    }
  }
  const items: GeneratedItem[] = []
  const exercises: Prescription[] = []
  let used = 0
  const push = (prescription: Prescription, exercise: Exercise, role: string, seconds: number, rationale: string, tag = tagOf(exercise)) => {
    exercises.push(prescription)
    items.push({
      exerciseId: exercise.id,
      name: exercise.name,
      role,
      primary: tag.primary,
      secondary: tag.secondary,
      estSec: seconds,
      rationale,
    })
    used += seconds
  }
  const upperOnly = muscles.length > 0 && muscles.every(isUpper)
  if (goal !== 'mobility' && budget >= 540) {
    const cardioSeconds = Math.round(Math.min(300, Math.max(120, budget * 0.1)) / 30) * 30
    const cardio = CARDIO.find((item) => item.needs.some((need) => allowed.has(need)) && library.has(item.id))
    const cardioExercise = cardio ? library.get(cardio.id) : undefined
    if (cardioExercise) {
      push(
        {
          exerciseId: cardioExercise.id,
          setType: 'time',
          sets: 1,
          reps: `${cardioSeconds}s`,
          restSec: 0,
          notes: 'Warm-up: easy pace, nose breathing.',
        },
        cardioExercise,
        'warmup',
        cardioSeconds + 20,
        `General warm-up, ${Math.round(cardioSeconds / 60)} min to raise temperature.`,
      )
    }
    const drill = library.get(upperOnly ? 'ex-scapca' : 'ex-worldsgreatest')
    if (drill && budget >= 840) {
      push(
        { exerciseId: drill.id, setType: 'each_side', sets: 1, reps: '5', restSec: 0, notes: 'Warm-up drill.' },
        drill,
        'warmup',
        75,
        `Dynamic ${upperOnly ? 'shoulder' : 'hip / T-spine'} prep for the work ahead.`,
      )
    }
  }
  const warmupSeconds = used
  const demand = new Map<string, number>()
  for (const muscle of muscles) demand.set(muscle, (SMALL.has(muscle) ? 1 : 2) + (extras.boost?.has(muscle) ? 2 : 0))
  const patternCount = new Map<string, number>()
  const seenShape = new Set<string>()
  const seenFamily = new Set<string>()
  const picked: Array<{ c: Candidate; rx: Built }> = []
  const circuit = goal === 'endurance' && (budget <= 1500 || muscles.length >= 4)
  const workBudget = budget - warmupSeconds
  let filled = 0
  const score = (candidate: Candidate, index: number) => {
    let value = 0
    let hits = 0
    for (const muscle of candidate.tag.primary) {
      if (selected.has(muscle)) {
        value += 2.2 * Math.max(0.15, demand.get(muscle) ?? 0)
        hits++
      } else value -= muscles.length >= 8 ? 0.15 : 0.6
    }
    for (const muscle of candidate.tag.secondary) {
      if (selected.has(muscle)) value += 0.5 * Math.max(0.1, demand.get(muscle) ?? 0)
    }
    if (hits === 0) return Number.NEGATIVE_INFINITY
    const loaded = goal === 'strength' || goal === 'hypertrophy'
    if (loaded && candidate.compound && index < 3) value += 1.6
    if (
      loaded &&
      !candidate.compound &&
      index < 1 &&
      pool.some((item) => item.compound && item.tag.primary.some((muscle) => selected.has(muscle)))
    ) {
      value -= 1.5
    }
    if (goal === 'strength' && candidate.main) value += 1
    if (candidate.ex.theme === GOAL_LABEL[goal]) value += 0.35
    const seen = patternCount.get(candidate.tag.pattern) ?? 0
    if (seen && candidate.tag.pattern !== 'iso' && candidate.tag.pattern !== 'mob') value -= 2.6 * seen
    if (extras.avoid?.has(candidate.ex.id)) value -= 0.9
    value += 0.6 * jitter(seed, candidate.ex.id)
    return value
  }
  for (let index = 0; index < 14; index++) {
    let best: Candidate | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    let bestRx: Built | null = null
    for (const candidate of pool) {
      if (picked.some((item) => item.c.ex.id === candidate.ex.id)) continue
      const shape = `${candidate.tag.pattern}|${[...candidate.tag.primary].sort().join(',')}`
      if (seenShape.has(shape)) continue
      if (COMPOUND.has(candidate.tag.pattern) && patternCount.has(candidate.tag.pattern)) continue
      if (!candidate.family.startsWith('ex:') && seenFamily.has(candidate.family)) continue
      const value = score(candidate, index)
      if (value <= bestScore) continue
      const built = prescribe(candidate, goal, picked.length, input, circuit)
      while (filled + built.estSec > workBudget * 1.04 && built.pe.sets > 2 && picked.length > 0) {
        built.pe.sets--
        built.estSec = estimateSeconds(built.pe)
      }
      if (filled + built.estSec > workBudget * 1.04 && picked.length > 0) continue
      best = candidate
      bestScore = value
      bestRx = built
    }
    if (!best || !bestRx) break
    picked.push({ c: best, rx: bestRx })
    filled += bestRx.estSec
    patternCount.set(best.tag.pattern, (patternCount.get(best.tag.pattern) ?? 0) + 1)
    seenShape.add(`${best.tag.pattern}|${[...best.tag.primary].sort().join(',')}`)
    if (!best.family.startsWith('ex:')) seenFamily.add(best.family)
    for (const muscle of best.tag.primary) if (demand.has(muscle)) demand.set(muscle, (demand.get(muscle) ?? 0) - 1)
    for (const muscle of best.tag.secondary) if (demand.has(muscle)) demand.set(muscle, (demand.get(muscle) ?? 0) - 0.35)
    if (filled >= workBudget * 0.92 || (filled >= workBudget * 0.85 && muscles.every((muscle) => (demand.get(muscle) ?? 0) <= 0))) {
      break
    }
  }
  if (picked.length === 0) {
    warnings.push('No exercise matched these muscles, goal and equipment. Try adding equipment or another goal.')
  }
  const maxSets = goal === 'strength' ? 5 : goal === 'hypertrophy' ? 4 : goal === 'mobility' ? 3 : 4
  const minSets = goal === 'mobility' ? 1 : 2
  const total = () => warmupSeconds + picked.reduce((sum, item) => sum + item.rx.estSec, 0)
  const bump = (item: { rx: Built }, delta: number) => {
    item.rx.pe.sets += delta
    item.rx.estSec = estimateSeconds(item.rx.pe)
  }
  for (let pass = 0; pass < 40 && total() < budget * 0.95; pass++) {
    const room = picked.filter((item) => item.rx.pe.sets < maxSets)
    if (!room.length) break
    room.sort((left, right) => left.rx.pe.sets - right.rx.pe.sets || right.rx.estSec - left.rx.estSec)
    const target = room[0]
    if (!target) break
    bump(target, 1)
    if (total() > budget * 1.08) {
      bump(target, -1)
      break
    }
  }
  for (let pass = 0; pass < 40 && total() > budget * 1.08; pass++) {
    const room = picked.filter((item) => item.rx.pe.sets > minSets)
    if (!room.length) {
      if (picked.length > 1) {
        picked.pop()
        continue
      }
      break
    }
    room.sort((left, right) => right.rx.pe.sets - left.rx.pe.sets)
    const target = room[0]
    if (target) bump(target, -1)
  }
  if (goal === 'strength' || goal === 'hypertrophy') {
    picked.sort((left, right) => {
      const rank = (item: { c: Candidate }) =>
        item.c.compound ? (item.c.main ? 0 : 1) : item.c.tag.pattern === 'core' ? 3 : 2
      return rank(left) - rank(right)
    })
  } else if (goal === 'endurance') {
    picked.sort((left, right) => Number(right.c.compound) - Number(left.c.compound))
  }
  const lead = picked[0]
  if (
    lead &&
    lead.c.compound &&
    (goal === 'strength' || goal === 'hypertrophy') &&
    (lead.rx.pe.setType ?? 'reps_load') !== 'time' &&
    budget >= 1200
  ) {
    const rampSets = goal === 'strength' ? 3 : 2
    const rampReps = goal === 'strength' ? ['5', '3', '2'] : ['8', '5']
    const rampPercent = goal === 'strength' ? [40, 55, 65] : [40, 50]
    const ramp: Prescription = {
      exerciseId: lead.c.ex.id,
      setType: lead.rx.pe.setType,
      sets: rampSets,
      reps: rampReps[0] ?? '5',
      restSec: 60,
      notes:
        goal === 'strength'
          ? 'Warm-up ramp: light → moderate, 5 / 3 / 2 reps.'
          : 'Warm-up ramp: 2 light sets before the work sets.',
    }
    if ((lead.c.main && lead.rx.pe.targetPercent1RM != null) || (lead.c.main && goal === 'hypertrophy')) {
      ramp.schemes = rampReps.map((reps, index) => ({
        id: `ramp-${index}`,
        sets: 1,
        reps,
        restSec: 60,
        targetPercent1RM: rampPercent[index],
      }))
      ramp.targetPercent1RM = rampPercent[0]
    } else ramp.targetRpe = 5
    const rampSeconds = estimateSeconds(ramp)
    push(ramp, lead.c.ex, 'ramp', rampSeconds, `Specific ramp-up sets for ${lead.c.ex.name} before the work sets.`, lead.c.tag)
    if (total() + rampSeconds > budget * 1.08) {
      const spare = [...picked].reverse().find((item) => item.rx.pe.sets > minSets)
      if (spare) bump(spare, -1)
    }
  }
  picked.forEach((item, index) => {
    const primary = item.c.tag.primary.filter((muscle) => selected.has(muscle)).map(label)
    const secondary = item.c.tag.secondary.filter((muscle) => selected.has(muscle)).map(label)
    const role =
      goal === 'mobility' ? 'mobility' : circuit ? 'circuit' : item.c.compound && index < 3 ? 'main' : 'accessory'
    const kind = item.c.compound
      ? item.c.main && goal === 'strength'
        ? 'main lift'
        : 'compound'
      : item.c.tag.pattern === 'core'
        ? 'core'
        : 'isolation'
    const rationale = `${kind} · primary ${primary.join(', ')}${secondary.length ? ` · also ${secondary.join(', ')}` : ''}`
    push(item.rx.pe, item.c.ex, role, item.rx.estSec, rationale, item.c.tag)
  })
  const coverage: Record<string, MuscleCoverage> = {}
  for (const muscle of muscles) coverage[muscle] = { primary: 0, secondary: 0 }
  for (const item of items) {
    if (item.role === 'warmup' || item.role === 'ramp') continue
    for (const muscle of item.primary) if (coverage[muscle]) coverage[muscle].primary++
    for (const muscle of item.secondary) if (coverage[muscle]) coverage[muscle].secondary++
  }
  for (const muscle of muscles) {
    const row = coverage[muscle]
    if (!row) continue
    if (!row.primary && row.secondary && !warnings.some((warning) => warning.includes(label(muscle)))) {
      warnings.push(`${label(muscle)} only gets secondary work in this session.`)
    }
  }
  for (const muscle of muscles) {
    const row = coverage[muscle]
    if (!row || row.primary || row.secondary) continue
    if (!warnings.some((warning) => warning.includes(label(muscle)))) {
      warnings.push(`${label(muscle)} could not be fitted in ${input.minutes} min.`)
    }
  }
  const muscleName = muscles.length > 4 ? `${muscles.length} muscles` : muscles.map(label).join(' + ')
  const name = extras.dayName ?? `${GOAL_LABEL[goal]}: ${muscleName || 'session'}`
  const seconds = items.reduce((sum, item) => sum + item.estSec, 0)
  const focus = GOAL_LABEL[goal]
  const rationale =
    goal === 'strength'
      ? `Strength: 4–5 × 5–6 on compounds (%1RM on main lifts, else RPE 7–8), 3 × 8 accessories. ${picked.length} exercises for ${muscleName}, compounds first, about ${Math.round(seconds / 60)} of ${input.minutes} min.`
      : goal === 'hypertrophy'
        ? `Hypertrophy: 3–4 × 8–12 at RIR 1–2. ${picked.length} exercises for ${muscleName}, compounds first, about ${Math.round(seconds / 60)} of ${input.minutes} min.`
        : goal === 'endurance'
          ? `${circuit ? 'Endurance circuit: 2–3 rounds, short rest.' : 'Endurance: 2–3 × 15–20 or 40 s timed sets, short rest.'} ${picked.length} exercises for ${muscleName}, compounds first, about ${Math.round(seconds / 60)} of ${input.minutes} min.`
          : `Mobility: unhurried holds and controlled drills, no load. ${picked.length} exercises for ${muscleName}, compounds first, about ${Math.round(seconds / 60)} of ${input.minutes} min.`
  const day: ProgramDay = {
    id: `gen-day-${seed}-${hash(name + muscles.join()).toString(36)}`,
    name,
    weekday: -1,
    focus,
    exercises,
  }
  const program: Program = {
    id: `gen-prog-${input.seed ?? 1}-${hash(day.id).toString(36)}`,
    name,
    description: rationale,
    theme: focus,
    sports: ['General Athletic'],
    weeks: 1,
    days: [day],
    isTemplate: false,
    isMine: true,
    createdAt: input.now ?? new Date().toISOString(),
  }
  return {
    kind: 'session',
    name,
    focus,
    exercises: exercises.map((exercise, index) => ({ ...exercise, id: `gen-pe-${seed}-${index}-${exercise.exerciseId}` })),
    day,
    program,
    items,
    estimatedMinutes: Math.round((seconds / 60) * 10) / 10,
    coverage,
    rationale,
    warnings,
  }
}

function daysPerWeek(count: number, minutes: number, goal: MuscleGoal): number {
  if (goal === 'mobility') return count <= 4 ? 3 : 4
  let days = count <= 3 ? 2 : count <= 7 ? 3 : 4
  if (minutes <= 20 && days < 4) days++
  return days
}

function splitMuscles(muscles: string[]): string[][] {
  const upper = muscles.filter(isUpper)
  const lower = muscles.filter((muscle) => !isUpper(muscle))
  return upper.length >= 2 && lower.length >= 2 ? [upper, lower] : [muscles]
}

function enduranceProgression() {
  return { percentPerWeek: 0, deloadEvery: 4, deloadPct: 0, deloadSetFactor: 0.6 }
}

export function generateMusclePlan(input: MusclePlanInput): GeneratedSession | GeneratedProgram {
  const seed = Number.isFinite(input.seed) ? Number(input.seed) : 1
  const muscles = [...new Set((input.muscles ?? []).filter((muscle) => muscle in muscleLabels || REGION[muscle]))]
  const normalized: MusclePlanInput = { ...input, seed, muscles, equipment: input.equipment ?? [] }
  const weeks = Math.max(0, Math.floor(input.weeks ?? 0))
  if (!muscles.length) {
    const empty = generateSession({ ...normalized, muscles: [] }, [], seed)
    empty.warnings.unshift('No muscles selected.')
    if (!weeks) return empty
  }
  if (!weeks) return generateSession(normalized, muscles, seed)
  const perWeek = daysPerWeek(muscles.length, normalized.minutes, normalized.goal)
  const groups = perWeek >= 3 && muscles.length >= 6 && normalized.minutes <= 45 ? splitMuscles(muscles) : [muscles]
  const weekdays = WEEKDAYS[perWeek] ?? WEEKDAYS[3] ?? [1, 3, 5]
  const sessions: GeneratedSession[] = []
  const avoid = new Set<string>()
  for (let day = 0; day < perWeek; day++) {
    const group = groups[day % groups.length] ?? muscles
    const title = groups.length > 1 ? (group.every(isUpper) ? 'Upper' : 'Lower + core') : 'Full'
    const covered = new Set<string>()
    for (const session of sessions) {
      for (const muscle of group) if (session.coverage[muscle]?.primary) covered.add(muscle)
    }
    const boost = new Set(sessions.length ? group.filter((muscle) => !covered.has(muscle)) : [])
    const session = generateSession(normalized, group, seed * 31 + day, {
      avoid,
      boost,
      dayName: `Day ${'ABCD'[day] ?? day + 1} · ${title}`,
    })
    for (const item of session.items) {
      if (item.role !== 'warmup' && item.role !== 'ramp') avoid.add(item.exerciseId)
    }
    sessions.push(session)
  }
  const focus = GOAL_LABEL[normalized.goal]
  const days: ProgramDay[] = sessions.map((session, index) => ({
    ...session.day,
    id: `gen-pd-${seed}-${index}`,
    weekday: weekdays[index] ?? 1,
  }))
  const muscleName = muscles.length > 4 ? `${muscles.length} muscles` : muscles.map(label).join(' + ')
  const rationale = `${perWeek} days/week (${groups.length > 1 ? 'upper / lower split' : 'each session covers all selected muscles'}), ${weeks} weeks, ${normalized.minutes} min sessions. ${focus === 'Strength' || focus === 'Hypertrophy' ? 'Weekly %1RM progression with rep-aware caps and scheduled deloads (enrichProgram defaults).' : focus === 'Endurance' ? 'Volume held steady, deload every 4th week (sets ×0.6).' : 'No load progression for mobility.'}`
  const program: Program = {
    id: `gen-prog-${seed}-${hash(muscles.join() + normalized.goal + weeks + normalized.minutes + normalized.equipment.join()).toString(36)}`,
    name: `${focus} · ${muscleName} · ${weeks} wk`,
    description: rationale,
    theme: focus,
    sports: ['General Athletic'],
    weeks,
    days,
    isTemplate: false,
    isMine: true,
    createdAt: normalized.now ?? new Date().toISOString(),
    progression: normalized.goal === 'endurance' ? enduranceProgression() : undefined,
  }
  const weekly: Record<string, MuscleCoverage> = {}
  for (const muscle of muscles) weekly[muscle] = { primary: 0, secondary: 0 }
  for (const session of sessions) {
    for (const [muscle, row] of Object.entries(session.coverage)) {
      const bucket = weekly[muscle]
      if (!bucket) continue
      bucket.primary += row.primary
      bucket.secondary += row.secondary
    }
  }
  const warnings = [
    ...new Set(sessions.flatMap((session) => session.warnings).filter((warning) => !/only gets secondary|could not be fitted/.test(warning))),
  ]
  for (const muscle of muscles) {
    const row = weekly[muscle]
    if (!row) continue
    if (!row.primary && row.secondary) warnings.push(`${label(muscle)} only gets secondary work this week.`)
    else if (!row.primary) warnings.push(`${label(muscle)} could not be fitted this week; add minutes or select fewer muscles.`)
  }
  if (weeks < 4 && (focus === 'Strength' || focus === 'Hypertrophy')) {
    warnings.push('Blocks under the deload cadence get no deload week.')
  }
  return { kind: 'program', program, sessions, daysPerWeek: perWeek, weeklyCoverage: weekly, rationale, warnings }
}
