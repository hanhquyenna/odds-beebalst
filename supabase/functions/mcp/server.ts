// The odds MCP server: lets Claude, ChatGPT or any MCP client search the job pool, read a job and its company, and work out
// someone's interview chance and tailored list, with the app's own rules (core.js, bundled from src/lib by scripts/build-mcp-core.sh).
//
// Transport: MCP Streamable HTTP, stateless (every POST stands alone, answered as JSON; no server-sent stream is needed for tools).
// Access, two levels. Without a key: the public anon key only, the same reads the app makes before anyone signs in; nothing writes.
// With a person's private link (?key=odds_..., made on their profile, see migrations/20261010140000_claude_private_link.sql): also
// their own profile, documents, saved jobs and applications, and they can save a cover letter to Documents and mark a job applied.
// Every one of those reads and writes is filtered by the user id the key belongs to. Nothing calls a paid service (no Apify, no models).
// @ts-ignore: bundled from src/lib by scripts/build-mcp-core.sh
import * as core from "./core.js"

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"]
/** Public endpoint: what one request may ask for, so no single call can make the server do much work. */
const MAX_BODY_BYTES = 64 * 1024
const MAX_BATCH = 10
const MAX_TEXT = 300
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
  "Access-Control-Expose-Headers": "mcp-session-id",
}

// deno-lint-ignore no-explicit-any
type Json = any

export interface Env {
  url: string
  anonKey: string
  /** Only for the private link: finding whose key it is, and reading and writing that one person's own rows. */
  serviceKey?: string
}

/** The person a private link belongs to. */
interface Me {
  id: string
  email: string | null
}

// ---- Reading the pool, kept for a few minutes per warm instance ----

const PAGE = 1000
const COLUMNS =
  "id,employer,employer_display,ats,source,title,region,cat,cbs_group,url,ind_sponsor,ind_sponsor_name,years_min,dutch_required,visa_mention,junior_title,degree_asked,skills,pay_posted,applicants,applicants_text,valid_through,seniority,posted_at,days_open,freshness_state,fetched_at,title_clean,level_jev,level_conf,usable,industry,workplace,job_type,dutch_jev,family,closed_at,last_checked,posted_on,skill_tiers,enrollment,level_view,kept_id,pick_rank,role_kind,work_signals"
const KEEP_MS = 10 * 60 * 1000

interface World {
  pool: Json[]
  byId: Map<string, Json>
  ref: Json
  signals: Json
  shares: Json
  at: number
}

let world: Promise<World> | null = null
let worldAt = 0

