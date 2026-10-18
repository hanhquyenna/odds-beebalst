// POST /jobs/add: add one job, pasted by anyone or kept from the odds extension, to the shared postings table, so every user sees it.
// The browser sends { url }. Nothing is paid for until the link is a real job link AND the job is not already in the table:
//   1. the link is checked (one job address, https, a site odds reads)    -> 422, free
//   2. the table is asked for that job                                    -> "exists" or "closed", free
//   3. only then the job is read: a LinkedIn job from LinkedIn's public page of it as the person's browser read it (free), else by the Apify
//      job-details reader (about half a cent); a job anywhere else from its own page, which
//      says what the job is for search engines (schema.org JobPosting), free. Indeed and Glassdoor turn servers away, so for those (and any page
//      that does not answer) the job as the person's own browser read it is used, sent as { url, posting }: only the extension's own route,
//      which knows who the person is, may send that (it calls with the service key), never an anonymous caller.
//   4. a job that is closed or unreadable is not added
//   5. the same employer, title and city already open under another address -> "exists"
//   6. otherwise one row is inserted, read by the same rules as the loaders (supabase/functions/_shared/job-intake.ts)
// There is no limit per person. A single ceiling for everyone together (JOB_GLOBAL_LIMIT, 2,000 a day unless set) only stops a runaway of paid reads.
// Secrets: APIFY_JOB_TOKEN (falls back to APIFY_TOKEN). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { imageDataUrl, reply } from "../_shared/http.ts"
import { factsRow, industryFromLinkedIn, sameCompany, smallLogoOf, type CompanyItem } from "../_shared/company-facts.ts"
import { cityOf, readVerdict, rowFromDetails, type JobDetails, type KnownEmployer } from "../_shared/job-intake.ts"
import { heldFilter, jobLink, postingFrom, postingSent, postingUsable, textOf, type JobLink, type Posting } from "../_shared/job-sites.ts"

