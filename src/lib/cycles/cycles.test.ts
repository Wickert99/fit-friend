import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyState } from '../../store/normalize.ts'
import {
  applyCommit,
  assignProgramDay,
  buildCycleBlocks,
  clearCalendar,
  defaultCommitMode,
  defaultStartKey,
  deleteLoggedSession,
  findStretches,
  isLateInWeek,
  nextMondayKey,
  prepareBoardCommit,
  prepareProgramCommit,
  readSeason,
  summarizeCycles,
} from './index.ts'
import type { PlanBoard, Program, WorkoutSession } from '../../types.ts'

const TODAY = '2026-10-15'

function program(partial: Partial<Program> = {}): Program {
  return {
    id: 'prog-1',
    name: 'Strength block',
    description: 'Three days.',
    theme: 'Strength',
    sports: ['General Athletic'],
    weeks: 1,
    isTemplate: false,
    isMine: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    days: [
      { id: 'd-mon', name: 'Squat', weekday: 1, focus: 'Strength', exercises: [{ exerciseId: 'ex-bsquat', setType: 'reps_load', sets: 5, reps: '5', restSec: 180 }] },
      { id: 'd-wed', name: 'Bench', weekday: 3, focus: 'Strength', exercises: [{ exerciseId: 'ex-bp', setType: 'reps_load', sets: 5, reps: '5', restSec: 180 }] },
      { id: 'd-fri', name: 'Hinge', weekday: 5, focus: 'Strength', exercises: [{ exerciseId: 'ex-dl', setType: 'reps_load', sets: 3, reps: '5', restSec: 180 }] },
    ],
    ...partial,
  }
}

function ids() {
  let n = 0
  return (prefix: string) => `${prefix}-${++n}`
}

describe('commit dates', () => {
  it('moves a late-week start to the following Monday and refuses the past', () => {
    assert.equal(isLateInWeek('2026-10-15'), true)
    assert.equal(isLateInWeek('2026-10-14'), false)
    assert.equal(nextMondayKey('2026-10-15'), '2026-10-19')
    assert.equal(defaultStartKey(undefined, TODAY), '2026-10-19')
    assert.equal(defaultStartKey('2026-10-20', TODAY), '2026-10-20')
    assert.equal(defaultStartKey('2026-10-01', TODAY), '2026-10-19')
    assert.equal(defaultCommitMode(program()), 'weekday')
    assert.equal(defaultCommitMode(program({ days: [{ id: 'flex', name: 'A', focus: 'Strength', exercises: [] }] })), 'consecutive')
  })
})