async function rest(env: Env, path: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<Json> {
  const r = await fetch(`${env.url}/rest/v1/${path}`, { method: init.method, body: init.body, headers: { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}`, "Content-Type": "application/json", ...init.headers } })
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`)

  return r.json()
}

/** A read or write as the server, for the private link only. Every caller filters by the person's own user id. */
async function svc(env: Env, path: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<Json> {
  const key = env.serviceKey!
  const r = await fetch(`${env.url}/rest/v1/${path}`, { method: init.method, body: init.body, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers } })
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()

  return t ? JSON.parse(t) : null
}

async function sha256hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  const digest = await crypto.subtle.digest("SHA-256", bytes)

  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

const KEY_RE = /^odds_[0-9a-f]{48}$/
const keyOf = (req: Request): string => new URL(req.url).searchParams.get("key") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")

/** Whose private link this is, or null without one (or with one that was turned off). */
async function whoIs(env: Env, key: string): Promise<Me | null> {
  if (!KEY_RE.test(key) || !env.serviceKey) return null
  const rows = await svc(env, `mcp_keys?key_hash=eq.${await sha256hex(key)}&select=user_id,last_used_at`)
  const row = rows?.[0]
  if (!row) return null
  // Marked as used at most every ten minutes, so the profile can say when Claude last came by.
  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 600_000) void svc(env, `mcp_keys?user_id=eq.${row.user_id}`, { method: "PATCH", body: JSON.stringify({ last_used_at: new Date().toISOString() }) }).catch(() => undefined)
  const u = await fetch(`${env.url}/auth/v1/admin/users/${row.user_id}`, { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const email = typeof u?.email === "string" && !u.email.endsWith("@guest.odds.invalid") ? u.email : null

  return { id: row.user_id, email }
}

async function readAll(env: Env, table: string, columns: string): Promise<Json[]> {
  const out: Json[] = []
  for (let from = 0; ; from += PAGE * 4) {
    const pages = await Promise.all([0, 1, 2, 3].map((i) => rest(env, `${table}?select=${columns}&order=id`, { headers: { Range: `${from + i * PAGE}-${from + (i + 1) * PAGE - 1}` } })))
    for (const p of pages) out.push(...p)
    if (pages.some((p) => p.length < PAGE)) return out
  }
}

async function load(env: Env): Promise<World> {
  const [rows, bands, ages, tax, transitions] = await Promise.all([
    readAll(env, "app_jobs", COLUMNS),
    rest(env, "cbs_bands?select=*"),
    rest(env, "cbs_age_factors?select=sector,age_band,factor"),
    rest(env, "tax_params?select=params&year=eq.2026"),
    rest(env, "transitions?select=*"),
  ])
  const pool = core.preparePool(rows)

  return { pool, byId: new Map(pool.map((p: Json) => [p.id, p])), ref: core.makeReference(bands, ages, tax[0]?.params, transitions), signals: core.signalsOf(pool), shares: core.sharesOf(pool), at: Date.now() }
}

function worldFor(env: Env): Promise<World> {
  if (!world || Date.now() - worldAt > KEEP_MS) {
    worldAt = Date.now()
    world = load(env).catch((e) => {
      world = null
      throw e
    })
  }

  return world
}

// ---- The tools ----

const person = {
  type: "object",
  description: "The job seeker, as you know them from the conversation or their CV. The more roles, schools and skills, the better the estimate.",
  properties: {
    roles: { type: "array", description: "Jobs, internships, student jobs and positions, newest first.", items: { type: "object", properties: { title: { type: "string" }, company: { type: "string" }, start: { type: "string", description: "e.g. 2024-09 or Sep 2024" }, end: { type: "string", description: "empty if current" }, description: { type: "string" } }, required: ["title"] } },
    education: { type: "array", items: { type: "object", properties: { school: { type: "string" }, degree: { type: "string", description: "e.g. BSc, MSc" }, field: { type: "string" }, start: { type: "string" }, end: { type: "string" } } } },
    skills: { type: "array", items: { type: "string" } },
    dutch: { type: "string", enum: ["none", "basic", "professional"] },
    studying: { type: "boolean", description: "Still a student now." },
    headline: { type: "string" },
  },
}

const TOOLS = [
  {
    name: "list_job_fields",
    title: "Job fields and levels",
    description: "The job fields (lines of work) and levels the other tools accept. Call this first if you are unsure of the exact names.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "search_jobs",
    title: "Search jobs",
    description: "Search the open internship, traineeship and entry-level jobs in the Netherlands that do not require Dutch (the odds pool). Newest first. Every job links to its page on odds.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words that must all appear in the title, company, place or industry." },
        fields: { type: "array", items: { type: "string" }, description: "Job fields from list_job_fields, e.g. 'Finance & accounting'." },
        levels: { type: "array", items: { type: "string" }, description: "Default: Internship and Entry." },
        cities: { type: "array", items: { type: "string" }, description: "e.g. Amsterdam, Rotterdam." },
        sponsor_only: { type: "boolean", description: "Only employers on the IND register of recognised visa sponsors." },
        posted_within: { type: "string", enum: ["day", "week", "month", "any"] },
        min_pay: { type: "number", description: "Minimum pay per month in euros, stated or typical." },
        limit: { type: "number", description: "Up to 50, default 20." },
      },
    },
  },
  {
    name: "get_job",
    title: "Read one job",
    description: "One job in full: the posting text, what it asks for, pay (stated or typical), visa sponsor, applicants, closing date and a link.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
  },
  {
    name: "company_profile",
    title: "Company profile and reviews",
    description: "What is known about an employer: its own LinkedIn company page (size, founded, offices, what employees do and where they studied), its Glassdoor rating and scores, and its latest reviews. As scraped, nothing rewritten.",
    inputSchema: { type: "object", properties: { company: { type: "string", description: "The company name as a job shows it." }, reviews: { type: "number", description: "How many latest reviews to include, up to 30, default 8." } }, required: ["company"] },
  },
  {
    name: "interview_chance",
    title: "Interview chance",
    description: "This person's estimated chance of being invited to interview for one job, with a range, how many people apply, what helps and what holds them back. Uses the same model as the odds app.",
    inputSchema: { type: "object", properties: { job_id: { type: "string" }, person }, required: ["job_id", "person"] },
  },
  {
    name: "tailored_jobs",
    title: "Jobs tailored to someone",
    description: "The jobs that fit this person best, as the odds Jobs page ranks them: their chosen fields first (in their order), roles like their own, then the newest, then their interview chance. Each says why it is there and whether it is one where they are most likely to hear back.",
    inputSchema: { type: "object", properties: { person, fields: { type: "array", items: { type: "string" }, description: "Up to 3 job fields, first choice first (list_job_fields). Leave out to use what their profile points to." }, limit: { type: "number", description: "Up to 50, default 15." } }, required: ["person"] },
  },
]

