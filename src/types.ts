/**
 * Shared Fit Friend models. Field names follow the recovered bundles and seed JSON.
 * The spec's inferred aliases (percent1RM, rir, waves, done) are optional mirrors;
 * persisted data uses targetPercent1RM, targetRir, schemes, and completed.
 */

export const SET_TYPES = [
  'reps_load',
  'time',
  'distance',
  'amrap',
  'emom',
  'each_side',
  'per_leg',
  'for_time',
] as const

export type SetType = (typeof SET_TYPES)[number]

export type WeightUnit = 'kg' | 'lb'

export type ThemeName = 'Strength' | 'Power' | 'Hypertrophy' | 'Endurance' | 'Mobility' | (string & {})

export type DayFocus =
  | 'Speed'
  | 'Strength'
  | 'Power'
  | 'Hypertrophy'
  | 'Endurance'
  | 'Mobility'
  | 'Recovery'
  | 'Custom focus'
  | 'Free write'
  | 'Testing'
  | (string & {})

export interface Profile {
  id: string
  name: string
  handle: string
  avatarColor: string
  bio: string
  streak: number
  isYou: boolean
}

export interface Friend {
  id: string
  name: string
  handle: string
  avatarColor: string
  bio?: string
  isYou?: boolean
}

export interface Exercise {
  id: string
  name: string
  theme: string
  sports: string[]
  muscles: string[]
  equipment: string[]
  description: string
  cues: string[]
  source: string
  defaultSets: number
  defaultReps: string
  defaultRestSec: number
  aliases: string[]
  primaryMuscles: string[]
  secondaryMuscles: string[]
  movementPattern: string
  imageUrls: string[]
  videoUrl?: string
  youtubeId?: string
  imageCredit?: string
}

/** One wave / scheme inside a prescription. Seed JSON calls these `schemes`. */
export interface SetScheme {
  id?: string
  sets: number
  reps: string
  restSec?: number
  targetLoadKg?: number
  targetPercent1RM?: number
  percent1RM?: number
  targetRpe?: number
  targetRir?: number
  rir?: number
  notes?: string
}

/**
 * Prescription shared by program days, plan-board days, and planned sessions.
 * `reps` is a string ("8", "8/side", "45s", "500m").
 */
export interface Prescription {
  /** Row id on a planned day. Program templates often omit it. */
  id?: string
  exerciseId: string
  setType: SetType
  sets: number
  reps: string
  restSec: number
  targetLoadKg?: number
  /** Canonical percent field used in seed JSON. */
  targetPercent1RM?: number
  /** Spec alias of targetPercent1RM. */
  percent1RM?: number
  targetRpe?: number
  targetRir?: number
  /** Spec alias of targetRir. */
  rir?: number
  timeCapSec?: number
  distanceM?: number
  durationSec?: number
  rounds?: number
  intervalSec?: number
  emomIntervalSec?: number
  notes?: string
  /** Board custom-exercise name, or the note text written by template expansion. */
  placeholder?: string
  perSide?: boolean
  /** Spec name for multiple set schemes. Seed JSON stores these on `schemes`. */
  waves?: SetScheme[]
  schemes?: SetScheme[]
}

export interface ProgramDay {
  id: string
  name: string
  /** 0 = Sunday … 6 = Saturday. Omitted on flexible days. */
  weekday?: number
  focus: string
  sessionPad?: string
  exercises: Prescription[]
}

export interface ProgramProgression {
  percentPerWeek: number
  deloadEvery: number
  /** Rep-aware ceiling applied when a template expands onto a board. */
  maxPercent?: number
  deloadPct?: number
  deloadSetFactor?: number
}

export type LoadMode = 'find_working' | 'rpe' | 'estimate' | 'resolve' | 'enter_maxes'

export interface LoadImportMeta {
  mode: LoadMode
  chosenAt: string
  note: string
  prepWeek: boolean
  retestWeek: boolean
}

