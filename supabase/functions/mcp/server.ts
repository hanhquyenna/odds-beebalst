// The odds MCP server: lets Claude, ChatGPT or any MCP client search the job pool, read a job and its company, and work out
// someone's interview chance and tailored list, with the app's own rules (core.js, bundled from src/lib by scripts/build-mcp-core.sh).
//
// Transport: MCP Streamable HTTP, stateless (every POST stands alone, answered as JSON; no server-sent stream is needed for tools).
// Access: signed in only. A request without a person's key is answered 401 and the client signs them in (oauth.ts); a client may also
// carry the private link of the profile page (the old way).
// What a signed-in person gets (their key: oauth.ts, or ?key=odds_... from migrations/20261010140000_claude_private_link.sql): the job pool, and
// their own profile, documents, saved jobs and applications, and they can save a cover letter to Documents and mark a job applied.
// Every one of those reads and writes is filtered by the user id the key belongs to. Nothing calls a paid service (no Apify, no models).
// @ts-ignore: bundled from src/lib by scripts/build-mcp-core.sh
import * as core from "./core.js"
import { handleOAuth, unauthorized } from "./oauth.ts"
import { accessFor, contentOf, driveEnv, linkOf, pushIfConnected } from "../_shared/drive.ts"
import { cleanAnswers, missingAnswers, type Answers } from "../_shared/application-answers.ts"
import { cleanCv, cvText, renderCvPdf } from "../_shared/cv-template.ts"
import { parseJobUrl } from "../_shared/job-intake.ts"
// @ts-ignore: npm specifier, resolved by Deno
import * as PDFLib from "npm:pdf-lib@1.17.1"

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"]
/** Public endpoint: what one request may ask for, so no single call can make the server do much work. */
const MAX_BODY_BYTES = 64 * 1024
const MAX_BATCH = 10
const MAX_TEXT = 300
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, accept, apikey, x-client-info, mcp-protocol-version, mcp-session-id, last-event-id",
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
  /** The private key itself, to build links to their files that only work with it. */
  key: string
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

  return { id: row.user_id, email, key }
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
    name: "similar_to_saved",
    title: "Jobs like the ones I saved",
    description: "A few open jobs like the ones the person saved or applied to, in the same mix as their list (two thirds finance saved: about two thirds of the suggestions are finance-like). A job they applied to or are interviewing for counts more than one they only saved; nothing much like a job they dismissed is suggested.",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "Up to 20, default 5." } } },
    write: false,
  },
  {
    name: "my_documents",
    title: "My documents",
    description: "The CVs and cover letters the person keeps in odds Documents (up to thirty), and which CV is their main one.",
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
    name: "my_application_answers",
    title: "My standard application answers",
    description: "The answers application forms keep asking (phone, right to work in the Netherlands, pay expected, start date, hours a week, notice period, relocation) as the person saved them on odds, and which are still empty. Use them to fill a form. Never invent one that is empty: ask the person once, then save it with save_application_answers.",
    inputSchema: { type: "object", properties: {} },
    write: false,
  },
  {
    name: "save_application_answers",
    title: "Save standard application answers",
    description: "Saves answers the person just gave you (only those: never guess one) so every later application uses the same. Send only the fields to set or change; an empty text clears a field. Ask them to confirm the wording first.",
    inputSchema: {
      type: "object",
      properties: {
        answers: {
          type: "object",
          properties: {
            phone: { type: "string" },
            website: { type: "string", description: "Portfolio, personal site or GitHub." },
            work_authorization: { type: "string", description: "Right to work in the Netherlands, in their words, e.g. 'I need a work permit; the employer sponsors it as a recognised sponsor.'" },
            expected_salary: { type: "string", description: "As a form wants it, e.g. 'EUR 600 a month' or 'negotiable'." },
            start_date: { type: "string" },
            hours_per_week: { type: "string" },
            notice_period: { type: "string" },
            relocation: { type: "string" },
            notes: { type: "string", description: "Anything else forms ask that stays the same." },
          },
        },
      },
      required: ["answers"],
    },
    write: true,
  },
  {
    name: "save_cv",
    title: "Make a CV in odds's format and save it",
    description:
      "Makes a CV from the content you give, always in the same format (A4 PDF, one column, plain headings: it reads cleanly in employers' systems), saves it to the person's Documents and attaches it to a job when you give one. Use it to prepare a CV for one job: read their CV (read_document) and my_profile, keep every fact true, and choose and reword what fits the job. Send content only, never layout. Ask them first and tell them what you changed. Thirty files at most.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "A short name, e.g. 'CV Givaudan pricing'." },
        job_id: jobId,
        cv: {
          type: "object",
          description: "The CV content.",
          properties: {
            name: { type: "string" },
            headline: { type: "string" },
            contact: { type: "object", properties: { email: { type: "string" }, phone: { type: "string" }, place: { type: "string" }, linkedin: { type: "string" }, website: { type: "string" } } },
            summary: { type: "string", description: "Two or three lines at most." },
            experience: { type: "array", description: "Newest first, at most 8.", items: { type: "object", properties: { title: { type: "string" }, company: { type: "string" }, location: { type: "string" }, start: { type: "string", description: "e.g. 'Mar 2026'" }, end: { type: "string", description: "e.g. 'Aug 2026' or 'Present'" }, bullets: { type: "array", items: { type: "string" }, description: "At most 8, one line each." } }, required: ["title", "company"] } },
            education: { type: "array", items: { type: "object", properties: { school: { type: "string" }, degree: { type: "string" }, field: { type: "string" }, start: { type: "string" }, end: { type: "string", description: "e.g. 'Jun 2027' or 'Expected Jun 2027'" }, details: { type: "string" } }, required: ["school"] } },
            skills: { type: "array", description: "Rows like { label: 'Finance', items: [...] }, or plain strings.", items: { type: "object", properties: { label: { type: "string" }, items: { type: "array", items: { type: "string" } } } } },
            projects: { type: "array", items: { type: "object", properties: { name: { type: "string" }, when: { type: "string" }, bullets: { type: "array", items: { type: "string" } } }, required: ["name"] } },
            languages: { type: "array", items: { type: "string" } },
          },
          required: ["name", "contact"],
        },
      },
      required: ["name", "cv"],
    },
    write: true,
  },
  {
    name: "my_people",
    title: "People I can contact",
    description: "The people the person keeps on odds at employers (name, role, company, the job, where the contact stands, their LinkedIn), and for a job the people odds found there that are not added yet. Give job_id to see one job's. Use it to plan outreach.",
    inputSchema: { type: "object", properties: { job_id: jobId } },
    write: false,
  },
  {
    name: "save_outreach",
    title: "Save an outreach message draft",
    description:
      "Saves a message you wrote for one person at an employer (a LinkedIn connection note, a LinkedIn message, or an email) as a draft the person sees on odds. You only draft: it is sent only after the person approves it (approve_outreach, or the button on odds), because messages go out in their name. Write it from their real background and the job, short, specific, one clear ask, never pushy, and no claim that is not true. A LinkedIn note is 300 characters at most. Ask them before saving a batch.",
    inputSchema: {
      type: "object",
      properties: {
        person_id: { type: "string", description: "A person_id from my_people, when the message is for someone on their list." },
        to_name: { type: "string", description: "Who it is for, when they are not on the list." },
        to_url: { type: "string", description: "Their LinkedIn address or email, when they are not on the list." },
        job_id: jobId,
        channel: { type: "string", enum: ["linkedin_note", "linkedin_message", "email"] },
        subject: { type: "string", description: "Email only." },
        body: { type: "string" },
      },
      required: ["channel", "body"],
    },
    write: true,
  },
  {
    name: "my_outreach",
    title: "My outreach drafts",
    description: "The message drafts saved for the person (waiting to be sent, or sent), newest first. Give job_id or draft_status to narrow them.",
    inputSchema: { type: "object", properties: { job_id: jobId, draft_status: { type: "string", enum: ["draft", "approved", "sent"] } } },
    write: false,
  },
  {
    name: "approve_outreach",
    title: "Approve drafts for sending",
    description: "Marks drafts (from my_outreach) as approved to send. Use it only when the person has just said, in this chat, to send them: that is their permission, for those messages only, up to ten at a time. Messages they approve on odds count the same. Then outreach_to_send gives what to send.",
    inputSchema: { type: "object", properties: { draft_ids: { type: "array", items: { type: "string" }, description: "Up to ten draft_ids from my_outreach." } }, required: ["draft_ids"] },
    write: true,
  },
  {
    name: "outreach_to_send",
    title: "Approved messages to send now",
    description: "The drafts the person approved, ready to send, with the steps for each channel, and how many more may go today (a daily limit keeps their LinkedIn account safe). Send only these, only that many, exactly as written, in their own signed-in browser, then mark_contacted each one.",
    inputSchema: { type: "object", properties: {} },
    write: false,
  },
  {
    name: "mark_contacted",
    title: "Mark a message sent",
    description: "Records that a draft went out: right after you sent an approved one, or when the person tells you they sent a draft themselves. On odds that person then shows as Contacted.",
    inputSchema: { type: "object", properties: { draft_id: { type: "string" } }, required: ["draft_id"] },
    write: true,
  },
  {
    name: "export_my_odds",
    title: "Everything I keep on odds",
    description: "In one call: the person's profile, every saved and applied job with where it stands, and their CVs and cover letters (names and links, not full texts: use read_document for a text). Use it when they ask for their information, or to plan before working through their jobs.",
    inputSchema: { type: "object", properties: {} },
    write: false,
  },
  {
    name: "attach_document",
    title: "Put a CV or cover letter on a job",
    description: "Attaches one of the person's CVs or cover letters (from my_documents) to a job, in place of the one of that kind already on it. That is the CV application_kit then uses for the job. Do it for each job when they ask for a CV per job.",
    inputSchema: { type: "object", properties: { job_id: jobId, document_id: { type: "string", description: "From my_documents." } }, required: ["job_id", "document_id"] },
    write: true,
  },
  {
    name: "save_cover_letter",
    title: "Save a cover letter to Documents",
    description: "Saves a cover letter you wrote with the person to their odds Documents, and attaches it to a job when you give one. Ask them first. Documents hold thirty files at most.",
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
    // Checked where they are used (cleanCv, cleanAnswers): the shape is theirs.
    cv: a.cv,
    answers: a.answers,
    channel: ["linkedin_note", "linkedin_message", "email"].includes(a.channel) ? a.channel : undefined,
    body: str(a.body, 3000),
    subject: str(a.subject, 200),
    person_id: str(a.person_id, 80),
    to_name: str(a.to_name, 200),
    to_url: str(a.to_url, 500),
    draft_id: str(a.draft_id, 64),
    draft_status: ["draft", "approved", "sent"].includes(a.draft_status) ? a.draft_status : undefined,
    draft_ids: strs(a.draft_ids, 10).map((x) => x.slice(0, 64)),
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

    return text({ jobs: core.tailoredFor(w.pool, w.ref, w.signals, w.shares, profile, { fields: args.fields, limit: args.limit, saved: mine ? mine.ids.map((id) => w.byId.get(id)).filter(Boolean) : undefined, dismissed: mine?.dismissed, stages: mine?.stage }) })
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

/** A link to the original file (PDF, Word) that works only with the person's own private key: for upload fields on an application form. */
const fileUrl = (env: Env, me: Me, docId: string): string => `${env.url}/functions/v1/mcp/file?key=${encodeURIComponent(me.key)}&doc=${docId}`

/** GET /mcp/file?key=...&doc=...: the person's own CV or letter as they uploaded it, from their Google Drive when it lives there, else from odds. */
async function serveFile(req: Request, env: Env): Promise<Response> {
  const fail = (status: number, message: string): Response => new Response(JSON.stringify({ error: message }), { status, headers: { ...CORS, "Content-Type": "application/json" } })
  const me = await whoIs(env, keyOf(req)).catch(() => null)
  if (!me) return fail(401, "This link needs your private odds link key.")
  const doc = new URL(req.url).searchParams.get("doc") ?? ""
  if (!/^[0-9a-f-]{36}$/.test(doc)) return fail(400, "Give doc, a document_id from my_documents.")
  const row = (await svc(env, `documents?user_id=eq.${me.id}&id=eq.${doc}&select=file_name,mime,path,drive_file_id`))?.[0]
  if (!row) return fail(404, "No document with that id in your Documents.")
  let r: Response
  if (row.drive_file_id) {
    const denv = driveEnv()
    const link = denv ? await linkOf(denv, me.id) : null
    if (!denv || !link) return fail(502, "The file is in Google Drive, and odds can no longer reach it. Reconnect Drive in Documents.")
    r = await contentOf(await accessFor(denv, link), row.drive_file_id)
  } else {
    r = await fetch(`${env.url}/storage/v1/object/documents/${String(row.path).split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: env.serviceKey!, Authorization: `Bearer ${env.serviceKey}` } })
  }
  if (!r.ok || !r.body) return fail(502, "We could not get that file right now. Try again.")

  return new Response(r.body, { status: 200, headers: { ...CORS, "Content-Type": row.mime || "application/octet-stream", "Content-Disposition": `attachment; filename="${String(row.file_name).replace(/["\\\r\n]/g, "")}"`, "Cache-Control": "private, no-store" } })
}

