/**
 * Which line of work a CV points to, and whether a job is in it. Counted from the postings themselves: every posting
 * carries the job family Jev read from its whole text, and src/lib/family-model.json holds which title words and listed
 * skills go with which family. A CV's job titles, degree and skills are scored against it
 * with plain naive Bayes: no model call, the same CV always gives the same answer.
 *
 * What it is: how likely the words on the CV are to come from postings of that family, 0 to 1. What it is not: a measured
 * effect on hiring. The fit uses it as a part with an assumed weight (fit.ts).
 */
import model from "@/lib/family-model.json"
import { stem, words } from "@/lib/fit"
import type { Profile } from "@/lib/types"

interface Model {
  families: string[]
  totals: number[]
  vocab: Record<string, number[]>
}
const M = model as Model
const V = Object.keys(M.vocab).length
/** Smoothing: a word never seen with a family is unlikely there, not impossible. */
const ALPHA = 0.5

/** The share of belonging to each family for one set of words, summing to 1. Null when none of the words is known. */
export function familyPosterior(tokens: ReadonlyArray<string>): number[] | null {
  const known = tokens.filter((t) => M.vocab[t] !== undefined)
  if (known.length === 0) {
    return null
  }
  const logits = M.families.map((_, f) => known.reduce((sum, t) => sum + Math.log((M.vocab[t][f] + ALPHA) / (M.totals[f] + ALPHA * V)), 0))
  // Several words from one title are not independent evidence, so the sum is damped by how many there are, to the power 0.25.
  // Chosen on postings held out of the counts (1,908 of them, 16 families): right 75.6% of the
  // time from title words and skills, 72.5% from title words alone. 0.25 had the lowest log loss with skills; 0.5 was
  // too timid (when it said 49% sure it was right 81% of the time) and 1 far too timid.
  const damp = known.length ** 0.25
  const scaled = logits.map((l) => l / damp)
  const top = Math.max(...scaled)
  const exp = scaled.map((l) => Math.exp(l - top))
  const sum = exp.reduce((a, b) => a + b, 0)

  return exp.map((e) => e / sum)
}

const titleTokens = (text: string): string[] => words(text).map(stem)
const skillTokens = (skills: Iterable<string>): string[] => [...skills].map((s) => `skill:${s.toLowerCase()}`)

/** One reading per job title and per degree, kept per profile so the thousands of jobs scored against it do not redo it. */
const cache = new WeakMap<Profile, Array<number[]>>()

function itemsOf(profile: Profile): Array<number[]> {
  const hit = cache.get(profile)
  if (hit) {
    return hit
  }
  const items: Array<number[]> = []
  for (const p of profile.positions) {
    const post = familyPosterior(titleTokens(p.Title ?? ""))
    if (post) items.push(post)
  }
  for (const e of profile.education) {
    const post = familyPosterior(titleTokens(`${e["Degree Name"] ?? ""} ${e["Field Of Study"] ?? ""}`))
    if (post) items.push(post)
  }
  cache.set(profile, items)

  return items
}

/**
 * How well a job's family matches what the CV points to, 0 to 1: the best match among the person's job titles, degree
 * and skills taken together. Null when the job has no family or the CV has nothing to read.
 */
export function fieldMatch(profile: Profile, skills: Iterable<string>, family: string | null | undefined): number | null {
  const f = family ? M.families.indexOf(family) : -1
  if (f < 0) {
    return null
  }
  const items = [...itemsOf(profile)]
  // Each skill points to a line of work on its own and the best one counts, so adding a skill can never lower the match
  // (skills read together would let an extra, unrelated skill dilute the ones that fit).
  for (const t of skillTokens(skills)) {
    const alone = familyPosterior([t])
    if (alone) items.push(alone)
  }
  if (items.length === 0) {
    return null
  }

  return Math.max(...items.map((p) => p[f]))
}

export const FAMILIES: ReadonlyArray<string> = M.families

/**
 * The lines of work a profile points to, strongest first: what its job titles and degrees say they are (the most recent roles count most), each one
 * only when it clearly leads for some title or degree. A profile with finance, data and marketing in it gives all three; one with nothing to read gives none.
 */