const ACTOR = "scrapingmonkey~linkedin-job-details-scraper"
const COMPANY_ACTOR = "harvestapi~linkedin-company"
const COMPANY_URL = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/company\/[^/?#]+/i
const LOGO_MAX = 60_000

/** Supabase's Edge runtime: work that goes on after the answer is sent. */
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

/**
 * The employer's logo and facts are filled in after the answer: a company page read can take a minute, and the person is waiting to see their
 * chance for the job, which needs neither.
 */
function later(work: Promise<unknown>): "later" {
  const quiet = work.catch(() => undefined)
  try {
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(quiet)
  } catch {
    // no runtime to keep it going: it runs as long as the function does
  }

  return "later"
}
const GLOBAL_LIMIT = (() => {
  const n = Number(Deno.env.get("JOB_GLOBAL_LIMIT"))

  return Number.isFinite(n) && n > 0 ? n : 2000
})()

interface Held {
  id: string
  employer: string
  title: string
  region: string | null
  closed_at?: string | null
  employer_display: string | null
  ind_sponsor: boolean | null
  ind_sponsor_name: string | null
  industry: string | null
}
const COLUMNS = "id,employer,title,region,closed_at,employer_display,ind_sponsor,ind_sponsor_name,industry"

/** Adds the job at { url } unless it is already held, closed or unreadable; answers { status, ... }. */
export async function addJob(req: Request): Promise<Response> {
  if (req.method !== "POST") return reply(405, { error: "Use POST." })

  const base = Deno.env.get("SUPABASE_URL")
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const apify = Deno.env.get("APIFY_JOB_TOKEN") ?? Deno.env.get("APIFY_TOKEN")
  if (!base || !service) return reply(500, { error: "Not configured." })
  if (!apify) return reply(503, { error: "Adding a job is not switched on yet." })
  const rest = { apikey: service, Authorization: `Bearer ${service}` }
  // Checked above; kept as plain strings for keep() below, which TypeScript sees as able to run before the checks.
  const db: string = base
  const token: string = apify

  let input = ""
  let sentPosting: unknown = null
  try {
    const body = (await req.json()) as Record<string, unknown>
    input = typeof body.url === "string" ? body.url : ""
    sentPosting = body.posting ?? null
  } catch {
    return reply(400, { error: "Send { url }." })
  }
  // Only the extension's route (server to server, with the service key) may hand over a job its person's browser read.
  const trusted = req.headers.get("authorization") === `Bearer ${service}`
  // 1. Free: is it a link to one job? Any page that says it is a job only from the extension (signed-in people, counted per day); anyone else, the job sites odds knows.
  const parsed = jobLink(input, trusted)
  if (!parsed) return reply(422, { error: "Paste the link to one job, like https://www.linkedin.com/jobs/view/1234567890 or a job on Indeed, Glassdoor, Magnet.me or an employer's own job page." })

  const get = async (filter: string): Promise<Held[]> => {
    const r = await fetch(`${base}/rest/v1/postings?select=${COLUMNS}&${filter}`, { headers: rest })

    return r.ok ? ((await r.json()) as Held[]) : []
  }

  // 2. Free: do we already hold this job?
  const byUrl = (await get(`${heldFilter(parsed)}&order=closed_at.desc.nullsfirst&limit=1`))[0]
  if (byUrl) {
    // Already here: match it. If its employer has no logo or facts yet, fill those in too.
    const enriched = byUrl.closed_at ? undefined : later(enrich(base, rest, apify, byUrl.employer, byUrl.employer_display ?? byUrl.employer))

    return reply(200, { status: byUrl.closed_at ? "closed" : "exists", id: byUrl.id, title: byUrl.title, employer: byUrl.employer_display, enriched: enriched })
  }

  // The job as the person's browser read it (the extension's route only): for LinkedIn from its public page of the job, so nothing is paid for.
  const fromBrowser = trusted ? postingSent(sentPosting) : null
  const itemOf = (posting: Posting): JobDetails => ({
    status: "success",
    job_status: posting.closed || (posting.valid && posting.valid.slice(0, 10) < new Date().toISOString().slice(0, 10)) ? "closed" : null,
    title: posting.title,
    location: posting.location,
    description: posting.description,
    "company.name": posting.company,
    "company.logo": posting.logo ?? undefined,
    valid_through: posting.valid,
    posted: posting.posted,
    applicants_text: posting.applicants ?? null,
    seniority_level: posting.seniority ?? null,
  })
  if (parsed.site === "linkedin" && fromBrowser) return await keep(itemOf(fromBrowser), parsed, { ats: "linkedin", source: "linkedin_user" })

  // A job anywhere but LinkedIn: read from its own page, for free.
  if (parsed.site !== "linkedin") {
    // Its own page, else the person's browser, else (a page that draws itself with scripts) Apify's page reader, within the day's paid ceiling.
    const posting = (await pageRead(parsed)) ?? fromBrowser ?? (await apifyPageRead(parsed, apify))
    if (!posting) return reply(200, { status: "unreadable", message: "odds could not read that job page." })

    return await keep(itemOf(posting), parsed, { ats: parsed.ats, source: `${parsed.site}_user` })
  }

  // The paid read. One ceiling for everyone together, counted in the same table the profile import uses.
  const since = new Date(Date.now() - 86_400_000).toISOString()
  // Counted before the check, so parallel requests all see each other; every paid read counts, failed or not.
  await fetch(`${base}/rest/v1/linkedin_imports`, { method: "POST", headers: { ...rest, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: null, ip_hash: null, kind: "job", url: parsed.url }) })
  const counted = await fetch(`${base}/rest/v1/linkedin_imports?kind=eq.job&created_at=gte.${since}&select=id`, { headers: { ...rest, Prefer: "count=exact", Range: "0-0" } })
  if (Number((counted.headers.get("content-range") ?? "*/0").split("/")[1] ?? 0) > GLOBAL_LIMIT) return reply(429, { error: "Adding jobs is paused for today. Try again tomorrow." })

  // 3. The read.
  let item: JobDetails | undefined
  try {
    const run = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${apify}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputList: [parsed.url] }), signal: AbortSignal.timeout(110_000) })
    if (!run.ok) throw new Error(String(run.status))
    item = ((await run.json()) as JobDetails[])[0]
  } catch {
    return reply(502, { error: "LinkedIn did not answer. Try again in a minute." })
  }

  return await keep(item, parsed, { ats: "linkedin", source: "linkedin_user" })

  /** Steps 4 to 6 for a job that was read, wherever it was read from. */
  async function keep(item: JobDetails | undefined, link: JobLink, from: { ats: string; source: string }): Promise<Response> {
    const verdict = readVerdict(item)
    if (verdict === "unreadable" || !item) {
      return reply(200, { status: "unreadable", message: "That job could not be read. It may have been taken down." })
    }
    // 4. Closed jobs are not added. Pasted/extension jobs may be anywhere in the world.
    if (verdict === "closed") return reply(200, { status: "closed", title: item.title, employer: item["company.name"] })
    const employer = (item["company.name"] ?? "").trim()
    const title = (item.title ?? "").trim()
    const place = (item.location ?? "").trim()

    // 5. The same job under another address: the same employer, title and city, still open.
    const sameEmployer = await get(`employer=eq.${encodeURIComponent(employer)}&limit=300`)
    const dup = sameEmployer.find((h) => !h.closed_at && sameTitle(h.title, title) && cityOf(h.region ?? "") === cityOf(place))
    if (dup) {
      const enriched = later(enrich(db, rest, token, dup.employer, dup.employer_display ?? dup.employer, { logo: item["company.logo"], page: item["company.url"] }))

      return reply(200, { status: "exists", id: dup.id, title: dup.title, employer: dup.employer_display, enriched: enriched })
    }

    // 6. Insert. A known employer lends its display name, sponsor flag and industry.
    const known: KnownEmployer | null = sameEmployer[0] ? { employer_display: sameEmployer[0].employer_display, ind_sponsor: sameEmployer[0].ind_sponsor, ind_sponsor_name: sameEmployer[0].ind_sponsor_name, industry: sameEmployer.find((h) => h.industry)?.industry ?? null } : null
    const now = new Date()
    const row = await rowFromDetails(item, link, known, now.toISOString().slice(0, 10), now.toISOString(), from)
    const put = await fetch(`${db}/rest/v1/postings`, { method: "POST", headers: { ...rest, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(row) })
    if (!put.ok) return reply(500, { error: "The job was read but could not be saved." })
    const saved = ((await put.json().catch(() => [])) as Array<{ id: string }>)[0]

    const enriched = later(enrich(db, rest, token, employer, employer, { logo: item["company.logo"], page: item["company.url"] }))

    return reply(200, { status: "added", id: saved?.id ?? row.id, title: title, employer: row.employer_display, dutch_required: row.dutch_required, student_fit: row.student_fit, pay: row.pay_posted, enriched: enriched })
  }
}

