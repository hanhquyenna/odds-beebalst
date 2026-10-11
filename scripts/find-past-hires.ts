/**
 * The people who held a job like this one at this employer before ("successful candidates"), for the jobs of the last 30 days, newest
 * first. Found through LinkedIn by the Apify actor harvestapi/linkedin-profile-search (Full mode: the whole work history and education),
 * searching people who were at this employer with a title like the job's. No model reads or writes anything: a person is kept only when,
 * by fixed rules, their history has a position at this employer (company name or LinkedIn page matches) whose title shares the job's
 * line of work and level. "exact" when the title words match the job's, "adjacent" when only the line of work and level do.
 * Stored in candidate_profiles, candidate_experience, candidate_education and job_candidate_evidence (validated by these rules), which
 * the app reads through job_successful_candidates.
 *
 *   set -a; . ./.env.secrets; set +a; APIFY_TOKEN=... bun scripts/find-past-hires.ts [--days 30] [--limit 50] [--dry]
 * A job that already has validated evidence is skipped. Jobs at one employer with the same cleaned title share one search.
 */
import { lit, loadPages, norm, pageOf, sameCompany, sql } from "./people-rules"

console.log(`LinkedIn pages known: ${await loadPages()}`)
const APIFY = process.env.APIFY_TOKEN
const arg = (n: string, d: string): string => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const DRY = process.argv.includes("--dry")
const DAYS = Number(arg("--days", "30"))
const LIMIT = Number(arg("--limit", "100000"))
if (!DRY && !APIFY) throw new Error("Set APIFY_TOKEN")

const LEVEL_WORDS: Record<string, RegExp> = {
  Internship: /\b(intern|internship|stagiair|stage|trainee|working student|werkstudent|thesis|graduation)\b/i,
  Entry: /\b(junior|graduate|trainee|associate|entry|starter|analyst|assistant|medior)\b/i,
}
const STOP = new Set(["intern", "internship", "stage", "stagiair", "junior", "graduate", "trainee", "associate", "entry", "level", "m", "f", "d", "x", "and", "the", "of", "for", "in", "at", "to", "a", "an", "with", "programme", "program", "2025", "2026", "2027", "fall", "spring", "summer", "autumn", "winter", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "months", "month", "fulltime", "full", "time", "part", "nl", "netherlands", "amsterdam", "rotterdam", "eindhoven", "utrecht"])
const GENERIC = new Set(["product", "business", "management", "manager", "operations", "project", "global", "senior", "team", "services", "support", "officer", "specialist", "program", "general", "corporate", "office"])
const words = (title: string): string[] => norm(title.replace(/\(.*?\)/g, " ")).split(" ").filter((w) => w.length > 1 && !STOP.has(w))

interface Job { id: string; employer: string; display: string; title: string; level: string; day: string }
const jobs = await sql<Job>(`
  select a.id, a.employer, a.employer_display as display, coalesce(a.title_clean, a.title) as title, a.level_view as level, coalesce(a.posted_on, current_date - a.days_open)::text as day
  from app_jobs a
  where a.level_view in ('Internship','Entry') and a.dutch_required is not true and coalesce(a.posted_on, current_date - a.days_open) >= current_date - ${DAYS}
    and not exists (select 1 from job_candidate_evidence e where e.posting_id = a.id and e.validation_status = 'validated' and e.status in ('exact','adjacent'))
  order by day desc, a.id`)

