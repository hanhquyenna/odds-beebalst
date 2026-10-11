/**
 * People to reach out to for each employer with jobs in the last 30 days, newest jobs first: its recruiters (talent acquisition, HR, early
 * careers) and the managers in the departments of its open jobs (the likely hiring managers). Stored per employer in public.job_people, the
 * role kept in jev.role, so the app can show "Recruiter" and "Hiring manager" per job.
 *
 * Found through LinkedIn by the Apify actor harvestapi/linkedin-profile-search (Short mode, one page of 25 per search). No model reads or
 * writes anything: a person is kept only when, by fixed rules, their current position is at this employer (company name or LinkedIn page
 * matches) and they are in the Netherlands, and their title fits the role searched for.
 *
 *   set -a; . ./.env.secrets; set +a; APIFY_TOKEN=... bun scripts/find-people.ts [--days 30] [--limit 50] [--dry]
 * An employer that already has people of a role is not searched for that role again.
 */
import { DEPARTMENT_TITLES } from "../supabase/functions/_shared/departments"
import { inNL, lit, loadPages, pageOf, sameCompany, sql } from "./people-rules"

console.log(`LinkedIn pages known: ${await loadPages()}`)
const APIFY = process.env.APIFY_TOKEN
const PAT = process.env.SUPABASE_ACCESS_TOKEN
const arg = (n: string, d: string): string => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const DRY = process.argv.includes("--dry")
const DAYS = Number(arg("--days", "30"))
const LIMIT = Number(arg("--limit", "100000"))
if (!PAT || (!DRY && !APIFY)) throw new Error("Set SUPABASE_ACCESS_TOKEN and APIFY_TOKEN")

const RECRUITER = /recruit|talent acquisition|talent partner|talent sourc|sourcer|\bhr\b|human resources|people partner|people & culture|people and culture|early careers|campus|employer brand/i
const MANAGER = /\bmanager\b|\bhead\b|\blead\b|director|team ?lead|supervisor|chief|\bvp\b|vice president/i

type Role = "recruiter" | "hiring_manager"
interface Employer { employer: string; display: string; families: string[]; jobs: number; has_recruiter: boolean; has_manager: boolean }

const employers = await sql<Employer>(`
  with recent as (
    select employer, employer_display, family, coalesce(posted_on, current_date - days_open) as day
    from app_jobs where level_view in ('Internship','Entry') and dutch_required is not true and coalesce(posted_on, current_date - days_open) >= current_date - ${DAYS}
  )
  select r.employer, max(r.employer_display) as display, coalesce(array_agg(distinct r.family) filter (where r.family is not null), '{}') as families, count(*)::int as jobs,
    exists (select 1 from job_people p where p.employer = r.employer and p.jev->>'role' = 'recruiter') as has_recruiter,
    exists (select 1 from job_people p where p.employer = r.employer and p.jev->>'role' = 'hiring_manager') as has_manager
  from recent r group by r.employer order by max(r.day) desc, count(*) desc`)

interface Person { url: string; name: string; headline: string; place: string; photo: string; title: string; company: string; companyUrl: string; positions: Array<{ title: string; company: string; since: string }> }
function toPeople(items: Array<Record<string, any>>, e: Employer, page: string | null): Person[] {
  return items.filter((p) => p.linkedinUrl && (p.firstName || p.lastName)).map((p) => {
    const cur = (Array.isArray(p.currentPositions) ? p.currentPositions : Array.isArray(p.experience) ? p.experience.filter((x: any) => !x.endDate || /present/i.test(String(x.endDate?.text ?? ""))) : []) as Array<Record<string, any>>
    const here = cur.find((c) => sameCompany({ name: c.companyName, url: c.companyLinkedinUrl }, e.employer, e.display, page)) ?? null
    return {
      url: String(p.linkedinUrl), name: [p.firstName, p.lastName].filter(Boolean).join(" "), headline: String(p.headline ?? here?.title ?? ""),
      place: String(p.location?.linkedinText ?? p.location ?? ""), photo: String(p.photo ?? p.pictureUrl ?? ""),
      title: String(here?.title ?? here?.position ?? ""), company: String(here?.companyName ?? ""), companyUrl: String(here?.companyLinkedinUrl ?? ""),
      positions: cur.slice(0, 3).map((c) => ({ title: String(c.title ?? c.position ?? ""), company: String(c.companyName ?? ""), since: c.startedOn?.year ? String(c.startedOn.year) : String(c.startDate?.year ?? "") })),
    }
  })
}

