/**
 * Checks the interview chance on every active job, for the real imported profile and for edge cases: is a range always produced when it should be,
 * are the numbers sane (0 < low <= mid <= high < 1, no NaN), does confidence come out, and do the what-ifs move it the right way.
 *   bun scripts/audit-odds.ts <imported-profile.json>
 */
import { readFileSync } from "node:fs"
import { confidenceOf } from "../src/lib/confidence"
import { computeShares, standing, NO_WHAT_IF } from "../src/lib/engine"
import { fetchPostings, fetchReference } from "../src/lib/jobs"
import { mergeLinkedIn, type LinkedInProfile } from "../src/lib/linkedin-merge"
import { DEFAULT_PROFILE, type Profile } from "../src/lib/types"

const li = JSON.parse(readFileSync(process.argv[2], "utf8")).profile as LinkedInProfile
const posts = await fetchPostings()
const ref = await fetchReference()
const shares = computeShares(posts)
const mine: Profile = { ...mergeLinkedIn({ ...DEFAULT_PROFILE, onboarded: true, positions: [], education: [], skills: [], languages: [], cv: "" }, { ...li, photo: undefined }) }
const q = (xs: number[], p: number): number => xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]
const pct = (n: number): string => `${(n * 100).toFixed(1)}%`

function run(label: string, profile: Profile): void {
  const mids: number[] = []
  const bad: string[] = []
  const conf = { Low: 0, Medium: 0, High: 0, none: 0 }
  let nullRate = 0, unmet = 0
  for (const p of posts) {
    const st = standing(p, profile, ref, shares, NO_WHAT_IF, false)
    if (st.failing > 0) unmet++
    if (!st.rate) { nullRate++; conf.none++; continue }
    const { low, mid, high } = st.rate
    if (![low, mid, high].every(Number.isFinite) || low <= 0 || high >= 1 || low > mid + 1e-12 || mid > high + 1e-12) bad.push(`${p.id}: ${low}/${mid}/${high}`)
    mids.push(mid)
    const c = confidenceOf(st, p, profile)
    conf[c ? c.level : "none"]++
  }
  console.log(`\n${label}: ${posts.length} jobs | no rate ${nullRate} | with an unmet ask ${unmet} | bad numbers ${bad.length}`)
  if (mids.length) console.log(`  mid chance: min ${pct(q(mids, 0))}  p25 ${pct(q(mids, 0.25))}  median ${pct(q(mids, 0.5))}  p75 ${pct(q(mids, 0.75))}  max ${pct(q(mids, 0.999))} | confidence ${JSON.stringify(conf)}`)
  bad.slice(0, 3).forEach((b) => console.log("  BAD", b))
}

run("your imported profile", mine)
run("empty profile (nothing to compare)", { ...DEFAULT_PROFILE, onboarded: true, positions: [], education: [], skills: [], languages: [], cv: "" })
run("only a CV sentence", { ...DEFAULT_PROFILE, onboarded: true, positions: [], education: [], skills: [], languages: [], cv: "Finance student who likes Excel and data." })
run("EU citizen", { ...mine, permit: "eu", origin: "eu" as Profile["origin"] })
run("Dutch native", { ...mine, dutch: "native", origin: "dutch" as Profile["origin"] })

// What-ifs move it the right way, on one job in your field.
const job = posts.find((p) => p.level_view === "Entry" && p.skills.length >= 3 && !p.dutch_required) ?? posts[0]
const base = standing(job, mine, ref, shares, NO_WHAT_IF, false).rate!
const withRef = standing(job, mine, ref, shares, NO_WHAT_IF, true).rate!
const withTailor = standing(job, mine, ref, shares, { ...NO_WHAT_IF, tailor: true }, false).rate!
console.log(`\nwhat-ifs on "${job.title}": base ${pct(base.mid)} (${pct(base.low)}-${pct(base.high)}) | referral ${pct(withRef.mid)} ${withRef.mid > base.mid ? "up" : "NOT UP"} | tailor ${pct(withTailor.mid)} ${withTailor.high > base.high ? "high end up" : "NOT UP"} (low end ${withTailor.low === base.low ? "unchanged, as designed" : "changed"})`)
