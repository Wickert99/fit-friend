import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Program, ProgramDay } from '../../types.ts'
import type { CoachProfile } from './profile.ts'
import { daysUntil, mergeLlmPicks, rankPrograms, readLlmPicks } from './recommend.ts'

function days(count: number): ProgramDay[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `d${index}`,
    name: `Day ${index + 1}`,
    focus: 'Strength',
    exercises: [],
  }))
}

function program(partial: Partial<Program> & Pick<Program, 'id' | 'name'>): Program {
  return {
    description: '',
    theme: 'Strength',
    sports: ['Rugby'],
    weeks: 4,
    isTemplate: true,
    isMine: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    days: days(8),
    ...partial,
  }
}

const profile: CoachProfile = {
  goals: ['strength'],
  sport: 'Rugby',
  season: 'preseason',
  experience: 'intermediate',
}

describe('rules recommender', () => {
  const now = new Date(2026, 9, 15, 9, 0, 0)

  it('scores a tagged strength block as a strong rugby fit', () => {
    const [hit] = rankPrograms(profile, [program({ id: 'rugby', name: 'Rugby Strength' })], 5, now)
    assert.ok(hit)
    assert.equal(hit.score, 16)
    assert.equal(hit.match, 'strong')
    assert.deepEqual(hit.reasons, [
      'Theme “Strength” aligns with goal “Strength”',
      'Explicitly tagged for Rugby',
      'Theme suits pre-season',
      'Typical intermediate block length',
    ])
    assert.equal(
      hit.rationale,
      'Strong fit for Strength · tagged Rugby — Theme “Strength” aligns with goal “Strength”. pre-season bias applied.',
    )
  })

  it('drops a zero-score template and every non-template', () => {
    const yoga = program({
      id: 'yoga',
      name: 'Yoga Flow',
      theme: 'Mobility',
      sports: ['Yoga'],
      description: 'A slow mobility flow',
      weeks: 2,
      days: days(2),
    })
    const mine = program({ id: 'mine', name: 'Rugby Strength', isTemplate: false, isMine: true })
    assert.deepEqual(rankPrograms(profile, [yoga, mine], 5, now), [])
  })

  it('applies the beginner olympic penalty and a near-term competition bump', () => {
    const olympic = program({
      id: 'oly',
      name: 'Olympic lifting',
      theme: 'Power',
      sports: ['General Athletic'],
      description: 'Olympic lifting',
      weeks: 4,
      days: days(8),
    })
    const beginner: CoachProfile = {
      goals: ['power'],
      sport: 'Other',
      season: 'offseason',
      experience: 'beginner',
    }
    const [hit] = rankPrograms(beginner, [olympic], 5, now)
    assert.equal(hit?.score, 12)
    assert.equal(hit?.match, 'strong')

    const soon: CoachProfile = { ...profile, competitionDate: '2026-10-20' }
    const [fresh] = rankPrograms(soon, [program({ id: 'short', name: 'Peaking', theme: 'Power', weeks: 2, days: days(4) })], 5, now)
    assert.ok(fresh?.reasons.some((reason) => reason.includes('5d to competition')))
    assert.equal(daysUntil('2026-10-16', now), 1)
    assert.equal(daysUntil('nope', now), null)
  })

  it('sorts ties by name and respects the limit', () => {
    const ranked = rankPrograms(
      profile,
      [program({ id: 'b', name: 'Beta' }), program({ id: 'a', name: 'Alpha' })],
      1,
      now,
    )
    assert.deepEqual(ranked.map((item) => item.program.name), ['Alpha'])
  })
})

describe('llm pick merge', () => {
  it('parses fenced JSON and pads with rule results', () => {
    const picks = readLlmPicks('```json\n{"picks":[{"id":"b","reason":"Coach likes the hinge"}]}\n```')
    assert.deepEqual(picks, [{ id: 'b', reason: 'Coach likes the hinge' }])
    const alpha = program({ id: 'a', name: 'Alpha' })
    const beta = program({ id: 'b', name: 'Beta' })
    const rules = rankPrograms(profile, [alpha, beta], 8)
    const merged = mergeLlmPicks(picks ?? [], [alpha, beta], rules, 2)
    assert.equal(merged?.[0]?.program.id, 'b')
    assert.equal(merged?.[0]?.match, 'strong')
    assert.equal(merged?.[0]?.rationale, 'Coach likes the hinge')
    assert.equal(merged?.[1]?.program.id, 'a')
    assert.equal(mergeLlmPicks([{ id: 'missing', reason: 'nope' }], [alpha], rules, 2), null)
  })
})
