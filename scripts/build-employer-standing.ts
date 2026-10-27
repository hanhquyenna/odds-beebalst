/**
 * How well placed each employer is within its own industry, for the interview-chance model (src/lib/tiers.ts): a bank is compared with banks, a chip maker
 * with chip makers, not with every company at once. Standing is the employer's rank by LinkedIn headcount among the employers we know in the same industry
 * (industry = the commonest reading across its postings, as in jobs.ts), 0 (smallest) to 1 (largest): top tenth large, next half mid, the rest small. Industries with fewer than MIN_PEERS employers
 * with a headcount get no standing, and the global tiers apply. Run: bun scripts/build-employer-standing.ts > writes src/lib/employer-standing.json
 */
import { readFileSync, writeFileSync } from "node:fs"
import { wholeName } from "@/lib/tiers"

const MIN_PEERS = 8
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

const posts = await readAll<{ employer: string; employer_display: string | null; industry: string | null }>("app_jobs?select=employer,employer_display,industry&order=id")
const facts = await readAll<{ employer: string; employees: number | null }>("employer_facts?select=employer,employees&order=employer")
const employees = new Map(facts.filter((f) => f.employees && f.employees > 0).map((f) => [f.employer, f.employees as number]))
const votes = new Map<string, Map<string, number>>()
const display = new Map<string, string>()
for (const p of posts) {
  if (p.employer_display) display.set(p.employer, p.employer_display)
  if (!p.industry) continue
  const v = votes.get(p.employer) ?? new Map<string, number>()
  v.set(p.industry, (v.get(p.industry) ?? 0) + 1)
  votes.set(p.employer, v)
}
const byIndustry = new Map<string, Array<{ employer: string; n: number }>>()
for (const [employer, v] of votes) {
  const n = employees.get(employer)
  if (!n) continue
  const industry = [...v.entries()].sort((a, b) => b[1] - a[1])[0][0]
  byIndustry.set(industry, [...(byIndustry.get(industry) ?? []), { employer, n }])
}
// Only the employers whose place within their industry changes what the global headcount cut-offs would say are kept: the file ships with the app.
const globalTier = (n: number): string => (n >= 5000 ? "large" : n >= 200 ? "mid" : "small")
const out: Record<string, string> = {}
let industries = 0
for (const list of byIndustry.values()) {
  if (list.length < MIN_PEERS) continue
  industries += 1
  list.sort((a, b) => a.n - b.n)
  list.forEach((e, idx) => {
    const standing = idx / (list.length - 1)
    const tier = standing >= 0.9 ? "large" : standing >= 0.4 ? "mid" : "small"
    if (tier === globalTier(e.n)) return
    for (const name of new Set([e.employer, display.get(e.employer)].filter((x): x is string => Boolean(x)))) out[wholeName(name.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&amp;/g, "&").trim())] = tier
  })
}
writeFileSync("src/lib/employer-standing.json", JSON.stringify(out))
console.log(Object.keys(out).length, "employers whose tier differs, in", industries, "industries")