const jobId = { type: "string", description: "The odds id of the job (from my_jobs, search_jobs or tailored_jobs)." }

/** Only with the person's private link. */
const ME_TOOLS = [
  {
    name: "my_profile",
    title: "My profile",
    description: "The person's own odds profile, from their LinkedIn import and CV: name, email, headline, roles, education, skills, languages, Dutch level, permit. Use it instead of asking them, and to fill in applications.",
    inputSchema: { type: "object", properties: {} },
    write: false,
  },
  {
    name: "my_jobs",
    title: "My saved and applied jobs",
    description: "Every job the person saved or applied to on odds, with where it stands (saved, applied, interviewing, offer...), the closing date, their interview chance, and the CV and cover letter attached to it.",
    inputSchema: { type: "object", properties: {} },
    write: false,
  },
  {
    name: "my_documents",
    title: "My documents",
    description: "The CVs and cover letters the person keeps in odds Documents (up to five), and which CV is their main one.",
    inputSchema: { type: "object", properties: {} },
    write: false,
  },
  {
    name: "read_document",
    title: "Read a document",
    description: "The full text of one of the person's CVs or cover letters.",
    inputSchema: { type: "object", properties: { document_id: { type: "string" } }, required: ["document_id"] },
    write: false,
  },
  {
    name: "application_kit",
    title: "Everything to apply to one job",
    description: "What you need to fill in an application for one job: the job and its link, the posting text, the person's name and email, their CV text (the one attached to the job, else their main CV), the cover letter attached to the job, and their profile. Use it with a browser to fill in the employer's form; always let the person check it and press send themselves.",
    inputSchema: { type: "object", properties: { job_id: jobId }, required: ["job_id"] },
    write: false,
  },
  {
    name: "save_cover_letter",
    title: "Save a cover letter to Documents",
    description: "Saves a cover letter you wrote with the person to their odds Documents, and attaches it to a job when you give one. Ask them first. Documents hold five files at most.",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "A short name, e.g. 'Cover letter Adyen'." }, text: { type: "string", description: "The letter, plain text." }, job_id: jobId }, required: ["name", "text"] },
    write: true,
  },
  {
    name: "save_job",
    title: "Save a job",
    description: "Adds a job to the person's saved jobs on odds.",
    inputSchema: { type: "object", properties: { job_id: jobId }, required: ["job_id"] },
    write: true,
  },
  {
    name: "mark_applied",
    title: "Mark a job applied",
    description: "Records on odds that the person applied to a job, or moves it on (interview, offer, rejected...). Only after they confirm they sent it.",
    inputSchema: { type: "object", properties: { job_id: jobId, stage: { type: "string", enum: ["applied", "interview", "offer", "hired", "rejected", "no_reply", "withdrawn"], description: "Default: applied." } }, required: ["job_id"] },
    write: true,
  },
]

const text = (value: unknown): Json => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }], structuredContent: value })
const failed = (message: string): Json => ({ content: [{ type: "text", text: message }], isError: true })