/** Their standard application answers (table application_answers): the same ones every application form asks. */
async function myAnswers(env: Env, uid: string): Promise<Answers> {
  const rows = await svc(env, `application_answers?user_id=eq.${uid}&select=data`)

  return cleanAnswers(rows?.[0]?.data)
}

const HOW_TO_APPLY =
  "1) Open apply_at in the person's own browser (their Chrome keeps them signed in to sites). 2) If the page asks to sign in or create an account (Workday, LinkedIn, company portals), STOP and tell them: 'Please sign in (or create the account) in this tab, then tell me to continue.' Never type their password, never create the account for them, never answer a CAPTCHA or a verification code. Wait for them to say continue. 3) Fill the form from `you`, `standard_answers`, `cv` and `cover_letter`. For an upload field, download file_url (their CV or letter as a file) and attach it; if you cannot attach files, ask them to. For a question that none of these answers, do not invent an answer: ask them, and offer to keep it with save_application_answers. 4) Stop before submitting: show them what you filled in and let them press send. 5) Only after they say it is sent, mark_applied."

/** Messages that may go out in a day, from the person's own LinkedIn or mail: few, so their account stays in good standing. */
const DAILY_SEND_CAP = 10

const HOW_TO_SEND =
  "A draft is only a draft until the person approves it (approve_outreach, after they say so in the chat, or the button on odds). Then outreach_to_send lists what may go out. Never send anything that is not in that list, never change the words, and never send more than remaining_today."

