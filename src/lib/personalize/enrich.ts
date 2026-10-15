import type { Prescription, Program, ProgramProgression, SetScheme, SetType } from '../../types.ts'
import { liftFamilies } from './families.ts'
import { inferSetType, maxRepCount, ordinal, round1 } from './reps.ts'

export const DAY_FOCUSES = ['Speed', 'Strength', 'Power', 'Hypertrophy', 'Endurance', 'Mobility', 'Recovery'] as const

export const ADAPTATION_LABELS: Record<string, string> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  power: 'Power',
  aerobic_capacity: 'Aerobic capacity',
  speed: 'Speed',
  mobility: 'Mobility',
  work_capacity: 'Work capacity',
  injury_resilience: 'Injury resilience',
  skill: 'Skill',
  testing: 'Testing',
  baseline: 'Baseline',
}

const familyMembers = new Set(liftFamilies.flatMap((family) => family.members))

/** In a family, but prescribed by feel rather than %1RM. */
const FEEL_BASED = new Set([
  'ex-split',
  'ex-dbpress',
  'ex-rdbrow',
  'ex-farmer',
  'ex-goblet',
  'ex-lateral',
  'ex-facepull',
  'ex-calf',
  'ex-lunge',
  'ex-stepup',
  'ex-glutebridge',
  'ex-turkish',
  'ex-kbwindmill',
  'ex-kbswing',
  'ex-mbslam',
  'ex-boxjump',
  'ex-nordic',
  'ex-sled',
  'ex-dip',
  'ex-legpress',
])

const BODYWEIGHT = new Set([
  ...liftFamilies.filter((family) => family.id === 'pullup' || family.id === 'chinup').flatMap((family) => family.members),
  'ex-pullup',
  'ex-chinup',
  'ex-dip',
  'ex-push-up',
  'ex-invrow',
  'ex-ringrow',
  'ex-ring-row',
  'ex-muscle-up',
  'ex-ring-muscle-up',
  'ex-ring-pu',
  'ex-trx-pushup',
  'ex-diamond-pu',
  'ex-decline-pu',
  'ex-clapush',
  'ex-pike-pushup',
  'ex-hspu',
  'ex-pistol-squat',
  'ex-shrimp-squat',
  'ex-nordic',
])

export function isBodyweight(exerciseId: string): boolean {
  return BODYWEIGHT.has(exerciseId)
}

export function isMainLift(exerciseId: string): boolean {
  return familyMembers.has(exerciseId) && !FEEL_BASED.has(exerciseId)
}

const HIGH_REP_CAP = 12

export function percentForReps(reps: number): number {
  if (!Number.isFinite(reps) || reps <= 0) return 100
  const estimated = reps === 1 ? 100 : 100 * (1 + Math.min(reps, 12) / 30)
  return 10000 / estimated
}

export function repAwareCap(reps: string | undefined, maxPercent?: number): number | undefined {
  const count = maxRepCount(reps)
  if (count == null) return undefined
  const raw = Math.floor((percentForReps(count) - 4) * 2) / 2
  return Math.min(maxPercent ?? 95, raw)
}

export function themeProgression(theme: string): Required<ProgramProgression> | undefined {
  if (theme === 'Strength') {
    return { percentPerWeek: 2.5, maxPercent: 92.5, deloadEvery: 4, deloadPct: 10, deloadSetFactor: 0.6 }
  }
  if (theme === 'Hypertrophy') {
    return { percentPerWeek: 2, maxPercent: 82.5, deloadEvery: 6, deloadPct: 10, deloadSetFactor: 0.5 }
  }
  if (theme === 'Power') {
    return { percentPerWeek: 1.5, maxPercent: 87.5, deloadEvery: 4, deloadPct: 5, deloadSetFactor: 0.6 }
  }
  return undefined
}

export function weekStep(
  weekIndex: number,
  progression?: ProgramProgression | null,
): { isDeload: boolean; step: number } {
  const every = progression?.deloadEvery ?? 0
  if (!progression || !every || every < 2) return { isDeload: false, step: weekIndex }
  const block = Math.floor(weekIndex / every)
  const isDeload = (weekIndex + 1) % every === 0
  const step = weekIndex - block - (isDeload ? 1 : 0)
  return { isDeload, step: Math.max(0, step) }
}

