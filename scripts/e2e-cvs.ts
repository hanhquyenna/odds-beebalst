/**
 * The whole flow for real CV files, without the sign-in: a file is read into text, the roles, degrees and skills are filled in from it,
 * Jev reads each part of the profile (the same four questions the signed-in function asks), and the interview chance is worked
 * out on the live jobs with the engine the app uses. Prints what each CV got and checks it makes sense.
 *   set -a; . ./.env.local; set +a; TYPESAFE_API_KEY=... bun scripts/e2e-cvs.ts
 */
import { readFileSync } from "node:fs"
import { readCvFile } from "../src/lib/cv-file"
import { fillFromCv } from "../src/lib/cv-parse"
import { computeShares, derive, levelOf, standing } from "../src/lib/engine"
import { fetchPostings, fetchReference } from "../src/lib/jobs"
import { dedupe } from "../src/lib/sources"
import { parseItemFacts, strengthFromItems, type ReadItem } from "../src/lib/strength"
import { DEFAULT_PROFILE, type Profile } from "../src/lib/types"
import { hashItem, itemsOf } from "../supabase/functions/profile/items"
import { PREFACE, buildQuestions, readItemAnswers } from "../supabase/functions/profile/judge"

const KEY = process.env.TYPESAFE_API_KEY
if (!KEY) throw new Error("Set TYPESAFE_API_KEY")
const pdf = async () => (await import("pdfjs-dist/legacy/build/pdf.mjs")) as never

async function readItem(kind: string, text: string) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ state: `${PREFACE}\n\nEntry (${kind}):\n${text}`, model: "jev-latest", questions: buildQuestions() }) })
    if (res.ok) return readItemAnswers((await res.json()) as never)
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue }
    throw new Error(`Jev ${res.status}`)
  }
  return null
}

const [raw, ref] = await Promise.all([fetchPostings(), fetchReference()])
const posts = dedupe(raw).jobs
const shares = computeShares(posts)

interface Case { file: string; expect: { degree: string; years: [number, number]; roles: number; degrees: number; families?: string[] } }
const CASES: Case[] = [
  { file: "vietnam-finance.pdf", expect: { degree: "master", years: [2.3, 2.5], roles: 1, degrees: 2, families: ["Finance & accounting", "Risk, compliance & legal", "Consulting & strategy"] } },
  { file: "india-btech.docx", expect: { degree: "bachelor", years: [0.3, 0.5], roles: 1, degrees: 1, families: ["Software engineering", "Data, analytics & AI", "IT, cloud & security"] } },
  { file: "nigeria-accountant.pdf", expect: { degree: "bachelor", years: [1.8, 2.0], roles: 1, degrees: 2, families: ["Finance & accounting", "Risk, compliance & legal", "Consulting & strategy"] } },
  { file: "brazil-pt.docx", expect: { degree: "master", years: [0.9, 1.0], roles: 1, degrees: 2 } },
  { file: "china-mech.pdf", expect: { degree: "master", years: [0.4, 0.6], roles: 1, degrees: 2, families: ["Hardware & engineering"] } },
  { file: "elite-heavy.pdf", expect: { degree: "master", years: [0.3, 0.4], roles: 2, degrees: 2, families: ["Finance & accounting", "Consulting & strategy", "Risk, compliance & legal"] } },
  { file: "table-resume.docx", expect: { degree: "master", years: [0.4, 0.6], roles: 1, degrees: 2, families: ["Data, analytics & AI", "Software engineering"] } },
  { file: "weak-cv.txt", expect: { degree: "unknown", years: [0.9, 1.1], roles: 1, degrees: 1 } },
]

let bad = 0
const fail = (who: string, what: string): void => { bad++; console.log(`  ✗ ${who}: ${what}`) }
const finMedians: Record<string, number> = {}
const med = (a: number[]): number => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : NaN)
const pc = (x: number): string => `${(x * 100).toFixed(1)}%`

