import { useEffect, useState } from 'react'
import type { Profile } from '../../types.ts'
import { useStore } from '../../store/useStore.ts'
import { Card, SectionLabel } from '../../ui/Card.tsx'
import { Input } from '../../ui/Input.tsx'
import {
  formatZone,
  maxHrCaption,
  patchProfileHr,
  resolveProfileMaxHr,
  type HeartRatePatch,
} from './engine.ts'

export function HeartRateSettings() {
  const { state, update } = useStore()
  return (
    <Card className="space-y-3" data-heart-rate-settings>
      <SectionLabel>Heart rate</SectionLabel>
      <p className="text-sm text-muted">
        Age and max heart rate set the target for guided intervals. A Whoop max is remembered when a scored workout includes one.
      </p>
      <HeartRateFields
        profile={state.profile}
        onChange={(patch) => update((current) => ({ ...current, profile: patchProfileHr(current.profile, patch) }))}
      />
    </Card>
  )
}

export function HeartRateFields({
  profile,
  onChange,
  showZone = true,
  lowPct = 80,
  highPct = 85,
}: {
  profile: Profile
  onChange: (patch: HeartRatePatch) => void
  showZone?: boolean
  lowPct?: number
  highPct?: number
}) {
  const resolved = resolveProfileMaxHr(profile)
  const [ageText, setAgeText] = useState(profile.age == null ? '' : String(profile.age))
  const [maxText, setMaxText] = useState(profile.maxHeartRate == null ? '' : String(profile.maxHeartRate))
  useEffect(() => setAgeText(profile.age == null ? '' : String(profile.age)), [profile.age])
  useEffect(() => setMaxText(profile.maxHeartRate == null ? '' : String(profile.maxHeartRate)), [profile.maxHeartRate])

  return (
    <div className="space-y-3">
      {showZone ? (
        <p className="text-lg font-semibold text-ink" data-interval-zone>
          {formatZone(resolved.bpm, lowPct, highPct)}
        </p>
      ) : null}
      <p className="text-sm text-muted" data-max-hr-source={resolved.source}>
        {maxHrCaption(resolved)}
      </p>
      {profile.whoopMaxHeartRate && resolved.source === 'manual' ? (
        <p className="text-xs text-muted">Whoop last reported {profile.whoopMaxHeartRate} bpm. Your number is the one the timer uses.</p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-muted">
          Age
          <Input
            className="mt-1"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Age"
            placeholder="Years"
            value={ageText}
            onChange={(event) => {
              const next = digits(event.target.value)
              setAgeText(next)
              if (next === '') onChange({ age: null })
              else commitNumber(next, 8, 100, (age) => onChange({ age }))
            }}
          />
        </label>
        <label className="block text-xs text-muted">
          Max HR
          <Input
            className="mt-1"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Max heart rate"
            placeholder="Auto"
            value={maxText}
            onChange={(event) => {
              const next = digits(event.target.value)
              setMaxText(next)
              if (next === '') onChange({ maxHeartRate: null })
              else commitNumber(next, 100, 230, (maxHeartRate) => onChange({ maxHeartRate }))
            }}
          />
        </label>
      </div>
    </div>
  )
}

function digits(value: string): string {
  return value.replace(/[^\d]/g, '').slice(0, 3)
}

function commitNumber(text: string, min: number, max: number, commit: (value: number) => void): void {
  const value = Number(text)
  if (value >= min && value <= max) commit(value)
}