export function progressedPercent(
  base: number | undefined,
  weekIndex: number,
  progression: ProgramProgression | undefined,
  reps: string | undefined,
): number | undefined {
  if (base == null || base <= 0 || !progression) return base
  const weekly = Math.max(0, progression.percentPerWeek || 0)
  const repMax = maxRepCount(reps)
  let cap = repAwareCap(reps, progression.maxPercent) ?? progression.maxPercent ?? 95
  if (repMax != null && repMax > HIGH_REP_CAP) cap = Math.min(cap, base)
  if (base > cap) {
    cap = repMax == null ? base : Math.min(base, Math.floor((percentForReps(repMax) - 1) * 2) / 2)
  }
  const at = (step: number) => Math.min(cap, round1(base + step * weekly))
  const position = weekStep(weekIndex, progression)
  if (!position.isDeload) return at(position.step)
  const cut = Math.min(50, Math.max(0, progression.deloadPct ?? 10))
  return round1(at(position.step) * (1 - cut / 100))
}

export function deloadSets(sets: number, progression: ProgramProgression): number {
  const factor = progression.deloadSetFactor ?? 0.6
  return Math.max(1, Math.round(sets * Math.min(1, Math.max(0, factor))))
}

function defaultPercent(theme: string, reps: string | undefined): number {
  const count = maxRepCount(reps) ?? 8
  if (theme === 'Power') return count <= 3 ? 80 : count <= 5 ? 75 : 70
  if (theme === 'Hypertrophy') return count <= 6 ? 75 : count <= 10 ? 67 : 62
  if (theme === 'Endurance' || theme === 'Mobility') return count <= 8 ? 65 : 60
  return count <= 3 ? 88 : count <= 5 ? 80 : count <= 8 ? 72 : 65
}

export function rpeFromPercent(percent: number): { rpe: number; rir: number } {
  if (percent >= 92) return { rpe: 9.5, rir: 0 }
  if (percent >= 87) return { rpe: 9, rir: 1 }
  if (percent >= 82) return { rpe: 8.5, rir: 1 }
  if (percent >= 77) return { rpe: 8, rir: 2 }
  if (percent >= 72) return { rpe: 7.5, rir: 2 }
  if (percent >= 67) return { rpe: 7, rir: 3 }
  if (percent >= 62) return { rpe: 6.5, rir: 3 }
  return { rpe: 6, rir: 4 }
}

function bodyweightRir(percent: number | undefined, reps: string | undefined): number {
  if (percent == null || percent <= 0) return 2
  const single = maxRepCount(reps) === 1 ? 0 : 1
  return Math.max(single, rpeFromPercent(percent).rir)
}

function bodyweightNote(reps: string | undefined, rir: number, weighted: boolean): string {
  const ceiling = maxRepCount(reps)
  if (weighted) return `Weighted: pick added load (belt / vest) for ${reps} reps @ target RIR (starts RIR ${rir}).`
  if (ceiling) {
    return `Bodyweight, reps @ target RIR (starts RIR ${rir}). Add load (belt / vest) once every set hits ${ceiling + 3} reps at that RIR.`
  }
  return `Bodyweight, reps @ target RIR (starts RIR ${rir}).`
}

function isLoadType(setType: SetType | undefined): boolean {
  return setType === 'reps_load' || setType === 'each_side' || setType === 'per_leg' || setType == null
}

function joinNotes(current: string | undefined, extra: string): string {
  return [current, extra].filter(Boolean).join(' · ')
}