for (const c of CASES) {
  console.log(`\n== ${c.file}`)
  const read = await readCvFile(new File([readFileSync(`tests/cvs/${c.file}`)], c.file), pdf)
  const filled = fillFromCv({ positions: [], education: [], skills: [] }, read.text)
  const profile: Profile = { ...DEFAULT_PROFILE, onboarded: true, permit: "orientation_year", birth: 2000, origin: "non_eu", dutch: "basic", cv: read.text, cvName: read.name, ...filled.patch }
  const d = derive(profile)
  console.log(`  read ${read.words} words; filled ${filled.filled.roles} roles, ${filled.filled.degrees} degrees, ${filled.filled.skills} skills; degree ${d.degree}, ${d.years.toFixed(2)} years of work`)
  if (d.degree !== c.expect.degree) fail(c.file, `degree read as ${d.degree}, expected ${c.expect.degree}`)
  if (!(d.years >= c.expect.years[0] && d.years <= c.expect.years[1])) fail(c.file, `years ${d.years.toFixed(2)}, expected ${c.expect.years.join(" to ")}`)
  if (filled.filled.roles !== c.expect.roles) fail(c.file, `${filled.filled.roles} roles filled, expected ${c.expect.roles}`)
  if (filled.filled.degrees !== c.expect.degrees) fail(c.file, `${filled.filled.degrees} degrees filled, expected ${c.expect.degrees}`)

  // Jev reads each part, as the signed-in function would.
  const items = itemsOf(profile as never)
  const hashes = await Promise.all(items.map(hashItem))
  const facts = await Promise.all(items.map((it) => readItem(it.kind, it.text)))
  const read_: ReadItem[] = items.flatMap((it, i) => { const f = facts[i] ? parseItemFacts(facts[i]) : null; return f ? [{ text: it.text, facts: f }] : [] })
  if (read_.length !== items.length) fail(c.file, `${items.length - read_.length} of ${items.length} profile parts did not read`)
  void hashes
  const strong = read_.filter((r) => r.facts.standing !== "none" || r.facts.recognition !== "none" || r.facts.grades !== "none")
  console.log(`  Jev read ${read_.length} parts; ${strong.length} stand out: ${strong.map((r) => `${r.facts.standing}/${r.facts.recognition}/${r.facts.grades} "${r.text.slice(0, 40)}"`).join("; ") || "none"}`)

  // The chance on every live job, with and without the track-record reading.
  const rows = posts.map((p) => ({ p, a: standing(p, profile, ref, shares), b: standing(p, profile, ref, shares, undefined, false, strengthFromItems(read_, p.family)) })).filter((r) => r.b.failing === 0 && r.b.rate)
  rows.sort((x, y) => y.b.rate!.mid - x.b.rate!.mid)
  const top = rows.slice(0, 5)
  console.log(`  ${rows.length} jobs open to them. Median chance ${pc(med(rows.map((r) => r.b.rate!.mid)))}; best five:`)
  for (const r of top) console.log(`     ${pc(r.b.rate!.mid).padStart(6)} (no record ${pc(r.a.rate!.mid)})  ${levelOf(r.p).padEnd(10)} ${r.p.title.slice(0, 44)} | ${r.p.employer_display.slice(0, 16)} [${r.p.family ?? "?"}]`)
  if (c.expect.families) {
    const inLine = top.filter((r) => r.p.family && c.expect.families!.includes(r.p.family)).length
    if (inLine < 3) fail(c.file, `only ${inLine} of the best 5 jobs are in the expected lines of work`)
  }
  if (d.years < 1 && top.some((r) => levelOf(r.p) === "Director")) fail(c.file, "a Director job among the best five for someone with under a year of work")
  for (const r of rows) {
    if (!(r.b.rate!.low > 0 && r.b.rate!.high <= 0.54 + 1e-9 && r.b.rate!.low <= r.b.rate!.mid && r.b.rate!.mid <= r.b.rate!.high)) { fail(c.file, `a chance out of range on ${r.p.title}`); break }
    if (r.b.rate!.mid < r.a.rate!.mid - 1e-12) { fail(c.file, `the track-record reading LOWERED the chance on ${r.p.title}`); break }
  }
  finMedians[c.file] = med(rows.filter((r) => r.p.family === "Finance & accounting").map((r) => r.b.rate!.mid))
}

console.log("\nMedian chance on finance jobs, by CV (those open to the CV):")
for (const [f, m] of Object.entries(finMedians).sort((a, b) => b[1] - a[1])) console.log(`  ${pc(m).padStart(6)}  ${f}`)
const e = finMedians["elite-heavy.pdf"], v = finMedians["vietnam-finance.pdf"], w = finMedians["weak-cv.txt"], i = finMedians["india-btech.docx"]
if (!(e > v)) fail("order", `the elite finance CV (${pc(e)}) should beat the ordinary finance CV (${pc(v)}) on finance jobs`)
if (!(v > i)) fail("order", `the finance CV (${pc(v)}) should beat a software CV (${pc(i)}) on finance jobs`)
if (!(i >= w || Number.isNaN(w))) fail("order", `a software CV should not trail the weak CV on finance jobs`)
console.log(bad === 0 ? "\nOK: every CV went through the whole flow and the results make sense." : `\n${bad} problems.`)
process.exit(bad === 0 ? 0 : 1)
