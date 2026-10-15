/** Lift families and related-lift fallbacks used to turn %1RM into kilograms. */
export interface FamilyDef {
  id: string
  name: string
  primaryExerciseId: string
  members: string[]
}

export interface FamilyFallback {
  target: string
  source: string
  factor: number
  note: string
}

export const liftFamilies: FamilyDef[] = [
  {
    "id": "back_squat",
    "name": "Back Squat",
    "primaryExerciseId": "ex-bsquat",
    "members": [
      "ex-bsquat",
      "ex-pause-bsquat"
    ]
  },
  {
    "id": "front_squat",
    "name": "Front Squat",
    "primaryExerciseId": "ex-fsquat",
    "members": [
      "ex-fsquat"
    ]
  },
  {
    "id": "oh_squat",
    "name": "Overhead Squat",
    "primaryExerciseId": "ex-ohsquat",
    "members": [
      "ex-ohsquat"
    ]
  },
  {
    "id": "goblet_squat",
    "name": "Goblet Squat",
    "primaryExerciseId": "ex-goblet",
    "members": [
      "ex-goblet"
    ]
  },
  {
    "id": "conventional_dl",
    "name": "Conventional Deadlift",
    "primaryExerciseId": "ex-dl",
    "members": [
      "ex-dl",
      "ex-pause-dl"
    ]
  },
  {
    "id": "rdl",
    "name": "Romanian Deadlift",
    "primaryExerciseId": "ex-rdl",
    "members": [
      "ex-rdl"
    ]
  },
  {
    "id": "sumo_dl",
    "name": "Sumo Deadlift",
    "primaryExerciseId": "ex-sumo-dl",
    "members": [
      "ex-sumo-dl"
    ]
  },
  {
    "id": "trap_bar_dl",
    "name": "Trap Bar Deadlift",
    "primaryExerciseId": "ex-trapbar",
    "members": [
      "ex-trapbar"
    ]
  },
  {
    "id": "bench",
    "name": "Bench Press",
    "primaryExerciseId": "ex-bp",
    "members": [
      "ex-bp"
    ]
  },
  {
    "id": "cg_bench",
    "name": "Close-Grip Bench",
    "primaryExerciseId": "ex-cgbp",
    "members": [
      "ex-cgbp"
    ]
  },
  {
    "id": "incline_bb_bench",
    "name": "Incline Barbell Bench",
    "primaryExerciseId": "ex-incline-bb-press",
    "members": [
      "ex-incline-bb-press"
    ]
  },
  {
    "id": "db_bench",
    "name": "Dumbbell Bench Press",
    "primaryExerciseId": "ex-dbpress",
    "members": [
      "ex-dbpress"
    ]
  },
  {
    "id": "ohp",
    "name": "Overhead Press",
    "primaryExerciseId": "ex-ohp",
    "members": [
      "ex-ohp",
      "ex-strict-shoulder",
      "ex-bb-shoulder-press"
    ]
  },
  {
    "id": "push_press",
    "name": "Push Press",
    "primaryExerciseId": "ex-pushpress",
    "members": [
      "ex-pushpress"
    ]
  },
  {
    "id": "power_clean",
    "name": "Power Clean",
    "primaryExerciseId": "ex-pclean",
    "members": [
      "ex-pclean",
      "ex-cleanpull"
    ]
  },
  {
    "id": "hang_clean",
    "name": "Hang Clean",
    "primaryExerciseId": "ex-hangclean",
    "members": [
      "ex-hangclean"
    ]
  },
  {
    "id": "clean_jerk",
    "name": "Clean & Jerk",
    "primaryExerciseId": "ex-cleanjerk",
    "members": [
      "ex-cleanjerk"
    ]
  },
  {
    "id": "power_snatch",
    "name": "Power Snatch",
    "primaryExerciseId": "ex-powersnatch",
    "members": [
      "ex-powersnatch",
      "ex-psnatch",
      "ex-snatchpull"
    ]
  },
  {
    "id": "hang_snatch",
    "name": "Hang Snatch",
    "primaryExerciseId": "ex-hangsnatch",
    "members": [
      "ex-hangsnatch"
    ]
  },
  {
    "id": "pullup",
    "name": "Pull-Up",
    "primaryExerciseId": "ex-pullup",
    "members": [
      "ex-pullup"
    ]
  },
  {
    "id": "chinup",
    "name": "Chin-Up",
    "primaryExerciseId": "ex-chinup",
    "members": [
      "ex-chinup"
    ]
  },
  {
    "id": "bb_row",
    "name": "Barbell Row",
    "primaryExerciseId": "ex-row",
    "members": [
      "ex-row"
    ]
  },
  {
    "id": "hip_thrust",
    "name": "Hip Thrust",
    "primaryExerciseId": "ex-hipthrust",
    "members": [
      "ex-hipthrust"
    ]
  },
  {
    "id": "leg_press",
    "name": "Leg Press",
    "primaryExerciseId": "ex-legpress",
    "members": [
      "ex-legpress"
    ]
  }
]

export const familyFallbacks: FamilyFallback[] = [
  {
    "target": "front_squat",
    "source": "back_squat",
    "factor": 0.85,
    "note": "Front squat ≈ 85% of back squat when no front-squat max is set"
  },
  {
    "target": "oh_squat",
    "source": "front_squat",
    "factor": 0.8,
    "note": "OHS ≈ 80% of front squat (mobility-limited; rough)"
  },
  {
    "target": "oh_squat",
    "source": "back_squat",
    "factor": 0.65,
    "note": "OHS ≈ 65% of back squat if neither OHS nor front max exists"
  },
  {
    "target": "rdl",
    "source": "conventional_dl",
    "factor": 0.75,
    "note": "RDL ≈ 75% of conventional deadlift (common S&C heuristic)"
  },
  {
    "target": "sumo_dl",
    "source": "conventional_dl",
    "factor": 1,
    "note": "Sumo often comparable to conventional; 1:1 until a sumo max is set"
  },
  {
    "target": "trap_bar_dl",
    "source": "conventional_dl",
    "factor": 1.05,
    "note": "Trap bar often slightly above conventional"
  },
  {
    "target": "cg_bench",
    "source": "bench",
    "factor": 0.9,
    "note": "Close-grip ≈ 90% of competition bench"
  },
  {
    "target": "incline_bb_bench",
    "source": "bench",
    "factor": 0.85,
    "note": "Incline BB ≈ 85% of flat bench"
  },
  {
    "target": "push_press",
    "source": "ohp",
    "factor": 1.15,
    "note": "Push press typically above strict press"
  },
  {
    "target": "hang_clean",
    "source": "power_clean",
    "factor": 0.95,
    "note": "Hang clean slightly below floor power clean for many athletes"
  },
  {
    "target": "clean_jerk",
    "source": "power_clean",
    "factor": 1,
    "note": "C&J often limited by jerk; use power-clean max as stand-in"
  },
  {
    "target": "hang_snatch",
    "source": "power_snatch",
    "factor": 0.95,
    "note": "Hang snatch ≈ 95% of power snatch"
  },
  {
    "target": "chinup",
    "source": "pullup",
    "factor": 1.05,
    "note": "Chin-up (supinated) often slightly stronger than pull-up"
  }
]

export const exerciseIdAliases: Record<string, string> = {
  "ex-kb-turkish": "ex-turkish",
  "ex-kb-windmill": "ex-kbwindmill",
  "ex-suitcase-carry": "ex-suit",
  "ex-hollow-hold": "ex-hollow",
  "ex-ring-row": "ex-ringrow"
}