export interface ProgramInstance {
  id: string
  programId: string
  startKey: string
  firstSessionKey: string
  lastSessionKey: string
  weeks: number
  committedAt: string
  source: string
  boardId?: string
}

export interface Program {
  id: string
  name: string
  description: string
  theme: string
  sports: string[]
  weeks: number
  isTemplate: boolean
  isMine: boolean
  createdAt: string
  audience?: string
  coachNotes?: string
  adaptations?: string[]
  progression?: ProgramProgression
  days: ProgramDay[]
  /** Derived at read time from programInstances. Stripped before save. */
  activeInstance?: ProgramInstance
}

export interface LoggedSet {
  setNumber: number
  reps: number
  loadKg: number
  rpe?: number
  /** Canonical completion flag. */
  completed: boolean
  /** Spec alias of completed. */
  done?: boolean
  durationSec?: number
  distanceM?: number
  rounds?: number
  restSec?: number
  targetPercent1RM?: number
  loggedAt?: string
  /** Ramp / warm-up sets are excluded from PRs and volume. */
  isWarmup?: boolean
}

export interface SessionExercise {
  exerciseId: string
  setType: SetType
  sets: LoggedSet[]
  notes?: string
  restSec?: number
  timeCapSec?: number
  emomIntervalSec?: number
  rounds?: number
  distanceM?: number
  targetReps?: string
  targetLoadKg?: number
  targetPercent1RM?: number
  schemes?: SetScheme[]
  perSide?: boolean
  targetRpe?: number
  targetRir?: number
  /** Prescription row this block was built from. */
  plannedExerciseId?: string
  /** First coaching cue copied in at session start. */
  coachCue?: string
}

export type SessionStatus = 'in_progress' | 'paused' | 'completed'

/** Focus clock saved with a session so pause and resume restore the same place. */
export interface SessionTimer {
  phase: 'ready' | 'count-in' | 'work' | 'rest'
  /** Wall-clock end while the workout is still in progress. */
  endsAt?: number
  startedAt?: number
  /** Countdown seconds frozen at pause. */
  remainingSec?: number
  /** Elapsed seconds frozen at pause for a count-up. */
  elapsedSec?: number
  total?: number
  cap?: number
  mode?: 'down' | 'up'
  warned?: boolean
  warning?: string
  left?: number
  spoken?: number
  sideIndex?: number
}

export interface WorkoutSession {
  id: string
  name: string
  /** yyyy-MM-dd */
  dateKey: string
  programId?: string
  programDayId?: string
  status: SessionStatus
  startedAt?: string
  completedAt?: string
  /** Set while status is paused. Cleared on resume. */
  pausedAt?: string
  /** Rest, work, or count-in clock. Frozen while paused. */
  timer?: SessionTimer | null
  focus?: string
  pad?: string
  sessionPad?: string
  notes?: string
  shared?: boolean
  exercises: SessionExercise[]
  restEndsAt?: number | null
  currentSet?: { exerciseIndex: number; setIndex: number }
  /** Planned-session id this log was started from. */
  plannedSessionId?: string
}

export interface PersonalRecord {
  exerciseId: string
  kind?: string
  value?: number
  loadKg?: number
  reps?: number
  sessionId?: string
  dateKey: string
}

export interface ActivityEntry {
  id: string
  kind?: string
  text: string
  dateKey?: string
  createdAt: string
  sessionId?: string
  programId?: string
}

export type LiftMaxKind = 'strength' | 'run' | 'benchmark'

export interface LiftMax {
  familyId: string
  name: string
  kind: LiftMaxKind
  maxKg: number
  bestTimeSec?: number
  bestRounds?: number
  bestExtraReps?: number
  estimated?: boolean
  sourceExerciseId?: string
  updatedAt: string
  notes?: string
}

export interface PlanDay {
  id: string
  name: string
  focus?: string
  color?: string
  pad?: string
  sessionPad?: string
  freeWrite?: boolean
  isWhiteboard?: boolean
  exercises: Prescription[]
}

export interface PlanWeek {
  id: string
  label: string
  days: PlanDay[]
}

