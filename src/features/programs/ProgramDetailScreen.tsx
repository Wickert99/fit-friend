import { useState } from 'react'
import { useStore } from '../../store/useStore.ts'
import { ADAPTATION_LABELS, missingMaxes, programFitBlurb, progressionBlurb } from '../../lib/personalize/index.ts'
import { Badge, Button, Card, EmptyState, Page, ScreenHeader } from '../../ui/index.ts'
import { useConfirm } from '../../ui/Confirm.tsx'
import CommitToCalendar from '../calendar/CommitToCalendar.tsx'
import { ShareProgramSheet } from '../friends/ShareProgramSheet.tsx'
import { prescriptionLine } from './formatLine.ts'
import { ImportToPlan } from './ImportToPlan.tsx'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ProgramDetailScreen() {
  const { state, nav, go, backToTab, setActiveProgram, deleteProgram, cloneProgram } = useStore()
  const confirm = useConfirm()
  const [importOpen, setImportOpen] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const program = state.programs.find((item) => item.id === nav.programId) ?? null
  if (!program) {
    return (
      <Page>
        <ScreenHeader
          title="Program"
          action={
            <Button variant="secondary" onClick={() => backToTab()}>
              Back
            </Button>
          }
        />
        <EmptyState title="Program not found" body="It may have been deleted on this device." />
      </Page>
    )
  }
  const active = state.activeProgramId === program.id
  const progression = progressionBlurb(program)
  const fit = programFitBlurb(program, {
    season: state.seasonGoals.season,
    missingMaxCount: missingMaxes(program, state.liftMaxes).length,
  })
  const byId = new Map(state.exercises.map((exercise) => [exercise.id, exercise.name]))
  return (
    <Page>
      <ScreenHeader
        title={program.name}
        subtitle={`${program.weeks} week${program.weeks === 1 ? '' : 's'}`}
        action={
          <Button variant="secondary" onClick={() => backToTab()}>
            Back
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Badge tone="lime">{program.theme}</Badge>
        {active ? <Badge tone="success">Active</Badge> : null}
        {(program.adaptations ?? []).map((item) => (
          <Badge key={item}>{ADAPTATION_LABELS[item] ?? item}</Badge>
        ))}
        {program.sports.map((sport) => (
          <Badge key={sport} tone="steel">
            {sport}
          </Badge>
        ))}
      </div>
      {program.description ? <p className="text-sm leading-relaxed text-ink">{program.description}</p> : null}
      {program.audience ? <p className="text-sm text-muted">For: {program.audience}</p> : null}
      {program.coachNotes ? <p className="text-sm text-muted">Coach notes: {program.coachNotes}</p> : null}
      {progression ? <p className="text-sm text-ink">Progressive overload: {progression}</p> : null}
      {fit ? <p className="text-sm text-muted">{fit}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant={active ? 'secondary' : 'primary'} onClick={() => setActiveProgram(program.id)}>
          {active ? 'Active' : 'Set as active'}
        </Button>
        <Button
          variant="secondary"
          data-open-import="true"
          onClick={() => setImportOpen(true)}
        >
          Import to Plan
        </Button>
        <Button variant="secondary" data-commit-calendar="true" onClick={() => setCommitOpen(true)}>
          Commit to calendar
        </Button>
        <Button variant="secondary" data-share-program="true" onClick={() => setShareOpen(true)}>
          Share
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            const id = cloneProgram(program.id)
            if (!id) return
            go('program-detail', { programId: id })
          }}
        >
          Clone
        </Button>
        {program.isMine && !program.isTemplate ? (
          <Button
            variant="danger"
            onClick={() => {
              void confirm(`Delete “${program.name}”?\n\nThis removes the program from this device.`).then((ok) => {
                if (!ok) return
                deleteProgram(program.id)
                backToTab()
              })
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>
      <div className="space-y-3">
        {program.days.map((day) => (
          <Card key={day.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-ink">{day.name}</h2>
                <p className="text-xs text-muted">{day.weekday == null ? 'Flexible' : WEEKDAYS[day.weekday] ?? 'Flexible'}</p>
              </div>
              <Badge>{day.focus}</Badge>
            </div>
            {day.sessionPad ? <p className="mt-2 font-hand text-lg leading-7 text-ink">{day.sessionPad}</p> : null}
            <ul className="mt-3 space-y-2">
              {day.exercises.map((exercise, index) => (
                <li key={exercise.id ?? `${exercise.exerciseId}-${index}`}>
                  <p className="text-sm text-ink">
                    <span className="font-medium">{byId.get(exercise.exerciseId) || exercise.placeholder || 'Exercise'}</span>
                    {' — '}
                    {prescriptionLine(exercise, state.weightUnit)}
                  </p>
                  {exercise.notes ? <p className="text-xs text-muted">Coach: {exercise.notes}</p> : null}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <ImportToPlan program={program} open={importOpen} onClose={() => setImportOpen(false)} />
      {commitOpen ? <CommitToCalendar source={{ kind: 'program', program }} onClose={() => setCommitOpen(false)} /> : null}
      {shareOpen ? <ShareProgramSheet program={program} onClose={() => setShareOpen(false)} /> : null}
    </Page>
  )
}