let apifyRuns = 0
async function search(body: Record<string, unknown>): Promise<Array<Record<string, any>>> {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/run-sync-get-dataset-items?token=${APIFY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxItems: 25, takePages: 1, profileScraperMode: "Short", ...body }), signal: AbortSignal.timeout(280_000),
    })
    apifyRuns++
    if (r.ok) return (await r.json()) as Array<Record<string, any>>
    const text = (await r.text()).slice(0, 200)
    if (r.status === 402 || /insufficient|credit|limit/i.test(text)) throw new Error(`STOP: Apify says ${r.status} ${text}`)
    await new Promise((x) => setTimeout(x, 5000 * (i + 1)))
  }
  return []
}

/** Who to keep, by fixed rules: at this employer now, in the Netherlands, and a title that fits the role. */
function keep(p: Person, role: Role, e: Employer, page: string | null): { ok: boolean; why: string } {
  if (!p.company) return { ok: false, why: "not at the company now" }
  if (!inNL(p.place)) return { ok: false, why: "not in the Netherlands" }
  const t = `${p.title} ${p.headline}`
  if (role === "recruiter" && !RECRUITER.test(t)) return { ok: false, why: "title is not recruiting/HR" }
  if (role === "hiring_manager" && (!MANAGER.test(p.title || p.headline) || RECRUITER.test(t))) return { ok: false, why: "title is not a manager" }
  void e; void page
  return { ok: true, why: "" }
}

let searched = 0, stored = 0, skippedNoPage = 0
const totals = { recruiter: 0, hiring_manager: 0 }
for (const e of employers) {
  if (searched >= LIMIT) break
  const page = pageOf(e.employer, e.display)
  const jobs: Array<{ role: Role; body: Record<string, unknown> }> = []
  const companyFilter = page ? { currentCompanies: [page] } : null
  if (!companyFilter) { skippedNoPage++; console.log(`- ${e.display}: no LinkedIn company page known, skipped`); continue }
  if (!e.has_recruiter) jobs.push({ role: "recruiter", body: { ...companyFilter, locations: ["Netherlands"], currentJobTitles: ["recruiter", "talent acquisition", "HR business partner", "early careers", "campus recruiter", "people partner"] } })
  if (!e.has_manager) {
    const words = [...new Set((e.families.length ? e.families : ["Operations & supply chain"]).flatMap((f) => (DEPARTMENT_TITLES[f] ?? []).slice(0, 3)))].slice(0, 9)
    jobs.push({ role: "hiring_manager", body: { ...companyFilter, locations: ["Netherlands"], currentJobTitles: words, seniorityLevelIds: ["200", "210", "220"] } })
  }
  if (jobs.length === 0) continue
  if (DRY) { console.log(`- ${e.display} (${e.jobs} jobs): would search ${jobs.map((j) => j.role).join(" + ")} on ${page}`); searched += jobs.length; continue }
  for (const j of jobs) {
    try {
      const found = toPeople(await search(j.body), e, page)
      searched++
      const judged = found.map((p) => ({ p, k: keep(p, j.role, e, page) }))
      const kept = judged.filter((x) => x.k.ok).map((x) => x.p)
      if (kept.length) {
        await sql(`insert into job_people (employer, profile_url, name, headline, place, photo, positions, jev) values ${kept.map((p) => `(${lit(e.employer)}, ${lit(p.url)}, ${lit(p.name)}, ${lit(p.title || p.headline)}, ${lit(p.place)}, ${lit(p.photo)}, ${lit(JSON.stringify(p.positions))}::jsonb, ${lit(JSON.stringify({ source: "rules", role: j.role, decision_final: "keep", company: p.company }))}::jsonb)`).join(",")}
          on conflict (employer, profile_url) do update set headline = excluded.headline, place = excluded.place, positions = excluded.positions, jev = job_people.jev || excluded.jev, fetched_at = now()`)
      }
      stored += kept.length; totals[j.role] += kept.length
      const why = judged.filter((x) => !x.k.ok).reduce((m: Record<string, number>, x) => ((m[x.k.why] = (m[x.k.why] ?? 0) + 1), m), {})
      console.log(`- ${e.display} ${j.role}: ${found.length} found, ${kept.length} kept ${Object.keys(why).length ? JSON.stringify(why) : ""}`)
    } catch (err) {
      console.log(`- ${e.display} ${j.role}: failed, ${(err as Error).message}`)
      if (/^STOP/.test((err as Error).message)) { console.log("Out of Apify credit: stopping."); process.exit(0) }
    }
  }
  await sql(`insert into job_people_runs (employer, found, kept, cost_usd) values (${lit(e.employer)}, 0, 0, 0) on conflict (employer) do update set searched_at = now()`)
}
console.log(`\n${employers.length} employers; searches ${searched} (Apify runs ${apifyRuns}); skipped without a LinkedIn page ${skippedNoPage}; stored ${stored} (recruiters ${totals.recruiter}, hiring managers ${totals.hiring_manager})`)
