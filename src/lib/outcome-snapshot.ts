import { oddsV2, type V2Context } from "@/lib/odds-v2"
import { employerTier } from "@/lib/tiers"
import type { Posting, Profile } from "@/lib/types"

/**
 * What is kept when someone marks a job applied, for the outcome loop (docs/ENGINE_DATA_PLAN.md step E, table chance_snapshots):
 * the chance odds showed, and what it was worked out from, so that when they hear back (or do not) the model can be checked against
 * what happened. Only numbers: one score per factor (the same shape as research-data/backtest/parts.jsonl, so learn.py can read it),
 * and a few facts about the posting. No CV text, no name, no employer name and no job title.
 */

/** Names the model that made the number: change it whenever the engine changes in a way that moves the chance. */
export const SNAPSHOT_MODEL = "odds-v2.4-other-channels"

export interface ChanceSnapshot {
  posting_id: string
  model: string
  chance: number
  low: number
  high: number
  snapshot: {
    parts: Record<string, number>
    reviewing: number
    pile: { applicants: number; interviews: number; source: string }
    referral: boolean
    post: { family: string | null; level: string | null; days_open: number | null; applicants: number | null; source: string; ats: string; dutch_required: boolean; ind_sponsor: boolean; employer_tier: string; has_deadline: boolean }
  }
}

const round = (x: number, digits = 4): number => Math.round(x * 10 ** digits) / 10 ** digits

export function chanceSnapshot(post: Posting, profile: Profile, ctx: V2Context = {}): ChanceSnapshot {
  const v2 = oddsV2(post, profile, ctx)
  const parts: Record<string, number> = {}
  for (const p of v2.parts) parts[p.key] = round(p.z)

  return {
    posting_id: post.id,
    model: SNAPSHOT_MODEL,
    chance: round(v2.p),
    low: round(v2.low),
    high: round(v2.high),
    snapshot: {
      parts,
      reviewing: round(v2.reviewing),
      pile: { applicants: Math.round(v2.pile.applicants), interviews: v2.pile.interviews, source: v2.pile.source },
      referral: ctx.referral === true,
      post: {
        family: post.family ?? null,
        level: post.level_view ?? null,
        days_open: post.days_open ?? null,
        applicants: post.applicants ?? null,
        source: post.source,
        ats: post.ats,
        dutch_required: post.dutch_required,
        ind_sponsor: Boolean(post.ind_sponsor),
        employer_tier: employerTier(post.employer_display || post.employer, ctx.employerEmployees),
        has_deadline: Boolean(post.valid_through),
      },
    },
  }
}
