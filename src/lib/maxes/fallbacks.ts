/**
 * Related-lift fallbacks from the recovered maxes utils.
 * Applied only when the target family has no max of its own, and only from a
 * source family that itself has a stored max (fallbacks do not chain).
 */
export interface LiftFallback {
  target: string
  source: string
  factor: number
  note: string
}

export const LIFT_FALLBACKS: LiftFallback[] = [
  {
    target: 'front_squat',
    source: 'back_squat',
    factor: 0.85,
    note: 'Front squat ≈ 85% of back squat when no front-squat max is set',
  },
  {
    target: 'oh_squat',
    source: 'front_squat',
    factor: 0.8,
    note: 'OHS ≈ 80% of front squat (mobility-limited; rough)',
  },
  {
    target: 'oh_squat',
    source: 'back_squat',
    factor: 0.65,
    note: 'OHS ≈ 65% of back squat if neither OHS nor front max exists',
  },
  {
    target: 'rdl',
    source: 'conventional_dl',
    factor: 0.75,
    note: 'RDL ≈ 75% of conventional deadlift (common S&C heuristic)',
  },
  {
    target: 'sumo_dl',
    source: 'conventional_dl',
    factor: 1,
    note: 'Sumo often comparable to conventional; 1:1 until a sumo max is set',
  },
  {
    target: 'trap_bar_dl',
    source: 'conventional_dl',
    factor: 1.05,
    note: 'Trap bar often slightly above conventional',
  },
  {
    target: 'cg_bench',
    source: 'bench',
    factor: 0.9,
    note: 'Close-grip ≈ 90% of competition bench',
  },
  {
    target: 'incline_bb_bench',
    source: 'bench',
    factor: 0.85,
    note: 'Incline BB ≈ 85% of flat bench',
  },
  {
    target: 'push_press',
    source: 'ohp',
    factor: 1.15,
    note: 'Push press typically above strict press',
  },
  {
    target: 'hang_clean',
    source: 'power_clean',
    factor: 0.95,
    note: 'Hang clean slightly below floor power clean for many athletes',
  },
  {
    target: 'clean_jerk',
    source: 'power_clean',
    factor: 1,
    note: 'C&J often limited by jerk; use power-clean max as stand-in',
  },
  {
    target: 'hang_snatch',
    source: 'power_snatch',
    factor: 0.95,
    note: 'Hang snatch ≈ 95% of power snatch',
  },
  {
    target: 'chinup',
    source: 'pullup',
    factor: 1.05,
    note: 'Chin-up (supinated) often slightly stronger than pull-up',
  },
]

export const MAPPING_NOTE =
  'Movement families share one 1RM. Related fallbacks (e.g. front squat ≈ 85% back squat) apply only when that family has no max of its own. Set a family max to override. Estimates use average of Epley + Brzycki and never overwrite without confirmation.'