describe('commit mapping', () => {
  it('pins template days onto weekdays and repeats the block', () => {
    const prepared = prepareProgramCommit(program({ weeks: 2 }), '2026-10-12', 'weekday', '2026-10-12')
    assert.ok(prepared)
    assert.deepEqual(
      prepared.preview.mappings.map((item) => `${item.dateKey}:${item.dayName}`),
      [
        '2026-10-12:Squat',
        '2026-10-14:Bench',
        '2026-10-16:Hinge',
        '2026-10-19:Squat',
        '2026-10-21:Bench',
        '2026-10-23:Hinge',
      ],
    )
    assert.equal(prepared.preview.repacked, 0)
  })

  it('repacks weekdays that would land before the start date', () => {
    const prepared = prepareProgramCommit(program(), '2026-10-14', 'weekday', '2026-10-14')
    assert.ok(prepared)
    assert.deepEqual(
      prepared.preview.mappings.map((item) => item.dateKey),
      ['2026-10-14', '2026-10-15', '2026-10-16'],
    )
    assert.equal(prepared.preview.repacked, 2)
    assert.match(prepared.preview.mappings[0]?.label ?? '', /Wed 14 Oct/)
  })

  it('places days back to back in board order', () => {
    const prepared = prepareProgramCommit(program({ weeks: 2 }), '2026-10-14', 'consecutive', '2026-10-14')
    assert.ok(prepared)
    assert.equal(prepared.preview.mappings.length, 6)
    assert.equal(prepared.preview.mappings[0]?.dateKey, '2026-10-14')
    assert.equal(prepared.preview.mappings[5]?.dateKey, '2026-10-19')
    assert.equal(prepared.preview.repacked, 0)
    const stretches = findStretches(prepared.preview.mappings, 5)
    assert.equal(stretches.length, 1)
    assert.equal(stretches[0]?.length, 6)
  })

  it('clamps a past start to today', () => {
    const prepared = prepareProgramCommit(program(), '2026-10-01', 'consecutive', TODAY)
    assert.equal(prepared?.preview.clampedToToday, true)
    assert.equal(prepared?.preview.mappings[0]?.dateKey, TODAY)
  })

  it('writes scheduled days, a planned session, and the active program', () => {
    const source = program()
    const prepared = prepareProgramCommit(source, '2026-10-12', 'weekday', '2026-10-12')
    assert.ok(prepared)
    const next = applyCommit({ ...emptyState(), programs: [source] }, prepared, '2026-10-12T08:00:00.000Z', ids())
    assert.equal(next.activeProgramId, 'prog-1')
    assert.equal(next.scheduled['2026-10-12'], 'd-mon')
    assert.equal(next.plannedSessions['2026-10-14']?.name, 'Bench')
    assert.equal(next.plannedSessions['2026-10-14']?.exercises[0]?.exerciseId, 'ex-bp')
    assert.equal(next.programInstances.length, 1)
    assert.equal(next.programInstances[0]?.firstSessionKey, '2026-10-12')
    assert.equal(next.programInstances[0]?.source, 'program')
  })

  it('commits a board in weekday order and keeps a placeholder exercise', () => {
    const board: PlanBoard = {
      id: 'board-1',
      name: 'Whiteboard',
      weeks: [
        {
          id: 'w1',
          label: 'Week 1',
          days: [
            {
              id: 'day-a',
              name: 'Push',
              focus: 'Strength',
              exercises: [{ exerciseId: 'ex-bp', setType: 'reps_load', sets: 3, reps: '8', restSec: 90 }],
            },
            {
              id: 'day-b',
              name: 'Notes',
              focus: 'Free write',
              sessionPad: 'Easy spin',
              exercises: [{ exerciseId: '', setType: 'reps_load', sets: 3, reps: '10', restSec: 60, placeholder: 'Sled drag' } as PlanBoard['weeks'][0]['days'][0]['exercises'][0]],
            },
            { id: 'day-c', name: 'Empty', exercises: [] },
          ],
        },
      ],
    }
    const prepared = prepareBoardCommit(board, '2026-10-12', 'weekday', '2026-10-12', ids(), '2026-10-12T00:00:00.000Z')
    assert.ok(prepared)
    assert.equal(prepared.preview.mappings.length, 2)
    assert.equal(prepared.newExercises[0]?.name, 'Sled drag')
    assert.equal(prepared.preview.mappings[0]?.dateKey, '2026-10-12')
    assert.equal(prepared.preview.mappings[1]?.dateKey, '2026-10-13')
    const next = applyCommit(emptyState(), prepared, '2026-10-12T00:00:00.000Z', ids())
    assert.equal(next.programs[0]?.name, 'Whiteboard')
    assert.equal(next.exercises[0]?.name, 'Sled drag')
    assert.equal(next.programInstances[0]?.source, 'board')
    assert.equal(next.programInstances[0]?.boardId, 'board-1')
  })
})

