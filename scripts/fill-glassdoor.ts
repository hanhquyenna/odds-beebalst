/**
 * Glassdoor reviews for the employers of the last 30 days' internship and entry jobs that do not need Dutch, newest jobs first, so the job
 * page can show what employees say and the review averages (job_company reads employer_glassdoor_reviews).
 *
 * 1. The Glassdoor page: the one employer_glassdoor already holds, else a Google search ("<name> glassdoor reviews", Apify actor
 *    apify/google-search-scraper, about $0.0015 a company), keeping a /Reviews/<Name>-Reviews-E<id> address whose name matches the company.
 * 2. The reviews: Apify actor kaix/glassdoor-reviews-scraper, newest first, many companies in one run (about $0.0001 a review).
 * Kept only when the employer Glassdoor names on the reviews is the same company. Nothing is written or judged by a model.
 *
 *   set -a; . ./.env.secrets; set +a; APIFY_TOKEN=... bun scripts/fill-glassdoor.ts [--days 30] [--limit 40] [--reviews 20] [--dry]
 */
import { lit, norm, sameCompany, sql } from "./people-rules"

const APIFY = process.env.APIFY_TOKEN
const arg = (n: string, d: string): string => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const DRY = process.argv.includes("--dry")
const DAYS = Number(arg("--days", "30")), LIMIT = Number(arg("--limit", "40")), PER = Number(arg("--reviews", "20"))
if (!DRY && !APIFY) throw new Error("Set APIFY_TOKEN")

/** One Apify run, in the background and waited on (a synchronous call stops at 300 s), capped at `cap` dollars. */
async function run(actor: string, input: unknown, cap: number): Promise<Array<Record<string, any>>> {
  const start = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?maxTotalChargeUsd=${cap.toFixed(3)}&token=${APIFY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
  if (!start.ok) throw new Error(`${actor} ${start.status}: ${(await start.text()).slice(0, 200)}`)
  let r = ((await start.json()) as { data: { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number } }).data
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(r.status)) {
    await new Promise((x) => setTimeout(x, 10_000))
    r = ((await (await fetch(`https://api.apify.com/v2/actor-runs/${r.id}?token=${APIFY}`)).json()) as { data: typeof r }).data
  }
  const items = (await (await fetch(`https://api.apify.com/v2/datasets/${r.defaultDatasetId}/items?clean=true&token=${APIFY}`)).json()) as Array<Record<string, any>>
  console.log(`  ${actor}: ${r.status}, ${items.length} items, $${(r.usageTotalUsd ?? 0).toFixed(3)}`)
  return items
}

interface Employer { employer: string; display: string; url: string | null }
const employers = await sql<Employer>(`
  with recent as (
    select employer, max(employer_display) display, max(coalesce(posted_on, current_date - days_open)) newest
    from app_jobs where level_view in ('Internship','Entry') and dutch_required is not true and coalesce(posted_on, current_date - days_open) >= current_date - ${DAYS}
    group by employer)
  select r.employer, r.display, g.glassdoor_url as url
  from recent r left join employer_glassdoor g on g.employer = r.employer
  where not exists (select 1 from employer_glassdoor_reviews v where lower(v.employer) in (lower(r.employer), lower(r.display)))
  order by r.newest desc limit ${LIMIT}`)
console.log(`${employers.length} employers without reviews (newest jobs first)`)

