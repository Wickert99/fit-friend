import type {
  LiftMax,
  LoadImportMeta,
  LoadMode,
  PlanBoard,
  PlanDay,
  PlanWeek,
  Prescription,
  Program,
  ProgramDay,
  ProgramProgression,
  SetScheme,
  WeightUnit,
} from '../../types.ts'
import { createId } from '../../store/id.ts'
import { familyById, familyIdForExercise, percentToKg, resolveMax, type ResolvedMax } from './maxes.ts'
import {
  deloadSets,
  enrichPrescription,
  enrichProgram,
  isBodyweight,
  isMainLift,
  progressedPercent,
  rpeFromPercent,
  weekStep,
} from './enrich.ts'
import { inferSetType } from './reps.ts'

export interface MainLiftRef {
  exerciseId: string
  familyId: string
  familyName: string
  percent?: number
  sampleReps?: string
}

export interface ExpandInput {
  mode: LoadMode
  maxes?: Record<string, LiftMax>
  weightUnit?: WeightUnit
  prepWeek?: boolean
  retestWeek?: boolean
  id?: (prefix: string) => string
  now?: string
}

function ids(input: ExpandInput): (prefix: string) => string {
  return input.id ?? createId
}

export function mainLifts(program: Program): MainLiftRef[] {
  const seen = new Set<string>()
  const found: MainLiftRef[] = []
  for (const day of program.days) {
    for (const exercise of day.exercises) {
      if (!isMainLift(exercise.exerciseId)) continue
      const familyId = familyIdForExercise(exercise.exerciseId)
      if (seen.has(familyId)) continue
      seen.add(familyId)
      found.push({
        exerciseId: exercise.exerciseId,
        familyId,
        familyName: familyById(familyId).name,
        sampleReps: exercise.reps || '5',
      })
    }
  }
  return found
}

export function missingMaxes(program: Program, maxes: Record<string, LiftMax> | undefined): MainLiftRef[] {
  const seen = new Set<string>()
  const found: MainLiftRef[] = []
  for (const day of program.days) {
    for (const exercise of day.exercises) {
      const percent =
        exercise.targetPercent1RM ??
        exercise.schemes?.find((scheme) => scheme.targetPercent1RM != null)?.targetPercent1RM
      if (percent == null || percent <= 0 || !isMainLift(exercise.exerciseId) || resolveMax(exercise.exerciseId, maxes)) {
        continue
      }
      const familyId = familyIdForExercise(exercise.exerciseId)
      if (seen.has(familyId)) continue
      seen.add(familyId)
      found.push({
        exerciseId: exercise.exerciseId,
        familyId,
        familyName: familyById(familyId).name,
        percent,
      })
    }
  }
  return found
}

function resolveLoad(
  prescription: Prescription,
  exerciseId: string,
  maxes: Record<string, LiftMax> | undefined,
  unit: WeightUnit,
  mode: LoadMode,
): Prescription {
  const next: Prescription = { ...prescription }
  const percent = next.targetPercent1RM
  if (percent == null || percent <= 0) return next
  if (mode === 'rpe') {
    const effort = rpeFromPercent(percent)
    next.targetRpe = effort.rpe
    next.targetRir = effort.rir
    delete next.targetLoadKg
    return next
  }
  if (mode === 'resolve' || mode === 'estimate') {
    const max = resolveMax(exerciseId, maxes)
    if (max) next.targetLoadKg = percentToKg(percent, max.maxKg, unit)
    else delete next.targetLoadKg
    return next
  }
  delete next.targetLoadKg
  return next
}

function hasPercent(prescription: Prescription): boolean {
  return (
    (prescription.targetPercent1RM != null && prescription.targetPercent1RM > 0) ||
    (prescription.schemes ?? []).some((scheme) => scheme.targetPercent1RM != null && scheme.targetPercent1RM > 0)
  )
}

function deloadCandidate(prescription: Prescription): boolean {
  if (hasPercent(prescription)) return true
  const setType = prescription.setType ?? inferSetType(prescription.reps)
  return (setType === 'reps_load' || setType === 'each_side' || setType === 'per_leg') && (prescription.restSec ?? 0) > 0
}

function joinNotes(current: string | undefined, extra: string | undefined): string | undefined {
  const text = [current, extra].filter(Boolean).join(' · ')
  return text || undefined
}

