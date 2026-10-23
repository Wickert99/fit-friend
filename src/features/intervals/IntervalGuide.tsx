import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Profile, WorkoutSession } from '../../types.ts'
import { buzz, speak, useWakeLock } from '../session/browser.ts'
import { Button } from '../../ui/Button.tsx'
import { Stepper } from '../../ui/Stepper.tsx'
import { beep, unlockAudio } from './audio.ts'
import { HeartRateFields } from './HeartRateFields.tsx'
import { useHeartRateMonitor } from './useHeartRateMonitor.ts'
import {
  applyIntervalProgress,
  firstPhaseSpeak,
  formatClock,
  formatZone,
  HR_WATCH_NOTE,
  markInRange,
  phaseView,
  pinVisibleRemaining,
  recommendedRounds,
  remainingSeconds,
  resolveProfileMaxHr,
  resultCopy,
  matchHrInterval,
  sessionLengthSec,
  setupInterval,
  startInterval,
  structureLine,
  thawHrInterval,
  tickInterval,
  zoneRange,
  type HrIntervalProgram,
  type IntervalCue,
  type IntervalHistory,
} from './engine.ts'

export function IntervalGuide({
  session,
  program,
  profile,
  history,
  muted,
  onToggleMute,
  onProfile,
  onChange,
  onDone,
  onPause,
}: {
  session: WorkoutSession
  program: HrIntervalProgram
  profile: Profile
  history: IntervalHistory[]
  muted: boolean
  onToggleMute: () => void
  onProfile: (patch: { age?: number | null; maxHeartRate?: number | null }) => void
  onChange: (recipe: (session: WorkoutSession) => WorkoutSession) => void
  onDone: () => void
  onPause: (visibleRemainingSec?: number) => void
}) {
  const interval = session.hrInterval?.programId === program.id ? session.hrInterval : undefined
  const recommendation = recommendedRounds(history, program, session.id)
  const [rounds, setRounds] = useState(() => (interval?.run === 'setup' ? interval.rounds : recommendation.rounds))
  const [now, setNow] = useState(() => Date.now())
  const resolved = resolveProfileMaxHr(profile)
  const monitor = useHeartRateMonitor()
  const live = interval?.run === 'live'
  useWakeLock(live)

  const intervalRef = useRef(interval)
  const programRef = useRef(program)
  const mutedRef = useRef(muted)
  const onChangeRef = useRef(onChange)
  const nowRef = useRef(now)
  const heard = useRef<string | null>(null)
  intervalRef.current = interval
  programRef.current = program
  mutedRef.current = muted
  onChangeRef.current = onChange
  nowRef.current = now

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  useEffect(() => {
    if (session.status !== 'in_progress' || !interval || interval.run !== 'live' || interval.remainingSec == null || interval.endsAt != null) {
      return
    }
    const stamp = nowRef.current
    onChange((current) => {
      const hr = current.hrInterval
      if (!hr || current.status !== 'in_progress' || hr.remainingSec == null || hr.endsAt != null) return current
      return { ...current, hrInterval: thawHrInterval(hr, stamp) }
    })
  }, [session.status, interval, onChange])

  useEffect(() => {
    const id = window.setInterval(() => {
      const time = Date.now()
      setNow(time)
      const hr = intervalRef.current
      const currentProgram = programRef.current
      if (!hr || hr.run !== 'live' || hr.endsAt == null) return
      if (heard.current == null) heard.current = cueKey(hr)
      const result = tickInterval(hr, currentProgram, time)
      const key = cueKey(result.state)
      if (result.cues.length > 0 && key !== heard.current) {
        heard.current = key
        playCues(result.cues, mutedRef.current)
      }
      if (result.state === hr) return
      onChangeRef.current((current) => {
        if (current.status !== 'in_progress') return current
        const latest = current.hrInterval
        if (!latest || latest.run !== 'live' || latest.endsAt == null) return current
        const again = tickInterval(latest, currentProgram, Date.now())
        if (again.state === latest) return current
        return applyIntervalProgress(current, currentProgram, again.state)
      })
    }, 250)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  function chooseRounds(next: number) {
    setRounds(next)
    onChange((current) => ({ ...current, hrInterval: setupInterval(program, next) }))
  }

  function start() {
    unlockAudio()
    const max = resolveProfileMaxHr(profile)
    const speakLine = firstPhaseSpeak(program, rounds, max)
    onChange((current) => {
      const started = startInterval(current, program, rounds, max, Date.now())
      heard.current = started.hrInterval ? cueKey(started.hrInterval) : heard.current
      return started
    })
    playCues([{ kind: 'phase', speak: speakLine }], muted)
  }

  function pause() {
    const hr = intervalRef.current
    const shown = hr?.run === 'live' ? remainingSeconds(hr, now) : undefined
    if (hr && shown != null) {
      onChange((current) => {
        const live = current.hrInterval
        if (!live || live.run !== 'live') return current
        return { ...current, hrInterval: pinVisibleRemaining(live, shown) }
      })
    }
    onPause(shown)
  }

  function answer(round: number, inRange: boolean) {
    unlockAudio()
    onChange((current) => {
      const hr = current.hrInterval
      if (!hr) return current
      return { ...current, hrInterval: markInRange(hr, round, inRange) }
    })
  }

  if (!interval || interval.run === 'setup') {
    return (
      <div className="space-y-4" data-interval="setup" onPointerDown={() => unlockAudio()}>
        <p className="text-sm text-muted" data-interval-note>
          {HR_WATCH_NOTE}
        </p>
        <div className="rounded-3xl border border-lime/40 bg-charcoal px-4 py-6 text-center shadow-card">
          <p className="text-xs font-semibold tracking-wider text-lime-dim uppercase">{program.title}</p>
          <p className="mt-2 text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl" data-interval-zone>
            {formatZone(resolved.bpm, program.lowPct, program.highPct)}
          </p>
          <p className="mt-2 text-sm text-muted">{structureLine(program, rounds)}</p>
          <p className="mt-1 text-sm text-muted">About {formatClock(sessionLengthSec(program, rounds))}</p>
        </div>
        <HeartRateFields profile={profile} onChange={onProfile} showZone={false} lowPct={program.lowPct} highPct={program.highPct} />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">Rounds</p>
          <Stepper label="Rounds" value={rounds} min={program.minRounds} max={program.maxRounds} onChange={chooseRounds} />
          {recommendation.detail ? (
            <p className="text-sm text-muted" data-interval-suggest>
              {recommendation.detail}
            </p>
          ) : (
            <p className="text-sm text-muted" data-interval-suggest>
              Starts at {program.defaultRounds}. Add one round next time every work round stays in the band, up to {program.maxRounds}.
            </p>
          )}
        </div>
        <Button className="w-full" size="lg" data-interval-start onClick={start}>
          Start
        </Button>
      </div>
    )
  }

  if (interval.run === 'done') {
    return (
      <div className="space-y-4" data-interval="done" onPointerDown={() => unlockAudio()}>
        <p className="text-sm text-muted" data-interval-note>
          {HR_WATCH_NOTE}
        </p>
        <IntervalResult session={{ ...session, hrInterval: interval }} onMark={answer} />
        <Button className="w-full" data-interval-review onClick={onDone}>
          Review and save
        </Button>
        <Button className="w-full" variant="secondary" data-interval-pause onClick={pause}>
          Pause
        </Button>
      </div>
    )
  }

  const view = phaseView(program, interval, now)
  const zone = interval.maxHr != null ? zoneRange(interval.maxHr, interval.lowPct, interval.highPct) : null
  const tone =
    view.title.startsWith('Work') ? 'border-lime/50 bg-lime/10' : view.title === 'Rest' ? 'border-charcoal-4 bg-charcoal-3' : 'border-charcoal-4 bg-charcoal'

  return (
    <div className="space-y-4" data-interval="live" onPointerDown={() => unlockAudio()}>
      <p className="text-sm text-muted" data-interval-note>
        {HR_WATCH_NOTE}
      </p>
      <div className={`rounded-3xl border px-4 py-6 text-center shadow-card ${tone}`}>
        <p className="text-sm font-semibold tracking-wider text-lime-dim uppercase" data-interval-phase aria-live="polite">
          {view.title}
        </p>
        <p className="mt-1 text-sm text-muted">{view.detail}</p>
        <p
          className={`mt-3 font-semibold tabular-nums leading-none tracking-tight ${view.warning ? 'text-warn-ink' : 'text-ink'}`}
          style={{ fontSize: 'clamp(4.5rem, 18vw, 6.5rem)' }}
          data-interval-clock
          data-interval-warning={view.warning ? 'true' : 'false'}
        >
          {view.clock}
        </p>
        <p className="mt-4 text-balance text-xl font-semibold text-ink sm:text-2xl" data-interval-zone>
          {view.zone}
        </p>
        <p className="mt-2 text-sm text-muted" data-interval-next>
          {view.next}
        </p>
        {monitor.bpm != null && zone ? (
          <p className="mt-3 text-3xl font-semibold tabular-nums text-ink" data-interval-live-hr>
            {monitor.bpm}
            <span className="ml-1 text-base font-medium text-muted">bpm</span>
            <span className="mt-1 block text-sm font-medium text-muted">{bandText(monitor.bpm, zone.low, zone.high)}</span>
          </p>
        ) : null}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-charcoal-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(view.progress * 100)}
        aria-label="Session progress"
      >
        <div className="h-full bg-lime-dim" style={{ width: `${Math.round(view.progress * 100)}%` }} />
      </div>
      {view.promptRound != null ? (
        <div className="space-y-2 rounded-2xl border border-charcoal-4 bg-charcoal p-3" data-in-range-prompt={view.promptRound}>
          <p className="text-sm font-semibold text-ink">Stayed in range?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button data-in-range="yes" onClick={() => answer(view.promptRound as number, true)}>
              Yes
            </Button>
            <Button variant="secondary" data-in-range="no" onClick={() => answer(view.promptRound as number, false)}>
              No
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button data-interval-pause onClick={pause}>
          Pause
        </Button>
        <Button variant="secondary" aria-pressed={muted} onClick={onToggleMute}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {muted ? 'Sound off' : 'Sound on'}
        </Button>
        {monitor.supported ? (
          <Button variant="secondary" data-connect-hr onClick={() => (monitor.status === 'live' ? monitor.disconnect() : monitor.connect())}>
            {monitor.status === 'connecting' ? 'Connecting…' : monitor.status === 'live' ? 'Disconnect HR' : 'Connect heart rate'}
          </Button>
        ) : null}
      </div>
      {monitor.message ? <p className="text-sm text-muted">{monitor.message}</p> : null}
      {monitor.supported && monitor.status !== 'live' ? (
        <p className="text-xs text-muted">Phone heart-rate broadcast uses the standard Bluetooth heart-rate service. Whoop can broadcast it from the Whoop app.</p>
      ) : null}
    </div>
  )
}

export function IntervalResult({
  session,
  onMark,
}: {
  session: WorkoutSession
  onMark?: (round: number, inRange: boolean) => void
}) {
  const program = matchHrInterval(session) ?? matchHrInterval({ programId: session.hrInterval?.programId, name: session.name })
  if (!program || !session.hrInterval || session.hrInterval.run === 'setup') return null
  const interval = session.hrInterval
  const copy = resultCopy(interval.rounds, interval.marks ?? [], program)
  const zone = interval.maxHr != null ? formatZone(interval.maxHr, interval.lowPct, interval.highPct) : null
  return (
    <div className="space-y-3 rounded-2xl border border-charcoal-4 bg-charcoal p-4" data-interval-result>
      <div>
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">Interval</p>
        {zone ? <p className="mt-1 text-lg font-semibold text-ink">{zone}</p> : null}
        <p className="mt-1 text-sm text-ink">
          In range {copy.yes} of {interval.rounds}
          {copy.no > 0 ? ` · outside ${copy.no}` : ''}
          {copy.open > 0 ? ` · unmarked ${copy.open}` : ''}
        </p>
        <p className="mt-1 text-sm text-muted" data-interval-next-rounds>
          {copy.detail}
        </p>
      </div>
      <ul className="space-y-2">
        {Array.from({ length: interval.rounds }, (_, index) => {
          const round = index + 1
          const mark = interval.marks.find((item) => item.round === round)
          return (
            <li key={round} className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink">Round {round}</span>
              {onMark ? (
                <span className="flex gap-2">
                  <Button size="sm" variant={mark?.inRange === true ? 'primary' : 'secondary'} data-in-range="yes" data-round={round} onClick={() => onMark(round, true)}>
                    Yes
                  </Button>
                  <Button size="sm" variant={mark?.inRange === false ? 'primary' : 'secondary'} data-in-range="no" data-round={round} onClick={() => onMark(round, false)}>
                    No
                  </Button>
                </span>
              ) : (
                <span className="text-sm text-muted">{mark == null ? 'Unmarked' : mark.inRange ? 'In range' : 'Outside'}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function bandText(bpm: number, low: number, high: number): string {
  if (bpm < low) return 'Below the band'
  if (bpm > high) return 'Above the band'
  return 'In the band'
}

function cueKey(state: { run: string; phaseIndex: number; warned?: boolean }): string {
  return `${state.run}|${state.phaseIndex}|${state.warned ? 1 : 0}`
}

function playCues(cues: IntervalCue[], muted: boolean): void {
  const phase = cues.find((cue) => cue.kind === 'phase' || cue.kind === 'done')
  const warn = cues.find((cue) => cue.kind === 'warn')
  if (phase) {
    if (!muted) {
      beep('change')
      speak(phase.speak, false)
    }
    buzz([80, 40, 80, 40, 160])
  }
  if (warn && !phase) {
    if (!muted) {
      beep('warn')
      speak(warn.speak, false)
    }
    buzz([40, 30, 40])
  }
}
