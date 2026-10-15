/** Epley: weight × (1 + reps / 30). Reps above 12 are capped. */
export function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + Math.min(reps, 12) / 30)
}

/** Brzycki: weight × 36 / (37 − reps). Reps above 12 are capped. */
export function brzycki(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  const capped = Math.min(reps, 12)
  if (capped >= 37) return weight
  return weight * (36 / (37 - capped))
}

/** Working 1RM is the average of Epley and Brzycki. A single is the weight itself. */
export function estimate1rm(weight: number, reps: number): number {
  if (reps === 1) return weight
  return (epley(weight, reps) + brzycki(weight, reps)) / 2
}
