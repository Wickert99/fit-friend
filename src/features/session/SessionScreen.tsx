import { useCallback, useEffect, useRef, useState } from 'react'
import type { WeightUnit, WorkoutSession } from '../../types.ts'
import { exerciseAliases, liftFamilies } from '../../store/catalog.ts'
import { setLiftMax } from '../../store/actions.ts'
import { useStore } from '../../store/useStore.ts'
import { isSupabaseConfigured } from '../../lib/supabase/client.ts'
import { Badge, Button, Card, EmptyState, Page, TextArea, useConfirm, useToast } from '../../ui/index.ts'
import { publishProgressPost, programNameFor } from '../friends/progressApi.ts'
import { EstimateMaxOffer, ExerciseMaxEditor } from '../progress/MaxesPanel.tsx'
import { formatExactLoad, formatPlateLoad } from '../../lib/setTypes/units.ts'
import { readMuted, writeMuted } from './browser.ts'
import { trainingContext } from './context.ts'
import { FocusMode, type FocusHandle } from './FocusMode.tsx'
import {
  deleteCompletedSession,
  discardSession,
  finishSession,
  sessionCounts,
  sessionVolume,
  summarizeSession,
} from './logic.ts'

export default function SessionScreen() {
  const { state, nav, go } = useStore()
  const session = state.sessions.find((item) => item.id === nav.sessionId)
  if (!session) {
    return (
      <Page>
        <EmptyState
          title="Session not found"
          body="This workout is no longer on the device."
          action={
            <Button variant="secondary" onClick={() => go('today')}>
              Back to Today
            </Button>
          }
        />
      </Page>
    )
  }
  if (session.status === 'completed') return <CompletedSession session={session} />
  return <ActiveSession session={session} />
}