/** Text kept short, lists kept to a few, numbers kept in range: what a caller sends is never trusted to be small. */
const str = (v: unknown, max = MAX_TEXT): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined)
const strs = (v: unknown, n: number): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, n).map((x) => x.slice(0, MAX_TEXT)) : [])
const int = (v: unknown, lo: number, hi: number, fallback: number): number => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : fallback)

function cleanPerson(v: Json): Json {
  const p = v && typeof v === "object" ? v : {}
  const list = (x: unknown, n: number): Json[] => (Array.isArray(x) ? x.filter((y) => y && typeof y === "object").slice(0, n) : [])

  return {
    roles: list(p.roles, 30).map((r) => ({ title: str(r.title) ?? "", company: str(r.company), start: str(r.start, 20), end: str(r.end, 20), description: str(r.description, 1000) })).filter((r) => r.title),
    education: list(p.education, 15).map((e) => ({ school: str(e.school), degree: str(e.degree), field: str(e.field), start: str(e.start, 20), end: str(e.end, 20) })),
    skills: strs(p.skills, 80),
    dutch: ["none", "basic", "professional"].includes(p.dutch) ? p.dutch : undefined,
    studying: typeof p.studying === "boolean" ? p.studying : undefined,
    headline: str(p.headline),
  }
}

function cleanArgs(v: Json): Json {
  const a = v && typeof v === "object" && !Array.isArray(v) ? v : {}

  return {
    job_id: str(a.job_id, 64),
    company: str(a.company, 120),
    query: str(a.query, 120),
    fields: strs(a.fields, 5),
    levels: strs(a.levels, 7),
    cities: strs(a.cities, 10),
    workplace: strs(a.workplace, 3),
    sponsor_only: a.sponsor_only === true,
    posted_within: ["day", "week", "month", "any"].includes(a.posted_within) ? a.posted_within : undefined,
    min_pay: Number.isFinite(Number(a.min_pay)) && a.min_pay !== undefined ? Math.max(0, Number(a.min_pay)) : undefined,
    limit: a.limit === undefined ? undefined : int(a.limit, 1, 50, 20),
    reviews: int(a.reviews, 0, 30, 8),
    person: cleanPerson(a.person),
    document_id: str(a.document_id, 64),
    name: str(a.name, 80),
    letter: str(a.text, 20000),
    stage: ["applied", "interview", "offer", "hired", "rejected", "no_reply", "withdrawn"].includes(a.stage) ? a.stage : "applied",
  }
}

