/**
 * Each employer's own LinkedIn company page (size, founded, headquarters, offices, industry, where its people studied and what they do) for
 * the last 30 days' internship and entry jobs that do not need Dutch, newest jobs first. Apify actor harvestapi/linkedin-company, by name
 * search, many companies in one run (about $0.004 a company). Kept only when the page's name is this company's. Every read also adds a
 * dated headcount (employer_headcount, source 'linkedin'), so reading again later shows growth. No model is involved.
 *
 *   set -a; . ./.env.secrets; set +a; APIFY_TOKEN=... bun scripts/fill-linkedin-company.ts [--days 30] [--limit 100] [--refresh] [--dry]
 * Without --refresh only employers with no facts are read; with it, the ones with facts are read again (by their page) for a new headcount.
 */
import { lit, sameCompany, sql } from "./people-rules"

const APIFY = process.env.APIFY_TOKEN
const arg = (n: string, d: string): string => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const DRY = process.argv.includes("--dry"), REFRESH = process.argv.includes("--refresh")
const DAYS = Number(arg("--days", "30")), LIMIT = Number(arg("--limit", "100"))
if (!DRY && !APIFY) throw new Error("Set APIFY_TOKEN")

interface Employer { employer: string; display: string; page: string | null }
const employers = await sql<Employer>(`
  with recent as (
    select employer, max(employer_display) display, max(coalesce(posted_on, current_date - days_open)) newest
    from app_jobs where level_view in ('Internship','Entry') and dutch_required is not true and coalesce(posted_on, current_date - days_open) >= current_date - ${DAYS}
    group by employer)
  select r.employer, r.display, f.linkedin_url as page from recent r left join employer_facts f on f.employer = r.employer
  where ${REFRESH ? "f.linkedin_url is not null and coalesce(f.fetched_at, '2000-01-01') < current_date" : "f.employer is null"}
  order by r.newest desc limit ${LIMIT}`)
console.log(`${employers.length} employers to read (${REFRESH ? "refresh by page" : "no facts yet, by name"}), newest jobs first`)
if (DRY || employers.length === 0) process.exit(0)

const input = REFRESH ? { companies: employers.map((e) => e.page) } : { searches: employers.map((e) => e.display) }
// A background run, waited on: a few seconds per company is more than a synchronous call allows. Capped at $0.005 a company.
const start = await fetch(`https://api.apify.com/v2/acts/harvestapi~linkedin-company/runs?maxTotalChargeUsd=${(employers.length * 0.005).toFixed(3)}&token=${APIFY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
if (!start.ok) throw new Error(`apify ${start.status}: ${(await start.text()).slice(0, 200)}`)
let run = ((await start.json()) as { data: { id: string; status: string; defaultDatasetId: string } }).data
while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
  await new Promise((x) => setTimeout(x, 10_000))
  run = ((await (await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${APIFY}`)).json()) as { data: typeof run }).data
}
const items = (await (await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&token=${APIFY}`)).json()) as Array<Record<string, any>>
console.log(`run ${run.status}, ${items.length} pages read`)

const slug = (u: string | null | undefined): string => (u ?? "").toLowerCase().replace(/\/+$/, "").split("/").pop() ?? ""
const stat = (it: Record<string, any>, title: string): Array<{ title: string; count: number }> | null => {
  const s = ((it.peopleStats ?? []) as Array<{ statTitle: string; values: Array<{ title: string; count: number }> }>).find((x) => x.statTitle === title)
  return s ? s.values.slice(0, 10).map((v) => ({ title: v.title, count: v.count })) : null
}
const j = (v: unknown): string => (v == null ? "null" : `${lit(JSON.stringify(v))}::jsonb`)
let stored = 0
const refused: string[] = [], missing: string[] = []
for (const e of employers) {
  const it = items.find((x) => (REFRESH ? slug(x.linkedinUrl) === slug(e.page) : x.originalQuery?.search === e.display || x.originalQuery === e.display || x.originalQuery?.query === e.display))
  if (!it) { missing.push(e.display); continue }
  if (!sameCompany({ name: it.name, url: it.linkedinUrl }, e.employer, e.display, e.page)) { refused.push(`${e.display} -> ${it.name}`); continue }
  const hq = ((it.locations ?? []) as Array<Record<string, any>>).find((l) => l.headquarter)
  const locs = ((it.locations ?? []) as Array<Record<string, any>>).slice(0, 20).map((l) => ({ city: l.city ?? l.parsed?.city ?? null, country: l.parsed?.country ?? l.country ?? null }))
  const range = it.employeeCountRange ? `${it.employeeCountRange.start ?? ""}${it.employeeCountRange.end ? `-${it.employeeCountRange.end}` : "+"}` : null
  await sql(`
    insert into employer_facts (employer, linkedin_url, name, tagline, description, website, founded_year, employees, employee_range, followers, company_type, headquarters, locations, linkedin_industry, specialities, top_locations, top_schools, top_functions, top_fields, fetched_at, logo)
    values (${lit(e.employer)}, ${lit(it.linkedinUrl ?? "")}, ${lit(it.name ?? "")}, ${lit(it.tagline ?? "")}, ${lit(String(it.description ?? "").slice(0, 4000))}, ${lit(it.website ?? "")},
      ${it.foundedOn?.year ?? "null"}, ${it.employeeCount ?? "null"}, ${range ? lit(range) : "null"}, ${it.followerCount ?? "null"}, ${lit(it.companyType ?? "")},
      ${hq?.parsed?.text ? lit(hq.parsed.text) : "null"}, ${j(locs)}, ${lit(it.industries?.[0]?.name ?? "")}, ${it.specialities?.length ? `array[${(it.specialities as string[]).slice(0, 20).map(lit).join(",")}]` : "null"},
      ${j(stat(it, "Locations"))}, ${j(stat(it, "School"))}, ${j(stat(it, "Function") ?? stat(it, "What they do"))}, ${j(stat(it, "Field of study") ?? stat(it, "What they studied"))}, current_date, ${it.logo ? lit(it.logo) : "null"})
    on conflict (employer) do update set linkedin_url = excluded.linkedin_url, name = excluded.name, tagline = excluded.tagline, description = excluded.description, website = excluded.website,
      founded_year = excluded.founded_year, employees = excluded.employees, employee_range = excluded.employee_range, followers = excluded.followers, company_type = excluded.company_type,
      headquarters = excluded.headquarters, locations = excluded.locations, linkedin_industry = excluded.linkedin_industry, specialities = excluded.specialities,
      top_locations = coalesce(excluded.top_locations, employer_facts.top_locations), top_schools = coalesce(excluded.top_schools, employer_facts.top_schools),
      top_functions = coalesce(excluded.top_functions, employer_facts.top_functions), top_fields = coalesce(excluded.top_fields, employer_facts.top_fields), fetched_at = current_date, logo = coalesce(excluded.logo, employer_facts.logo)`)
  if (it.employeeCount) await sql(`insert into employer_headcount (employer, read_on, employees, source) values (${lit(e.employer)}, current_date, ${it.employeeCount}, 'linkedin') on conflict (employer, read_on, source) do update set employees = excluded.employees`)
  stored++
}
console.log(`stored ${stored}; refused (other company) ${refused.length ? refused.join("; ") : "none"}; not found ${missing.length ? missing.join(", ") : "none"}`)
