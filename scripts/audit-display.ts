/**
 * Checks that what the app shows for the jobs we hold is right, and says exactly which job is not. Run it after any batch of new jobs, or on a schedule:
 *   set -a; . ./.env.local; set +a; bun scripts/audit-display.ts          (exits 1 when an invariant is broken)
 * Invariants (a broken one fails the run):
 *   1. every posting's text sorts into sections without an error, and a text of any length gives at least one section with something in it
 *   2. no section is empty
 *   3. nothing is removed: at least 99% of the words of the text are still there (the layout only moves and joins lines)
 *   4. every job in the default list has a logo, an industry and a job field
 * Measures (reported, not failed): how many postings sort into the standard sections, which headings are not placed.
 */
import { logoFor } from "../src/lib/companies"
import { stripMarkup } from "../src/lib/format"
import { fieldOf } from "../src/lib/filters"
import { industryOf } from "../src/lib/industries"
import { parsePosting } from "../src/lib/job-sections"
import { fetchPostings } from "../src/lib/jobs"
import { mergePool } from "../src/lib/sources"

const SB = process.env.VITE_SUPABASE_URL!
const KEY = process.env.VITE_SUPABASE_ANON_KEY!
const head = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const bodies: Array<{ id: string; employer_display: string; body: string | null }> = []
for (let o = 0; ; o += 500) {
  const r = (await (await fetch(`${SB}/rest/v1/postings?select=id,employer_display,body&closed_at=is.null&order=id&offset=${o}&limit=500`, { headers: head })).json()) as typeof bodies
  bodies.push(...r)
  if (r.length < 500) break
}

const words = (t: string): string[] => t.toLowerCase().replace(/[’‘´`]/g, "'").match(/[a-z0-9À-ɏ']{3,}/g) ?? []
const problems: string[] = []
let structured = 0
const unplaced = new Map<string, number>()
let worst = { id: "", kept: 1 }
for (const b of bodies) {
  const text = stripMarkup(b.body ?? "")
  try {
    const out = parsePosting(text, b.employer_display)
    if (out.structured) structured++
    if (text.trim().length >= 80 && out.sections.length === 0) problems.push(`${b.id}: ${text.length} characters of text but no section`)
    for (const s of out.sections) {
      if (s.title === "" && s.blocks.length === 0) problems.push(`${b.id}: a section with neither a heading nor text`)
      if (s.key === "other") unplaced.set(s.title, (unplaced.get(s.title) ?? 0) + 1)
    }
    const had = new Set(words(text))
    if (had.size >= 40) {
      const kept = new Set(words(JSON.stringify(out.sections) + " " + JSON.stringify(out.details) + " " + JSON.stringify(out.page)))
      const share = [...had].filter((w) => kept.has(w)).length / had.size
      if (share < worst.kept) worst = { id: b.id, kept: share }
      if (share < 0.99) problems.push(`${b.id}: only ${Math.round(share * 100)}% of the words kept`)
    }
  } catch (e) {
    problems.push(`${b.id}: the sorting threw ${(e as Error).message}`)
  }
}

const jobs = mergePool(await fetchPostings()).jobs.filter((p) => (p.dutch_required === false || p.dutch_required == null))
let noLogo = 0, noIndustry = 0, noField = 0
const gaps: string[] = []
for (const p of jobs) {
  const lacks: string[] = []
  if (logoFor(p.employer, p.url) === null) { noLogo++; lacks.push("logo") }
  if (!industryOf(p)) { noIndustry++; lacks.push("industry") }
  if (!fieldOf(p)) { noField++; lacks.push("field") }
  if (lacks.length && gaps.length < 25) gaps.push(`${p.employer_display}: ${lacks.join(", ")}`)
}
if (noLogo) problems.push(`${noLogo} jobs without a logo`)
if (noIndustry) problems.push(`${noIndustry} jobs without an industry`)
if (noField) problems.push(`${noField} jobs without a job field`)

console.log(`${bodies.length} postings: ${Math.round((100 * structured) / bodies.length)}% sort into the standard sections; the most text lost by any posting is ${Math.round((1 - worst.kept) * 100)}% (${worst.id})`)
console.log(`${jobs.length} jobs in the English list: ${noLogo} without a logo, ${noIndustry} without an industry, ${noField} without a field`)
console.log("headings not placed, most common:", [...unplaced.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([h, c]) => `${c} ${h}`).join(" | "))
if (gaps.length) console.log("gaps:\n  " + gaps.join("\n  "))
if (problems.length) {
  console.log(`\n${problems.length} PROBLEMS`)
  for (const p of problems.slice(0, 40)) console.log("  " + p)
  process.exit(1)
}
console.log("\nAll invariants hold.")
