// Supabase Edge Function: add one LinkedIn job, pasted by anyone, to the shared postings table, so every user sees it.
// The browser sends { url }. Nothing is paid for until the link is a real LinkedIn job link AND the job is not already in the table:
//   1. the link is checked (one job address, https, LinkedIn only)        -> 422, free
//   2. the table is asked for that address                                -> "exists" or "closed", free
//   3. only then the job is read (Apify job-details reader, about half a cent)
//   4. a job that is closed, unreadable or outside the Netherlands is not added
//   5. the same employer, title and city already open under another address -> "exists"
//   6. otherwise one row is inserted, read by the same rules as the loaders (supabase/functions/_shared/job-intake.ts)
// There is no limit per person. A single ceiling for everyone together (JOB_GLOBAL_LIMIT, 2,000 a day unless set) only stops a runaway.
// Secrets: APIFY_JOB_TOKEN (falls back to APIFY_TOKEN). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Deploy:  supabase functions deploy add-job --project-ref ukpmpyfcnbhngkgbnkxi --no-verify-jwt
import { factsRow, industryFromLinkedIn, sameCompany, smallLogoOf, type CompanyItem } from "../_shared/company-facts.ts"
import { cityOf, inNetherlands, parseJobUrl, readVerdict, rowFromDetails, type JobDetails, type KnownEmployer } from "../_shared/job-intake.ts"