const SEND_STEPS: Record<string, string> = {
  linkedin_note: "Open their LinkedIn page (to_url) in the person's browser, signed in as them. Choose Connect (under More if it is hidden), then Add a note, paste the message, and send. If LinkedIn offers no note (they are already connected, or the invitation limit is reached), stop and tell the person.",
  linkedin_message: "Open their LinkedIn page (to_url), choose Message, paste the message, and send.",
  email: "Open a new email to to_url in the person's webmail, put in the subject and the message, and send.",
}

const SEND_RULES =
  "Work in the person's own signed-in browser. Leave 30 to 90 seconds between messages. If LinkedIn shows a warning, a CAPTCHA, a verification step or a weekly limit, stop at once, tell the person, and do not try again or get around it. After each message that went out, call mark_contacted with its draft_id. Tell the person at the end what was sent."

/**
 * Saves a CV or a letter the way the app does: the row first (so the limit and the same-name check refuse before anything is stored),
 * then the file, taken back if the file fails; attached to a job when given; pushed to their Drive when it is connected.
 */
async function saveDocument(env: Env, uid: string, d: { kind: "cv" | "cover_letter"; name: string; fileName: string; mime: string; bytes: Uint8Array; textBody: string; jobId?: string; label: string }): Promise<Json> {
  const count = (await svc(env, `documents?user_id=eq.${uid}&select=id`))?.length ?? 0
  if (count >= 30) return failed("Their Documents are full (thirty files). Ask them to delete one in odds first.")
  const id = crypto.randomUUID()
  const path = `${uid}/${id}`
  try {
    await svc(env, "documents", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id, user_id: uid, kind: d.kind, name: d.name, file_name: d.fileName, mime: d.mime, size_bytes: d.bytes.length, content_hash: await sha256hex(d.bytes), body: d.textBody, path, is_main: false }) })
  } catch (e) {
    const m = e instanceof Error ? e.message : ""
    console.error(`save ${d.label}: ${m}`)

    return failed(m.includes("hash") ? `That exact ${d.label} is already in their Documents.` : m.includes(" 409 ") || m.includes("23505") || m.includes("unique") ? `A ${d.label} with that name is already in their Documents. Pick another name.` : m.includes("document limit") ? "Their Documents are full (thirty files). Ask them to delete one in odds first." : `Could not save the ${d.label}. Try again.`)
  }
  const up = await fetch(`${env.url}/storage/v1/object/documents/${path}`, { method: "POST", headers: { apikey: env.serviceKey!, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": d.mime }, body: d.bytes })
  if (!up.ok) {
    await svc(env, `documents?id=eq.${id}&user_id=eq.${uid}`, { method: "DELETE" }).catch(() => undefined)

    return failed("Could not save the file. Try again.")
  }
  if (d.jobId) await svc(env, "job_documents?on_conflict=user_id,posting_id,kind", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, posting_id: d.jobId, kind: d.kind, document_id: id }) }).catch(() => undefined)
  // With their Google Drive connected, the file goes on into odds/CVs or odds/Cover letters there; if Drive fails it stays in the bucket
  // and the app's next sync moves it.
  await pushIfConnected(uid, id).catch(() => undefined)

  return text({ saved: true, document_id: id, name: d.name, kind: d.label, attached_to: d.jobId ?? null, note: "It is in their odds Documents now." })
}

