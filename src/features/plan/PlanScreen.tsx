import { useState } from 'react'
import { PlanSubNav } from '../../app/TabSubNav.tsx'
import { useStore } from '../../store/useStore.ts'
import { Button, EmptyState, Input, Page, ScreenHeader, Select } from '../../ui/index.ts'
import { useConfirm } from '../../ui/Confirm.tsx'
import { useToast } from '../../ui/Toast.tsx'
import { addDay, addWeek, clearBoard, clearDay, clearWeek, deleteDay, deleteWeek, duplicateWeek, renameWeek, updateDay } from './boardOps.ts'
import { boardExportSummary, boardToProgram } from './boardProgram.ts'
import CommitToCalendar from '../calendar/CommitToCalendar.tsx'
import { DayCard } from './DayCard.tsx'
import { ImportSheet } from './ImportSheet.tsx'
import { RxSheet } from './RxSheet.tsx'

export default function PlanScreen() {
  const { state, go, createBoard, setActiveBoard, upsertBoard, deleteBoard, upsertExercise, createProgram } = useStore()
  const confirm = useConfirm()
  const toast = useToast()
  const board = state.planBoards.find((item) => item.id === state.activeBoardId) ?? state.planBoards[0] ?? null
  const [weekId, setWeekId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [commitOpen, setCommitOpen] = useState(false)
  const [rxDayId, setRxDayId] = useState<string | null>(null)
  const week = board?.weeks.find((item) => item.id === weekId) ?? board?.weeks[0] ?? null
  const rxDay = week?.days.find((day) => day.id === rxDayId) ?? board?.weeks.flatMap((item) => item.days).find((day) => day.id === rxDayId) ?? null

  function save(next: NonNullable<typeof board>) {
    upsertBoard(next)
  }

  async function useAsProgram() {
    if (!board) {
      toast({ tone: 'error', text: 'Create or select a plan board first.' })
      return
    }
    const summary = boardExportSummary(board)
    if ('error' in summary) {
      toast({ tone: 'error', text: summary.error })
      return
    }
    const ok = await confirm(summary.message)
    if (!ok) return
    const draft = boardToProgram(board)
    if (!draft) {
      toast({
        tone: 'error',
        text: 'Could not create a program — every day was empty. Add exercises, a custom name, or a free-write pad to at least one day first.',
      })
      return
    }
    for (const exercise of draft.exercises) upsertExercise(exercise)
    const id = createProgram(draft.program)
    go('program-detail', { programId: id })
  }

  return (
    <Page>
      <ScreenHeader title="Plan" subtitle="Week timeline · colour-coded days" />
      <PlanSubNav value="plan" />
      {board ? (
        <div data-plan-bd={board.id} className="space-y-3">
          <label className="block text-xs text-muted">
            Board name
            <Input
              aria-label="Board name"
              value={board.name}
              onChange={(event) => save({ ...board, name: event.target.value, updatedAt: new Date().toISOString() })}
            />
          </label>
          {state.planBoards.length > 1 ? (
            <Select
              aria-label="Choose board"
              value={board.id}
              onChange={(event) => {
                setActiveBoard(event.target.value)
                setWeekId(null)
              }}
            >
              {state.planBoards.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          ) : null}
          {board.loadImport?.note ? <p className="text-xs text-muted">{board.loadImport.note}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const id = createBoard('New board')
                setActiveBoard(id)
                setWeekId(null)
              }}
            >
              New
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button size="sm" variant="secondary" onClick={() => go('program-builder')}>
              Program builder
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!week) {
                  const added = addWeek(board)
                  const day = addDay(added.board, added.weekId, { name: 'Free write', focus: 'Free write' })
                  if (day) save(day.board)
                  setWeekId(added.weekId)
                  return
                }
                const day = addDay(board, week.id, { name: 'Free write', focus: 'Free write' })
                if (day) save(day.board)
              }}
            >
              Free write
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const added = addWeek(board)
                save(added.board)
                setWeekId(added.weekId)
              }}
            >
              Week
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!week) {
                  toast({ tone: 'error', text: 'Add a week before adding a day.' })
                  return
                }
                const day = addDay(board, week.id)
                if (day) save(day.board)
              }}
            >
              Day
            </Button>
            <Button size="sm" data-use-as-program="true" onClick={() => void useAsProgram()}>
              Use as program
            </Button>
            <Button size="sm" variant="secondary" data-commit-calendar="true" onClick={() => setCommitOpen(true)}>
              Commit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-clear-board="true"
              onClick={() => {
                void confirm(
                  `Clear board “${board.name}”?\n\nRemoves exercises and pads from every week and day. Structure (weeks/days) stays. This persists — seed content will not come back.`,
                ).then((ok) => {
                  if (ok) save(clearBoard(board))
                })
              }}
            >
              Clear board
            </Button>
            {state.planBoards.length > 1 ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  void confirm(`Delete board “${board.name}”?\n\nThis removes the board entirely.`).then((ok) => {
                    if (ok) deleteBoard(board.id)
                  })
                }}
              >
                Delete board
              </Button>
            ) : null}
          </div>
          <div data-plan-timeline="true" className="space-y-3">
            <div data-week-tabs="true" className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Weeks">
              {board.weeks.map((item) => {
                const selected = item.id === week?.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={`min-h-11 shrink-0 rounded-full border px-3 text-sm ${selected ? 'border-lime bg-lime/10 font-semibold' : 'border-charcoal-4 text-muted'}`}
                    onClick={() => setWeekId(item.id)}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
            <p data-week-count={board.weeks.length} className="text-xs text-muted">
              {board.weeks.length} week{board.weeks.length === 1 ? '' : 's'}
            </p>
            {week ? (
              <section data-week-card={week.id} className="space-y-3 rounded-2xl border border-charcoal-4 bg-charcoal p-3">
                <Input
                  aria-label="Week name"
                  value={week.label}
                  onChange={(event) => save(renameWeek(board, week.id, event.target.value))}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const copy = duplicateWeek(board, week.id)
                      if (!copy) return
                      save(copy.board)
                      setWeekId(copy.weekId)
                    }}
                  >
                    Duplicate
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-clear-week={week.id}
                    onClick={() => {
                      const count = week.days.length
                      void confirm(
                        `Clear ${week.label}?\n\nRemoves exercises and pads from all ${count} day${count === 1 ? '' : 's'}. The week row stays — use Delete to remove it.`,
                      ).then((ok) => {
                        if (ok) save(clearWeek(board, week.id))
                      })
                    }}
                  >
                    Clear week
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    data-delete-week={week.id}
                    onClick={() => {
                      void confirm(
                        `Delete ${week.label}?\n\nRemoves the week and all its days from the board. You can delete down to an empty timeline.`,
                      ).then((ok) => {
                        if (!ok) return
                        save(deleteWeek(board, week.id))
                        setWeekId(null)
                      })
                    }}
                  >
                    Delete week
                  </Button>
                </div>
                <div data-plan-day-view="true" className="space-y-3">
                  {week.days.length === 0 ? <p className="text-sm text-muted">Empty board</p> : null}
                  {week.days.map((day) => (
                    <DayCard
                      key={day.id}
                      day={day}
                      weekLabel={week.label}
                      exercises={state.exercises}
                      weightUnit={state.weightUnit}
                      liftMaxes={state.liftMaxes}
                      onChange={(next) => save(updateDay(board, day.id, () => next))}
                      onClear={() => {
                        void confirm(
                          `Clear day “${day.name || 'Day'}”?\n\nRemoves exercises and session pad. The day card stays.`,
                        ).then((ok) => {
                          if (ok) save(clearDay(board, day.id))
                        })
                      }}
                      onDelete={() => {
                        void confirm(
                          `Delete day “${day.name || 'Day'}”?\n\nRemoves this day card from ${week.label}.`,
                        ).then((ok) => {
                          if (ok) save(deleteDay(board, day.id))
                        })
                      }}
                      onEditSets={() => setRxDayId(day.id)}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <EmptyState title="Empty board" body="Add a week, then a day, to start the timeline." />
            )}
          </div>
        </div>
      ) : (
        <EmptyState
          title="Blank timeline"
          body="New board, rename, and import from the library start a plan you can turn into a program."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  const id = createBoard('New board')
                  setActiveBoard(id)
                }}
              >
                New board
              </Button>
              <Button variant="secondary" onClick={() => go('program-builder')}>
                Program builder
              </Button>
            </div>
          }
        />
      )}
      <ImportSheet
        board={board}
        open={importOpen}
        exercises={state.exercises}
        programs={state.programs}
        weightUnit={state.weightUnit}
        onClose={() => setImportOpen(false)}
        onBoard={(next) => {
          save(next)
          toast({ tone: 'ok', text: 'Imported onto the board.' })
        }}
      />
      {commitOpen && board ? <CommitToCalendar source={{ kind: 'board', board }} onClose={() => setCommitOpen(false)} /> : null}
      <RxSheet
        day={rxDay}
        open={rxDay != null}
        exercises={state.exercises}
        weightUnit={state.weightUnit}
        liftMaxes={state.liftMaxes}
        onClose={() => setRxDayId(null)}
        onChange={(next) => {
          if (!board) return
          save(updateDay(board, next.id, () => next))
        }}
      />
    </Page>
  )
}