// One search per employer and title words: "Marketing Intern" at Picnic is searched once for all its postings.
const groups = new Map<string, Job[]>()
for (const j of jobs) {
  const key = `${j.employer}\u0000${words(j.title).slice(0, 3).join(" ")}\u0000${j.level}`
  groups.set(key, [...(groups.get(key) ?? []), j])
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const monthOf = (m: unknown): number => (typeof m === "number" ? m : MONTHS.indexOf(String(m ?? "").slice(0, 3).toLowerCase()) + 1 || Number(m) || 1)
const ym = (d: any): string | null => (d?.year ? `${d.year}-${String(monthOf(d.month)).padStart(2, "0")}-01` : null)
interface Hit { status: "exact" | "adjacent"; confidence: number; position: Record<string, any> }

/** The best position at this employer that fits the job, by fixed rules; null when none does. */
function judge(profile: Record<string, any>, j: Job, page: string | null): Hit | null {
  const want = words(j.title)
  let best: Hit | null = null
  for (const x of (Array.isArray(profile.experience) ? profile.experience : []) as Array<Record<string, any>>) {
    if (!sameCompany({ name: x.companyName, url: x.companyLinkedinUrl }, j.employer, j.display, page)) continue
    const t = String(x.position ?? x.title ?? "")
    if (!LEVEL_WORDS[j.level]?.test(t)) continue
    const have = new Set(words(t))
    // A word as broad as "product" or "business" alone says nothing about the line of work.
    const shared = want.filter((w) => have.has(w) && !GENERIC.has(w)).length
    if (shared === 0) continue
    const share = shared / Math.max(want.length, 1)
    const hit: Hit = { status: share >= 0.6 ? "exact" : "adjacent", confidence: Math.round(Math.min(0.95, 0.5 + share * 0.45) * 100) / 100, position: x }
    if (!best || hit.confidence > best.confidence) best = hit
  }
  return best
}

let runs = 0
// --reuse-last answers the first search from the actor's most recent run (already paid for), e.g. after a failed write.
let reuse = process.argv.includes("--reuse-last")
async function lastRun(): Promise<Array<Record<string, any>>> {
  const r = (await (await fetch(`https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/runs?limit=1&desc=1&token=${APIFY}`)).json()) as { data?: { items?: Array<{ defaultDatasetId: string }> } }
  const id = r.data?.items?.[0]?.defaultDatasetId
  return id ? ((await (await fetch(`https://api.apify.com/v2/datasets/${id}/items?clean=true&token=${APIFY}`)).json()) as Array<Record<string, any>>) : []
}
async function search(body: Record<string, unknown>): Promise<Array<Record<string, any>>> {
  if (reuse) { reuse = false; return lastRun() }
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.apify.com/v2/acts/harvestapi~linkedin-profile-search/run-sync-get-dataset-items?token=${APIFY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxItems: 15, takePages: 1, profileScraperMode: "Full", ...body }), signal: AbortSignal.timeout(290_000),
    })
    runs++
    if (r.ok) return (await r.json()) as Array<Record<string, any>>
    const text = (await r.text()).slice(0, 200)
    if (r.status === 402 || /insufficient|credit|limit/i.test(text)) throw new Error(`STOP: Apify says ${r.status} ${text}`)
    await new Promise((x) => setTimeout(x, 5000 * (i + 1)))
  }
  return []
}

/** The position they hold now, in the shape the table keeps: title, employer, start and end as LinkedIn shows them. */
function currentOf(profile: Record<string, any>): Record<string, string> {
  const x = ((profile.experience ?? []) as Array<Record<string, any>>)[0] ?? {}
  return { title: String(x.position ?? x.title ?? ""), employer: String(x.companyName ?? ""), start_date: String(x.startDate?.text ?? ""), end_date: String(x.endDate?.text ?? ""), employment_type: String(x.employmentType ?? "") }
}