export interface PlanBoard {
  id: string
  name: string
  notes?: unknown[]
  weeks: PlanWeek[]
  updatedAt?: string
  sourceProgramId?: string
  loadImport?: LoadImportMeta
}

export interface PlannedSession {
  id: string
  dateKey: string
  name: string
  focus?: string
  programId?: string
  programDayId?: string
  programName?: string
  sessionPad?: string
  updatedAt?: string
  weekIndex?: number
  exercises: Prescription[]
}

export interface SeasonGoals {
  goals?: string[]
  season?: string
  experience?: string
  sport?: string
  competitionDate?: string
  competitionLabel?: string
  prepStart?: string
  seasonStartDate?: string
}

export interface CompletedPlanRecord {
  plan?: PlannedSession
}

export interface AppState {
  profile: Profile
  friends: Friend[]
  exercises: Exercise[]
  programs: Program[]
  sessions: WorkoutSession[]
  prs: PersonalRecord[]
  activity: ActivityEntry[]
  activeProgramId: string | null
  commitmentDays: string[]
  /** dateKey → program day id */
  scheduled: Record<string, string>
  plannedSessions: Record<string, PlannedSession>
  scheduleUserOwned: boolean
  planBoards: PlanBoard[]
  activeBoardId: string | null
  seasonGoals: SeasonGoals
  liftMaxes: Record<string, LiftMax>
  weightUnit: WeightUnit
  programInstances: ProgramInstance[]
  completedPlans?: Record<string, CompletedPlanRecord>
}

export type Screen =
  | 'today'
  | 'calendar'
  | 'workout'
  | 'plan'
  | 'friends'
  | 'log'
  | 'session'
  | 'workout-mode'
  | 'program-detail'
  | 'program-builder'
  | 'exercise-detail'

/** Train sub-views and Maxes are hash aliases of other screens. */
export type GoTarget = Screen | 'library' | 'programs' | 'coach' | 'maxes'

export type WorkoutTab = 'day' | 'library' | 'programs' | 'coach' | 'maxes'

export type PlanView = 'board' | 'muscles'

export type NavTab = 'today' | 'train' | 'plan' | 'progress' | 'friends'

export interface NavState {
  screen: Screen
  workoutTab?: WorkoutTab
  dateKey?: string
  programId?: string
  exerciseId?: string
  sessionId?: string
  planView?: PlanView
  invite?: string
}

export interface GoOptions {
  skipLeaveGuard?: boolean
}

export type LeaveGuard = (next: NavState) => boolean | Promise<boolean>

export interface StorageNotice {
  kind: 'corrupt'
  message: string
  backupKeys: string[]
  recovered: 'activity' | 'catalog' | 'none'
}

export interface CorruptBackup {
  key: string
  at: number
  kind: 'state' | 'catalog'
  bytes: number
}

export interface RestoreResult {
  ok: boolean
  key: string
  error?: string
  kind?: 'state' | 'catalog'
  repaired?: boolean
  summary?: string
  data?: Partial<AppState>
}

export interface LiftFamily {
  id: string
  name: string
  primaryExerciseId: string
  members: string[]
}

export interface ScoreRecordDef {
  id: string
  name: string
  kind: 'run' | 'benchmark'
  scoreType: 'time' | 'amrap'
  primaryExerciseId: string
  members: string[]
  distanceM?: number
  blurb?: string
}

/** Supabase rows. Inferred from the recovered client. RLS is described in SPEC.md §7. */
export interface SupabaseProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at?: string
}

export interface Friendship {
  user_a: string
  user_b: string
  created_at?: string
}

export type InviteStatus = 'pending' | 'accepted' | 'expired'

export interface FriendInvite {
  id: string
  from_user: string
  code: string
  status: InviteStatus | string
  created_at?: string
  /** Set by accept_friend_invite. Present on the live table. */
  accepted_by?: string | null
}

export interface ChatMessage {
  id: string
  from_user: string
  to_user: string
  body: string
  created_at?: string
  read_at?: string | null
}