const NO_POOL = new Set(["my_profile", "my_documents", "read_document", "my_application_answers", "save_application_answers", "my_people", "save_outreach", "my_outreach", "mark_contacted", "save_cv", "save_cover_letter"])

async function callMe(env: Env, me: Me, name: string, args: Json): Promise<Json> {
  if (name === "export_my_odds") {
    const [profile, jobs, documents] = await Promise.all(["my_profile", "my_jobs", "my_documents"].map((n) => callMe(env, me, n, args)))

    return text({ profile: profile.structuredContent, jobs: jobs.structuredContent?.jobs ?? [], documents: documents.structuredContent?.documents ?? [] })
  }
  // Tools that only read or write the person's own rows do not wait for the whole job pool (a cold copy of this function takes seconds to load it).
  const w = NO_POOL.has(name) ? (null as never) : await worldFor(env)
  const uid = me.id
  // One row read, not the whole pool: the job is open if the app_jobs view has it.
  const knownJob = async (id: string): Promise<boolean> => ((await rest(env, `app_jobs?select=id&id=eq.${encodeURIComponent(id)}`)) ?? []).length > 0

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

  if (name === "similar_to_saved") {
    const [mine, profile] = await Promise.all([myJobIds(env, me), myProfile(env, me)])
    const saved = mine.ids.map((id) => w.byId.get(id)).filter(Boolean)
    if (saved.length === 0) return text({ jobs: [], note: "Nothing saved yet: save a few jobs and they will be suggested from." })
    const dismissed = [...mine.dismissed].map((id) => w.byId.get(id)).filter(Boolean)

    return text({ jobs: core.similarToSaved(w.pool, w.ref, w.shares, profile, saved, { stages: mine.stage, dismissed, limit: args.limit }) })
  }

  if (name === "my_documents") {
    const docs = await svc(env, `documents?user_id=eq.${uid}&select=id,kind,name,file_name,is_main,updated_at&order=created_at`)

    return text({ documents: (docs ?? []).map((d: Json) => ({ ...docLine(d), file_url: fileUrl(env, me, d.id) })), room_left: Math.max(0, 30 - (docs ?? []).length) })
  }

  if (name === "read_document") {
    if (!args.document_id || !/^[0-9a-f-]{36}$/.test(args.document_id)) return failed("Give a document_id from my_documents.")
    const d = (await svc(env, `documents?user_id=eq.${uid}&id=eq.${args.document_id}&select=id,kind,name,file_name,is_main,updated_at,body`))?.[0]

    return d ? text({ ...docLine(d), file_url: fileUrl(env, me, d.id), text: d.body }) : failed("No document with that id in your Documents.")
  }

  if (name === "application_kit") {
    const id = args.job_id ?? ""
    const post = w.byId.get(id)
    if (!post) return failed("No open job with that id. Use my_jobs or search_jobs.")
    const [profile, body, attached, mainCv, answers] = await Promise.all([
      myProfile(env, me),
      rest(env, `postings?select=body&id=eq.${encodeURIComponent(id)}`).catch(() => []),
      svc(env, `job_documents?user_id=eq.${uid}&posting_id=eq.${encodeURIComponent(id)}&select=kind,document_id`),
      svc(env, `documents?user_id=eq.${uid}&is_main=eq.true&select=id,name`),
      myAnswers(env, uid),
    ])
    const pick = async (kind: string): Promise<Json> => {
      const a = (attached ?? []).find((x: Json) => x.kind === kind)
      if (!a) return null
      return (await svc(env, `documents?user_id=eq.${uid}&id=eq.${a.document_id}&select=id,name,body`))?.[0] ?? null
    }
    const [cv, letter] = await Promise.all([pick("cv"), pick("cover_letter")])
    const missing = missingAnswers(answers)

    return text({
      job: core.jobLine(post, w.ref),
      apply_at: post.url,
      posting: String(body?.[0]?.body ?? "").slice(0, 8000),
      you: { name: profile.name || null, email: me.email, linkedin: profile.linkedin ?? null, place: profile.place || null },
      // Only the CV the person put on this job. The main CV is not put on a job for them: it is offered, and the choice is theirs.
      cv: cv ? { name: cv.name, document_id: cv.id, file_url: fileUrl(env, me, cv.id), text: cv.body, from: "attached to this job" } : null,
      cv_note: cv ? undefined : `No CV is on this job yet.${mainCv?.[0] ? ` Their main CV is "${mainCv[0].name}" (document_id ${mainCv[0].id}).` : ""} Choose the one that fits this job from my_documents (ask them if it is not clear), or make one for it with save_cv, then attach_document it, and read it with read_document.`,
      cover_letter: letter ? { name: letter.name, document_id: letter.id, file_url: fileUrl(env, me, letter.id), text: letter.body } : null,
      standard_answers: answers,
      not_answered_yet: missing,
      how_to_apply: HOW_TO_APPLY,
    })
  }

  if (name === "my_application_answers") {
    const answers = await myAnswers(env, uid)

    return text({ answers, not_answered_yet: missingAnswers(answers), note: "Never invent an empty one: ask the person, then save_application_answers." })
  }

  if (name === "save_application_answers") {
    const given = cleanAnswers(args.answers)
    const raw = args.answers && typeof args.answers === "object" ? (args.answers as Json) : {}
    // An empty text clears a field; a field not sent stays.
    const cleared = Object.keys(raw).filter((k) => typeof raw[k] === "string" && raw[k].trim() === "")
    if (Object.keys(given).length === 0 && cleared.length === 0) return failed("Send at least one answer, e.g. { answers: { phone: '+31 6 ...' } }.")
    const merged: Json = { ...(await myAnswers(env, uid)), ...given }
    for (const k of cleared) delete merged[k]
    await svc(env, "application_answers?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, data: merged, updated_at: new Date().toISOString() }) })

    return text({ saved: true, answers: merged, not_answered_yet: missingAnswers(merged), note: "They can read and change these on their odds profile." })
  }

  if (name === "save_cv") {
    if (!args.name || !args.name.trim()) return failed("Give the CV a name, e.g. 'CV Givaudan pricing'.")
    if (args.job_id && !(await knownJob(args.job_id))) return failed("No open job with that id.")
    const checked = cleanCv(args.cv)
    if ("error" in checked) return failed(checked.error)
    let bytes: Uint8Array
    try {
      bytes = await renderCvPdf(PDFLib as never, checked.cv)
    } catch (e) {
      console.error(`save_cv pdf: ${e instanceof Error ? e.message : String(e)}`)

      return failed("Could not make the PDF. Try again with a shorter CV.")
    }

    return saveDocument(env, uid, { kind: "cv", name: args.name, fileName: `${args.name.replace(/[^\w .-]+/g, "").trim() || "CV"}.pdf`, mime: "application/pdf", bytes, textBody: cvText(checked.cv), jobId: args.job_id, label: "CV" })
  }

  if (name === "my_people") {
    const [rows, drafts] = await Promise.all([svc(env, `profiles?user_id=eq.${uid}&select=data`), svc(env, `outreach_drafts?user_id=eq.${uid}&select=id,person_id,status,channel`)])
    const data: Json = rows?.[0]?.data ?? {}
    const jobId = args.job_id
    const mine: Json[] = Array.isArray(data.people) ? data.people : []
    const people = mine
      .filter((p) => !jobId || p.jobId === jobId)
      .map((p) => ({
        person_id: p.id,
        name: p.name,
        role: p.role || null,
        company: p.company || null,
        job_id: p.jobId ?? null,
        status: p.status,
        contact: p.contact || null,
        place: p.place || null,
        notes: p.notes || null,
        drafts: (drafts ?? []).filter((d: Json) => d.person_id === p.id).map((d: Json) => ({ draft_id: d.id, channel: d.channel, status: d.status })),
      }))
    const found = jobId ? data.peopleFound?.[jobId] : null
    const have = new Set(mine.map((p) => String(p.contact ?? "").toLowerCase()))
    const suggested = Array.isArray(found?.pool) ? found.pool.filter((f: Json) => f?.url && !have.has(String(f.url).toLowerCase())).slice(0, 15).map((f: Json) => ({ name: f.name, headline: f.headline || null, place: f.place || null, linkedin: f.url })) : []

    return text({ people, suggested, note: people.length === 0 && suggested.length === 0 ? "Nobody yet. They find people on a job's page on odds (People at the company), or you can draft for someone they name with save_outreach (to_name, to_url)." : undefined })
  }

  if (name === "save_outreach") {
    if (!args.channel || !args.body?.trim()) return failed("Give a channel (linkedin_note, linkedin_message or email) and the message body.")
    if (args.channel === "linkedin_note" && args.body.length > 300) return failed(`A LinkedIn note is 300 characters at most; this is ${args.body.length}. Shorten it.`)
    if (args.channel === "email" && !args.subject?.trim()) return failed("An email needs a subject.")
    if (args.job_id && !(await knownJob(args.job_id))) return failed("No open job with that id.")
    let toName = args.to_name?.trim()
    let toUrl = args.to_url?.trim() || null
    if (args.person_id) {
      const rows = await svc(env, `profiles?user_id=eq.${uid}&select=data`)
      const person = (Array.isArray(rows?.[0]?.data?.people) ? rows[0].data.people : []).find((p: Json) => p.id === args.person_id)
      if (!person) return failed("No person with that person_id on their list. Use my_people.")
      toName = person.name
      toUrl = toUrl ?? (person.contact || null)
    }
    if (!toName) return failed("Say who it is for: a person_id from my_people, or to_name.")
    const saved = await svc(env, "outreach_drafts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: uid, person_id: args.person_id ?? null, posting_id: args.job_id ?? null, to_name: toName, to_url: toUrl, channel: args.channel, subject: args.channel === "email" ? args.subject : null, body: args.body }) }).catch((e) => {
      const m = e instanceof Error ? e.message : ""
      console.error(`save_outreach: ${m}`)

      return { failed: m.includes("outreach limit") ? "Their drafts are full (three hundred). Ask them to clear some on odds." : "Could not save the draft. Try again." }
    })
    if (saved?.failed) return failed(saved.failed)

    return text({ saved: true, draft_id: saved[0].id, for: toName, channel: args.channel, how_to_send: HOW_TO_SEND, note: "It is on their odds, under the person, ready to copy. It goes out only if they approve it." })
  }

  if (name === "my_outreach") {
    const filter = `${args.job_id ? `&posting_id=eq.${encodeURIComponent(args.job_id)}` : ""}${args.draft_status ? `&status=eq.${args.draft_status}` : ""}`
    const rows = await svc(env, `outreach_drafts?user_id=eq.${uid}${filter}&select=id,person_id,posting_id,to_name,to_url,channel,subject,body,status,created_at,sent_at&order=created_at.desc&limit=100`)

    return text({ drafts: (rows ?? []).map((d: Json) => ({ draft_id: d.id, for: d.to_name, linkedin_or_email: d.to_url, person_id: d.person_id, job_id: d.posting_id, channel: d.channel, subject: d.subject, message: d.body, status: d.status, written: String(d.created_at).slice(0, 10), sent: d.sent_at ? String(d.sent_at).slice(0, 10) : null })) })
  }

  if (name === "approve_outreach") {
    const ids = [...new Set(args.draft_ids as string[])].filter((x) => /^[0-9a-f-]{36}$/.test(x))
    if (ids.length === 0) return failed("Give draft_ids from my_outreach (up to ten).")
    const done = await svc(env, `outreach_drafts?user_id=eq.${uid}&status=eq.draft&id=in.(${ids.join(",")})`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "approved", approved_at: new Date().toISOString() }) })
    const approved = new Set((done ?? []).map((d: Json) => d.id))

    return text({ approved: [...approved], not_approved: ids.filter((x) => !approved.has(x)), note: approved.size > 0 ? "Now outreach_to_send lists them." : "None of those is a waiting draft of theirs (already approved or sent, or not theirs)." })
  }

  if (name === "outreach_to_send") {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const [ready, sentToday] = await Promise.all([
      svc(env, `outreach_drafts?user_id=eq.${uid}&status=eq.approved&select=id,to_name,to_url,channel,subject,body,posting_id&order=approved_at.asc&limit=50`),
      svc(env, `outreach_drafts?user_id=eq.${uid}&status=eq.sent&sent_at=gte.${since}&select=id`),
    ])
    const remaining = Math.max(0, DAILY_SEND_CAP - (sentToday ?? []).length)
    const go = (ready ?? []).slice(0, remaining).map((d: Json) => ({ draft_id: d.id, for: d.to_name, to_url: d.to_url, channel: d.channel, subject: d.subject, message: d.body, job_id: d.posting_id, steps: SEND_STEPS[d.channel] }))

    return text({ to_send: go, waiting_for_tomorrow: Math.max(0, (ready ?? []).length - go.length), sent_last_24h: (sentToday ?? []).length, daily_limit: DAILY_SEND_CAP, remaining_today: remaining, rules: SEND_RULES, note: go.length === 0 ? "Nothing approved to send right now." : undefined })
  }

  if (name === "mark_contacted") {
    if (!args.draft_id || !/^[0-9a-f-]{36}$/.test(args.draft_id)) return failed("Give a draft_id from my_outreach.")
    const done = await svc(env, `outreach_drafts?user_id=eq.${uid}&id=eq.${args.draft_id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "sent", sent_at: new Date().toISOString() }) })
    if (!done?.[0]) return failed("No draft with that id.")

    return text({ done: true, for: done[0].to_name, note: "On odds that person now shows as Contacted." })
  }

  if (name === "save_cover_letter") {
    if (!args.name || !args.letter?.trim()) return failed("Give the letter a name and its text.")
    const bytes = new TextEncoder().encode(args.letter)

    return saveDocument(env, uid, { kind: "cover_letter", name: args.name, fileName: `${args.name.replace(/[^\w .-]+/g, "").trim() || "Cover letter"}.txt`, mime: "text/plain", bytes, textBody: args.letter, jobId: args.job_id, label: "cover letter" })
  }

  if (name === "attach_document") {
    if (!args.job_id || !w.byId.has(args.job_id)) return failed("No open job with that id.")
    if (!args.document_id || !/^[0-9a-f-]{36}$/.test(args.document_id)) return failed("Give a document_id from my_documents.")
    const d = (await svc(env, `documents?user_id=eq.${uid}&id=eq.${args.document_id}&select=id,kind,name`))?.[0]
    if (!d) return failed("No document with that id in your Documents.")
    await svc(env, "job_documents?on_conflict=user_id,posting_id,kind", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, posting_id: args.job_id, kind: d.kind, document_id: d.id }) })

    return text({ attached: true, job: core.jobLine(w.byId.get(args.job_id), w.ref), document: d.name, kind: d.kind === "cv" ? "CV" : "cover letter" })
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
    // The chance as it stands now, kept with the application so it can be checked against what happens (outcome loop). The first one per job stays.
    const post = w.byId.get(id)
    if (post && args.stage === "applied") {
      const profile = await myProfile(env, me)
      if (core.hasProfile(profile)) {
        await svc(env, "chance_snapshots", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ user_id: uid, ...core.chanceSnapshot(post, profile, {}) }) }).catch((e) => console.error(`snapshot: ${e instanceof Error ? e.message : e}`))
      }
    }

    return text({ done: true, job_id: id, stage: args.stage, note: "It shows on their odds tracker." })
  }

  return failed(`Unknown tool: ${name}`)
}

// ---- JSON-RPC over HTTP ----

const ME_INSTRUCTIONS =
  "This is the person's own private link: you can see their profile (my_profile), their CVs and letters (my_documents, read_document), their saved and applied jobs (my_jobs), all of it in one call (export_my_odds), and everything to apply to one (application_kit). Find jobs for them with search_jobs and tailored_jobs, save them (save_job), and put the right CV on each job (attach_document), or make one for the job in odds's one format (save_cv). Use these instead of asking them to paste anything. APPLYING: application_kit gives the form's answers (standard_answers); fill an application only from it, their profile and CV: ask them for anything else, and keep what they tell you with save_application_answers. If the form needs a sign-in or a new account, stop and ask them to do that step in the browser, then continue when they say so: never type their password or solve a CAPTCHA. Never press submit yourself: let them check and send it, then mark_applied. REACHING OUT: my_people lists the people they keep at employers; write short, specific, true messages with save_outreach. A message goes out only after they approve it (approve_outreach, once they have said so in the chat, or the button on odds): then outreach_to_send lists what to send and how many may go today; send exactly those, in their signed-in browser, and mark_contacted each. If they have not approved, they send it themselves. Ask before saving a CV, a letter, answers or a batch of drafts, and before marking anything applied."

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

// ---- The browser extension (own key, own routes: /mcp/ext/...) ----

const EXT_KEY_RE = /^oddsx_[0-9a-f]{48}$/
/** Jobs the extension may have read for one person in a day when we do not hold them yet (each read costs money). Jobs we hold are free and unlimited. */
const EXT_DAILY_READS = 30

async function extWho(env: Env, key: string): Promise<Me | null> {
  if (!EXT_KEY_RE.test(key) || !env.serviceKey) return null
  const rows = await svc(env, `extension_keys?key_hash=eq.${await sha256hex(key)}&select=user_id,last_used_at`)
  const row = rows?.[0]
  if (!row) return null
  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 600_000) void svc(env, `extension_keys?user_id=eq.${row.user_id}`, { method: "PATCH", body: JSON.stringify({ last_used_at: new Date().toISOString() }) }).catch(() => undefined)

  return { id: row.user_id, email: null, key }
}

/** The job at a LinkedIn link: kept for them, read first if we do not hold it, with their interview chance. */
async function handleExt(req: Request, env: Env): Promise<Response> {
  const json = (status: number, body: Json): Response => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  const route = new URL(req.url).pathname.replace(/^.*\/ext\//, "")
  const me = await extWho(env, keyOf(req)).catch(() => null)
  if (!me) return json(401, { error: "Connect the odds extension again." })
  if (route === "me" && req.method === "GET") return json(200, { ok: true })
  // What the person's chance is for the job on the page, without saving it or paying for anything: only a job odds already holds can be answered.
  if (route === "peek" && req.method === "POST") {
    let address = ""
    try {
      const raw = await req.text()
      if (raw.length > 4000) return json(413, { error: "Too large." })
      address = String((JSON.parse(raw) as Json)?.url ?? "")
    } catch {
      return json(400, { error: "Send { url }." })
    }
    const wanted = parseJobUrl(address)
    if (!wanted) return json(422, { status: "unsupported", message: "Only LinkedIn job pages for now." })
    const held = (await rest(env, `postings?select=id,closed_at&url=eq.${encodeURIComponent(wanted.url)}&limit=1`).catch(() => []))?.[0]
    if (!held) return json(200, { known: false })
    if (held.closed_at) return json(200, { known: true, closed: true, id: held.id })
    const [rows, mine, profile, w] = await Promise.all([rest(env, `app_jobs?select=${COLUMNS}&id=eq.${encodeURIComponent(held.id)}`).catch(() => []), svc(env, `saved_jobs?user_id=eq.${me.id}&posting_id=eq.${encodeURIComponent(held.id)}&select=posting_id`), myProfile(env, me), worldFor(env)])
    const post = rows?.[0] ? core.preparePool(rows)[0] : null
    const chance = post && core.hasProfile(profile) ? core.chanceFor(post, profile, w.ref, w.shares) : null

    return json(200, { known: true, id: held.id, saved: (mine ?? []).length > 0, chance_pct: chance?.chance_pct ?? null, needs_profile: !core.hasProfile(profile) })
  }
  // The person's saved jobs, newest first, for the panel the extension opens on LinkedIn.
  if (route === "pool" && req.method === "GET") {
    const mine = await callMe(env, me, "my_jobs", {})
    const all: Json[] = mine.structuredContent?.jobs ?? []
    const jobs = all.filter((j) => j.title).slice(0, 40).map((j) => ({ id: j.id, title: j.title, company: j.company ?? null, city: j.city ?? null, status: j.status, chance_pct: j.chance_pct ?? null, still_open: j.still_open !== false, link: `https://odds.beeblast.co/job/${j.id}` }))

    return json(200, { jobs, total: all.length })
  }
  if (route !== "add" || req.method !== "POST") return json(404, { error: "Not found." })

  let url = ""
  try {
    const raw = await req.text()
    if (raw.length > 4000) return json(413, { error: "Too large." })
    url = String((JSON.parse(raw) as Json)?.url ?? "")
  } catch {
    return json(400, { error: "Send { url }." })
  }
  const parsed = parseJobUrl(url)
  if (!parsed) return json(422, { status: "unsupported", message: "Only LinkedIn job pages for now." })

  // Free first: do we already hold this job? Only a job we do not hold is read (paid), and that is limited per person.
  const held = await rest(env, `postings?select=id,closed_at&url=eq.${encodeURIComponent(parsed.url)}&limit=1`).catch(() => [])
  if (!held?.[0]) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const used = await svc(env, `extension_reads?user_id=eq.${me.id}&created_at=gte.${since}&select=id`)
    if ((used ?? []).length >= EXT_DAILY_READS) return json(429, { status: "limit", message: `Up to ${EXT_DAILY_READS} new jobs a day. Jobs odds already has are not counted.` })
    await svc(env, "extension_reads", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: me.id, url: parsed.url }) })
  }
  const added = await fetch(`${env.url}/functions/v1/jobs/add`, { method: "POST", headers: { "Content-Type": "application/json", apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` }, body: JSON.stringify({ url: parsed.url }), signal: AbortSignal.timeout(120_000) }).catch(() => null)
  const result: Json = added ? await added.json().catch(() => ({})) : {}
  if (!added || !added.ok) return json(added?.status === 429 ? 429 : 502, { status: "error", message: result?.error ?? "odds could not read that job. Try again in a minute." })
  if (result.status !== "added" && result.status !== "exists") {
    const message = result.status === "closed" ? "That job is closed." : result.status === "not_netherlands" ? `That job is in ${result.place || "another country"}. odds keeps jobs in the Netherlands.` : (result.message ?? "That job could not be read.")

    return json(200, { status: result.status ?? "error", message })
  }

  const id: string = result.id
  await svc(env, "saved_jobs", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ user_id: me.id, posting_id: id }) })
  const rows = await rest(env, `app_jobs?select=${COLUMNS}&id=eq.${encodeURIComponent(id)}`).catch(() => [])
  const w = await worldFor(env)
  const post = rows?.[0] ? core.preparePool(rows)[0] : null
  const profile = await myProfile(env, me)
  const chance = post && core.hasProfile(profile) ? core.chanceFor(post, profile, w.ref, w.shares) : null
  const line = post ? core.jobLine(post, w.ref) : { id, title: result.title ?? null, company: result.employer ?? null }

  return json(200, { status: result.status, saved: true, job: line, odds_link: `https://odds.beeblast.co/job/${id}`, chance_pct: chance?.chance_pct ?? null, needs_profile: !core.hasProfile(profile) })
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (new URL(req.url).pathname.includes("/ext/")) return handleExt(req, env)
  const oauth = await handleOAuth(req, env, CORS)
  if (oauth) return oauth
  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/file")) return serveFile(req, env)
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
  // Everything here is the person's own odds: without their sign-in (or with a link turned off) the client is sent to sign in.
  if (!me) return unauthorized(env, CORS, key ? "This connection was turned off. Connect again from Claude." : undefined)
  const replies = (await Promise.all((batch ? body : [body]).map((m: Json) => answer(env, me, Boolean(key), m)))).filter((r) => r !== null)
  if (replies.length === 0) return new Response(null, { status: 202, headers: CORS })

  return new Response(JSON.stringify(batch ? replies : replies[0]), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } })
}