async function store(profile: Record<string, any>, j: Job, hit: Hit): Promise<void> {
  const url = String(profile.linkedinUrl).replace(/\/+$/, "")
  const now = new Date().toISOString()
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ")
  const [{ id }] = await sql<{ id: string }>(`
    insert into candidate_profiles (canonical_linkedin_url, public_identifier, full_name, headline, current_position, public_location, avatar_url, avatar_status, evidence_status)
    values (${lit(url)}, ${lit(profile.publicIdentifier ?? "")}, ${lit(name)}, ${lit(profile.headline ?? "")}, ${lit(JSON.stringify(currentOf(profile)))}::jsonb, ${lit(profile.location?.linkedinText ?? "")},
      ${profile.photo ? lit(profile.photo) : "null"}, ${profile.photo ? "'available'" : "'unavailable'"}, 'apify_verified')
    on conflict (canonical_linkedin_url) do update set headline = excluded.headline, current_position = excluded.current_position, public_location = excluded.public_location, updated_at = now()
    returning id`)
  await sql(`delete from candidate_experience where candidate_profile_id = '${id}'; delete from candidate_education where candidate_profile_id = '${id}';`)
  const exp = (profile.experience ?? []) as Array<Record<string, any>>
  if (exp.length) await sql(`insert into candidate_experience (candidate_profile_id, employer, title, start_date, end_date, is_current, source_url, observed_at, experience_type, description) values ${exp.slice(0, 20).map((x) => `('${id}', ${lit(x.companyName ?? "")}, ${lit(x.position ?? x.title ?? "")}, ${ym(x.startDate) ? lit(ym(x.startDate)!) + "::date" : "null"}, ${ym(x.endDate) ? lit(ym(x.endDate)!) + "::date" : "null"}, ${!x.endDate || /present/i.test(String(x.endDate?.text ?? ""))}, ${lit(url)}, ${lit(now)}, ${lit(x.employmentType ?? "")}, ${lit(String(x.description ?? "").slice(0, 2000))})`).join(",")}`)
  const edu = (profile.education ?? []) as Array<Record<string, any>>
  if (edu.length) await sql(`insert into candidate_education (candidate_profile_id, school, degree, field, start_date, end_date, source_url, observed_at) values ${edu.slice(0, 10).map((x) => `('${id}', ${lit(x.schoolName ?? x.title ?? "")}, ${lit(x.degree ?? "")}, ${lit(x.fieldOfStudy ?? "")}, ${ym(x.startDate) ? lit(ym(x.startDate)!) + "::date" : "null"}, ${ym(x.endDate) ? lit(ym(x.endDate)!) + "::date" : "null"}, ${lit(url)}, ${lit(now)})`).join(",")}`)
  const p = hit.position
  await sql(`
    insert into job_candidate_evidence (posting_id, candidate_profile_id, source_url, observed_at, label, current_position, employer_match, role_function_match, level_match, status, confidence, explanation, validation_status, validated_at, validation_notes)
    values (${lit(j.id)}, '${id}', ${lit(url)}, ${lit(now)}, ${lit(hit.status)}, ${lit(JSON.stringify(currentOf(profile)))}::jsonb, 'same employer', ${lit(hit.status === "exact" ? "same title words" : "shared title words")}, 'same level', ${lit(hit.status)}, ${hit.confidence},
      ${lit(`Was "${p.position ?? p.title}" at ${p.companyName}${ym(p.startDate) ? ` from ${ym(p.startDate)}` : ""}.`)}, 'validated', now(), 'rules: same employer, same level words, shared title words (scripts/find-past-hires.ts)')`)
}

let searched = 0, kept = 0, jobsCovered = 0
for (const [, group] of groups) {
  if (searched >= LIMIT) break
  const j = group[0]
  const page = pageOf(j.employer, j.display)
  if (!page) continue
  const titleWords = words(j.title).slice(0, 3)
  if (titleWords.length === 0) continue
  const level = j.level === "Internship" ? "intern" : "junior"
  if (DRY) { console.log(`- ${j.display}: "${titleWords.join(" ")} ${level}" (${group.length} jobs)`); searched++; continue }
  try {
    const people = await search({ pastCompanies: [page], pastJobTitles: [`${titleWords.join(" ")} ${level}`, `${level} ${titleWords.join(" ")}`] })
    searched++
    let here = 0
    for (const profile of people) {
      for (const job of group) {
        const hit = judge(profile, job, page)
        if (!hit) continue
        await store(profile, job, hit)
        here++
      }
    }
    if (here) jobsCovered += group.length
    kept += here
    console.log(`- ${j.display} "${titleWords.join(" ")}" (${group.length} jobs): ${people.length} found, ${here} kept`)
  } catch (err) {
    console.log(`- ${j.display}: failed, ${(err as Error).message}`)
    if (/^STOP/.test((err as Error).message)) { console.log("Out of Apify credit: stopping."); break }
  }
}
console.log(`\n${jobs.length} jobs without past hires in ${groups.size} searches; searched ${searched} (Apify runs ${runs}); evidence kept ${kept}; jobs now covered ${jobsCovered}`)
