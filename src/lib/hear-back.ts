import { hasCvData } from "@/lib/engine"
import { oddsV2 } from "@/lib/odds-v2"
import type { Posting, Profile } from "@/lib/types"

/**
 * "Most likely to hear back": the jobs where you stand out most in the pile of applicants, as a tag on the job, not a list of its own.
 * A job gets it when both hold:
 *  - it is in your top TOP_SHARE of chances across the open jobs, so a beginner and a senior each see a handful, never none or all;
 *  - your chance is at least LIFT times what an average applicant to that job gets (interviews / applicants), so it marks where you
 *    stand out, not where everyone's chances are merely less bad.
 * Tried on a real profile against 2,092 jobs: 15% tagged 288 jobs, too many to mean anything; 5% leaves about a hundred.
 */
export const TOP_SHARE = 0.05
export const LIFT = 2

export interface HearBack {
  chance: number
  /** One sentence on why: how many apply, and what lifts you most. */
  reason: string
}

const cache = new WeakMap<Profile, WeakMap<Posting[], Map<string, HearBack>>>()

export function hearBackFor(postings: Posting[], profile: Profile, referrals: Set<string>, record: (post: Posting) => { value: number; detail: string } | null): Map<string, HearBack> {
  const byPool = cache.get(profile) ?? new WeakMap<Posting[], Map<string, HearBack>>()
  cache.set(profile, byPool)
  const hit = byPool.get(postings)
  if (hit) return hit
  const out = new Map<string, HearBack>()
  if (hasCvData(profile)) {
    const scored = postings.filter((p) => !p.closed_at).map((post) => ({ post, r: oddsV2(post, profile, { referral: referrals.has(post.id), record: record(post) }) }))
    // By rank, not by a cut-off value: many jobs can share one chance, and a tie must not carry the tag past the top share.
    const room = Math.max(1, Math.floor(scored.length * TOP_SHARE))
    const ranked = [...scored].sort((a, b) => b.r.p - a.r.p).slice(0, room)
    for (const { post, r } of ranked) {
      const average = r.pile.interviews / r.pile.applicants
      if (r.p < LIFT * average) continue
      const lift = r.parts.filter((x) => x.z > 0.05).sort((a, b) => b.z - a.z)[0]
      const pile = `about ${Math.round(r.pile.applicants)} people apply and about ${r.pile.interviews} are invited`
      out.set(post.id, { chance: r.p, reason: `You stand out here: ${pile}, and your chance is ${Math.round(r.p / average)} times an average applicant's${lift ? `, mainly because of ${lift.label.replace(/^Most relevant: /, "").replace(/ \((same|a neighbouring|another) line of work\)$/, "")}` : ""}.` })
    }
  }
  byPool.set(postings, out)

  return out
}
