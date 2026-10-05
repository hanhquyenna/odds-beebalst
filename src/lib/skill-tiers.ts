import { stripMarkup } from "@/lib/format"
import { extractRequirements, fromJev, namedSkills, tiersOf, type Tier } from "@/lib/requirements"
import type { Posting } from "@/lib/types"

/** Each skill a posting names and the tier it is asked at; null when the posting names it without saying how much it insists. */
export type SkillTiers = Record<string, Tier | null>

/**
 * The skills a posting is compared on and the tier of each, worked out exactly as the job page does: from Jev's tiered lines when
 * there are any, from the headings and cue words of the text when there are not. The same code on the same inputs, so a number
 * computed from this agrees with the number on the job page. An empty object is a posting whose requirement lines name no skill.
 */
export function skillTiersFor(body: string, jev: ReadonlyArray<{ text: string; tier: string }> | null): SkillTiers {
  const text = stripMarkup(body)
  const valid = (jev ?? []).filter((r): r is { text: string; tier: Tier } => typeof r.text === "string" && ["must", "strong", "optional", "nice"].includes(r.tier))
  const lines = valid.length > 0 ? fromJev(valid) : extractRequirements(text)
  const tiers = tiersOf(lines)

  return Object.fromEntries(namedSkills(text, lines).map((name) => [name, tiers[name] ?? null]))
}

/**
 * What a loaded posting is compared on. With stored skill tiers, the skills are the ones the job page compares and each carries its
 * tier; without them (the column is not filled yet) the posting keeps the skills the text rules found and no tiers.
 */
export function withSkillTiers<T extends Posting>(post: T): T {
  const t = post.skill_tiers
  if (!t || typeof t !== "object") return post
  const tiers: Record<string, Tier> = {}
  for (const [name, tier] of Object.entries(t)) if (tier) tiers[name] = tier

  return { ...post, skills: Object.keys(t), tiers }
}

/**
 * The minimum years of experience a posting asks for, taken from the requirement lines that REQUIRE a number of years. The stored
 * years_min came from any "N years" anywhere in the text, which also caught a PhD contract of 4 years, "9 years of experience behind
 * us" about the company, and a benefit every 3 years, and a false minimum is a hard 0% for the person. Null when no required line
 * names a number of years. With several, the smallest: the gate asks for the least a person could have.
 */
export function minYearsFor(jev: ReadonlyArray<{ text: string; tier: string; confidence?: number; section?: string | null }> | null): number | null {
  const required = (jev ?? []).filter((r): r is { text: string; tier: Tier; confidence?: number; section?: string | null } => {
    if (typeof r.text !== "string") return false
    if (r.tier === "must") return true
    // A line Jev called soft with little confidence, and that nothing in it or its heading softens, still counts as required for
    // this gate: with no cue in the words, weak evidence for "only preferred" is not enough to let a stated minimum go. A clear
    // cue ("preferably", "a plus", "advantage") always lets it go.
    return ["strong", "optional", "nice"].includes(r.tier) && typeof r.confidence === "number" && r.confidence < WEAK && !SOFT_CUE.test(r.text) && !SOFT_HEADING.test(r.section ?? "")
  })
  const years = fromJev(required.map((r) => ({ text: r.text, tier: "must" as Tier }))).flatMap((l) => (l.years !== null && l.years > 0 && l.years <= 20 ? [l.years] : []))

  return years.length > 0 ? Math.min(...years) : null
}

const WEAK = 0.5
const SOFT_CUE = /\b(prefer\w*|plus|advantage\w*|asset|bonus|nice|ideal\w*|desirable|beneficial|would be (great|nice|helpful)|extra|valued|an? edge)\b/i
const SOFT_HEADING = /\b(prefer\w*|nice|bonus|plus\w*|advantage\w*|desirable|extra|stand out|additional|good to have|beneficial|ideal\w*)\b/i
