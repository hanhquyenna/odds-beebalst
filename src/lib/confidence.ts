import type { Standing } from "@/lib/engine"
import type { Posting, Profile } from "@/lib/types"

/**
 * How much we had to go on for one job's interview chance, in three words: Low, Medium or High.
 *
 * Level: High needs an average of 75 or more and no part below 60; Medium an average of 50 or more and no part below 30; otherwise Low.
 * It is NOT a statistical confidence interval and it does not say the number was tested against real outcomes (it has not been:
 * see docs/INTERVIEW_CHANCE_METHOD.md). The statistical part is the range itself, which comes from the spread between the studies.
 * This score only counts how much information the number was built from, in four parts of equal weight (our assumption, written here):
 *   - the benchmark: enough similar jobs to take the starting range from
 *   - your side: how many of the five things we compare (skills, line of work, role, level, track record) could be read from your profile, and how much
 *     there is on the profile to read (roles, skills, degrees)
 *   - the posting's side: how many skills and tools the posting lists, so there is something to compare with
 *   - the range: how tight it is (the high end over the low end)
 */
export type ConfidenceLevel = "Low" | "Medium" | "High"

export interface Confidence {
  level: ConfidenceLevel
  /** 0 to 100 */
  score: number
  /** One short line per part, saying what was found. */
  parts: Array<{ label: string; value: number; line: string }>
}

const FIT_PARTS_POSSIBLE = 5

export function confidenceOf(st: Standing, post: Pick<Posting, "skills">, profile?: Pick<Profile, "positions" | "skills" | "education">): Confidence | null {
  if (!st.rate || st.needsProfile) {
    return null
  }
  const listed = post.skills?.length ?? 0
  const spread = st.rate.high / Math.max(st.rate.low, 1e-9)
  const readParts = st.fit?.parts.length ?? 0
  // How much there is on the profile to read: a CV with one line gives a number built on very little, whatever the posting says.
  const richness = profile
    ? (profile.positions.length >= 2 ? 1 : profile.positions.length === 1 ? 0.6 : 0.2) / 3 + (profile.skills.length >= 8 ? 1 : profile.skills.length >= 3 ? 0.6 : 0.2) / 3 + (profile.education.length >= 1 ? 1 : 0.3) / 3
    : 1
  // The weaker of the two: a rich profile of which little could be compared is as uncertain as a thin one.
  const yours = Math.min(Math.min(1, readParts / FIT_PARTS_POSSIBLE), richness)
  const parts = [
    { label: "Benchmark", value: st.rate.thin ? 0.5 : 1, line: st.rate.thin ? "few similar jobs to take the starting range from" : "enough similar jobs to take the starting range from" },
    { label: "Your profile", value: yours, line: `${readParts} of ${FIT_PARTS_POSSIBLE} things compared could be read${profile ? `, from ${profile.positions.length} role${profile.positions.length === 1 ? "" : "s"}, ${profile.skills.length} skill${profile.skills.length === 1 ? "" : "s"} and ${profile.education.length} degree${profile.education.length === 1 ? "" : "s"}` : ""}` },
    { label: "The posting", value: listed >= 3 ? 1 : listed >= 1 ? 0.6 : 0.2, line: listed === 0 ? "the posting lists no skills to compare with" : `the posting lists ${listed} skill${listed === 1 ? "" : "s"} or tools` },
    { label: "The range", value: spread <= 2.5 ? 1 : spread <= 4 ? 0.7 : 0.4, line: spread <= 2.5 ? "the studies agree closely" : spread <= 4 ? "the studies differ somewhat" : "the studies differ a lot" },
  ]
  const mean = parts.reduce((sum, p) => sum + p.value, 0) / parts.length
  const weakest = Math.min(...parts.map((p) => p.value))
  const score = Math.round(mean * 100)
  // A chain is as sure as its weakest link: a high average cannot hide a part we had almost nothing for.
  const level: ConfidenceLevel = mean >= 0.75 && weakest >= 0.6 ? "High" : mean >= 0.5 && weakest >= 0.3 ? "Medium" : "Low"

  return { level, score, parts }
}
