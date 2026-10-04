/** Lists (employer, department) pairs of active_internship_entry jobs that have people stored but none the app would show. SUPABASE_ACCESS_TOKEN=... bun scripts/uncovered-entry-view.ts */
import { rankForJob, type Suggestion } from "../src/lib/suggest"
const PAT = process.env.SUPABASE_ACCESS_TOKEN
if (!PAT) throw new Error("Set SUPABASE_ACCESS_TOKEN")
const sql = async <T>(query: string): Promise<T[]> => (await (await fetch("https://api.supabase.com/v1/projects/ukpmpyfcnbhngkgbnkxi/database/query", { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })).json()) as T[]
const jobs = await sql<{ employer: string; family: string | null }>("select employer, family from active_internship_entry")
const people = await sql<{ employer: string; name: string; headline: string; place: string; profile_url: string }>("select employer, name, headline, place, profile_url from job_people")
const by = new Map<string, Suggestion[]>()
for (const p of people) (by.get(p.employer) ?? by.set(p.employer, []).get(p.employer)!).push({ name: p.name, headline: p.headline, place: p.place, url: p.profile_url })
const gaps = new Map<string, number>()
for (const j of jobs) { const l = by.get(j.employer) ?? []; if (l.length && !rankForJob(l, j.family).length) { const k = `${j.employer}|${j.family}`; gaps.set(k, (gaps.get(k) ?? 0) + 1) } }
console.log([...gaps].map(([k, n]) => `${k}|${n}`).join("\n"))
console.log(gaps.size, "pairs")
