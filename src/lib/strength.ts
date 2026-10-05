/**
 * How strong a person's track record is for one job: where they worked and in what position, what they have won, and the
 * grades they state. Jev reads each part of the saved profile once (Edge Function read-profile), against fixed categories,
 * and the answers are stored per part. This file turns those stored facts into a number for any job with plain rules, so the
 * same facts always give the same number and every step can be read and tested. No model call happens per job.
 *
 * What is measured and what is assumed (this is shown on the job page too):
 *   - Measured elsewhere: prestigious schools and employers raise employers' interest in a resume (Kessler, Low and
 *     Sullivan, Incentivized Resume Rating, 2019); adding grades raised callbacks for all applicants in a Dutch field
 *     experiment (Thijssen et al. 2021). Neither measures international students in the Netherlands.
 *   - Assumed by us: the scale below (how much each tier counts), which lines of work are next to each other, and how far
 *     the track record can lift the fit (fit.ts). The part only moves a person along the range the model already has
 *     (18% to 54% for a CV that fits, the top as a ceiling). It adds no multiplier of its own.
 */
import { FIT_AVERAGE } from "@/lib/fit"
import { FAMILIES } from "@/lib/field"

export const STANDING_TIERS = ["none", "known", "elite"] as const
export const RECOGNITION_TIERS = ["none", "local", "national", "international"] as const
export const GRADE_TIERS = ["none", "stated_high", "stated_top"] as const

export type StandingTier = (typeof STANDING_TIERS)[number]
export type RecognitionTier = (typeof RECOGNITION_TIERS)[number]
export type GradeTier = (typeof GRADE_TIERS)[number]

/** What Jev read from one part of the profile (one role, one degree or one line of the CV). */
export interface ItemFacts {
  standing: StandingTier
  recognition: RecognitionTier
  grades: GradeTier
  /** The line of work the part belongs to, one of the job families, or null when it points to none. */
  family: string | null
}

/** A part of the profile, in the person's own words, with what was read from it. */
export interface ReadItem {
  text: string
  facts: ItemFacts
}

/** How much each answer counts toward the person's strength, 0 to 1. Our assumption. */
const STANDING_VALUE: Record<StandingTier, number> = { none: 0, known: 0.5, elite: 1 }
const RECOGNITION_VALUE: Record<RecognitionTier, number> = { none: 0, local: 0.2, national: 0.5, international: 0.8 }
const GRADE_VALUE: Record<GradeTier, number> = { none: 0, stated_high: 0.2, stated_top: 0.4 }

export type Relevance = "same" | "adjacent" | "unrelated"
/** How much of a part's strength survives for a job in another line of work. Our assumption. */
export const RELEVANCE_SHARE: Record<Relevance, number> = { unrelated: 0.2, adjacent: 0.6, same: 1 }

/** Lines of work that sit next to each other: experience in one is worth something in the other. Our assumption; a family can be in several groups. */
const NEIGHBOURS: ReadonlyArray<ReadonlyArray<string>> = [
  ["Finance & accounting", "Risk, compliance & legal", "Consulting & strategy"],
  ["Software engineering", "Data, analytics & AI", "IT, cloud & security", "Hardware & engineering"],
  ["Marketing & communications", "Sales & account management", "Customer support & service", "Design & UX"],
  ["Product & project management", "Consulting & strategy", "Operations & supply chain", "Design & UX"],
  ["Research & academia", "Data, analytics & AI", "Healthcare & life sciences"],
  ["HR & recruiting", "Operations & supply chain", "Customer support & service"],
]

/** Whether the work a part comes from is the job's own line of work, next to it, or far from it. Unknown on either side is treated as next to it, the cautious middle. */
export function relevanceOf(itemFamily: string | null | undefined, jobFamily: string | null | undefined): Relevance {
  if (!itemFamily || !jobFamily) {
    return "adjacent"
  }
  if (itemFamily === jobFamily) {
    return "same"
  }

  return NEIGHBOURS.some((g) => g.includes(itemFamily) && g.includes(jobFamily)) ? "adjacent" : "unrelated"
}

/** The most the strength part can lift a person above an average applicant on the 0 to 1 fit scale. */
export const STRENGTH_SPAN = 0.5

export interface Strength {
  /** 0 to 1 on the fit scale. An ordinary profile is exactly the average (0.4): no lift, and no penalty. */
  value: number
  /** One line for the person, in their own words. */
  detail: string
}

const isOneOf = <T extends string>(list: ReadonlyArray<T>, x: unknown): x is T => typeof x === "string" && (list as ReadonlyArray<string>).includes(x)

/** Checks facts from the backend before they are used. Anything unexpected makes the whole entry unusable (null), never a guess. */
export function parseItemFacts(raw: unknown): ItemFacts | null {
  if (!raw || typeof raw !== "object") {
    return null
  }
  const r = raw as Record<string, unknown>
  if (!isOneOf(STANDING_TIERS, r.standing) || !isOneOf(RECOGNITION_TIERS, r.recognition) || !isOneOf(GRADE_TIERS, r.grades)) {
    return null
  }
  if (r.family !== null && !(typeof r.family === "string" && FAMILIES.includes(r.family))) {
    return null
  }

  return { standing: r.standing, recognition: r.recognition, grades: r.grades, family: r.family }
}

/** The start of a part in the person's own words, up to its first full stop and no longer than a short line: "Financial Analyst, Vietcombank (Hanoi, Vietnam)". */
export function headOf(text: string): string {
  const first = text.split(/\.\s/)[0].replace(/\.$/, "").trim()
  if (first.length <= 90) return first
  const cut = first.slice(0, 90)

  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40))}...`
}

/** The strongest signal in a part counts in full, the next at a quarter: one great line is not buried by small ones, and two small ones do not make a great one. */
export function itemStrength(f: ItemFacts): number {
  const signals = [STANDING_VALUE[f.standing], RECOGNITION_VALUE[f.recognition], GRADE_VALUE[f.grades]].sort((x, y) => y - x)

  return Math.min(1, signals[0] + 0.25 * signals[1])
}

/**
 * The strength for one job, from everything read on the profile. Each part counts for the job as much as its line of work is
 * the job's (or next to it); the best part counts in full and the second at a quarter. Null when nothing has been read yet.
 */
export function strengthFromItems(items: ReadonlyArray<ReadItem>, jobFamily: string | null | undefined): Strength | null {
  if (items.length === 0) {
    return null
  }
  const scored = items
    .map((it) => {
      const rel = relevanceOf(it.facts.family, jobFamily)

      return { it, rel, c: itemStrength(it.facts) * RELEVANCE_SHARE[rel] }
    })
    .sort((a, b) => b.c - a.c)
  const best = scored[0]
  if (best.c === 0) {
    return { value: FIT_AVERAGE, detail: "nothing on your profile that stands out for this job. That is the normal case and does not lower your chance" }
  }
  const s = Math.min(1, best.c + 0.25 * (scored[1]?.c ?? 0))
  const closeness = best.rel === "same" ? "the same kind of work" : best.rel === "adjacent" ? "work next to this job" : "work far from this job, so it counts for little"

  return { value: FIT_AVERAGE + STRENGTH_SPAN * s, detail: `${headOf(best.it.text)}: ${closeness}` }
}