/** Normalise one prescription the way a template is prepared before it hits a board. */
export function enrichPrescription(prescription: Prescription, theme: string): Prescription {
  const next: Prescription = { ...prescription }
  const loadType = isLoadType(next.setType ?? inferSetType(next.reps))
  const amrap = /^\s*(max|amrap)\b/i.test(next.reps ?? '')
  if (isBodyweight(next.exerciseId) && loadType) {
    const percent =
      next.targetPercent1RM ?? next.schemes?.find((scheme) => scheme.targetPercent1RM)?.targetPercent1RM
    const weighted = /weighted|\+\s*\d+\s*(kg|lb)|vest|belt/i.test(next.notes ?? '')
    delete next.targetPercent1RM
    if (!amrap) {
      const rir =
        next.targetRir ??
        (next.targetRpe == null ? bodyweightRir(percent, next.reps) : Math.max(1, Math.round(10 - next.targetRpe)))
      next.targetRir = rir
      if (!/\bRIR\b|add load/i.test(next.notes ?? '')) {
        next.notes = joinNotes(next.notes, bodyweightNote(next.reps, rir, weighted))
      }
    }
    if (next.schemes?.length) {
      next.schemes = next.schemes.map((scheme) => {
        const copy: SetScheme = { ...scheme }
        const rir = copy.targetRir ?? (amrap ? undefined : bodyweightRir(copy.targetPercent1RM ?? percent, copy.reps))
        delete copy.targetPercent1RM
        if (rir != null) copy.targetRir = rir
        return copy
      })
    }
    return next
  }
  if (isMainLift(next.exerciseId) && loadType && !amrap) {
    if (next.targetPercent1RM == null || next.targetPercent1RM <= 0) {
      next.targetPercent1RM = defaultPercent(theme, next.reps)
    }
    if (next.targetLoadKg != null) delete next.targetLoadKg
    if (next.schemes?.length) {
      next.schemes = next.schemes.map((scheme) => {
        const copy: SetScheme = { ...scheme }
        if (copy.targetPercent1RM == null || copy.targetPercent1RM <= 0) {
          copy.targetPercent1RM = next.targetPercent1RM
        }
        if (copy.targetLoadKg != null) delete copy.targetLoadKg
        return copy
      })
    }
    return next
  }
  if (
    (FEEL_BASED.has(next.exerciseId) || !isMainLift(next.exerciseId)) &&
    loadType &&
    next.targetLoadKg == null &&
    next.targetPercent1RM == null &&
    !/\bRPE\b|\bRIR\b/i.test(next.notes ?? '')
  ) {
    next.notes = joinNotes(next.notes, 'RPE 7–8 · leave 2–3 reps in reserve')
  }
  return next
}

function adaptationsFor(theme: string): string[] {
  switch (theme) {
    case 'Strength':
      return ['strength', 'injury_resilience']
    case 'Hypertrophy':
      return ['hypertrophy', 'work_capacity']
    case 'Power':
      return ['power', 'speed']
    case 'Endurance':
      return ['aerobic_capacity', 'work_capacity']
    case 'Mobility':
      return ['mobility', 'injury_resilience']
    default:
      return ['strength']
  }
}

function audienceFor(theme: string, sports: string[]): string {
  const sport = sports[0] && sports[0] !== 'General Athletic' ? sports[0] : 'general athletic'
  switch (theme) {
    case 'Strength':
      return `Intermediate ${sport} athletes building maximal strength`
    case 'Hypertrophy':
      return `Athletes needing muscle / tissue capacity in ${sport}`
    case 'Power':
      return `${sport} athletes prioritising rate of force development`
    case 'Endurance':
      return `Athletes building aerobic base for ${sport}`
    case 'Mobility':
      return 'Athletes needing movement quality and tissue tolerance'
    default:
      return 'General athletic population'
  }
}

function coachNotesFor(theme: string, progression?: ProgramProgression): string {
  const deload =
    progression?.deloadEvery && progression.deloadEvery >= 2
      ? ` Every ${ordinal(progression.deloadEvery)} week is a deload (lighter, fewer sets).`
      : ''
  const overload =
    progression && progression.percentPerWeek > 0
      ? ` Weekly overload ≈ +${progression.percentPerWeek}% 1RM on main lifts, capped so work sets keep ~1–2 reps in reserve.${deload}`
      : ''
  switch (theme) {
    case 'Strength':
      return `Main lifts prescribed as %1RM. Accessories stay RPE / feel-based.${overload} Rest fully between heavy sets.`
    case 'Hypertrophy':
      return `Moderate %1RM on compounds; accessories by RPE 7–8. Leave 1–3 reps in reserve.${overload}`
    case 'Power':
      return 'Keep bar speed high. Stop sets before velocity dies. %1RM is a ceiling, not a target to grind.'
    case 'Endurance':
      return 'Aerobic sessions by time / zones. Strength pieces stay submaximal.'
    case 'Mobility':
      return 'Quality over load. Use light absolute loads or bodyweight; no need for 1RMs.'
    default:
      return 'Follow prescriptions; adjust to readiness.'
  }
}