describe('calendar edits', () => {
  it('reassigns a day onto a program day and can clear the plan without history', () => {
    const source = program()
    let state = { ...emptyState(), programs: [source], sessions: [] }
    state = assignProgramDay(state, '2026-10-16', 'd-fri', '2026-10-16T00:00:00.000Z')
    assert.equal(state.scheduled['2026-10-16'], 'd-fri')
    assert.equal(state.plannedSessions['2026-10-16']?.programName, 'Strength block')
    state = clearCalendar(state, { clearPlanBoards: true })
    assert.deepEqual(state.scheduled, {})
    assert.deepEqual(state.plannedSessions, {})
    assert.deepEqual(state.programInstances, [])
  })

  it('drops a deleted log from PRs and the streak', () => {
    const logged: WorkoutSession = {
      id: 's1',
      name: 'Lower',
      dateKey: TODAY,
      status: 'completed',
      completedAt: '2026-10-15T18:00:00.000Z',
      exercises: [
        {
          exerciseId: 'ex-bsquat',
          setType: 'reps_load',
          sets: [{ setNumber: 1, reps: 5, loadKg: 100, completed: true }],
        },
      ],
    }
    const state = {
      ...emptyState(),
      sessions: [logged],
      prs: [{ exerciseId: 'ex-bsquat', loadKg: 100, reps: 5, dateKey: TODAY, sessionId: 's1' }],
      commitmentDays: [TODAY],
      activity: [{ id: 'a1', text: 'Session completed', createdAt: '2026-10-15T18:00:00.000Z', sessionId: 's1' }],
      profile: { ...emptyState().profile, streak: 1 },
    }
    const next = deleteLoggedSession(state, 's1', new Date('2026-10-15T20:00:00'))
    assert.equal(next.sessions.length, 0)
    assert.equal(next.prs.length, 0)
    assert.deepEqual(next.commitmentDays, [])
    assert.equal(next.activity.length, 0)
    assert.equal(next.profile.streak, 0)
  })
})

describe('training cycles', () => {
  it('keys the macro calendar to a competition date', () => {
    const state = {
      ...emptyState(),
      activeProgramId: 'prog-1',
      programs: [program({ weeks: 8 })],
      seasonGoals: {
        competitionDate: '2026-12-01',
        competitionLabel: 'Club finals',
        season: 'Pre-season',
        prepStart: '2026-09-01',
      },
      scheduled: { '2026-10-12': 'd-mon', '2026-10-14': 'd-wed' },
    }
    const season = readSeason(state.seasonGoals)
    assert.equal(season.competitionLabel, 'Club finals')
    assert.equal(season.phaseKey, 'preseason')
    assert.equal(season.seasonStart, '2026-09-01')
    const blocks = buildCycleBlocks(
      {
        activeProgram: state.programs[0] ?? null,
        instance: undefined,
        planWeekCount: undefined,
        blockStartKey: '2026-10-12',
        blockEndKey: '2026-10-14',
        committedKeys: ['2026-10-12', '2026-10-14'],
        seasonGoals: state.seasonGoals,
      },
      new Date('2026-10-15T12:00:00'),
    )
    const competition = blocks.find((block) => block.kind === 'competition')
    assert.equal(competition?.startKey, '2026-12-01')
    assert.equal(competition?.label, 'Club finals')
    const macro = blocks.find((block) => block.kind === 'macro')
    assert.equal(macro?.startKey, '2026-08-31')
    assert.ok(blocks.some((block) => block.kind === 'phase' && block.label === 'Pre-season'))
    assert.ok(blocks.some((block) => block.kind === 'micro'))
    const summary = summarizeCycles(state, {
      activeProgram: state.programs[0] ?? null,
      committedKeys: ['2026-10-12', '2026-10-14'],
      blockStartKey: '2026-10-12',
      blockEndKey: '2026-10-14',
      seasonGoals: state.seasonGoals,
    }, new Date('2026-10-15T12:00:00'))
    assert.equal(summary.macro.weeksOut, 7)
    assert.equal(summary.macro.competitionLabel, 'Club finals')
    assert.equal(summary.meso.weeksInBlock, 8)
  })
})
