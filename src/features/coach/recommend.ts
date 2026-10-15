import type { Program } from '../../types.ts'
import { goalLabel, type CoachProfile, type SeasonId } from './profile.ts'

const GOAL_THEMES: Record<string, string[]> = {
  strength: ['Strength'],
  power: ['Power'],
  hypertrophy: ['Hypertrophy'],
  endurance: ['Endurance'],
  mobility: ['Mobility'],
  speed: ['Power', 'Endurance'],
  rehab: ['Strength', 'Mobility'],
  body_control: ['Mobility', 'Strength'],
}

const SEASON_THEMES: Record<SeasonId, string[]> = {
  offseason: ['Hypertrophy', 'Strength', 'Mobility'],
  preseason: ['Power', 'Strength', 'Endurance'],
  inseason: ['Power', 'Endurance', 'Mobility'],
  return: ['Mobility', 'Strength', 'Endurance'],
}

const SEASON_BIAS: Record<SeasonId, string> = {
  offseason: 'off-season',
  preseason: 'pre-season',
  inseason: 'in-season',
  return: 'return / rebuild',
}

const GOAL_CUES: Record<string, RegExp[]> = {
  strength: [/5\s*[×x]\s*5/, /upper\s*\/\s*lower/, /positional/, /linear/, /max strength/, /masters strength/],
  power: [/olympic|oly\b/, /jump|plyo/, /athletic power/, /speed-?power/, /cod|decel/, /explos/],
  hypertrophy: [/ppl\b/, /off-?season/, /hypertrophy/, /volume/, /muscle/],
  endurance: [/zone-?2/, /tempo/, /hiit/, /hill/, /aerobic/, /engine/, /capacity/, /conditioner/],
  mobility: [/mobility/, /yoga/, /stretch/, /flow/],
  speed: [/sprint/, /speed/, /acceleration/, /in-?season speed/],
  rehab: [/return/, /r2r/, /graded/, /rehab/, /rebuild/, /return-to-run/],
  body_control: [/pilates/, /core/, /mat-?work/, /body control/, /foundations/],
}

const SPORT_PATTERNS: Record<string, RegExp> = {
  Rugby: /rugby|forward|back.?line|contact/,
  AFL: /\bafl\b|aussie rules|footballer/,
  Running: /run|tempo|zone-?2|return-to-run|road/,
  CrossFit: /crossfit|mixed.?modal|gymnastics|engine/,
  Basketball: /basketball|court|jump/,
  Swimming: /swim|dryland|pool/,
  Cycling: /cycl|bike|watt/,
  Yoga: /yoga|mobility flow/,
  'General Athletic': /athletic|general|youth|masters/,
}

const NAMED_SEASON: Record<SeasonId, RegExp> = {
  offseason: /off-?season/,
  preseason: /pre-?season/,
  inseason: /in-?season/,
  return: /return|rebuild|rehab/,
}

export type MatchLevel = 'strong' | 'good' | 'soft'

export interface RankedProgram {
  program: Program
  score: number
  reasons: string[]
  match: MatchLevel
  rationale: string
}

export interface LlmPick {
  id: string
  reason: string
}

export function matchLevel(score: number): MatchLevel {
  if (score >= 12) return 'strong'
  if (score >= 7) return 'good'
  return 'soft'
}