function expandExercise(
  exercise: Prescription,
  weekIndex: number,
  program: Program,
  maxes: Record<string, LiftMax> | undefined,
  unit: WeightUnit,
  mode: LoadMode,
  id: (prefix: string) => string,
): Prescription {
  let source = exercise
  if (isBodyweight(source.exerciseId) && (source.targetPercent1RM || source.schemes?.some((scheme) => scheme.targetPercent1RM))) {
    source = enrichPrescription(source, program.theme)
  }
  const progression = program.progression
  const deload = !!(progression && weekStep(weekIndex, progression).isDeload && deloadCandidate(source))
  const sets = deload && progression ? deloadSets(source.sets, progression) : source.sets
  let percent = progressedPercent(source.targetPercent1RM, weekIndex, progression, source.reps)
  let schemes = source.schemes?.map((scheme) => {
    const schemePercent = progressedPercent(
      scheme.targetPercent1RM ?? source.targetPercent1RM,
      weekIndex,
      progression,
      scheme.reps || source.reps,
    )
    const schemeSets = deload && progression ? deloadSets(scheme.sets, progression) : scheme.sets
    const resolved = resolveLoad(
      {
        exerciseId: source.exerciseId,
        setType: source.setType,
        sets: schemeSets,
        reps: scheme.reps || source.reps,
        restSec: scheme.restSec ?? source.restSec,
        targetPercent1RM: schemePercent,
        targetLoadKg: scheme.targetLoadKg,
        targetRpe: scheme.targetRpe,
        targetRir: scheme.targetRir,
      },
      source.exerciseId,
      maxes,
      unit,
      mode,
    )
    const next: SetScheme = {
      id: id('sch'),
      sets: schemeSets,
      reps: scheme.reps || source.reps,
      restSec: scheme.restSec,
      targetPercent1RM: resolved.targetPercent1RM,
      targetLoadKg: resolved.targetLoadKg,
      targetRpe: resolved.targetRpe,
      targetRir: resolved.targetRir,
    }
    return next
  })
  let load = source.targetLoadKg
  let rpe = source.targetRpe
  let rir = source.targetRir
  let notes = source.notes
  if (isBodyweight(source.exerciseId) && rir != null && progression && (progression.percentPerWeek ?? 0) > 0) {
    const position = weekStep(weekIndex, progression)
    rir = position.isDeload ? rir + 1 : Math.max(1, rir - Math.floor(position.step / 2))
    if (position.isDeload) notes = joinNotes(notes, 'Deload: easy reps, leave extra in reserve.')
    schemes = schemes?.map((scheme) =>
      scheme.targetRir == null
        ? scheme
        : {
            ...scheme,
            targetRir: position.isDeload
              ? scheme.targetRir + 1
              : Math.max(1, scheme.targetRir - Math.floor(position.step / 2)),
          },
    )
  }
  if (percent != null && percent > 0) {
    const flat = resolveLoad(
      {
        exerciseId: source.exerciseId,
        id: 'flat',
        sets,
        reps: source.reps,
        restSec: source.restSec,
        targetPercent1RM: percent,
        targetLoadKg: load,
        setType: source.setType,
      },
      source.exerciseId,
      maxes,
      unit,
      mode,
    )
    load = flat.targetLoadKg
    rpe = flat.targetRpe ?? rpe
    rir = flat.targetRir ?? rir
    percent = flat.targetPercent1RM
    if (mode === 'find_working' && weekIndex === 0) {
      const effort = rpeFromPercent(percent ?? 0).rpe
      notes = joinNotes(
        notes,
        `Find working weight: build to RPE ${effort} for ${source.reps} reps (Week 1). Keep ${percent}% as guide once established.`,
      )
    } else if (mode === 'rpe') {
      notes = joinNotes(notes, `RPE ${rpe} · RIR ${rir} (from ${percent}% 1RM)`)
    }
  }
  return {
    id: id('pex'),
    exerciseId: source.exerciseId,
    setType: source.setType,
    sets,
    reps: source.reps,
    restSec: source.restSec,
    targetLoadKg: load,
    targetPercent1RM: percent,
    targetRpe: rpe,
    targetRir: rir,
    schemes,
    timeCapSec: source.timeCapSec,
    emomIntervalSec: source.emomIntervalSec,
    rounds: source.rounds,
    distanceM: source.distanceM,
    notes,
    placeholder: notes,
  }
}