export function enrichProgram(program: Program): Program {
  const adaptations = program.adaptations && program.adaptations.length > 0 ? program.adaptations : adaptationsFor(program.theme)
  const testing = adaptations.includes('testing') || adaptations.includes('baseline')
  const defaults = program.theme === 'Strength' || program.theme === 'Hypertrophy' || program.theme === 'Power'
    ? themeProgression(program.theme)
    : undefined
  let progression: ProgramProgression | undefined
  if (program.progression === undefined) progression = testing ? undefined : defaults
  else if (defaults) progression = { ...defaults, ...program.progression }
  else progression = program.progression
  return {
    ...program,
    adaptations,
    audience: program.audience ?? audienceFor(program.theme, program.sports),
    coachNotes: program.coachNotes ?? coachNotesFor(program.theme, progression),
    progression,
    days: program.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((exercise) => enrichPrescription(exercise, program.theme)),
    })),
  }
}

export function programUsesPercent(program: Program): boolean {
  return program.days.some((day) =>
    day.exercises.some(
      (exercise) =>
        (exercise.targetPercent1RM != null && exercise.targetPercent1RM > 0) ||
        (exercise.schemes ?? []).some((scheme) => scheme.targetPercent1RM != null && scheme.targetPercent1RM > 0),
    ),
  )
}

export function wantsPreparation(program: Program): boolean {
  return (
    program.theme === 'Strength' ||
    program.theme === 'Hypertrophy' ||
    program.theme === 'Power' ||
    (program.adaptations ?? []).some((item) => item === 'strength' || item === 'hypertrophy' || item === 'power')
  )
}

export function isTestingProgram(program: Program): boolean {
  return (program.adaptations ?? []).includes('testing') || program.id === 'prog-1rm-testing'
}

export function progressionBlurb(program: Program): string | null {
  const progression = program.progression
  if (!progression || progression.percentPerWeek <= 0) return null
  const cap = progression.maxPercent ? ` · cap ${progression.maxPercent}% (lower for higher reps)` : ' · rep-aware cap'
  const deload =
    progression.deloadEvery && progression.deloadEvery >= 2 && (program.weeks || 1) >= progression.deloadEvery
      ? ` · deload every ${ordinal(progression.deloadEvery)} week`
      : ''
  return `+${progression.percentPerWeek}% 1RM / week on main lifts${cap}${deload}`
}

export function programFitBlurb(
  program: Program,
  hints: { season?: string; missingMaxCount?: number; rationale?: string },
): string | null {
  if (hints.rationale) return hints.rationale
  const notes: string[] = []
  const season = (hints.season ?? '').toLowerCase().replace(/[^a-z]/g, '')
  const theme = program.theme
  if (season === 'preseason' && (theme === 'Power' || theme === 'Strength' || theme === 'Endurance')) notes.push('Fits pre-season')
  else if (season === 'offseason' && (theme === 'Hypertrophy' || theme === 'Strength')) notes.push('Fits off-season')
  else if (season === 'inseason' && (theme === 'Power' || theme === 'Mobility' || theme === 'Endurance')) notes.push('Fits in-season')
  else if (season === 'return' && (theme === 'Mobility' || theme === 'Strength')) notes.push('Fits return / rebuild')
  if (hints.missingMaxCount && hints.missingMaxCount > 0) {
    notes.push(
      `${hints.missingMaxCount} max${hints.missingMaxCount === 1 ? '' : 'es'} missing for personalised loads`,
    )
  }
  if (notes.length) return notes.join(' · ')
  const labels = (program.adaptations ?? []).slice(0, 3).map((item) => ADAPTATION_LABELS[item] ?? item)
  return labels.length ? labels.join(' · ') : null
}
