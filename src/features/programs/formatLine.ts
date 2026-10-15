import type { Prescription, WeightUnit } from '../../types.ts'
import { formatLoad } from '../../lib/personalize/index.ts'

export function prescriptionLine(prescription: Prescription, unit: WeightUnit): string {
  const schemes = (prescription.schemes?.length ? prescription.schemes : prescription.waves) ?? []
  if (schemes.length > 1) {
    return schemes.map((scheme) => `${scheme.sets}×${scheme.reps}`).join(' · ')
  }
  const percent = prescription.targetPercent1RM ?? prescription.percent1RM
  let load = ''
  if (percent != null && percent > 0) load = ` @ ${percent}%`
  else if (prescription.targetRpe != null) load = ` @ RPE ${prescription.targetRpe}`
  else if (prescription.targetLoadKg != null && prescription.targetLoadKg > 0) {
    load = ` @ ${formatLoad(prescription.targetLoadKg, unit)}`
  }
  return `${prescription.sets} × ${prescription.reps}${load}`
}