function deloadPad(progression: ProgramProgression | undefined, weekIndex: number): string | undefined {
  if (progression && weekStep(weekIndex, progression).isDeload) {
    return `Deload week: main lifts ~${progression.deloadPct ?? 10}% lighter than last week, ~${Math.round((progression.deloadSetFactor ?? 0.6) * 100)}% of working sets. Finish fresh.`
  }
  return undefined
}

function expandDay(
  day: ProgramDay,
  weekIndex: number,
  program: Program,
  maxes: Record<string, LiftMax> | undefined,
  unit: WeightUnit,
  mode: LoadMode,
  id: (prefix: string) => string,
): PlanDay {
  const finding = mode === 'find_working' && weekIndex === 0
  const pad = [
    day.sessionPad,
    finding ? 'Week 1: establish working weights at target RPE before chasing %1RM.' : undefined,
    deloadPad(program.progression, weekIndex),
  ]
    .filter(Boolean)
    .join('\n')
  return {
    id: id('pday'),
    name: finding ? `${day.name} · find working weights` : day.name,
    focus: day.focus ?? program.theme,
    exercises: day.exercises.map((exercise) => expandExercise(exercise, weekIndex, program, maxes, unit, mode, id)),
    sessionPad: pad || day.sessionPad,
    pad: pad || day.sessionPad,
  }
}

function testingLadder(exerciseId: string, kind: 'prep' | 'retest', id: (prefix: string) => string): Prescription {
  const label =
    kind === 'prep'
      ? 'Prep: establish a working 1RM or heavy single. Fully editable — add/remove sets freely.'
      : 'Retest: compare to prep week. Same protocol, adjust attempts as needed.'
  const steps: Array<[string, number, number]> = [
    ['5', 40, 90],
    ['3', 60, 120],
    ['2', 75, 150],
    ['1', 85, 180],
    ['1', 92, 180],
    ['1', 97, 210],
    ['1', 100, 240],
  ]
  return {
    id: id('pex'),
    exerciseId,
    setType: 'reps_load',
    sets: 1,
    reps: '5',
    restSec: 90,
    targetPercent1RM: 40,
    notes: `${label} · Warm-up: 40% × 5`,
    placeholder: `${label} · Warm-up: 40% × 5`,
    schemes: steps.map(([reps, percent, rest]) => ({
      id: id('sch'),
      sets: 1,
      reps,
      restSec: rest,
      targetPercent1RM: percent,
    })),
  }
}

function testingWeek(
  lifts: MainLiftRef[],
  kind: 'prep' | 'retest',
  maxes: Record<string, LiftMax> | undefined,
  unit: WeightUnit,
  mode: LoadMode,
  id: (prefix: string) => string,
): PlanWeek {
  const label = kind === 'prep' ? 'Preparation' : 'Retest'
  const days: PlanDay[] = []
  for (let index = 0; index < lifts.length; index += 2) {
    const pair = lifts.slice(index, index + 2)
    const dayNumber = Math.floor(index / 2) + 1
    const title = pair.map((lift) => lift.familyName).join(' + ')
    const exercises: Prescription[] = [
      {
        id: id('pex'),
        exerciseId: 'ex-catcow',
        setType: 'reps_load',
        sets: 2,
        reps: '10',
        restSec: 0,
        notes: 'Spine warm-up',
        placeholder: 'Spine warm-up',
      },
    ]
    for (const lift of pair) {
      const ladder = testingLadder(lift.exerciseId, kind, id)
      const schemeMode: LoadMode = mode === 'rpe' ? 'find_working' : mode
      const schemes = (ladder.schemes ?? []).map((scheme) =>
        resolveLoad({ ...scheme, id: id('sch'), exerciseId: lift.exerciseId, setType: 'reps_load', restSec: scheme.restSec ?? 0 }, lift.exerciseId, maxes, unit, schemeMode),
      )
      exercises.push({
        ...ladder,
        id: id('pex'),
        schemes,
        targetPercent1RM: schemes[0]?.targetPercent1RM,
        targetLoadKg: schemes[0]?.targetLoadKg,
        notes:
          kind === 'prep'
            ? `${lift.familyName}: warm-up ladder → top single. Attempt rules: full rest (3–5 min) above 90%; stop if bar speed dies or form breaks. Log best single to Maxes. All sets editable.`
            : `${lift.familyName} retest: same ladder. Compare to prep. Update Maxes if improved. Fully editable.`,
        placeholder:
          kind === 'prep'
            ? `${lift.familyName}: warm-up ladder → top single. Attempt rules: full rest (3–5 min) above 90%; stop if bar speed dies or form breaks. Log best single to Maxes. All sets editable.`
            : `${lift.familyName} retest: same ladder. Compare to prep. Update Maxes if improved. Fully editable.`,
      })
    }
    exercises.push({
      id: id('pex'),
      exerciseId: 'ex-plank',
      setType: 'time',
      sets: 2,
      reps: '30s',
      restSec: 45,
      notes: 'Optional core finisher — delete if not needed',
      placeholder: 'Optional core finisher — delete if not needed',
    })
    days.push({
      id: id('pday'),
      name: `${label} day ${dayNumber} — ${title}`,
      focus: kind === 'prep' ? 'Testing' : 'Retest',
      exercises,
      sessionPad:
        kind === 'prep'
          ? 'Preparation week — establish maxes / working weights for this program’s main lifts. Edit, add, or remove any exercise or set on the board.'
          : 'Retest week — optional. Re-test the same lifts after the block. Fully editable.',
    })
  }
  if (days.length === 0) {
    days.push({
      id: id('pday'),
      name: `${label} — open`,
      focus: 'Testing',
      exercises: [],
      sessionPad: 'No main lifts detected — add testing lifts manually on the board.',
    })
  }
  return { id: id('week'), label, days }
}

