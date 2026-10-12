/**
 * Our own Dutch postings that show LinkedIn's applicant count, with what the engine would assume for the same posting if it had no count
 * (pileFor's employer-tier fallback), and the facts a model could use instead. For scripts/research/pile_model.py.
 *
 *   set -a; . ./.env.secrets; set +a; bun scripts/research/export_pile.ts   -> research-data/pile/pile_rows.jsonl
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { employerTier } from "../../src/lib/tiers"

const DAY = 86_400_000
const dayOf = (v: unknown): number | null => (v ? Math.floor(Date.parse(String(v)) / DAY) : null)
/**
 * The count a posting showed, carried forward to the end of its life exactly as the engine did before it stopped using posted counts
 * (odds-v2 until v2.6): count x sqrt(open days / age at read), open = max(28, days since posted) capped at 60, factor 1 to 6; age 9 days
 * when the posting date is not known. Kept here so the research can be repeated.
 */
function projectedApplicants(count: number, post: { posted_on: string | null; fetched_at: string | null }): { applicants: number; daysAfterPosting: number } {
  const posted = dayOf(post.posted_on), read = dayOf(post.fetched_at)
  if (read === null) return { applicants: count, daysAfterPosting: 0 }
  const today = Math.floor(Date.now() / DAY)
  const age = posted !== null && read >= posted ? Math.max(1, read - posted) : 9
  const open = posted !== null ? Math.max(28, today - posted) : 28
  const factor = Math.min(6, Math.max(1, Math.sqrt(Math.min(60, open) / age)))

  return { applicants: Math.round(count * factor), daysAfterPosting: age }
}

const PAT = process.env.SUPABASE_ACCESS_TOKEN
if (!PAT) throw new Error("Set SUPABASE_ACCESS_TOKEN (.env.secrets)")
async function sql<T>(query: string): Promise<T[]> {
  for (let i = 0; i < 6; i++) {
    const r = await fetch("https://api.supabase.com/v1/projects/ukpmpyfcnbhngkgbnkxi/database/query", { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) })
    if (r.ok) return (await r.json()) as T[]
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 2000 * 2 ** i)); continue }
    throw new Error(`${r.status} ${await r.text()}`)
  }
  throw new Error("sql kept failing")
}

const rows = await sql<Record<string, any>>(`
  select p.id, p.employer, p.employer_display, p.title, p.region, p.applicants, p.applicants_text, p.posted_on::text, p.fetched_at::text, p.closed_at::text,
    p.ats, p.source, p.english, p.workplace, p.job_type, p.industry, p.family, p.cat, p.ind_sponsor, p.pay_posted is not null as pay_stated, p.years_min, p.degree_asked,
    a.level_view, f.employees, f.followers, f.company_type, f.linkedin_industry, f.founded_year,
    g.rating as gd_rating, g.review_count as gd_reviews,
    (select count(*) from postings q where q.employer = p.employer) as employer_postings
  from postings p
  left join app_jobs a on a.id = p.id
  left join employer_facts f on f.employer = p.employer
  left join employer_glassdoor g on g.employer = p.employer
  where p.applicants is not null and p.applicants > 0`)

const out = rows.map((r) => {
  // The tier the engine sees at run time: from the name alone (the app does not pass the employer headcount to the chance).
  const tier = employerTier(r.employer_display || r.employer)
  const byTier: Record<string, number> = { elite: 600, large: 220, mid: 150, small: 60, unknown: 180 }
  const proj = projectedApplicants(Number(r.applicants), { posted_on: r.posted_on, fetched_at: r.fetched_at } as never)
  const text = String(r.applicants_text ?? "")
  return {
    ...r,
    tier,
    engine_typical: byTier[tier],
    projected: proj.applicants,
    age_at_read: proj.daysAfterPosting,
    censor: /be among the first/i.test(text) ? "below" : /^over /i.test(text) ? "above" : "exact",
    intern: /intern|stage|stagiair|trainee|werkstudent|working student|graduate/i.test(r.title),
  }
})
mkdirSync("research-data/pile", { recursive: true })
writeFileSync("research-data/pile/pile_rows.jsonl", out.map((x) => JSON.stringify(x)).join("\n") + "\n")
const tiers = out.reduce((m: Record<string, number>, x) => ((m[x.tier] = (m[x.tier] ?? 0) + 1), m), {})
console.log(`${out.length} postings with a count; tiers ${JSON.stringify(tiers)}; censored below ${out.filter((x) => x.censor === "below").length}, above ${out.filter((x) => x.censor === "above").length}`)
