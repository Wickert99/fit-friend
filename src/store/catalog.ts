import benchmarkRecordsJson from '../../data/benchmark-records.json'
import dayFocusOptionsJson from '../../data/day-focus-options.json'
import exercisesExtraJson from '../../data/exercises-extra-subset.json'
import exercisesJson from '../../data/exercises.json'
import goalLabelsJson from '../../data/goal-labels.json'
import initialStateJson from '../../data/initial-state.json'
import liftFamiliesJson from '../../data/lift-families.json'
import liftFamilyNoteJson from '../../data/lift-family-note.json'
import muscleEquipmentJson from '../../data/muscle-equipment-options.json'
import muscleGoalsJson from '../../data/muscle-goals.json'
import muscleGroupsJson from '../../data/muscle-groups.json'
import muscleIdsJson from '../../data/muscle-ids.json'
import muscleLabelsJson from '../../data/muscle-labels.json'
import program1rmJson from '../../data/program-1rm-testing.json'
import programsExtraJson from '../../data/programs-extra-subset.json'
import programsJson from '../../data/programs.json'
import runRecordsJson from '../../data/run-records.json'
import sessionMinutesJson from '../../data/session-minutes-options.json'
import setTypeDescriptionsJson from '../../data/set-type-descriptions.json'
import setTypeLabelsJson from '../../data/set-type-labels.json'
import setTypesJson from '../../data/set-types.json'
import type { Exercise, LiftFamily, Program, ScoreRecordDef, SetType } from '../types.ts'
import { exerciseIdAliases } from './aliases.ts'

/** Bundled catalogs. Import from here so every seed file is part of the app graph. */
export const exercises = exercisesJson as Exercise[]
export const exercisesExtraSubset = exercisesExtraJson as Exercise[]
export const programs = programsJson as Program[]
export const programsExtraSubset = programsExtraJson as Program[]
export const program1rmTesting = program1rmJson as Program
export const initialState = initialStateJson
export const liftFamilies = liftFamiliesJson as LiftFamily[]
export const liftFamilyNote = liftFamilyNoteJson as string
export const runRecords = runRecordsJson as ScoreRecordDef[]
export const benchmarkRecords = benchmarkRecordsJson as ScoreRecordDef[]
export const exerciseAliases = exerciseIdAliases
export const goalLabels = goalLabelsJson as Record<string, string>
export const dayFocusOptions = dayFocusOptionsJson as string[]
export const muscleEquipmentOptions = muscleEquipmentJson as string[]
export const muscleGoals = muscleGoalsJson as string[]
export const muscleGroups = muscleGroupsJson as Record<string, string[]>
export const muscleIds = muscleIdsJson as string[]
export const muscleLabels = muscleLabelsJson as Record<string, string>
export const sessionMinutesOptions = sessionMinutesJson as number[]
export const setTypes = setTypesJson as SetType[]
export const setTypeLabels = setTypeLabelsJson as Record<SetType, string>
export const setTypeDescriptions = setTypeDescriptionsJson as Record<SetType, string>