export type ProgramShareStatus = 'pending' | 'accepted' | 'declined'

export interface ProgramShare {
  id: string
  from_user: string
  to_user: string
  program_id?: string | null
  program_name: string
  program_snapshot: unknown
  /** Older inferred name. The live column is program_snapshot. */
  program?: unknown
  message?: string | null
  status: ProgramShareStatus
  created_at?: string
}

export interface ProgressPost {
  id: string
  user_id: string
  session_local_id: string
  title?: string | null
  detail?: string | null
  post_type?: string | null
  snapshot?: unknown
  /** Spec aliases. The live columns are detail and snapshot. */
  summary?: string | null
  payload?: unknown
  created_at?: string
}

export type UserRecordKind =
  | 'session'
  | 'program'
  | 'program_instance'
  | 'exercise'
  | 'pr'
  | 'activity'
  | 'profile'
  | 'settings'
  | 'scheduled'
  | 'plan_board'
  | 'planned_session'
  | 'completed_plan'

export interface UserRecord {
  user_id: string
  kind: UserRecordKind
  id: string
  data: unknown
  updated_at: string
  deleted_at?: string | null
  rev?: number
}

export interface UserBackup {
  id: string
  user_id: string
  created_at: string
  size_bytes: number
  device_label?: string | null
  payload: unknown
}

/**
 * Prescription editor contract.
 * WP3 implements it at src/features/workout/PrescriptionEditor.tsx.
 * WP4 (plan day cards, program builder) imports that component and passes these props.
 * Do not fork a second editor.
 */
export interface PrescriptionEditorProps {
  prescription: Prescription
  onChange: (next: Prescription) => void
  exercise: Exercise | null
  weightUnit: WeightUnit
  /** Family 1RM in kilograms, when Coach / Maxes has one. */
  maxKg?: number | null
  /** `compact` is a plan-board row. `full` is the My day editor. */
  variant?: 'compact' | 'full'
  disabled?: boolean
  onRemove?: () => void
  onMove?: (direction: -1 | 1) => void
  onSwapExercise?: () => void
}

export interface StoreApi {
  state: AppState
  nav: NavState
  storageNotice: StorageNotice | null
  storageRevision: number
  go: (target: GoTarget, params?: Partial<NavState>, options?: GoOptions) => void
  backToTab: () => void
  registerLeaveGuard: (guard: LeaveGuard) => () => void
  /** Extension point for packages 2–6. Do not edit src/store to add a one-off write. */
  update: (recipe: (state: AppState) => AppState) => void
  dismissStorageNotice: () => void
  listCorruptBackups: () => CorruptBackup[]
  restoreFromBackup: (key: string) => RestoreResult
  deleteBackup: (key: string) => boolean
  resetToSeed: () => Promise<void>
  setActiveProgram: (id: string | null) => void
  updateSeasonGoals: (patch: Partial<SeasonGoals>) => void
  upsertExercise: (exercise: Exercise) => void
  setLiftMax: (max: LiftMax) => void
  deleteLiftMax: (familyId: string) => void
  setWeightUnit: (unit: WeightUnit) => void
  setActiveBoard: (id: string | null) => void
  createBoard: (name?: string) => string
  upsertBoard: (board: PlanBoard) => void
  deleteBoard: (id: string) => void
  scheduleDay: (dateKey: string, programDayId: string) => void
  clearSchedule: (dateKey: string) => void
  clearAllSchedule: () => void
  savePlannedSession: (session: PlannedSession) => void
  deleteSession: (id: string) => void
  updateSession: (id: string, recipe: (session: WorkoutSession) => WorkoutSession) => void
  setSessionNotes: (id: string, notes: string) => void
  setSessionPad: (id: string, pad: string) => void
  createProgram: (partial?: Partial<Program>) => string
  updateProgram: (id: string, recipe: (program: Program) => Program) => void
  deleteProgram: (id: string) => void
  cloneProgram: (id: string) => string | null
  openWorkout: (dateKey?: string, workoutTab?: WorkoutTab) => void
}
