/** Jobs in public.active_internship_entry that have at least one person the app would show (rankForJob over job_people). SUPABASE_ACCESS_TOKEN=... bun scripts/coverage-entry-view.ts */
import { rankForJob, type Suggestion } from "../src/lib/suggest"
const PAT = process.env.SUPABASE_ACCESS_TOKEN
if (!PAT) throw new Error("Set SUPABASE_ACCESS_TOKEN")
const sql = async <T>(query: string): Promise<T[]> => (await (await fetch("https://api.supabase.com/v1/projects/ukpmpyfcnbhngkgbnkxi/database/query", { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })).json()) as T[]
const jobs = await sql<{ employer: string; family: string | null }>("select employer, family from active_internship_entry")
const people = await sql<{ employer: string; name: string; headline: string; place: string; profile_url: string }>("select employer, name, headline, place, profile_url from job_people")
const by = new Map<string, Suggestion[]>()
for (const p of people) (by.get(p.employer) ?? by.set(p.employer, []).get(p.employer)!).push({ name: p.name, headline: p.headline, place: p.place, url: p.profile_url })
let any = 0, shown = 0
for (const j of jobs) { const l = by.get(j.employer) ?? []; if (l.length) any++; if (rankForJob(l, j.family).length) shown++ }
console.log(`jobs ${jobs.length}; employer has people ${any} (${((any / jobs.length) * 100).toFixed(0)}%); job has someone the app shows ${shown} (${((shown / jobs.length) * 100).toFixed(0)}%)`)
