export const muscleLabels: Record<string, string> = {
  chest: 'Chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  upper_traps: 'Upper traps',
  lats: 'Lats',
  mid_back: 'Mid back',
  lower_back: 'Lower back',
  abs: 'Abs',
  obliques: 'Obliques',
  glutes: 'Glutes',
  hip_flexors: 'Hip flexors',
  adductors: 'Adductors',
  abductors: 'Abductors',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  tibialis: 'Tibialis',
  neck: 'Neck',
}

export const muscleGroups: Record<string, string[]> = {
  push: ['chest', 'front_delts', 'side_delts', 'triceps'],
  pull: ['lats', 'mid_back', 'rear_delts', 'upper_traps', 'biceps', 'forearms'],
  legs: ['quads', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves'],
  core: ['abs', 'obliques', 'lower_back', 'hip_flexors'],
}

export const muscleIds = Object.keys(muscleLabels)
