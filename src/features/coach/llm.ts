import { loadSupabase } from '../../lib/supabase/client.ts'
import type { Program } from '../../types.ts'
import type { CoachProfile } from './profile.ts'
import { mergeLlmPicks, rankPrograms, readLlmPicks, type RankedProgram } from './recommend.ts'

/**
 * Optional ranker. The browser calls the `coach-rank` Supabase Edge Function
 * and never sees a model API key. Missing env, a missing function, or a bad
 * payload all fall back to the rules list.
 *
 * Request body: `{ profile, catalog }` where catalog items are
 * `{ id, name, theme, sports, weeks, days, blurb }`.
 * Response: `{ picks: [{ id, reason }] }` (a fenced JSON string is also accepted).
 */
export const COACH_RANK_FUNCTION = 'coach-rank'

export interface RankResult {
  ranked: RankedProgram[]
  source: 'rules' | 'llm'
}

export async function recommendPrograms(profile: CoachProfile, programs: Program[], limit = 5): Promise<RankResult> {
  const rules = rankPrograms(profile, programs, Math.max(limit, 8))
  const fallback: RankResult = { ranked: rules.slice(0, limit), source: 'rules' }
  try {
    const supabase = await loadSupabase()
    if (!supabase) return fallback
    const catalog = programs
      .filter((program) => program.isTemplate)
      .map((program) => ({
        id: program.id,
        name: program.name,
        theme: program.theme,
        sports: program.sports,
        weeks: program.weeks,
        days: program.days.length,
        blurb: program.description.slice(0, 160),
      }))
    const { data, error } = await supabase.functions.invoke(COACH_RANK_FUNCTION, {
      body: { profile, catalog },
    })
    if (error) return fallback
    const picks = readLlmPicks(data)
    if (!picks) return fallback
    const merged = mergeLlmPicks(picks, programs, rules, limit)
    if (!merged) return fallback
    return { ranked: merged, source: 'llm' }
  } catch {
    return fallback
  }
}