export function daysUntil(iso: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function programText(program: Program): string {
  return `${program.name} ${program.description} ${program.theme} ${program.sports.join(' ')}`.toLowerCase()
}

function rationale(program: Program, profile: CoachProfile, reasons: string[], match: MatchLevel): string {
  const goals = profile.goals.map(goalLabel).join(', ')
  const lead =
    match === 'strong' ? `Strong fit for ${goals}` : match === 'good' ? `Solid fit for ${goals}` : `Partial fit for ${goals}`
  const tagged = profile.sport !== 'Other' && program.sports.includes(profile.sport) ? ` · tagged ${profile.sport}` : ''
  const because = reasons[0] ? ` — ${reasons[0]}` : ''
  const bias = SEASON_BIAS[profile.season] ?? profile.season
  return `${lead}${tagged}${because}. ${bias} bias applied.`
}

function scoreProgram(program: Program, profile: CoachProfile, now: Date): RankedProgram {
  let score = 0
  const reasons: string[] = []
  const text = programText(program)
  const dayCount = program.days.length
  const sessionsPerWeek = program.weeks > 0 ? dayCount / Math.max(1, program.weeks) : dayCount

  for (const goal of profile.goals) {
    if ((GOAL_THEMES[goal] ?? []).includes(program.theme)) {
      score += 5
      reasons.push(`Theme “${program.theme}” aligns with goal “${goalLabel(goal)}”`)
    }
    for (const cue of GOAL_CUES[goal] ?? []) {
      if (cue.test(text)) {
        score += 4
        reasons.push(`Copy matches “${goalLabel(goal)}” cues`)
        break
      }
    }
  }

  if (profile.sport === 'Other') {
    if (program.sports.includes('General Athletic')) {
      score += 2
      reasons.push('General athletic — good when sport is open')
    }
  } else if (program.sports.includes(profile.sport)) {
    score += 6
    reasons.push(`Explicitly tagged for ${profile.sport}`)
  } else if (SPORT_PATTERNS[profile.sport]?.test(text)) {
    score += 3
    reasons.push(`Description leans toward ${profile.sport}`)
  } else if (program.sports.includes('General Athletic')) {
    score += 1
    reasons.push('General athletic template (flexible across sports)')
  }

  const seasonThemes = SEASON_THEMES[profile.season]
  if (seasonThemes?.includes(program.theme)) {
    score += 3
    reasons.push(`Theme suits ${SEASON_BIAS[profile.season]}`)
  }
  const named = NAMED_SEASON[profile.season] ?? NAMED_SEASON.return
  if (named.test(text)) {
    score += 3
    reasons.push(`Named for ${SEASON_BIAS[profile.season] ?? profile.season} work`)
  }

  if (profile.experience === 'beginner') {
    if (program.weeks <= 4 && dayCount <= 12 && sessionsPerWeek <= 4) {
      score += 3
      reasons.push('Short block, manageable session count for beginners')
    }
    if (/intro|foundations|youth|masters mobility/i.test(text)) {
      score += 2
      reasons.push('Intro / foundations tone')
    }
    if (program.theme === 'Power' && /olympic|oly/i.test(text)) score -= 2
  }
  if (profile.experience === 'intermediate' && program.weeks >= 3 && program.weeks <= 8) {
    score += 2
    reasons.push('Typical intermediate block length')
  }
  if (profile.experience === 'advanced') {
    if (program.theme === 'Power' || program.weeks >= 4 || sessionsPerWeek >= 4) {
      score += 2
      reasons.push('Enough volume / intensity for advanced athletes')
    }
    if (/positional|olympic|oly|hiit|cod/i.test(text)) {
      score += 2
      reasons.push('Advanced method cues (specialty / high skill)')
    }
  }

  if (profile.competitionDate) {
    const days = daysUntil(profile.competitionDate, now)
    if (days !== null) {
      if (days < 21) {
        if (program.theme === 'Power' || program.theme === 'Mobility' || program.weeks <= 3) {
          score += 3
          reasons.push(`${days}d to competition → short / freshness-oriented`)
        }
        if (program.theme === 'Hypertrophy' && program.weeks >= 6) score -= 2
      } else if (days > 60) {
        if (program.theme === 'Hypertrophy' || program.theme === 'Strength' || program.theme === 'Endurance') {
          score += 3
          reasons.push(`${days}d runway → base / hypertrophy / strength OK`)
        }
      } else if (days >= 21 && days <= 60 && SEASON_THEMES.preseason.includes(program.theme)) {
        score += 2
        reasons.push('Mid runway → pre-season style themes')
      }
    }
  }

  if (profile.goals.length >= 2 && profile.goals.filter((goal) => (GOAL_THEMES[goal] ?? []).includes(program.theme)).length >= 2) {
    score += 2
    reasons.push('Covers more than one of your selected goals')
  }

  const unique = [...new Set(reasons)].slice(0, 4)
  const match = matchLevel(score)
  return { program, score, reasons: unique, match, rationale: rationale(program, profile, unique, match) }
}

/** Rules scorer over template programs. Non-templates and zero scores are dropped. */
export function rankPrograms(profile: CoachProfile, programs: Program[], limit = 5, now = new Date()): RankedProgram[] {
  return programs
    .filter((program) => program.isTemplate)
    .map((program) => scoreProgram(program, profile, now))
    .sort((left, right) => right.score - left.score || left.program.name.localeCompare(right.program.name))
    .filter((item) => item.score > 0)
    .slice(0, limit)
}

/**
 * Merges Edge Function picks ahead of the rules list.
 * Returns null when none of the picks resolve to a known program.
 */
export function readLlmPicks(data: unknown): LlmPick[] | null {
  if (typeof data === 'string') {
    try {
      return readLlmPicks(JSON.parse(data.replace(/```json|```/g, '').trim()))
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object' || !('picks' in data)) return null
  const picks = (data as { picks?: unknown }).picks
  if (!Array.isArray(picks)) return null
  const parsed: LlmPick[] = []
  for (const pick of picks) {
    if (!pick || typeof pick !== 'object' || !('id' in pick) || typeof pick.id !== 'string') continue
    const reason = 'reason' in pick && typeof pick.reason === 'string' ? pick.reason : ''
    parsed.push({ id: pick.id, reason })
  }
  return parsed
}

export function mergeLlmPicks(picks: LlmPick[], programs: Program[], rules: RankedProgram[], limit: number): RankedProgram[] | null {
  const byId = new Map(programs.map((program) => [program.id, program]))
  const ranked: RankedProgram[] = []
  for (const pick of picks) {
    const program = byId.get(pick.id)
    if (!program) continue
    const rule = rules.find((item) => item.program.id === pick.id)
    ranked.push({
      program,
      score: rule?.score ?? 10,
      reasons: [pick.reason, ...(rule?.reasons ?? [])].slice(0, 4),
      match: 'strong',
      rationale: pick.reason,
    })
  }
  if (ranked.length === 0) return null
  for (const rule of rules) {
    if (ranked.length >= limit) break
    if (!ranked.some((item) => item.program.id === rule.program.id)) ranked.push(rule)
  }
  return ranked.slice(0, limit)
}