// 1. Glassdoor pages for the ones without one, by Google search, in one run.
const ID = /glassdoor\.[a-z.]+\/Reviews\/([^/?#]+)-Reviews-E(\d+)\.htm/i
const need = employers.filter((e) => !e.url)
if (need.length && !DRY) {
  const results = await run("apify~google-search-scraper", { queries: need.map((e) => `${e.display} glassdoor reviews`).join("\n"), maxPagesPerQuery: 1, resultsPerPage: 10, countryCode: "nl" }, Math.max(0.5, need.length * 0.004))
  for (const res of results) {
    const e = need.find((x) => `${x.display} glassdoor reviews` === res.searchQuery?.term)
    if (!e) continue
    for (const o of (res.organicResults ?? []) as Array<{ url?: string }>) {
      const m = ID.exec(o.url ?? "")
      // The name in the address ("Bynder" in /Reviews/Bynder-Reviews-E1003066.htm) must be this company's.
      if (m && sameCompany({ name: decodeURIComponent(m[1]).replace(/-/g, " ") }, e.employer, e.display, null)) { e.url = `https://www.glassdoor.com/Reviews/${m[1]}-Reviews-E${m[2]}.htm`; break }
    }
  }
}
const withUrl = employers.filter((e) => e.url)
console.log(`Glassdoor page known for ${withUrl.length}: ${employers.filter((e) => !e.url).map((e) => e.display).join(", ") || "all"} without`)
if (DRY || withUrl.length === 0) process.exit(0)

// 2. The reviews, all companies in one run.
const items = await run("kaix~glassdoor-reviews-scraper", { urls: withUrl.map((e) => e.url), maxReviews: PER, sort: "DATE", includeCompanyData: false }, Math.max(0.1, withUrl.length * PER * 0.0002))
const byId = new Map(withUrl.map((e) => [ID.exec(e.url!)![2], e]))
const rows: string[] = [], firms = new Map<string, Employer>(), refused = new Set<string>()
const rec = (v: unknown): string | null => (v === "POSITIVE" ? "yes" : v === "NEGATIVE" ? "no" : null)
for (const it of items) {
  const e = byId.get(String(it.employer?.id ?? ""))
  if (!e) continue
  if (!sameCompany({ name: it.employer?.shortName ?? it.employer?.name }, e.employer, e.display, null)) { refused.add(`${e.display} (Glassdoor says ${it.employer?.shortName})`); continue }
  firms.set(e.employer, e)
  const r = it.ratings ?? {}, em = it.employment ?? {}, c = it.content ?? {}
  rows.push(`(${lit(e.employer)}, ${lit(`glassdoor:${it.employer.id}:${it.reviewId}`)}, ${it.postedAt ? lit(String(it.postedAt).slice(0, 10)) + "::date" : "null"}, ${lit(c.summary ?? "")}, ${lit(em.jobTitle?.text ?? "")}, ${lit(em.isCurrentJob ? "current" : "former")}, ${lit(em.location?.name ?? "")},
    ${r.overall ?? "null"}, ${r.workLifeBalance ?? "null"}, ${r.cultureAndValues ?? "null"}, ${r.diversityAndInclusion ?? "null"}, ${r.careerOpportunities ?? "null"}, ${r.compensationAndBenefits ?? "null"}, ${r.seniorLeadership ?? "null"},
    ${rec(r.recommendation) ? lit(rec(r.recommendation)!) : "null"}, ${r.ceo ? lit(String(r.ceo).toLowerCase()) : "null"}, ${r.outlook ? lit(String(r.outlook).toLowerCase()) : "null"}, ${lit(c.pros ?? "")}, ${lit(c.cons ?? "")}, current_date)`)
}
if (firms.size) {
  await sql(`insert into employer_glassdoor (employer, glassdoor_id, glassdoor_url, scope, read_on) values ${[...firms.values()].map((e) => `(${lit(e.employer)}, ${lit(ID.exec(e.url!)![2])}, ${lit(e.url!)}, 'Company-wide Glassdoor profile', current_date)`).join(",")} on conflict (employer) do nothing`)
}
for (let i = 0; i < rows.length; i += 200) {
  await sql(`insert into employer_glassdoor_reviews (employer, review_key, review_date, title, role, status, place, overall, rating_balance, rating_culture, rating_diversity, rating_career, rating_pay, rating_management, recommend, ceo_approval, outlook, pros, cons, read_on)
    values ${rows.slice(i, i + 200).join(",")} on conflict (employer, review_key) do nothing`)
}
console.log(`reviews stored ${rows.length} for ${firms.size} employers; refused (other company) ${refused.size ? [...refused].join("; ") : "none"}; no reviews: ${withUrl.filter((e) => !firms.has(e.employer)).map((e) => e.display).join(", ") || "none"}`)
void norm
