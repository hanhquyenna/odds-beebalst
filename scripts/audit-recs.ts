/**
 * Checks the recommendations on every active job for a few kinds of person, the way the job panel builds them (src/components/JobPersonal.tsx):
 * which gates fail, what would be offered, and whether the offer is right. Read-only: it reads the same pool the app reads.
 *   bun scripts/audit-recs.ts
 */
import { derive, computeShares, standing } from "../src/lib/engine"
import { fetchPostings, type Reference } from "../src/lib/jobs"
import { DEFAULT_PROFILE, type Posting, type Profile } from "../src/lib/types"

const ref = { bands: {}, transitions: {}, ageFactors: {}, tax: null } as unknown as Reference
const person = (over: Partial<Profile>, edu: Array<Record<string, string>>): Profile => ({ ...DEFAULT_PROFILE, onboarded: true, cv: "Student with Excel and Python. Built dashboards.", skills: [{ Name: "Excel" }, { Name: "Python" }], education: edu as Profile["education"], ...over })
const year = new Date().getFullYear()
const PERSONAS: Record<string, Profile> = {
  "master's student, basic Dutch": person({ studying: true }, [{ "School Name": "TU Delft", "Degree Name": "MSc", "Start Date": `Sep ${year - 1}`, "End Date": `Aug ${year + 1}` }]),
  "no degree yet, no Dutch": person({ studying: true, dutch: "none" }, []),
  "graduate 3 years ago, fluent Dutch": person({ studying: false, dutch: "professional" }, [{ "School Name": "UvA", "Degree Name": "MSc", "Start Date": `Sep ${year - 5}`, "End Date": `Jun ${year - 3}` }]),
}

const posts: Posting[] = await fetchPostings()
const shares = computeShares(posts)
console.log(`${posts.length} jobs read`)
for (const [label, profile] of Object.entries(PERSONAS)) {
  const d = derive(profile)
  const t = { dutch: 0, dutchWrong: 0, degree: 0, degreeBachelorButMasterOffered: 0, years: 0, yearsGapOver1: 0, student: 0, language: 0, skillRecs: 0, skillNotMust: 0, skillBeforeMust: 0, noPostSkills: 0, none: 0 }
  const bad: string[] = []
  for (const p of posts) {
    const st = standing(p, profile, ref, shares)
    const fail = (n: string): boolean => st.gates.find((g) => g.name === n)?.status === "fail"
    if (fail("Dutch")) { t.dutch++; if (!p.dutch_required) { t.dutchWrong++; bad.push(`dutch gate fails but not required: ${p.id}`) } }
    if (fail("Degree")) { t.degree++; if (p.degree_asked === "bachelor") { t.degreeBachelorButMasterOffered++ } }
    if (fail("Minimum years")) { t.years++; if ((p.years_min ?? 0) - d.years > 1) t.yearsGapOver1++ }
    if (fail("Student")) t.student++
    if (fail("Language")) t.language++
    const missing = st.checklist.filter((c) => !c.have).sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, 3)
    t.skillRecs += missing.length
    for (const m of missing) {
      const tier = p.tiers?.[m.skill]
      if (tier && tier !== "must") t.skillNotMust++
    }
    // A must-have skill the person lacks that is not offered while a lesser one is.
    const musts = st.checklist.filter((c) => !c.have && p.tiers?.[c.skill] === "must")
    if (musts.length > 0 && missing.some((m) => p.tiers?.[m.skill] !== "must")) t.skillBeforeMust++
    if (p.skills.length === 0) t.noPostSkills++
    if (st.failing === 0 && missing.length === 0) t.none++
  }
  console.log(`\n${label}`, JSON.stringify(t))
  bad.slice(0, 5).forEach((b) => console.log("  ", b))
}
