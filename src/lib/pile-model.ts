import model from "@/lib/pile-model.json"
import type { EmployerTier } from "@/lib/tiers"
import type { Posting } from "@/lib/types"

/**
 * How many people apply to a posting, relative to a typical one: a ridge regression of the applicant counts LinkedIn showed on 1,246 of our own
 * Dutch postings (783 employers) against what the app knows about a posting when it works out a chance. Cross-validated by employer, it ranks
 * postings by their pile (Spearman +0.30 against +0.06 for the hand-set tier constants it replaces) and is off by a factor 1.6 against 1.9
 * (scripts/research/pile_fit.py, which writes pile-model.json).
 *
 * It gives the SHAPE of the pile, not its level. A count on LinkedIn is one site, often a bound ("first 25", "over 200") and read early in a
 * posting's life, so its level cannot be trusted. The level stays at the typical European posting (Greenhouse 2026: 183 applications), and each
 * posting moves up or down from it by what the model says: Data and software jobs, banking, the Randstad and entry-level jobs draw more; sales,
 * IT, accounting and smaller cities fewer. It is kept within a factor 2.2 either way.
 */
const ANCHOR = 180
const RELATIVE_MIN = 0.45
const RELATIVE_MAX = 2.2
/**
 * The tier of the employer (tiers.ts) is in the model, and our counts show almost no effect of it (elite +4%). The old assumption was that the most
 * sought-after employers draw several times the pile (Greenhouse). A count on one site cannot refute that, so half of it is kept, on the log scale.
 */
const TIER_PRIOR: Record<EmployerTier, number> = { elite: Math.sqrt(600 / 180), large: Math.sqrt(220 / 180), mid: Math.sqrt(150 / 180), small: Math.sqrt(60 / 180), unknown: 1 }

type Categorical = Record<string, Record<string, number>>
const cat = model.categorical as Categorical
const vocab = model.vocab as Record<string, string[]>
const numeric = model.numeric as Record<string, { mean: number; sd: number; coef: number }>

const cityOf = (region: string | null | undefined): string => (region ?? "").split(",")[0].trim().toLowerCase()

/** The coefficient of one value of one categorical feature: 0 for a value that is missing (not a kind of posting), "other" for one the model did not see often. */
function weight(feature: string, value: string | null | undefined): number {
  if (value === null || value === undefined || value === "" || value === "none") return 0
  const seen = vocab[feature] ?? []

  return cat[feature]?.[seen.includes(value) ? value : "other"] ?? 0
}

/** log(pile) of this posting in the model's own terms (the level is not used: see ANCHOR). */
function logPile(post: Posting, tier: EmployerTier): number {
  const numbers: Record<string, number> = {
    intern: /intern|stage|stagiair/i.test(post.title) ? 1 : 0,
    years: Math.min(8, Math.max(-1, post.years_min ?? -1)),
    pay: post.pay_posted ? 1 : 0,
    sponsor: post.ind_sponsor ? 1 : 0,
  }
  let z = model.intercept
  for (const [name, spec] of Object.entries(numeric)) z += spec.coef * ((numbers[name] - spec.mean) / spec.sd)
  const city = cityOf(post.region)
  z += weight("level_view", post.level_view)
  z += weight("family", post.family)
  z += weight("industry", post.industry)
  z += weight("workplace", post.workplace)
  z += weight("job_type", post.job_type)
  z += weight("degree_asked", post.degree_asked)
  z += weight("tier", tier)
  z += weight("city", city)

  return z
}

/** How many people apply to this posting. */
export function pileSize(post: Posting, tier: EmployerTier): number {
  const relative = Math.min(RELATIVE_MAX, Math.max(RELATIVE_MIN, Math.exp(logPile(post, tier) - model.mean_fitted)))

  return Math.round(ANCHOR * relative * TIER_PRIOR[tier])
}
