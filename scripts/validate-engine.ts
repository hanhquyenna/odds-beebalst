/**
 * Does the interview chance stay inside sane bounds on every live posting, and can it tell two applicants apart who sit next to each other?
 * Fetches every active posting and, for several base profiles, compares the chance of the applicant with the same applicant plus one thing
 * (a year of experience, an internship in the field, a referral, the Dutch...). Prints bounds, ties (differences too small to see), reversals
 * (the better applicant scoring lower) and the typical uplift. Run: bun scripts/validate-engine.ts
 */
import { readFileSync } from "node:fs"
import { CEILING, FLOOR, oddsV2, type V2Context } from "@/lib/odds-v2"
import { JOBS, PEOPLE } from "@/lib/odds-v2.personas"
import type { Posting, Profile } from "@/lib/types"

const env = readFileSync(".env.local", "utf8")
const url = /VITE_SUPABASE_URL=(.*)/.exec(env)?.[1].trim() ?? ""
const key = /VITE_SUPABASE_ANON_KEY=(.*)/.exec(env)?.[1].trim() ?? ""
const posts: Posting[] = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${url}/rest/v1/app_jobs?select=*&closed_at=is.null&order=id`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` } })
  const part = (await r.json()) as Posting[]
  posts.push(...part.map((p) => ({ ...p, skills: p.skills ?? [] })))
  if (part.length < 1000) break
}

type Variant = { name: string; base: keyof typeof PEOPLE; better: (p: Profile) => Profile; ctx?: V2Context }
const extraYear = (p: Profile): Profile => ({ ...p, positions: [...p.positions, { ...(p.positions[0] ?? { Title: "Analyst", "Company Name": "Acme", Location: "Amsterdam, Netherlands" }), "Started On": "Jan 2024", "Finished On": "Jan 2025" }] })
const variants: Variant[] = [
  { name: "referral", base: "midFinanceIntern", better: (p) => p, ctx: { referral: true } },
  { name: "tailored letter", base: "midFinanceIntern", better: (p) => p, ctx: { tailored: true } },
  { name: "native Dutch + Dutch background", base: "midFinanceIntern", better: (p) => ({ ...p, origin: "dutch", dutch: "native" }) },
  { name: "fluent Dutch", base: "midFinanceIntern", better: (p) => ({ ...p, dutch: "fluent" }) },
  { name: "EU instead of non-EU", base: "midFinanceIntern", better: (p) => ({ ...p, origin: "eu_non_native", permit: "eu" }) },
  { name: "one more year in the field", base: "midFinanceIntern", better: extraYear },
  { name: "a top employer on the CV (same line)", base: "midFinanceIntern", better: (p) => ({ ...p, positions: [{ ...p.positions[0], "Company Name": "Goldman Sachs" }, ...p.positions.slice(1)] }) },
  { name: "experience vs none (fresh grad)", base: "freshFinanceGrad", better: () => PEOPLE.midFinanceIntern },
  { name: "same years, finance work instead of barista", base: "barista", better: (p) => ({ ...p, positions: p.positions.map((r) => ({ ...r, Title: "Financial Analyst", "Company Name": "Van Oord" })) }) },
  { name: "finance degree instead of history", base: "barista", better: (p) => ({ ...p, education: PEOPLE.midFinanceIntern.education }) },
  { name: "a second internship in the field", base: "midFinanceIntern", better: (p) => ({ ...p, positions: [...p.positions, { ...p.positions[0], Title: "Finance Intern", "Company Name": "Rabobank", "Started On": "Jan 2024", "Finished On": "Jul 2024" }] }) },
]
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
const q = (xs: number[], f: number): number => [...xs].sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))]
let bad = 0
for (const who of Object.keys(PEOPLE) as Array<keyof typeof PEOPLE>) {
  const ps = posts.map((p) => oddsV2(p, PEOPLE[who]))
  const out = ps.filter((r) => !Number.isFinite(r.p) || r.p < FLOOR - 1e-9 || r.p > CEILING || r.high > CEILING || r.low < FLOOR - 1e-9 || r.low > r.p + 1e-9 || r.high < r.p - 1e-9).length
  bad += out
  const atFloor = ps.filter((r) => r.p < FLOOR + 0.0005).length
  console.log(`${who.padEnd(28)} p5 ${pct(q(ps.map((r) => r.p), 0.05))} p50 ${pct(q(ps.map((r) => r.p), 0.5))} p95 ${pct(q(ps.map((r) => r.p), 0.95))} max ${pct(Math.max(...ps.map((r) => r.p)))}  at the floor ${((atFloor / ps.length) * 100).toFixed(0)}%  out of bounds ${out}`)
}
console.log("\nPairs: the same applicant with one thing added, across every posting")
console.log("variant".padEnd(40), "reversed", "tied(<0.1pp)", "median uplift", "p10 uplift", "base>3%: median uplift", "| finance jobs: tied, median uplift")
for (const v of variants) {
  const base = PEOPLE[v.base]
  const rows = posts.map((p) => {
    const a = oddsV2(p, base).p
    const b = oddsV2(p, v.better(base), v.ctx).p

    return { a, b, fin: p.family === "Finance & accounting" }
  })
  const reversed = rows.filter((r) => r.b < r.a - 1e-9).length
  const tied = rows.filter((r) => Math.abs(r.b - r.a) < 0.001).length
  const rel = rows.map((r) => r.b / r.a - 1)
  const live = rows.filter((r) => r.a > 0.03)
  const fin = rows.filter((r) => r.fin)
  const finTied = fin.filter((r) => Math.abs(r.b - r.a) < 0.001).length
  console.log(v.name.padEnd(40), String(reversed).padStart(8), `${((tied / rows.length) * 100).toFixed(0)}%`.padStart(12), pct(q(rel, 0.5)).padStart(13), pct(q(rel, 0.1)).padStart(10), (live.length ? pct(q(live.map((r) => r.b / r.a - 1), 0.5)) : "-").padEnd(10), `| ${((finTied / fin.length) * 100).toFixed(0)}% tied, ${pct(q(fin.map((r) => r.b / r.a - 1), 0.5))}`)
}
console.log("\nbounds violations:", bad)
if (JOBS) process.exitCode = bad === 0 ? 0 : 1