export function profileFields(profile: Profile): string[] {
  const score = new Map<string, number>()
  const jobs = profile.positions.length
  const items = [...itemsOf(profile)]
  items.forEach((post, i) => {
    const top = Math.max(...post)
    const family = M.families[post.indexOf(top)]
    if (family === "Other" || top < 0.35) return
    // Roles come first in the readings, newest first; degrees follow.
    const weight = i < jobs ? 0.85 ** i : 0.6
    score.set(family, (score.get(family) ?? 0) + weight * top)
  })

  // Skills point to lines of work too: one that two or more of the skills clearly belong to (SQL and Python for data, say) counts as well, even if no job title said so.
  const bySkill = new Map<string, number>()
  for (const skill of profile.skills) {
    const alone = familyPosterior(skillTokens([skill.Name ?? ""]))
    if (!alone) continue
    const top = Math.max(...alone)
    const family = M.families[alone.indexOf(top)]
    if (family !== "Other" && top >= 0.5) bySkill.set(family, (bySkill.get(family) ?? 0) + 1)
  }
  for (const [family, n] of bySkill) {
    if (n >= 2) score.set(family, (score.get(family) ?? 0) + 0.4 * n)
  }

  return [...score.entries()].sort((x, y) => y[1] - x[1]).map(([family]) => family)
}

/**
 * How much a title word is evidence of THIS kind of work, 0.1 to 1. Counted from the same postings as the field model: the word's share of use (per posting of
 * each line of work) that falls in the job's own line. "Equity" is found mostly in finance postings, so for a finance job it counts fully; "growth" is found mostly in
 * marketing postings, so for a finance job it counts for little, and matching it is no evidence of finance. With no line of work for the job, a word counts for how
 * concentrated it is in any one line (spread across all of them, it says little). A word the model has never seen is neither: 0.5.
 */
export function wordSpecificity(token: string, family?: string | null): number {
  const counts = M.vocab[token]
  if (!counts) {
    return 0.5
  }
  const rates = counts.map((c, f) => c / (M.totals[f] || 1))
  const sum = rates.reduce((a, b) => a + b, 0)
  if (sum === 0) {
    return 0.5
  }
  const f = family ? M.families.indexOf(family) : -1
  if (f >= 0) {
    return Math.min(1, Math.max(0.1, rates[f] / sum / 0.5))
  }
  const top = Math.max(...rates) / sum

  return Math.min(1, Math.max(0.1, (top - 1 / M.families.length) / (0.6 - 1 / M.families.length)))
}

/**
 * How focused the whole history is on this job's line of work, 0 to 1: the average (not the best) of how each past role and each degree points at it, with
 * recent roles counting more. A profile spread across AI, marketing and finance scores low for any one of them; a career spent in one line scores high.
 * Where fieldMatch asks "has the person ever done this?", this asks "is this what the person does?". Null when the job has no line of work or the profile has nothing to read.
 */
export function consistencyWith(profile: Profile, family: string | null | undefined): number | null {
  const f = family ? M.families.indexOf(family) : -1
  if (f < 0) {
    return null
  }
  const items = itemsOf(profile)
  if (items.length === 0) {
    return null
  }
  const jobs = profile.positions.map((p) => familyPosterior(titleTokens(p.Title ?? ""))).filter((x): x is number[] => x !== null)
  const schools = items.length - jobs.length > 0 ? items.slice(jobs.length) : []
  let weight = 0
  let total = 0
  jobs.forEach((post, i) => {
    const w = 0.8 ** i
    weight += w
    total += w * post[f]
  })
  for (const post of schools) {
    weight += 0.5
    total += 0.5 * post[f]
  }

  return weight > 0 ? total / weight : null
}

/**
 * The department a job title belongs to, in the same families the postings use, or null when the title does not say. A title that
 * sits between two families is left unnamed rather than guessed.
 */
export function departmentOf(title: string): string | null {
  const post = familyPosterior(titleTokens(title))
  if (!post) return null
  const top = Math.max(...post)
  const family = M.families[post.indexOf(top)]

  return top >= 0.45 && family !== "Other" ? family : null
}

/**
 * A job's line of work when Jev has not read it yet (a job added after the last reading): the same words-and-skills counting, applied to the job's
 * own title and listed skills, and only used when it is at least 0.6 sure. Where Jev has read the job, Jev's family is used and this is never asked.
 */
export function guessFamily(title: string, skills: ReadonlyArray<string>): string | null {
  const post = familyPosterior([...titleTokens(title), ...skillTokens(skills)])
  if (!post) {
    return null
  }
  const best = Math.max(...post)

  return best >= 0.6 ? M.families[post.indexOf(best)] : null
}
