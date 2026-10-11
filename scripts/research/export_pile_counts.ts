/**
 * Every live posting's one-site applicant reading, as a CSV for scripts/research/pile_prior.py.
 * "Be among the first 25 applicants" is stored as 25 and "Over 200 applicants" as 200, but they are a ceiling and a floor, not counts:
 * the CSV says which (kind = lt | exact | gt). Run: bun scripts/research/export_pile_counts.ts
 */
import { readFileSync, writeFileSync } from "node:fs"
import { levelOf } from "@/lib/engine"
import { employerTier } from "@/lib/tiers"
import type { Posting } from "@/lib/types"

const env = readFileSync(".env.local", "utf8")
const url = /VITE_SUPABASE_URL=(.*)/.exec(env)?.[1].trim() ?? ""
const key = /VITE_SUPABASE_ANON_KEY=(.*)/.exec(env)?.[1].trim() ?? ""
const headers = { apikey: key, Authorization: `Bearer ${key}` }

async function readAll<T>(path: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${url}/rest/v1/${path}`, { headers: { ...headers, Range: `${from}-${from + 999}` } })
    const part = (await r.json()) as T[]
    out.push(...part)
    if (part.length < 1000) return out
  }
}

const posts = await readAll<Posting>("app_jobs?select=*&order=id")
const facts = await readAll<{ employer: string; employees: number | null }>("employer_facts?select=employer,employees&order=employer")
const employees = new Map(facts.map((f) => [f.employer, f.employees]))
const day = (s: string | null | undefined): number | null => (s ? Math.floor(Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s) / 86_400_000) : null)
const lines = ["id,family,level,tier,employees,kind,count,age_days,open_days,source,industry"]
for (const p of posts) {
  if (typeof p.applicants !== "number" || p.applicants <= 0) continue
  const text = p.applicants_text ?? ""
  const kind = /first 25/i.test(text) ? "lt" : /over 200/i.test(text) ? "gt" : "exact"
  const posted = day(p.posted_on)
  const read = day(p.fetched_at)
  const age = posted !== null && read !== null && read >= posted ? read - posted : ""
  const tier = employerTier(p.employer_display || p.employer, employees.get(p.employer))
  lines.push([p.id, JSON.stringify(p.family ?? ""), levelOf(p), tier, employees.get(p.employer) ?? "", kind, p.applicants, age, p.days_open ?? "", p.source, JSON.stringify(p.industry ?? "")].join(","))
}
writeFileSync("research-data/pile-prior/counts.csv", lines.join("\n"))
console.log(lines.length - 1, "rows")
