/**
 * Fills family and industry for open postings Jev has not read, from the same counting the app uses (family-model.json for the line of work,
 * industries.json for the employer's industry), and lists what it is not sure of so a person can name it. Writes a JSON plan, never the table.
 *   bun scripts/classify-new.ts > plan.json
 */
import industryByEmployer from "../src/lib/industries.json"
import { guessFamily } from "../src/lib/field"

const env = await Bun.file(new URL("../.env.local", import.meta.url)).text()
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim()
const key = env.match(/VITE_SUPABASE_(?:ANON|PUBLISHABLE)\w*=(.*)/)?.[1]?.trim()
const rows: Array<{ id: string; employer: string; employer_display: string; title: string; skills: string[]; family: string | null; industry: string | null; region: string | null }> = []
for (let o = 0; ; o += 1000) {
  const r = await fetch(`${url}/rest/v1/postings?select=id,employer,employer_display,title,skills,family,industry,region&closed_at=is.null&or=(family.is.null,industry.is.null)&order=id&offset=${o}&limit=1000`, { headers: { apikey: key!, Authorization: `Bearer ${key}` } })
  const j = await r.json()
  rows.push(...j)
  if (j.length < 1000) break
}
const MAP = industryByEmployer as Record<string, string>
const plan = rows.map((p) => ({ id: p.id, employer: p.employer, display: p.employer_display, title: p.title, family: p.family ?? guessFamily(p.title, p.skills ?? []), industry: p.industry ?? MAP[p.employer] ?? null, had: { family: p.family, industry: p.industry } }))
console.log(JSON.stringify(plan))