export function expandProgramToBoard(program: Program, input: ExpandInput): PlanBoard {
  const enriched = enrichProgram(program)
  const id = ids(input)
  const unit = input.weightUnit ?? 'kg'
  const maxes = input.maxes
  const mode = input.mode
  const weeksCount = Math.max(1, enriched.weeks || 1)
  const lifts = mainLifts(enriched)
  const prep = !!input.prepWeek
  const retest = !!input.retestWeek
  const weeks: PlanWeek[] = []
  if (prep && lifts.length > 0) weeks.push(testingWeek(lifts, 'prep', maxes, unit, mode, id))
  for (let weekIndex = 0; weekIndex < weeksCount; weekIndex++) {
    const finding = mode === 'find_working' && !prep && weekIndex === 0
    const deload = weekStep(weekIndex, enriched.progression).isDeload
    weeks.push({
      id: id('week'),
      label: finding ? `Week ${weekIndex + 1} · working weights` : deload ? `Week ${weekIndex + 1} · deload` : `Week ${weekIndex + 1}`,
      days: enriched.days.map((day) => {
        const expanded = expandDay(day, weekIndex, enriched, maxes, unit, mode, id)
        if (finding) expanded.name = `${day.name} · find working weights`
        return expanded
      }),
    })
  }
  if (retest && lifts.length > 0) weeks.push(testingWeek(lifts, 'retest', maxes, unit, mode, id))
  const notes: string[] = []
  if (mode === 'find_working') notes.push('Working-weight / RPE guidance on early sessions; %1RM kept as guide.')
  else if (mode === 'rpe') notes.push('Main lifts as RPE / RIR; % kept as reference.')
  else if (mode === 'resolve' || mode === 'estimate') notes.push('%1RM resolved to kg where maxes exist.')
  else notes.push('Kept %1RM prescriptions; enter maxes to resolve.')
  if (prep) notes.push('Preparation week prepended (this program’s main lifts).')
  if (retest) notes.push('Retest week appended.')
  notes.push('Everything on the board is editable — weeks, lifts, schemes, %, RPE.')
  const loadImport: LoadImportMeta = {
    mode,
    chosenAt: input.now ?? new Date().toISOString(),
    note: notes.join(' '),
    prepWeek: prep,
    retestWeek: retest,
  }
  return {
    id: id('board'),
    name: enriched.name,
    updatedAt: input.now ?? new Date().toISOString(),
    notes: [],
    weeks,
    sourceProgramId: enriched.id,
    loadImport,
  }
}

export function resolvedMaxOrNull(exerciseId: string, maxes: Record<string, LiftMax> | undefined): ResolvedMax | null {
  return resolveMax(exerciseId, maxes)
}