function ActiveSession({ session }: { session: WorkoutSession }) {
  const { state, go, backToTab, update, updateSession, registerLeaveGuard } = useStore()
  const confirm = useConfirm()
  const toast = useToast()
  const focusRef = useRef<FocusHandle>(null)
  const allowRef = useRef(false)
  const [view, setView] = useState<'focus' | 'summary'>('focus')
  const [muted, setMuted] = useState(readMuted)
  const [dirty, setDirty] = useState(false)
  const [notes, setNotes] = useState(session.notes ?? '')
  const [pad, setPad] = useState(session.sessionPad ?? session.pad ?? '')
  const [shared, setShared] = useState(true)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [leave, setLeave] = useState<{ resolve: (ok: boolean) => void } | null>(null)
  const summary = summarizeSession(session, state, trainingContext(state))
  const names = Object.fromEntries(state.exercises.map((exercise) => [exercise.id, exercise.name]))
  const notesDirty = notes !== (session.notes ?? '') || pad !== (session.sessionPad ?? session.pad ?? '')
  const blocked = dirty || notesDirty
  const blockedRef = useRef(blocked)
  blockedRef.current = blocked

  const onDirty = useCallback((value: boolean) => setDirty(value), [])
  const onDone = useCallback(() => {
    focusRef.current?.flush()
    setDirty(false)
    setView('summary')
  }, [])

  useEffect(() => {
    return registerLeaveGuard(() => {
      if (allowRef.current || !blockedRef.current) return true
      return new Promise((resolve) => setLeave({ resolve }))
    })
  }, [registerLeaveGuard])

  function leaveNow(run: () => void) {
    allowRef.current = true
    run()
  }

  function finish() {
    const offers = summary.maxOffers
    update((current) => {
      const withNotes = {
        ...current,
        sessions: current.sessions.map((item) => (item.id === session.id ? { ...item, notes, sessionPad: pad, pad } : item)),
      }
      let next = finishSession(withNotes, session.id, shared)
      for (const offer of offers) {
        if (!picked[offer.familyId]) continue
        next = setLiftMax(next, {
          familyId: offer.familyId,
          name: offer.liftName,
          kind: 'strength',
          maxKg: offer.estimateKg,
          estimated: true,
          sourceExerciseId: offer.exerciseId,
          updatedAt: new Date().toISOString(),
        })
      }
      return next
    })
    if (shared && isSupabaseConfigured) {
      const finished = { ...session, notes, sessionPad: pad, pad, status: 'completed' as const }
      void publishProgressPost({
        session: finished,
        exercises: state.exercises,
        previousPrs: state.prs,
        programName: programNameFor(state.programs, session.programId),
      }).then((result) => {
        if (!result.error) return
        if (result.error === 'Not signed in' || result.error === 'Offline') {
          toast({ text: 'Saved on this device. Sign in on Friends to share the feed.' })
          return
        }
        toast({ tone: 'error', text: result.error })
      })
    }
    leaveNow(() => go('today', {}, { skipLeaveGuard: true }))
  }

  async function discard() {
    const ok = await confirm('Discard this workout?\n\nLogged sets in this session are removed. Your plan for the day stays.')
    if (!ok) return
    update((current) => discardSession(current, session.id))
    leaveNow(() => go('today', {}, { skipLeaveGuard: true }))
  }

  return (
    <Page>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={backToTab}>
          Back
        </Button>
        {view === 'focus' ? (
          <Button variant="ghost" onClick={onDone}>
            Finish
          </Button>
        ) : (
          <Badge>
            {sessionCounts(session).done}/{sessionCounts(session).planned}
          </Badge>
        )}
      </div>
      {view === 'focus' ? (
        <FocusMode
          ref={focusRef}
          session={session}
          exercises={state.exercises}
          unit={state.weightUnit}
          families={liftFamilies}
          aliases={exerciseAliases}
          liftMaxes={state.liftMaxes}
          muted={muted}
          onToggleMute={() => {
            const next = !muted
            setMuted(next)
            writeMuted(next)
          }}
          onChange={(recipe) => updateSession(session.id, recipe)}
          onDirty={onDirty}
          onDone={onDone}
        />
      ) : (
        <Summary
          session={session}
          names={names}
          unit={state.weightUnit}
          summary={summary}
          notes={notes}
          pad={pad}
          shared={shared}
          picked={picked}
          onNotes={setNotes}
          onPad={setPad}
          onShared={setShared}
          onPick={(familyId, checked) => setPicked((current) => ({ ...current, [familyId]: checked }))}
          onFinish={finish}
          onKeep={() => setView('focus')}
          onDiscard={() => void discard()}
        />
      )}
      {leave ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="leave-title">
          <div className="w-full max-w-lg space-y-3 rounded-3xl border border-charcoal-4 bg-charcoal p-4 shadow-raised">
            <h2 id="leave-title" className="text-lg font-semibold">
              Leave focus mode?
            </h2>
            <p className="text-sm text-muted">You have edits that are not logged yet.</p>
            <Button
              onClick={() => {
                leave.resolve(false)
                setLeave(null)
              }}
            >
              Keep going
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                focusRef.current?.flush()
                updateSession(session.id, (item) => ({ ...item, notes, sessionPad: pad, pad }))
                allowRef.current = true
                leave.resolve(true)
                setLeave(null)
              }}
            >
              Save edits & leave
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                allowRef.current = true
                leave.resolve(true)
                setLeave(null)
              }}
            >
              Discard edits & leave
            </Button>
          </div>
        </div>
      ) : null}
    </Page>
  )
}