/**
 * A job page that shows nothing to a plain request (an employer's page drawn by scripts, no markup for search engines): read in a real browser by
 * Apify's page reader. About a cent, so it counts in the same daily ceiling as the paid LinkedIn read and runs only when nothing else read the job.
 * The employer is the page's site name, else the end of its title ("Analyst | Examplepay"), else the site's own name.
 */
async function apifyPageRead(link: JobLink, token: string): Promise<Posting | null> {
  const base = Deno.env.get("SUPABASE_URL") ?? ""
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const db = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString()
    await fetch(`${base}/rest/v1/linkedin_imports`, { method: "POST", headers: db, body: JSON.stringify({ user_id: null, ip_hash: null, kind: "job", url: link.url }) })
    const counted = await fetch(`${base}/rest/v1/linkedin_imports?kind=eq.job&created_at=gte.${since}&select=id`, { headers: { ...db, Prefer: "count=exact", Range: "0-0" } })
    if (Number((counted.headers.get("content-range") ?? "*/0").split("/")[1] ?? 0) > GLOBAL_LIMIT) return null
    const run = await fetch(`https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startUrls: [{ url: link.url }], maxCrawlPages: 1, maxCrawlDepth: 0, crawlerType: "playwright:adaptive", saveMarkdown: false }),
      signal: AbortSignal.timeout(100_000),
    })
    if (!run.ok) return null
    const item = ((await run.json()) as Array<{ text?: string; metadata?: { title?: string; openGraph?: Array<{ property?: string; content?: string }> } }>)[0]
    const text = String(item?.text ?? "").trim()
    if (!item || text.length < 400 || !/\b(apply|sollicit\w*|bewerb\w*|vacature|responsibilit\w*|requirements?)\b/i.test(text)) return null
    const og = (name: string) => item.metadata?.openGraph?.find((o) => o.property === name)?.content?.trim() ?? ""
    const full = (og("og:title") || item.metadata?.title || "").trim()
    const parts = full.split(/\s+[|–—-]\s+/).map((x) => x.trim()).filter(Boolean)
    const host = new URL(link.url).hostname.replace(/^(www|careers?|jobs?|werkenbij|apply)\./i, "").split(".")[0] ?? ""
    const company = og("og:site_name") || (parts.length > 1 ? parts[parts.length - 1]! : "") || host.replace(/^./, (c) => c.toUpperCase())
    const posting: Posting = { title: (parts[0] ?? full).slice(0, 300), company: company.slice(0, 200), location: "", description: text.slice(0, 100_000), posted: null, valid: null, logo: null, employment: null }

    return postingUsable(posting) ? posting : null
  } catch {
    return null
  }
}

/** Sites that turn servers away whatever is asked: not tried, so the person does not wait for a refusal. */
const NO_SERVERS = ["indeed", "glassdoor"]

/** The job as its own page describes it for search engines, read by the server, or null when the page does not answer or says nothing. */
async function pageRead(link: JobLink): Promise<Posting | null> {
  if (NO_SERVERS.includes(link.site)) return null
  // Workday draws its job pages with scripts; its own public JSON (the one the page reads) says the job, free.
  const wd = /^https:\/\/([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/]+)\/(job\/[^?#]+)/i.exec(link.url)
  if (wd) {
    try {
      const res = await fetch(`https://${new URL(link.url).hostname}/wday/cxs/${wd[1]}/${wd[2]}/${wd[3]}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) })
      const info = res.ok ? ((await res.json()) as { jobPostingInfo?: { title?: string; jobDescription?: string; location?: string; startDate?: string }; hiringOrganization?: { name?: string } }) : null
      const j = info?.jobPostingInfo
      if (j?.title) {
        const posting: Posting = { title: textOf(j.title), company: textOf(info?.hiringOrganization?.name ?? wd[1]!), location: textOf(j.location ?? ""), description: textOf(j.jobDescription ?? ""), posted: j.startDate ?? null, valid: null, logo: null, employment: null }
        if (postingUsable(posting)) return posting
      }
    } catch {
      // no answer: the page itself next
    }
  }
  try {
    const res = await fetch(link.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; odds-job-reader/1.0; +https://odds.beeblast.co)", accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const html = (await res.text()).slice(0, 3_000_000)
    for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const found = postingFrom(JSON.parse(m[1].trim()))
        if (postingUsable(found)) return found
      } catch {
        // a broken block: try the next one
      }
    }
  } catch {
    // no answer
  }

  return null
}

