import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { TrainSubNav } from '../../app/TabSubNav.tsx'
import { useStore } from '../../store/useStore.ts'
import type { Program, SeasonGoals } from '../../types.ts'
import { Badge, Button, Card, Chip, Input, Page, ScreenHeader, SectionLabel } from '../../ui/index.ts'
import CommitToCalendar from '../calendar/CommitToCalendar.tsx'
import { ImportToPlan } from '../programs/ImportToPlan.tsx'
import { recommendPrograms } from './llm.ts'
import { COACH_SPORTS, EXPERIENCE_OPTIONS, GOAL_OPTIONS, isExperienceId, isSeasonId, SEASON_OPTIONS, type CoachProfile, type ExperienceId, type SeasonId } from './profile.ts'
import type { RankedProgram } from './recommend.ts'

export default function CoachScreen() {
  const { state, go, setActiveProgram, cloneProgram, updateSeasonGoals } = useStore()
  const stored = state.seasonGoals
  const goals = stored.goals ?? ['strength']
  const sport = stored.sport ?? 'General Athletic'
  const season: SeasonId = isSeasonId(stored.season) ? stored.season : 'preseason'
  const experience: ExperienceId = isExperienceId(stored.experience) ? stored.experience : 'intermediate'
  const competitionDate = stored.competitionDate ?? ''
  const competitionLabel = stored.competitionLabel ?? ''
  const seasonStart = stored.seasonStartDate ?? stored.prepStart ?? ''
  const [matching, setMatching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [source, setSource] = useState<'rules' | 'llm'>('rules')
  const [ranked, setRanked] = useState<RankedProgram[]>([])
  const [importProgram, setImportProgram] = useState<Program | null>(null)
  const [commitProgram, setCommitProgram] = useState<Program | null>(null)

  const profile = (): CoachProfile => ({
    goals,
    sport,
    season,
    experience,
    competitionDate: competitionDate || undefined,
  })

  const persist = (patch: Partial<SeasonGoals> = {}) => {
    const start = patch.seasonStartDate !== undefined ? patch.seasonStartDate : seasonStart || undefined
    updateSeasonGoals({
      goals,
      sport,
      season,
      experience,
      competitionDate: competitionDate || undefined,
      competitionLabel: competitionLabel.trim() || undefined,
      seasonStartDate: start || undefined,
      prepStart: start || undefined,
      ...patch,
    })
  }

  const recommend = async () => {
    setShowResults(true)
    setMatching(true)
    persist()
    try {
      const result = await recommendPrograms(profile(), state.programs, 5)
      setRanked(result.ranked)
      setSource(result.source)
    } finally {
      setMatching(false)
    }
  }

  const active = state.programs.find((program) => program.id === state.activeProgramId)
  const maxCount = Object.keys(state.liftMaxes ?? {}).length

  return (
    <Page>
      <ScreenHeader title="Coach" subtitle="Smart matches from seeded templates" />
      <TrainSubNav value="coach" />
      <Card className="border-lime/25">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-lime" />
          <p className="text-xs text-muted" data-coach-intro="true">
            Match programs to your goals, sport, season and competition window. Your competition date drives the season countdown on Progress and Today.
          </p>
        </div>
      </Card>
      <Card data-season-goals="true">
        <SectionLabel>Season & competition</SectionLabel>
        <p className="mt-1 text-xs text-muted">Saved to this device. Macrocycle counts down to the competition date when set.</p>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted" htmlFor="comp-date">
              Competition date
            </label>
            <Input
              id="comp-date"
              type="date"
              value={competitionDate}
              onChange={(event) => {
                setShowResults(false)
                persist({ competitionDate: event.target.value || undefined })
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted" htmlFor="comp-name">
              Event name (optional)
            </label>
            <Input
              id="comp-name"
              type="text"
              placeholder="e.g. Club champs"
              value={competitionLabel}
              onChange={(event) => {
                const value = event.target.value
                persist({ competitionLabel: value.trim() ? value : undefined })
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted" htmlFor="season-start">
              Prep / season start (optional)
            </label>
            <Input
              id="season-start"
              type="date"
              value={seasonStart}
              onChange={(event) => {
                const value = event.target.value || undefined
                persist({ seasonStartDate: value, prepStart: value })
              }}
            />
          </div>
          {competitionDate ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                persist({
                  competitionDate: undefined,
                  competitionLabel: undefined,
                  seasonStartDate: undefined,
                  prepStart: undefined,
                })
              }
            >
              Clear competition dates
            </Button>
          ) : null}
        </div>
        {active ? (
          <p className="mt-3 text-xs text-muted">
            Active program: <span className="font-medium text-ink">{active.name}</span> · {active.weeks}-week block (drives meso / micro).
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted">No active program — set one from Programs or Commit below to drive meso / micro.</p>
        )}
      </Card>
      <Card data-coach-maxes="true" className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Maxes · {maxCount || 'none yet'}</p>
          <p className="text-xs text-muted">Coach uses your 1RMs for % loads. Edit them in Progress.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => go('workout', { workoutTab: 'maxes' })}>
          Open Maxes
        </Button>
      </Card>
      <section className="space-y-2">
        <SectionLabel>Goals (up to 3)</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.map((goal) => (
            <Chip
              key={goal.id}
              active={goals.includes(goal.id)}
              onClick={() => {
                const next = goals.includes(goal.id)
                  ? goals.filter((id) => id !== goal.id)
                  : goals.length >= 3
                    ? [...goals.slice(1), goal.id]
                    : [...goals, goal.id]
                setShowResults(false)
                persist({ goals: next })
              }}
            >
              {goal.label}
            </Chip>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <SectionLabel>Sport</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {COACH_SPORTS.map((item) => (
            <Chip
              key={item}
              active={sport === item}
              onClick={() => {
                setShowResults(false)
                persist({ sport: item })
              }}
            >
              {item}
            </Chip>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <SectionLabel>Season / phase</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {SEASON_OPTIONS.map((item) => (
            <Chip
              key={item.id}
              active={season === item.id}
              onClick={() => {
                setShowResults(false)
                persist({ season: item.id })
              }}
            >
              {item.label}
            </Chip>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <SectionLabel>Experience</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {EXPERIENCE_OPTIONS.map((item) => (
            <Chip
              key={item.id}
              active={experience === item.id}
              onClick={() => {
                setShowResults(false)
                persist({ experience: item.id })
              }}
            >
              {item.label}
            </Chip>
          ))}
        </div>
      </section>
      <Button size="lg" className="w-full" disabled={goals.length === 0 || matching} onClick={() => void recommend()}>
        <Sparkles className="h-4 w-4" /> {matching ? 'Matching…' : 'Recommend programs'}
      </Button>
      {showResults ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Recommended for you</SectionLabel>
            <Badge tone={source === 'llm' ? 'lime' : 'steel'}>{source === 'llm' ? 'Smart match' : 'Matched to your goals'}</Badge>
          </div>
          {matching && ranked.length === 0 ? <p className="text-sm text-muted">Matching templates…</p> : null}
          {!matching && ranked.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">No strong matches — browse Workout → Programs or try different goals.</p>
            </Card>
          ) : (
            ranked.map(({ program, reasons, score, rationale, match }) => (
              <Card key={program.id} data-coach-rec="true">
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="lime">{program.theme}</Badge>
                  {program.sports.slice(0, 2).map((item) => (
                    <Badge key={item}>{item}</Badge>
                  ))}
                  <Badge tone={match === 'strong' ? 'success' : match === 'good' ? 'lime' : 'steel'}>
                    {match} · {score}
                  </Badge>
                </div>
                <p className="mt-2 font-semibold">{program.name}</p>
                <p className="mt-1 text-sm text-ink/90">{rationale}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{program.description}</p>
                <ul className="mt-2 list-inside list-disc text-xs text-muted">
                  {reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => go('program-detail', { programId: program.id })}>
                    Open
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setCommitProgram(program)}>
                    Commit
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setImportProgram(program)}>
                    Import to Plan
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const id = cloneProgram(program.id)
                      if (!id) return
                      setActiveProgram(id)
                      go('program-detail', { programId: id })
                    }}
                  >
                    Clone
                  </Button>
                </div>
              </Card>
            ))
          )}
        </section>
      ) : null}
      <ImportToPlan program={importProgram} open={importProgram != null} onClose={() => setImportProgram(null)} />
      {commitProgram ? (
        <CommitToCalendar source={{ kind: 'program', program: commitProgram }} onClose={() => setCommitProgram(null)} />
      ) : null}
    </Page>
  )
}