async function call(env: Env, me: Me | null, keyGiven: boolean, name: string, raw: Json): Promise<Json> {
  const args = cleanArgs(raw)
  if (ME_TOOLS.some((t) => t.name === name)) return me ? callMe(env, me, name, args) : failed(keyGiven ? "This private odds link was turned off. Make a new one on the odds Claude page and add it to Claude again." : "This needs your private odds link. Connect Claude from the Claude page in odds.")
  if (name === "list_job_fields") return text({ fields: core.FIELD_OPTIONS, levels: core.LEVELS.filter((l: string) => l !== "Not stated") })

  const w = await worldFor(env)
  const job = (): Json => (typeof args.job_id === "string" ? (w.byId.get(args.job_id) ?? null) : null)

  if (name === "search_jobs") return text(core.search(w.pool, w.ref, w.signals, { query: args.query, fields: args.fields, levels: args.levels, cities: args.cities, sponsor_only: args.sponsor_only, posted_within: args.posted_within, min_pay: args.min_pay, workplace: args.workplace, limit: args.limit }))

  if (name === "get_job") {
    const post = job()
    if (!post) return failed("No open job with that id in the pool. Use search_jobs to find one.")
    const [body, reqs] = await Promise.all([
      rest(env, `postings?select=body&id=eq.${encodeURIComponent(post.id)}`).catch(() => []),
      rest(env, `postings?select=requirements&id=eq.${encodeURIComponent(post.id)}`).catch(() => []),
    ])

    return text({ ...core.jobLine(post, w.ref), skills: post.skills ?? [], degree_asked: post.degree_asked, years_asked: post.years_min, requirements: reqs[0]?.requirements ?? null, description: String(body[0]?.body ?? "").slice(0, 8000) })
  }

  if (name === "company_profile") {
    const company = String(args.company ?? "").trim()
    if (!company) return failed("Say which company.")
    const match = w.pool.find((p: Json) => p.employer_display?.toLowerCase() === company.toLowerCase() || p.employer?.toLowerCase() === company.toLowerCase())
    const keys = JSON.stringify({ p_employer: match?.employer ?? company, p_display: match?.employer_display ?? company })
    // The researched facts (company_research) fill in for employers with no company page; each fact carries its source.
    const [data, research] = await Promise.all([rest(env, "rpc/job_company", { method: "POST", body: keys }), rest(env, "rpc/company_research", { method: "POST", body: keys }).catch(() => null)])
    const n = args.reviews
    const open = w.pool.filter((p: Json) => p.employer === (match?.employer ?? company)).map((p: Json) => core.jobLine(p, w.ref))

    return text({ company: match?.employer_display ?? company, visa_sponsor: Boolean(match?.ind_sponsor), open_jobs: open, facts: data?.facts ?? null, glassdoor: data?.glassdoor ?? null, review_scores: data?.reviewStats ?? null, latest_reviews: (data?.reviews ?? []).slice(0, n), research: research ?? data?.research ?? undefined })
  }

  if (name === "interview_chance") {
    const post = job()
    if (!post) return failed("No open job with that id in the pool. Use search_jobs to find one.")
    const profile = await personFor(env, me, args.person)
    if (!core.hasProfile(profile)) return failed("Tell me about the person first: at least one role or one degree.")
    const chance = core.chanceFor(post, profile, w.ref, w.shares)

    return chance ? text({ job: core.jobLine(post, w.ref), ...chance }) : failed("No estimate for this job.")
  }

  if (name === "tailored_jobs") {
    const profile = await personFor(env, me, args.person)
    if (!core.hasProfile(profile)) return failed("Tell me about the person first: at least one role or one degree.")
    const mine = me ? await myJobIds(env, me) : null

    return text({ jobs: core.tailoredFor(w.pool, w.ref, w.signals, w.shares, profile, { fields: args.fields, limit: args.limit, saved: mine ? mine.ids.map((id) => w.byId.get(id)).filter(Boolean) : undefined, dismissed: mine?.dismissed }) })
  }

  return failed(`Unknown tool: ${name}`)
}

// ---- The person's own data (private link only) ----

/** Their saved profile, with their main CV's text, the way the app reads it. */
async function myProfile(env: Env, me: Me): Promise<Json> {
  const [rows, main] = await Promise.all([svc(env, `profiles?user_id=eq.${me.id}&select=data`), svc(env, `documents?user_id=eq.${me.id}&is_main=eq.true&select=body`)])
  const profile = core.profileFromSaved(rows?.[0]?.data ?? undefined)
  if (!profile.cv && main?.[0]?.body) profile.cv = main[0].body

  return profile
}

/** What they told Claude in the chat when they did; otherwise their saved profile. */
async function personFor(env: Env, me: Me | null, person: Json): Promise<Json> {
  const told = core.profileFrom(person)
  if (core.hasProfile(told) || !me) return told

  return myProfile(env, me)
}

async function myJobIds(env: Env, me: Me): Promise<{ ids: string[]; stage: Map<string, string>; dismissed: Set<string> }> {
  const [saved, apps, prof] = await Promise.all([
    svc(env, `saved_jobs?user_id=eq.${me.id}&select=posting_id&order=saved_at.desc`),
    svc(env, `applications?user_id=eq.${me.id}&select=posting_id,stage&order=id.desc`),
    svc(env, `profiles?user_id=eq.${me.id}&select=data->dismissed`),
  ])
  const stage = new Map<string, string>((apps ?? []).map((a: Json) => [a.posting_id, a.stage ?? "applied"]))
  const ids = [...new Set([...(saved ?? []).map((r: Json) => r.posting_id), ...stage.keys()])]

  return { ids, stage, dismissed: new Set(Array.isArray(prof?.[0]?.dismissed) ? prof[0].dismissed : []) }
}