function Summary({
  session,
  names,
  unit,
  summary,
  notes,
  pad,
  shared,
  picked,
  onNotes,
  onPad,
  onShared,
  onPick,
  onFinish,
  onKeep,
  onDiscard,
}: {
  session: WorkoutSession
  names: Record<string, string>
  unit: WeightUnit
  summary: ReturnType<typeof summarizeSession>
  notes: string
  pad: string
  shared: boolean
  picked: Record<string, boolean>
  onNotes: (value: string) => void
  onPad: (value: string) => void
  onShared: (value: boolean) => void
  onPick: (familyId: string, checked: boolean) => void
  onFinish: () => void
  onKeep: () => void
  onDiscard: () => void
}) {
  return (
    <div className="space-y-4" data-summary>
      <header>
        <h1 className="text-xl font-semibold text-ink">{session.name}</h1>
        <p className="text-sm text-muted">
          {summary.doneSets}/{summary.plannedSets} sets · {summary.pct}% · {formatExactLoad(summary.volumeKg, unit)}
        </p>
      </header>
      <div className="h-2 overflow-hidden rounded-full bg-charcoal-3">
        <div className="h-full bg-lime-dim" style={{ width: `${summary.pct}%` }} />
      </div>
      {summary.unlogged.length > 0 ? (
        <Card className="space-y-1">
          <p className="text-sm font-semibold">Still open</p>
          {summary.unlogged.map((group) => (
            <p key={group.exerciseIndex} className="text-sm text-muted">
              {names[group.exerciseId] || 'Exercise'}: sets {group.setNumbers.join(', ')}
            </p>
          ))}
        </Card>
      ) : null}
      {summary.prs.length > 0 ? (
        <Card className="space-y-1">
          <p className="text-sm font-semibold">Personal records</p>
          {summary.prs.map((hit) => (
            <p key={hit.exerciseId} className="text-sm text-ink">
              {names[hit.exerciseId] || 'Exercise'} · {formatExactLoad(hit.loadKg, unit)} × {hit.reps}
            </p>
          ))}
        </Card>
      ) : null}
      {summary.maxOffers.length > 0 ? (
        <Card className="space-y-2">
          <p className="text-sm font-semibold">Update 1RM</p>
          <p className="text-xs text-muted">Average of Epley and Brzycki, plate-rounded. A max changes only if you tick it.</p>
          {summary.maxOffers.map((offer) => (
            <div key={offer.familyId} className="space-y-2">
              <label className="flex min-h-11 items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!!picked[offer.familyId]}
                  onChange={(event) => onPick(offer.familyId, event.target.checked)}
                />
                <span>
                  {offer.liftName} → {formatPlateLoad(offer.estimateKg, unit)}
                  <span className="block text-xs text-muted">
                    from {formatExactLoad(offer.fromLoadKg, unit)} × {offer.fromReps}
                    {offer.currentKg != null ? ` · current ${formatPlateLoad(offer.currentKg, unit)}` : ''}
                  </span>
                </span>
              </label>
              <EstimateMaxOffer
                exerciseId={offer.exerciseId}
                exerciseName={names[offer.exerciseId]}
                loadKg={offer.fromLoadKg}
                reps={offer.fromReps}
              />
            </div>
          ))}
        </Card>
      ) : null}
      {[...new Map(session.exercises.map((exercise) => [exercise.exerciseId, exercise])).values()].map((exercise) => (
        <ExerciseMaxEditor
          key={exercise.exerciseId}
          exerciseId={exercise.exerciseId}
          exerciseName={names[exercise.exerciseId]}
        />
      ))}
      <label className="block text-xs text-muted">
        Session pad
        <TextArea className="font-hand mt-1 min-h-24 text-lg" value={pad} onChange={(event) => onPad(event.target.value)} />
      </label>
      <label className="block text-xs text-muted">
        Notes
        <TextArea className="mt-1 min-h-20" value={notes} onChange={(event) => onNotes(event.target.value)} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={shared} onChange={(event) => onShared(event.target.checked)} />
        Share to friends feed when finished
      </label>
      <div className="flex flex-col gap-2">
        <Button onClick={onFinish}>Finish</Button>
        <Button variant="secondary" onClick={onKeep}>
          Keep going
        </Button>
        <Button variant="danger" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  )
}

function CompletedSession({ session }: { session: WorkoutSession }) {
  const { state, go, update } = useStore()
  const confirm = useConfirm()
  const names = Object.fromEntries(state.exercises.map((exercise) => [exercise.id, exercise.name]))
  async function remove() {
    const ok = await confirm(
      `Delete “${session.name}” from your log?\n\nRemoves history, updates PRs if needed, and clears this day from your streak if nothing else was logged.`,
    )
    if (!ok) return
    update((current) => deleteCompletedSession(current, session.id))
    go('today', {}, { skipLeaveGuard: true })
  }
  return (
    <Page>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => go('today')}>
          Back
        </Button>
        <Badge tone="success">Completed</Badge>
      </div>
      <header>
        <h1 className="text-xl font-semibold text-ink">{session.name}</h1>
        <p className="text-sm text-muted">
          {sessionCounts(session).done} sets · {formatExactLoad(sessionVolume(session), state.weightUnit)}
        </p>
      </header>
      {session.exercises.map((exercise, index) => (
        <Card key={`${exercise.exerciseId}-${index}`} className="space-y-1">
          <p className="font-semibold text-ink">{names[exercise.exerciseId] || 'Exercise'}</p>
          {exercise.sets.map((set, setIndex) => (
            <p key={setIndex} className="text-sm text-muted">
              Set {set.setNumber}: {set.reps} reps
              {set.loadKg > 0 ? ` · ${formatExactLoad(set.loadKg, state.weightUnit)}` : ''}
              {set.completed ? '' : ' · open'}
            </p>
          ))}
        </Card>
      ))}
      {session.notes ? <p className="text-sm text-muted">{session.notes}</p> : null}
      <Button variant="danger" onClick={() => void remove()}>
        Delete
      </Button>
    </Page>
  )
}