const ACTOR = "scrapingmonkey~linkedin-job-details-scraper"
const COMPANY_ACTOR = "harvestapi~linkedin-company"
const COMPANY_URL = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/company\/[^/?#]+/i
const LOGO_MAX = 60_000
const GLOBAL_LIMIT = (() => {
  const n = Number(Deno.env.get("JOB_GLOBAL_LIMIT"))

  return Number.isFinite(n) && n > 0 ? n : 2000
})()

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

const sameTitle = (a: string, b: string): boolean => {
  const t = (x: string): string => x.toLowerCase().replace(/\b(m ?\/ ?[fvwxd]( ?\/ ?[dx])?|f ?\/ ?m( ?\/ ?[dx])?|all genders)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim()

  return t(a) === t(b)
}

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

/** A small picture from LinkedIn's own image servers as a data URL, or null. Only a picture, and not a large one. */
async function logoData(address: string | undefined): Promise<string | null> {
  try {
    if (!address) return null
    const u = new URL(address)
    if (u.protocol !== "https:" || !/(^|\.)licdn\.com$/.test(u.hostname)) return null
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) })
    const type = res.headers.get("content-type") ?? ""
    if (!res.ok || !type.startsWith("image/")) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > LOGO_MAX) return null
    let binary = ""
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))

    return `data:${type};base64,${btoa(binary)}`
  } catch {
    return null
  }
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
    let logo = await logoData(hint.logo)
    if (existing) {
      if (!existing.logo && logo) {
        await fetch(`${base}/rest/v1/employer_facts?employer=eq.${key}`, { method: "PATCH", headers: { ...rest, "Content-Type": "application/json" }, body: JSON.stringify({ logo }) })
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
    if (!logo && own) logo = await logoData(smallLogoOf(own))
    const row = factsRow(employer, own ?? { name: display, linkedinUrl: page ?? undefined }, logo)
    const saved = await fetch(`${base}/rest/v1/employer_facts`, { method: "POST", headers: { ...rest, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) })
    out.facts = saved.ok && Boolean(own)
    out.logo = saved.ok && logo !== null
    if (own?.employeeCount) {
      await fetch(`${base}/rest/v1/employer_headcount`, { method: "POST", headers: { ...rest, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ employer, read_on: new Date().toISOString().slice(0, 10), employees: own.employeeCount }) })
    }
    const industry = industryFromLinkedIn((own?.industries ?? []).map((i) => i.name ?? ""))
    if (industry) {
      await fetch(`${base}/rest/v1/postings?employer=eq.${key}&industry=is.null`, { method: "PATCH", headers: { ...rest, "Content-Type": "application/json" }, body: JSON.stringify({ industry }) })
      out.industry = industry
    }
  } catch {
    // leave it
  }

  return out
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return reply(405, { error: "Use POST." })

  const base = Deno.env.get("SUPABASE_URL")
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const apify = Deno.env.get("APIFY_JOB_TOKEN") ?? Deno.env.get("APIFY_TOKEN")
  if (!base || !service) return reply(500, { error: "Not configured." })
  if (!apify) return reply(503, { error: "Adding a job is not switched on yet." })
  const rest = { apikey: service, Authorization: `Bearer ${service}` }

  let input = ""
  try {
    input = String(((await req.json()) as Record<string, unknown>).url ?? "")
  } catch {
    return reply(400, { error: "Send { url }." })
  }
  // 1. Free: is it a link to one LinkedIn job?
  const parsed = parseJobUrl(input)
  if (!parsed) return reply(422, { error: "Paste the link to one LinkedIn job, like https://www.linkedin.com/jobs/view/1234567890" })

  const get = async (filter: string): Promise<Held[]> => {
    const r = await fetch(`${base}/rest/v1/postings?select=${COLUMNS}&${filter}`, { headers: rest })

    return r.ok ? ((await r.json()) as Held[]) : []
  }

  // 2. Free: do we already hold this exact address?
  const byUrl = (await get(`url=eq.${encodeURIComponent(parsed.url)}&limit=1`))[0]
  if (byUrl) {
    // Already here: match it. If its employer has no logo or facts yet, fill those in too.
    const enriched = byUrl.closed_at ? undefined : await enrich(base, rest, apify, byUrl.employer, byUrl.employer_display ?? byUrl.employer)

    return reply(200, { status: byUrl.closed_at ? "closed" : "exists", id: byUrl.id, title: byUrl.title, employer: byUrl.employer_display, enriched })
  }

  // The paid read. One ceiling for everyone together, counted in the same table the profile import uses.
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const counted = await fetch(`${base}/rest/v1/linkedin_imports?kind=eq.job&created_at=gte.${since}&select=id`, { headers: { ...rest, Prefer: "count=exact", Range: "0-0" } })
  if (Number((counted.headers.get("content-range") ?? "*/0").split("/")[1] ?? 0) >= GLOBAL_LIMIT) return reply(429, { error: "Adding jobs is paused for today. Try again tomorrow." })
  const logged = await fetch(`${base}/rest/v1/linkedin_imports`, { method: "POST", headers: { ...rest, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ user_id: null, ip_hash: null, kind: "job", url: parsed.url }) })
  const usedId = ((await logged.json().catch(() => [])) as Array<{ id?: number }>)[0]?.id
  const giveBack = async (): Promise<void> => {
    if (usedId !== undefined) await fetch(`${base}/rest/v1/linkedin_imports?id=eq.${usedId}`, { method: "DELETE", headers: rest })
  }

  // 3. The read.
  let item: JobDetails | undefined
  try {
    const run = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${apify}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputList: [parsed.url] }), signal: AbortSignal.timeout(110_000) })
    if (!run.ok) throw new Error(String(run.status))
    item = ((await run.json()) as JobDetails[])[0]
  } catch {
    await giveBack()
    return reply(502, { error: "LinkedIn did not answer. Try again in a minute." })
  }
  const verdict = readVerdict(item)
  if (verdict === "unreadable" || !item) {
    await giveBack()
    return reply(200, { status: "unreadable", message: "That job could not be read. It may have been taken down." })
  }
  // 4. Closed, or not in the Netherlands: not added.
  if (verdict === "closed") return reply(200, { status: "closed", title: item.title, employer: item["company.name"] })
  const employer = (item["company.name"] ?? "").trim()
  const title = (item.title ?? "").trim()
  const place = (item.location ?? "").trim()
  if (!inNetherlands(place)) return reply(200, { status: "not_netherlands", title, employer, place })

  // 5. The same job under another address: the same employer, title and city, still open.
  const sameEmployer = await get(`employer=eq.${encodeURIComponent(employer)}&limit=300`)
  const dup = sameEmployer.find((h) => !h.closed_at && sameTitle(h.title, title) && cityOf(h.region ?? "") === cityOf(place))
  if (dup) {
    const enriched = await enrich(base, rest, apify, dup.employer, dup.employer_display ?? dup.employer, { logo: item["company.logo"], page: item["company.url"] })

    return reply(200, { status: "exists", id: dup.id, title: dup.title, employer: dup.employer_display, enriched })
  }

  // 6. Insert. A known employer lends its display name, sponsor flag and industry.
  const known: KnownEmployer | null = sameEmployer[0] ? { employer_display: sameEmployer[0].employer_display, ind_sponsor: sameEmployer[0].ind_sponsor, ind_sponsor_name: sameEmployer[0].ind_sponsor_name, industry: sameEmployer.find((h) => h.industry)?.industry ?? null } : null
  const now = new Date()
  const row = await rowFromDetails(item, parsed, known, now.toISOString().slice(0, 10), now.toISOString())
  const put = await fetch(`${base}/rest/v1/postings`, { method: "POST", headers: { ...rest, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(row) })
  if (!put.ok) return reply(500, { error: "The job was read but could not be saved." })
  const saved = ((await put.json().catch(() => [])) as Array<{ id: string }>)[0]

  const enriched = await enrich(base, rest, apify, employer, employer, { logo: item["company.logo"], page: item["company.url"] })

  return reply(200, { status: "added", id: saved?.id ?? row.id, title, employer: row.employer_display, dutch_required: row.dutch_required, student_fit: row.student_fit, pay: row.pay_posted, enriched })
})
