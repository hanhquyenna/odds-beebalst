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
  // A job added from LinkedIn or Indeed can arrive with no skills read yet (null): it counts as none, never as a crash.
  if (!t || typeof t !== "object") return Array.isArray(post.skills) ? post : { ...post, skills: [] }
  const tiers: Record<string, Tier> = {}
  for (const [name, tier] of Object.entries(t)) if (tier) tiers[name] = tier

  return { ...post, skills: Object.keys(t), tiers }
}