/**
 * After a job is added: give its employer a logo and, if the employer is new to us, its facts (founded, size, headquarters, description) and an industry.
 * The logo comes with the job read, so it is free. The company page costs about $0.004 and is read only for an employer with no facts yet.
 * Anything that goes wrong here is left out of the answer, never an error: the job is already saved.
 */
async function enrich(base: string, rest: Record<string, string>, apify: string, employer: string, display: string, hint: { logo?: string; page?: string } = {}): Promise<{ logo: boolean; facts: boolean; industry: string | null }> {
  const out = { logo: false, facts: false, industry: null as string | null }
  try {
    const key = encodeURIComponent(employer)
    const existing = ((await (await fetch(`${base}/rest/v1/employer_facts?employer=eq.${key}&select=employer,logo&limit=1`, { headers: rest })).json()) as Array<{ logo: string | null }>)[0]
    let logo = await imageDataUrl(hint.logo, LOGO_MAX, 8000)
    if (existing) {
      if (!existing.logo && logo) {
        await fetch(`${base}/rest/v1/employer_facts?employer=eq.${key}`, { method: "PATCH", headers: { ...rest, "Content-Type": "application/json" }, body: JSON.stringify({ logo: logo }) })
        out.logo = true
      }

      return out
    }
    // The company page: its link when the job read gave one, else a search by the employer's name (a page that is not this employer's is dropped below).
    const page = hint.page && COMPANY_URL.test(hint.page) ? hint.page.split("?")[0] : null
    const run = await fetch(`https://api.apify.com/v2/acts/${COMPANY_ACTOR}/run-sync-get-dataset-items?token=${apify}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(page ? { companies: [page] } : { searches: [display.replace(/&amp;/g, "&")] }),
      signal: AbortSignal.timeout(90_000),
    })
    const company = run.ok ? ((await run.json()) as CompanyItem[])[0] : undefined
    const own = company && sameCompany(employer, company.name) ? company : undefined
    if (!logo && own) logo = await imageDataUrl(smallLogoOf(own), LOGO_MAX, 8000)
    const row = factsRow(employer, own ?? { name: display, linkedinUrl: page ?? undefined }, logo)
    const saved = await fetch(`${base}/rest/v1/employer_facts`, { method: "POST", headers: { ...rest, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) })
    out.facts = saved.ok && Boolean(own)
    out.logo = saved.ok && logo !== null
    if (own?.employeeCount) {
      await fetch(`${base}/rest/v1/employer_headcount`, { method: "POST", headers: { ...rest, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ employer: employer, read_on: new Date().toISOString().slice(0, 10), employees: own.employeeCount }) })
    }
    const industry = industryFromLinkedIn((own?.industries ?? []).map((i) => i.name ?? ""))
    if (industry) {
      await fetch(`${base}/rest/v1/postings?employer=eq.${key}&industry=is.null`, { method: "PATCH", headers: { ...rest, "Content-Type": "application/json" }, body: JSON.stringify({ industry: industry }) })
      out.industry = industry
    }
  } catch {
    // leave it
  }

  return out
}

/** Same job title, ignoring gender tags like (m/f/d) and punctuation. */
function sameTitle(a: string, b: string): boolean {
  const t = (x: string): string => x.toLowerCase().replace(/\b(m ?\/ ?[fvwxd]( ?\/ ?[dx])?|f ?\/ ?m( ?\/ ?[dx])?|all genders)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim()

  return t(a) === t(b)
}