const docLine = (d: Json): Json => ({ document_id: d.id, kind: d.kind === "cv" ? "CV" : "cover letter", name: d.name, main_cv: Boolean(d.is_main), file: d.file_name, updated: String(d.updated_at ?? "").slice(0, 10) })

async function callMe(env: Env, me: Me, name: string, args: Json): Promise<Json> {
  const w = await worldFor(env)
  const uid = me.id

  if (name === "my_profile") {
    const p = await myProfile(env, me)

    return text({
      name: p.name || null,
      email: me.email,
      headline: p.headline || null,
      place: p.place || null,
      linkedin: p.linkedin ?? null,
      roles: (p.positions ?? []).map((r: Json) => ({ title: r.Title, company: r["Company Name"], start: r["Started On"] || null, end: r["Finished On"] || null, description: r.Description || null })),
      education: (p.education ?? []).map((e: Json) => ({ school: e["School Name"], degree: e["Degree Name"] || null, field: e["Field Of Study"] || null, start: e["Start Date"] || null, end: e["End Date"] || null })),
      skills: (p.skills ?? []).map((s: Json) => s.Name).filter(Boolean),
      languages: (p.languages ?? []).map((l: Json) => [l.Name, l.Proficiency].filter(Boolean).join(": ")).filter(Boolean),
      dutch: p.dutch,
      studying: p.studying,
      permit: p.permit,
      about: p.about || null,
    })
  }

  if (name === "my_jobs") {
    const [mine, profile, attached, docs] = await Promise.all([myJobIds(env, me), myProfile(env, me), svc(env, `job_documents?user_id=eq.${uid}&select=posting_id,kind,document_id`), svc(env, `documents?user_id=eq.${uid}&select=id,name`)])
    const docName = new Map((docs ?? []).map((d: Json) => [d.id, d.name]))
    const missing = mine.ids.filter((id) => !w.byId.has(id))
    const closed = missing.length ? await rest(env, `postings?select=id,title,employer,employer_display,region,url,valid_through,closed_at&id=in.(${missing.map((id) => `"${encodeURIComponent(id)}"`).join(",")})`).catch(() => []) : []
    const closedBy = new Map((closed ?? []).map((p: Json) => [p.id, p]))
    const jobs = mine.ids.map((id) => {
      const post = w.byId.get(id)
      const files = (attached ?? []).filter((a: Json) => a.posting_id === id).map((a: Json) => ({ kind: a.kind === "cv" ? "CV" : "cover letter", name: docName.get(a.document_id) ?? null, document_id: a.document_id }))
      const status = mine.stage.get(id) ?? "saved"
      if (!post) {
        const c = closedBy.get(id)

        return { id, title: c?.title ?? null, company: c?.employer_display ?? c?.employer ?? null, url: c?.url ?? null, status, still_open: false, attached: files }
      }
      const chance = core.hasProfile(profile) ? core.chanceFor(post, profile, w.ref, w.shares) : null

      return { ...core.jobLine(post, w.ref), status, still_open: true, chance_pct: chance?.chance_pct ?? null, attached: files }
    })

    return text({ jobs, note: jobs.length === 0 ? "Nothing saved yet. Save jobs on odds (or with save_job) and they show here." : undefined })
  }

  if (name === "my_documents") {
    const docs = await svc(env, `documents?user_id=eq.${uid}&select=id,kind,name,file_name,is_main,updated_at&order=created_at`)

    return text({ documents: (docs ?? []).map(docLine), room_left: Math.max(0, 5 - (docs ?? []).length) })
  }

  if (name === "read_document") {
    if (!args.document_id || !/^[0-9a-f-]{36}$/.test(args.document_id)) return failed("Give a document_id from my_documents.")
    const d = (await svc(env, `documents?user_id=eq.${uid}&id=eq.${args.document_id}&select=id,kind,name,file_name,is_main,updated_at,body`))?.[0]

    return d ? text({ ...docLine(d), text: d.body }) : failed("No document with that id in your Documents.")
  }

  if (name === "application_kit") {
    const id = args.job_id ?? ""
    const post = w.byId.get(id)
    if (!post) return failed("No open job with that id. Use my_jobs or search_jobs.")
    const [profile, body, attached, mainCv] = await Promise.all([
      myProfile(env, me),
      rest(env, `postings?select=body&id=eq.${encodeURIComponent(id)}`).catch(() => []),
      svc(env, `job_documents?user_id=eq.${uid}&posting_id=eq.${encodeURIComponent(id)}&select=kind,document_id`),
      svc(env, `documents?user_id=eq.${uid}&is_main=eq.true&select=id,name,body`),
    ])
    const pick = async (kind: string): Promise<Json> => {
      const a = (attached ?? []).find((x: Json) => x.kind === kind)
      if (!a) return null
      return (await svc(env, `documents?user_id=eq.${uid}&id=eq.${a.document_id}&select=id,name,body`))?.[0] ?? null
    }
    const [cv, letter] = await Promise.all([pick("cv"), pick("cover_letter")])
    const useCv = cv ?? mainCv?.[0] ?? null

    return text({
      job: core.jobLine(post, w.ref),
      apply_at: post.url,
      posting: String(body?.[0]?.body ?? "").slice(0, 8000),
      you: { name: profile.name || null, email: me.email, linkedin: profile.linkedin ?? null, place: profile.place || null },
      cv: useCv ? { name: useCv.name, document_id: useCv.id, text: useCv.body, from: cv ? "attached to this job" : "your main CV" } : null,
      cover_letter: letter ? { name: letter.name, document_id: letter.id, text: letter.body } : null,
      how_to_apply: "Open apply_at in the browser, fill the form from you, cv and cover_letter, and stop before submitting: the person checks it and presses send. Upload fields need the file itself: ask the person to attach their CV from odds Documents. Afterwards, mark_applied.",
    })
  }

  if (name === "save_cover_letter") {
    if (!args.name || !args.letter?.trim()) return failed("Give the letter a name and its text.")
    const count = (await svc(env, `documents?user_id=eq.${uid}&select=id`))?.length ?? 0
    if (count >= 5) return failed("Their Documents are full (five files). Ask them to delete one in odds first.")
    const bytes = new TextEncoder().encode(args.letter)
    const id = crypto.randomUUID()
    const path = `${uid}/${id}`
    const fileName = `${args.name.replace(/[^\w .-]+/g, "").trim() || "Cover letter"}.txt`
    // The row first, so the limit and the duplicate-name check refuse before anything is stored; taken back if the file fails.
    try {
      await svc(env, "documents", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id, user_id: uid, kind: "cover_letter", name: args.name, file_name: fileName, mime: "text/plain", size_bytes: bytes.length, content_hash: await sha256hex(bytes), body: args.letter, path, is_main: false }) })
    } catch (e) {
      const m = e instanceof Error ? e.message : ""
      console.error(`save_cover_letter: ${m}`)

      return failed(m.includes("hash") ? "That exact letter is already in their Documents." : m.includes(" 409 ") || m.includes("23505") || m.includes("unique") ? "A cover letter with that name is already in their Documents. Pick another name." : m.includes("document limit") ? "Their Documents are full (five files). Ask them to delete one in odds first." : "Could not save it to Documents.")
    }
    const up = await fetch(`${env.url}/storage/v1/object/documents/${path}`, { method: "POST", headers: { apikey: env.serviceKey!, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "text/plain" }, body: bytes })
    if (!up.ok) {
      await svc(env, `documents?id=eq.${id}&user_id=eq.${uid}`, { method: "DELETE" }).catch(() => undefined)
      return failed("Could not save the file. Try again.")
    }
    if (args.job_id) await svc(env, "job_documents", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, posting_id: args.job_id, kind: "cover_letter", document_id: id }) }).catch(() => undefined)

    return text({ saved: true, document_id: id, name: args.name, attached_to: args.job_id ?? null, note: "It is in their odds Documents now." })
  }

  if (name === "save_job") {
    if (!args.job_id || !w.byId.has(args.job_id)) return failed("No open job with that id.")
    await svc(env, "saved_jobs", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, posting_id: args.job_id }) })

    return text({ saved: true, job: core.jobLine(w.byId.get(args.job_id), w.ref) })
  }

  if (name === "mark_applied") {
    const id = args.job_id ?? ""
    if (!id) return failed("Which job?")
    const existing = await svc(env, `applications?user_id=eq.${uid}&posting_id=eq.${encodeURIComponent(id)}&select=id`)
    if (existing?.[0]) await svc(env, `applications?id=eq.${existing[0].id}&user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ stage: args.stage }) })
    else await svc(env, "applications", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: uid, posting_id: id, fit_tier: "claude", stage: args.stage }) })

    return text({ done: true, job_id: id, stage: args.stage, note: "It shows on their odds tracker." })
  }

  return failed(`Unknown tool: ${name}`)
}

// ---- JSON-RPC over HTTP ----

const ME_INSTRUCTIONS =
  "This is the person's own private link: you can see their profile (my_profile), their CVs and letters (my_documents, read_document), their saved and applied jobs (my_jobs), and everything to apply to one (application_kit). Use these instead of asking them to paste anything. Ask before saving a letter or marking a job applied. When filling in an employer's application form, never press submit yourself: let them check and send it."

const INSTRUCTIONS =
  "odds lists open internship, traineeship and entry-level jobs in the Netherlands that do not require Dutch, for international students. Use search_jobs to find jobs, get_job to read one, company_profile for the employer, and interview_chance or tailored_jobs once you know the person's roles, education and skills. Chances are estimates from published hiring studies, not promises: say so. Link to the odds_link of each job you mention."

async function answer(env: Env, me: Me | null, keyGiven: boolean, msg: Json): Promise<Json> {
  const { id, method, params } = msg ?? {}
  const ok = (result: Json): Json => ({ jsonrpc: "2.0", id, result })
  const err = (code: number, message: string): Json => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } })
  if (msg?.jsonrpc !== "2.0" || typeof method !== "string") return err(-32600, "Invalid request")
  // A notification (no id) gets no answer.
  if (id === undefined) return null

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion

      return ok({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "odds", title: "odds: jobs for international students in the Netherlands", version: "1.1.0" }, instructions: me ? `${INSTRUCTIONS} ${ME_INSTRUCTIONS}` : keyGiven ? `${INSTRUCTIONS} This private link was turned off: tell the person to make a new one on their odds profile.` : INSTRUCTIONS })
    }
    case "ping":
      return ok({})
    case "tools/list":
      return ok({
        tools: [
          ...TOOLS.map((t) => ({ ...t, annotations: { readOnlyHint: true, openWorldHint: false } })),
          ...(me ? ME_TOOLS.map(({ write, ...t }) => ({ ...t, annotations: { readOnlyHint: !write, destructiveHint: false, idempotentHint: !write, openWorldHint: false } })) : []),
        ],
      })
    case "tools/call":
      try {
        return ok(await call(env, me, keyGiven, params?.name, params?.arguments))
      } catch (e) {
        // The detail goes to the function log, not to the caller: it can name tables and columns.
        console.error(`mcp ${params?.name}: ${e instanceof Error ? e.message : String(e)}`)

        return ok(failed("Something went wrong reading the jobs. Try again in a moment."))
      }
    default:
      return err(-32601, `Method not found: ${method}`)
  }
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  // Stateless: no stream to open and no session to end.
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Use POST (MCP Streamable HTTP)." }), { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS", "Content-Type": "application/json" } })
  const length = Number(req.headers.get("content-length") ?? 0)
  if (length > MAX_BODY_BYTES) return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large." } }), { status: 413, headers: { ...CORS, "Content-Type": "application/json" } })
  let body: Json
  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) throw new Error("too large")
    body = JSON.parse(raw)
  } catch {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } })
  }
  const batch = Array.isArray(body)
  if (batch && (body.length === 0 || body.length > MAX_BATCH)) return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Send 1 to ${MAX_BATCH} messages at once.` } }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } })
  const key = keyOf(req)
  const me = key ? await whoIs(env, key).catch(() => null) : null
  const replies = (await Promise.all((batch ? body : [body]).map((m: Json) => answer(env, me, Boolean(key), m)))).filter((r) => r !== null)
  if (replies.length === 0) return new Response(null, { status: 202, headers: CORS })

  return new Response(JSON.stringify(batch ? replies : replies[0]), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } })
}
