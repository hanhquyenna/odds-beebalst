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
import { driveExt, handleDriveMcp } from "./drive.ts"
import * as core from "./core.js"
import { handleOAuth, unauthorized } from "./oauth.ts"
import { accessFor, contentOf, driveEnv, linkOf, pushIfConnected } from "../_shared/drive.ts"
import { queueDone, queueNext } from "../_shared/apply-queue.ts"
import { applicationQuestionKey, chooseOption } from "../_shared/apply-form.ts"
import { applyAgentEnabled, factsForAgent, hostOf, notifyApplyAgent, requestSuggestAction, requestSuggestScan, suggestAnswers, validateSuggestedAnswers, type ApplyAgentEnv, type ApplyQuestion } from "../_shared/apply-agent.ts"
import { acceptActionPick, actionButtonsFingerprint, factsFromAgentPayload, pickSuggestAction, suggestFromRules } from "../_shared/apply-agent-suggest.ts"
import { educationFromProfile, personalFromProfile, workFromProfile } from "../_shared/application-personal.ts"
import { cleanAnswers, missingAnswers, type Answers } from "../_shared/application-answers.ts"
import { cleanCv, cvText, renderCvPdf } from "../_shared/cv-template.ts"
import { jobClosedAllowed } from "../_shared/apply-navigation.ts"
import { heldFilter, jobLink, type JobLink } from "../_shared/job-sites.ts"
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

export interface Env extends ApplyAgentEnv {
  url: string
  anonKey: string
  /** Only for the private link: finding whose key it is, and reading and writing that one person's own rows. */
  serviceKey?: string
}

/** Per-user LLM/webhook answer calls per UTC day — keep low; rules + shared patterns cover the rest. */
// Broods answers every form step now (one call a step), so the daily cap is per step, not per stuck question.
const APPLY_AGENT_DAILY_SUGGESTS = 400

async function logApplyAgentEvent(env: Env, userId: string, eventType: string, postingId: string | null, payload: Json): Promise<void> {
  await svc(env, "apply_agent_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, event_type: eventType, posting_id: postingId, payload: payload ?? {} }),
  }).catch(() => undefined)
}

/** The person a private link belongs to. */
interface Me {
  id: string
  email: string | null
  /** The private key itself, to build links to their files that only work with it. */
  key: string
}

// ---- Reading the pool, kept for a few minutes per warm instance ----

const PAGE = 250
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

async function readAll(env: Env, table: string, columns: string, pageSize = PAGE): Promise<Json[]> {
  const out: Json[] = []
  // The app_jobs view ranks the full pool. Four simultaneous wide reads exceeded the Free database's
  // statement timeout; smaller sequential pages keep each request within its memory and CPU budget.
  for (let from = 0; ; from += pageSize) {
    const page = await rest(env, `${table}?select=${columns}&order=id`, { headers: { Range: `${from}-${from + pageSize - 1}` } })
    out.push(...page)
    if (page.length < pageSize) return out
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

// A badge needs reference data and category totals, not the full ranked job pool.
// Keep identical category inputs while avoiding dozens of wide page reads.
let extensionContext: Promise<Pick<World, "ref" | "shares">> | null = null
let extensionContextAt = 0
/** After this long the stored reference is worked out again, in the background; the stored one is used meanwhile. */
const CONTEXT_STALE_MS = 30 * 60 * 1000

/** Works the reference out from the tables (reads every open job: a second or more) and stores it for every instance to read. */
async function computeExtensionContext(env: Env): Promise<Pick<World, "ref" | "shares">> {
  const [rows, bands, ages, tax, transitions] = await Promise.all([
    readAll(env, "app_jobs", "id,cat,dutch_required,dutch_jev,visa_mention,years_min,junior_title,skills", 1000),
    rest(env, "cbs_bands?select=*"), rest(env, "cbs_age_factors?select=sector,age_band,factor"),
    rest(env, "tax_params?select=params&year=eq.2026"), rest(env, "transitions?select=*"),
  ])
  const context = {
    ref: core.makeReference(bands, ages, tax[0]?.params, transitions),
    shares: core.sharesOf(rows.filter((row: Json) => !row.dutch_required && (row.dutch_jev ?? 0) < 0.8)),
  }
  await svc(env, "extension_context", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ id: 1, data: context, computed_at: new Date().toISOString() }) }).catch(() => undefined)

  return context
}

/** Supabase's Edge runtime: work that goes on after the answer is sent. */
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined

/**
 * What a chance is measured against. Kept by this instance for KEEP_MS; a new instance reads the stored one (one small row) instead of working it out,
 * and works it out again in the background when the stored one is old. Only with nothing stored yet does an answer wait for the whole computation.
 */
function extensionContextFor(env: Env): Promise<Pick<World, "ref" | "shares">> {
  if (!extensionContext || Date.now() - extensionContextAt > KEEP_MS) {
    extensionContextAt = Date.now()
    extensionContext = svc(env, "extension_context?id=eq.1&select=data,computed_at")
      .catch(() => null)
      .then((rows: Json) => {
        const stored = rows?.[0]
        if (!stored?.data?.ref || !stored?.data?.shares) return computeExtensionContext(env)
        if (Date.now() - Date.parse(stored.computed_at) > CONTEXT_STALE_MS) {
          const again = computeExtensionContext(env).catch(() => undefined)
          try {
            if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(again)
          } catch {
            // no runtime to keep it going: it finishes while this instance lives
          }
        }

        return stored.data as Pick<World, "ref" | "shares">
      })
      .catch((error) => {
        extensionContext = null
        throw error
      })
  }
  return extensionContext
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
    name: "continue_application",
    title: "Return to an existing desktop application",
    description: "After the person completes a browser step, asks their connected Chrome to focus and resume the existing application tab. Does not create another application or submit. Use application_status afterwards.",
    inputSchema: { type: "object", properties: { job_id: jobId }, required: ["job_id"] },
    write: true,
  },
  {
    name: "answer_application_questions",
    title: "Answer and continue an application",
    description: "Save answers the person explicitly supplied to the pending questions from application_status. Use each exact question key. Never guess visa, study or other answers. Their connected desktop automatically fills the answers and continues; it does not submit. Context-specific questions stay with that job.",
    inputSchema: { type: "object", properties: { job_id: jobId, answers: { type: "object", additionalProperties: { type: "string" } } }, required: ["job_id", "answers"] },
    write: true,
  },
  {
    name: "prepare_application",
    title: "Fill an application on my desktop",
    description: "When the person asks to apply, opens this job in their connected desktop Chrome and fills from their Odds profile and chosen CV. Uses the same queue as Fill on my desktop. Does not submit or mark applied. Repeated calls reuse the active request. Call application_status afterwards to report progress; never say it is filled just because it is queued. If they choose a CV, attach_document first.",
    inputSchema: { type: "object", properties: { job_id: jobId }, required: ["job_id"] },
    write: true,
  },
  {
    name: "application_status",
    title: "Check desktop application progress",
    description: "Reads this person's latest preparation for one job and whether their Chrome extension is online. queued means waiting, filling means working, needs_input means they must answer in the desktop form, ready means review on desktop. Never interpret these as submitted. Use after prepare_application, or when asked for an update.",
    inputSchema: { type: "object", properties: { job_id: jobId }, required: ["job_id"] },
    write: false,
  },
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
            first_name: { type: "string", description: "Given names, exactly as the person wants them on applications." },
            last_name: { type: "string", description: "Family name; never inferred from a full name." },
            email: { type: "string" },
            phone: { type: "string" },
            linkedin: { type: "string" },
            address: { type: "string" },
            city: { type: "string" },
            postcode: { type: "string" },
            country: { type: "string" },
            website: { type: "string", description: "Portfolio, personal site or GitHub." },
            work_authorization: { type: "string", description: "Right to work in the Netherlands, in their words, e.g. 'I need a work permit; the employer sponsors it as a recognised sponsor.'" },
            expected_salary: { type: "string", description: "As a form wants it, e.g. 'EUR 600 a month' or 'negotiable'." },
            start_date: { type: "string" },
            hours_per_week: { type: "string" },
            university: { type: "string" },
            degree: { type: "string" },
            field_of_study: { type: "string" },
            graduation_date: { type: "string" },
            study_year: { type: "string" },
            study_status: { type: "string" },
            internship_agreement: { type: "string" },
            nationality: { type: "string" },
            onsite_ok: { type: "string" },
            prior_agreements: { type: "string", description: "\"No\" or \"Yes\": a non-compete or a patents/confidentiality agreement with a past employer. Forms ask it; odds only answers \"No\"." },
            insider: { type: "string", description: "\"No\" when neither they nor close family work at the companies they apply to." },
            demographics: { type: "string", description: "Either \"Prefer not to say\" (odds picks that option on forms' gender, age and background questions) or \"I answer them myself\"." },
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
/** What Broods and the answer model may use: Autofill first, then what the CV says (school, degree, graduation, contact) for what Autofill leaves empty. */
async function agentFacts(env: Env, me: Me): Promise<Record<string, string>> {
  const [profile, saved, email] = await Promise.all([myProfile(env, me), myAnswers(env, me.id), emailOf(env, me)])
  return { ...factsForAgent({ ...personalFromProfile(profile, email), ...educationFromProfile(profile), ...workFromProfile(profile), ...saved }), ...profileForAgent(profile) }
}

const ORIGIN: Record<string, string> = { non_eu: "Non-EU nationality", eu_non_native: "EU nationality (not Dutch)", eu: "EU nationality", nl: "Dutch nationality", native: "Dutch nationality" }
const PERMIT: Record<string, string> = {
  eu: "EU citizen: free to work in the Netherlands, no sponsorship needed",
  orientation_year: "Orientation year (zoekjaar) permit: may work in the Netherlands without sponsorship",
  hsm: "Highly skilled migrant permit, tied to a sponsoring employer",
  other_non_eu: "Non-EU: needs a Dutch residence/work permit (an internship needs the school's internship agreement)",
}

/** The person's profile (their LinkedIn / CV import) in a few short lines, so Broods can reason about questions Autofill has no field for. */
function profileForAgent(profile: Json): Record<string, string> {
  const out: Record<string, string> = {}
  const str = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")
  if (ORIGIN[str(profile.origin)]) out.nationality_group = ORIGIN[str(profile.origin)]
  if (PERMIT[str(profile.permit)]) out.work_permit = PERMIT[str(profile.permit)]
  if (str(profile.place)) out.lives_in = str(profile.place)
  if (str(profile.headline)) out.headline = str(profile.headline)
  const langs = (Array.isArray(profile.languages) ? profile.languages : []).map((l: unknown) => (typeof l === "string" ? l : str((l as Json)?.name) + (str((l as Json)?.level) ? ` (${str((l as Json).level)})` : ""))).filter(Boolean)
  if (langs.length) out.languages = langs.slice(0, 6).join("; ")
  // Their own Dutch level from the Odds profile (none, basic, conversational, fluent, native): answers every "Dutch proficiency" question.
  if (str(profile.dutch)) out.dutch_level = str(profile.dutch)
  const skills = (Array.isArray(profile.skills) ? profile.skills : []).map((x: unknown) => (typeof x === "string" ? x : str((x as Json)?.Name ?? (x as Json)?.name))).filter(Boolean)
  if (skills.length) out.skills = skills.slice(0, 15).join(", ")
  const edu = (Array.isArray(profile.education) ? profile.education : []).slice(0, 3).map((e: Json) => [str(e["Degree Name"]), str(e["Field Of Study"]), str(e["School Name"]), [str(e["Start Date"]), str(e["End Date"]) || "now"].filter(Boolean).join("–")].filter(Boolean).join(", ")).filter(Boolean)
  if (edu.length) out.education = edu.join(" | ")
  const jobs = (Array.isArray(profile.positions) ? profile.positions : []).slice(0, 5).map((p: Json) => [str(p.Title), str(p["Company Name"]), [str(p["Started On"]), str(p["Finished On"]) || "now"].filter(Boolean).join("–")].filter(Boolean).join(", ")).filter(Boolean)
  if (jobs.length) out.experience = jobs.join(" | ")
  // A short start of the CV for open questions (motivation, what you bring): the person's own words, never the whole document.
  if (str(profile.cv)) out.cv_excerpt = str(profile.cv).slice(0, 1500)
  return out
}

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

const NO_POOL = new Set(["continue_application", "answer_application_questions", "prepare_application", "application_status", "my_profile", "my_documents", "read_document", "my_application_answers", "save_application_answers", "my_people", "save_outreach", "my_outreach", "mark_contacted", "save_cv", "save_cover_letter"])

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

  if (name === "continue_application") {
    if (!args.job_id) return failed("Choose the job to continue.")
    try {
      const run = await svc(env, "rpc/continue_application_for", { method: "POST", body: JSON.stringify({ p_user: uid, p_posting_id: args.job_id }) })
      return text({ run, submitted: false, next_step: "The connected desktop will return to the existing tab. Check application_status for progress." })
    } catch { return failed("No active application could be resumed. Check application_status and the desktop connection before starting again.") }
  }

  if (name === "answer_application_questions") {
    if (!args.job_id || !args.answers || typeof args.answers !== "object" || Array.isArray(args.answers) || !Object.keys(args.answers).length || Object.keys(args.answers).length > 30 || Object.values(args.answers).some(v => typeof v !== "string" || !v.trim() || v.length > 1000)) return failed("Give the current job and only the answers the person supplied, using the question keys from application_status.")
    try {
      await svc(env, "rpc/answer_application_questions_for", { method: "POST", body: JSON.stringify({ p_user: uid, p_posting_id: args.job_id, p_answers: args.answers }) })
      return text({ saved: true, submitted: false, next_step: "The connected desktop will receive these answers and continue filling. Check application_status for progress." })
    } catch { return failed("Could not save these answers. Read application_status again: the questions may have changed or expired.") }
  }

  if (name === "prepare_application" || name === "application_status") {
    if (!args.job_id) return failed("Choose a job first (job_id from search_jobs or my_jobs).")
    const cutoff = encodeURIComponent(new Date(Date.now() - 90_000).toISOString())
    const desktops = await svc(env, `application_desktops?user_id=eq.${uid}&last_seen_at=gt.${cutoff}&select=device_id&limit=1`)
    const online = Boolean(desktops?.length)
    if (name === "prepare_application") {
      if (!online) return text({ started: false, desktop_online: false, next_step: "Open desktop Chrome and the Odds extension, then enable phone control. Ask me to try again once connected.", submitted: false })
      const job = (await svc(env, `postings?id=eq.${encodeURIComponent(args.job_id)}&select=id,closed_at,url`))?.[0]
      if (!job || job.closed_at || !String(job.url ?? "").startsWith("https://")) return failed("This job is closed or has no available application page.")
      const run = await svc(env, "rpc/request_application_for", { method: "POST", body: JSON.stringify({ p_user: uid, p_posting_id: args.job_id }) })
      return text({ started: true, desktop_online: true, run, submitted: false, next_step: "Chrome checks for requests about every 30 seconds while awake, or immediately when the Odds side panel is open. Check application_status for progress. The person reviews and submits in Chrome." })
    }
    const run = (await svc(env, `application_runs?user_id=eq.${uid}&posting_id=eq.${encodeURIComponent(args.job_id)}&select=id,posting_id,status,message,expires_at&order=created_at.desc&limit=1`))?.[0] ?? null
    if (run && ["queued", "filling", "needs_input", "ready"].includes(run.status) && Date.parse(run.expires_at) < Date.now()) {
      run.status = "failed"
      run.message = "Preparation expired. Your open application remains on your desktop. Ask to start again when Chrome is connected."
    }
    const prompt = (await svc(env, `application_prompts?user_id=eq.${uid}&posting_id=eq.${encodeURIComponent(args.job_id)}&updated_at=gt.${encodeURIComponent(new Date(Date.now() - 30 * 60_000).toISOString())}&select=questions`))?.[0]
    return text({ desktop_online: online, run, questions: prompt?.questions ?? [], submitted: run?.status === "submitted", next_step: run?.status === "needs_input" ? "Read the message and answer the marked questions in the desktop application form, or complete its sign-in/CAPTCHA there." : run?.status === "ready" ? "Review the filled application in desktop Chrome and submit there." : !run ? "No preparation has been started for this job." : "Report the actual status and message. Do not claim an application was sent unless its status is submitted." })
  }

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
  "This is the person's own private link: you can see their profile (my_profile), their CVs and letters (my_documents, read_document), their saved and applied jobs (my_jobs), all of it in one call (export_my_odds), and everything to apply to one (application_kit). Find jobs for them with search_jobs and tailored_jobs, save them (save_job), and put the right CV on each job (attach_document), or make one for the job in odds's one format (save_cv). Use these instead of asking them to paste anything. APPLYING: When the person asks you to apply, use prepare_application with the job_id to start their connected Chrome extension. If they selected a CV, attach_document first. Then use application_status to check actual progress. If it returns questions, ask the person and save only their explicit answers with answer_application_questions; the extension continues automatically. An offline desktop cannot receive it; explain how to connect instead of claiming success. No separate confirmation is needed to prepare a form when they already asked you to apply. application_kit gives the form's answers (standard_answers); fill an application only from it, their profile and CV: ask them for anything else, and keep what they tell you with save_application_answers. If the form needs a sign-in or a new account, stop and ask them to do that step in the browser, then continue when they say so: never type their password or solve a CAPTCHA. Never press submit yourself: let them check and send it, then mark_applied. REACHING OUT: my_people lists the people they keep at employers; write short, specific, true messages with save_outreach. A message goes out only after they approve it (approve_outreach, once they have said so in the chat, or the button on odds): then outreach_to_send lists what to send and how many may go today; send exactly those, in their signed-in browser, and mark_contacted each. If they have not approved, they send it themselves. Ask before saving a CV, a letter, answers or a batch of drafts, and before marking anything applied."

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

      return ok({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "odds", title: "odds: jobs for international students in the Netherlands", version: "1.2.0" }, instructions: me ? `${INSTRUCTIONS} ${ME_INSTRUCTIONS}` : keyGiven ? `${INSTRUCTIONS} This private link was turned off: tell the person to make a new one on their odds profile.` : INSTRUCTIONS })
    }
    case "ping":
      return ok({})
    case "tools/list":
      return ok({
        tools: [
          ...TOOLS.map((t) => ({ ...t, annotations: { readOnlyHint: true, openWorldHint: false } })),
          ...(me ? ME_TOOLS.map(({ write, ...t }) => ({ ...t, annotations: { readOnlyHint: !write, destructiveHint: false, idempotentHint: !write || t.name === "prepare_application", openWorldHint: ["prepare_application", "continue_application"].includes(t.name) } })) : []),
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
/** LinkedIn jobs the extension may have read for one person in a day when we do not hold them yet (each read costs money). Jobs we hold are free and unlimited. */
const EXT_DAILY_READS = 30
/** Jobs from any other site a person's browser may hand over in a day: free to read, but each one goes into the table everyone sees. */
const EXT_DAILY_PAGE_READS = 300
/** A job we hold, found by the address it was stored under (job boards loaded in bulk kept longer ones: heldFilter finds those by the job's id). */
const POSTING_COLUMNS = "id,closed_at,region,employer,employer_display,ats,title,url"
/** The job an employer's application form belongs to, when its address is not a job link Odds holds (see apply-kit). */
async function formJob(env: Env, url: string, postingId: string | null, title: string): Promise<Json | null> {
  const clean = url.split("#")[0]!.slice(0, 2000)
  if (!/^https:\/\//.test(clean)) return null
  const byId = (id: string) => rest(env, `postings?id=eq.${encodeURIComponent(id)}&select=${POSTING_COLUMNS}&limit=1`).then((r) => r?.[0] ?? null).catch(() => null)
  if (postingId) { const p = await byId(postingId); if (p) return p }
  const base = clean.split("?")[0]!
  const seen = (await svc(env, `posting_apply_links?apply_url=like.${encodeURIComponent(base.replace(/[*%_]/g, ""))}*&select=posting_id&limit=1`).catch(() => null))?.[0]?.posting_id
  if (seen) { const p = await byId(String(seen)); if (p) return p }
  const name = title.replace(/\s*[|·–—-]\s*(careers?|jobs?|workday|apply|application)\b.*$/i, "").replace(/^(apply( for)?|application)\s*:?\s*/i, "").trim()
  if (name.length < 6) return null
  const host = (() => { try { return new URL(clean).hostname.toLowerCase() } catch { return "" } })()
  const rows = await rest(env, `postings?title=ilike.${encodeURIComponent(name.replace(/[*%,()]/g, " ").trim())}&closed_at=is.null&select=${POSTING_COLUMNS}&limit=10`).catch(() => null) ?? []
  const key = (t: unknown) => String(t ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "")
  // The posting on this very site first (YETI's own Workday), else one whose employer's first name is in the address ("yeti" in yeticoolers…).
  const hostOf = (u: unknown) => { try { return new URL(String(u)).hostname.toLowerCase() } catch { return "" } }
  const firstWord = (p: Json) => key(String(p.employer_display || p.employer || "").split(/\s+/)[0])
  const hit = rows.find((p: Json) => hostOf(p.url) === host) ?? rows.find((p: Json) => firstWord(p).length >= 3 && key(host).includes(firstWord(p)))
  if (!hit) return null
  await svc(env, "posting_apply_links?on_conflict=posting_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ posting_id: hit.id, apply_url: clean, source: "match", updated_at: new Date().toISOString() }) }).catch(() => undefined)
  return hit
}
const heldJob = (env: Env, link: JobLink): Promise<Json[] | null> => rest(env, `postings?select=id,closed_at,region,employer,employer_display,ats,title,url&${heldFilter(link)}&order=closed_at.desc.nullsfirst&limit=1`).catch(() => [])

/**
 * Keys and profiles seen in the last minute, kept by this instance: a list of jobs coming into view asks several times a second, and each answer
 * waited on the same two reads. A key cut off on odds stops working within the minute; a new CV counts within the minute.
 */
const EXT_KEEP_MS = 60_000
const extKeys = new Map<string, { me: Me; at: number }>()
const extProfiles = new Map<string, { profile: Promise<Json>; at: number }>()
function extProfile(env: Env, me: Me): Promise<Json> {
  const kept = extProfiles.get(me.id)
  if (kept && Date.now() - kept.at < EXT_KEEP_MS) return kept.profile
  const profile = myProfile(env, me)
  extProfiles.set(me.id, { profile, at: Date.now() })
  profile.catch(() => extProfiles.delete(me.id))

  return profile
}

/** The person's sign-in email (the extension's key does not carry it), kept a minute like the key. */
const extEmails = new Map<string, { email: Promise<string | null>; at: number }>()
function emailOf(env: Env, me: Me): Promise<string | null> {
  const kept = extEmails.get(me.id)
  if (kept && Date.now() - kept.at < EXT_KEEP_MS) return kept.email
  const email = fetch(`${env.url}/auth/v1/admin/users/${me.id}`, { headers: { apikey: env.serviceKey!, Authorization: `Bearer ${env.serviceKey}` } })
    .then((r) => (r.ok ? r.json() : null))
    .then((u: Json) => (typeof u?.email === "string" ? u.email : null))
    .catch(() => null)
  extEmails.set(me.id, { email, at: Date.now() })

  return email
}

async function extWho(env: Env, key: string): Promise<Me | null> {
  if (!EXT_KEY_RE.test(key) || !env.serviceKey) return null
  const hash = await sha256hex(key)
  const kept = extKeys.get(hash)
  if (kept && Date.now() - kept.at < EXT_KEEP_MS) return kept.me
  const rows = await svc(env, `extension_keys?key_hash=eq.${hash}&select=user_id,last_used_at`)
  const row = rows?.[0]
  if (!row) {
    extKeys.delete(hash)

    return null
  }
  extKeys.set(hash, { me: { id: row.user_id, email: null, key }, at: Date.now() })
  if (!row.last_used_at || Date.now() - Date.parse(row.last_used_at) > 600_000) void svc(env, `extension_keys?user_id=eq.${row.user_id}`, { method: "PATCH", body: JSON.stringify({ last_used_at: new Date().toISOString() }) }).catch(() => undefined)

  return { id: row.user_id, email: null, key }
}

/** The job at a job page's link (LinkedIn, Indeed, Glassdoor, Magnet.me, an employer's own page...): kept for them, read first if we do not hold it, with their interview chance. */
async function handleExt(req: Request, env: Env): Promise<Response> {
  const json = (status: number, body: Json): Response => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  const route = new URL(req.url).pathname.replace(/^.*\/ext\//, "")
  const me = await extWho(env, keyOf(req)).catch(() => null)
  if (!me) return json(401, { error: "Connect the odds extension again." })
  if (route === "me" && req.method === "GET") return json(200, { ok: true })
  if (/^drive-(start|next|result|stop|continue|playbook)$/.test(route) && req.method === "POST") {
    return driveExt(route, req, env, me.id, {
      facts: () => agentFacts(env, me),
      job: async (url: string) => {
        const link = jobLink(url, true)
        return link ? (await heldJob(env, link))?.[0] ?? null : null
      },
    })
  }
  // The apply queue: the extension asks for the next jobs to fill (at most two at once) and says how each one ended. It never submits.
  if ((route === "queue-next" || route === "queue-done") && req.method === "POST") {
    const body = await req.json().catch(() => null)
    // Until the queue table exists (its migration), asking for work answers "nothing to do" instead of an error every half minute.
    if (route === "queue-next") return json(200, { status: "ok", ...(await queueNext((path, init) => svc(env, path, init), me.id, body?.active).catch(() => ({ start: [], drop: [] }))) })
    return json(200, { status: "ok", saved: await queueDone((path, init) => svc(env, path, init), me.id, body ?? {}) })
  }
  if (["application-poll", "application-report", "application-resume"].includes(route) && req.method === "POST") {
    const body = await req.json().catch(() => null)
    const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    if (!uuid(body?.device_id)) return json(400, { error: "Invalid desktop." })
    if (route === "application-resume") {
      const link = jobLink(String(body?.url || ""), true)
      const held = link ? (await heldJob(env, link))?.[0] : null
      if (!held) return json(200, { status: "ok", run: null })
      const rows = await svc(env, `application_runs?user_id=eq.${me.id}&device_id=eq.${body.device_id}&posting_id=eq.${encodeURIComponent(held.id)}&status=in.(filling,needs_input,ready)&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id&order=created_at.desc&limit=1`)
      return json(200, { status: "ok", run: rows?.[0] || null })
    }
    if (route === "application-report") {
      if (!uuid(body?.id) || !["filling", "needs_input", "ready", "submitted", "failed"].includes(body?.status) || typeof body?.message !== "string") return json(400, { error: "Invalid progress." })
      await svc(env, "rpc/report_application", { method: "POST", body: JSON.stringify({ p_user: me.id, p_device: body.device_id, p_id: body.id, p_status: body.status, p_message: body.message.slice(0, 500) }) })
      if (["needs_input", "ready", "failed"].includes(body.status)) {
        const run = (await svc(env, `application_runs?id=eq.${body.id}&user_id=eq.${me.id}&select=posting_id,url`))?.[0]
        const postingId = typeof run?.posting_id === "string" ? run.posting_id : null
        notifyApplyAgent(env, {
          type: "apply.status",
          posting_id: postingId,
          run_id: body.id,
          status: body.status,
          message: String(body.message).slice(0, 500),
          host: hostOf(typeof run?.url === "string" ? run.url : null),
          ats: null,
        })
        void logApplyAgentEvent(env, me.id, "apply.status", postingId, { status: body.status, run_id: body.id, message: String(body.message).slice(0, 200) })
      }
      return json(200, { status: "ok" })
    }
    if (Array.isArray(body?.ids)) {
      const ids = body.ids.filter(uuid).slice(0, 200)
      const result = await svc(env, "rpc/poll_applications", { method: "POST", body: JSON.stringify({ p_user: me.id, p_device: body.device_id, p_known: ids }) })
      return json(200, { status: "ok", ...result })
    }
    const previous = uuid(body?.id) ? (await svc(env, `application_runs?id=eq.${body.id}&user_id=eq.${me.id}&device_id=eq.${body.device_id}&select=id,status`))?.[0] ?? null : null
    const task = await svc(env, "rpc/poll_application", { method: "POST", body: JSON.stringify({ p_user: me.id, p_device: body.device_id }) })
    return json(200, { status: "ok", task, previous })
  }

  if (route === "application-questions" && req.method === "POST") {
    const body = await req.json().catch(() => null)
    const link = jobLink(String(body?.url || ""), true)
    const held = link ? (await heldJob(env, link))?.[0] : null
    if (!held) return json(404, { error: "Job not registered in Odds." })
    const questions = (Array.isArray(body?.questions) ? body.questions : []).slice(0, 30).filter((q: Json) => ["text", "textarea", "number", "radio", "select"].includes(q?.kind) && typeof q?.label === "string" && typeof q?.key === "string" && q.key.length >= 2 && q.key.length <= 300 && q.label.length >= 2 && q.label.length <= 500 && !/password|captcha|verification code|security code|social security|\bbsn\b|credit card/i.test(q.label)).map((q: Json) => ({ key: applicationQuestionKey(q.label, held.id), label: q.label, kind: q.kind, options: ["radio", "select"].includes(q.kind) ? (Array.isArray(q.options) ? q.options : []).filter((v: unknown) => typeof v === "string").slice(0, 300).map((v: string) => v.slice(0, 200)) : [] }))
    await svc(env, "application_prompts?on_conflict=user_id,posting_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: me.id, posting_id: held.id, questions, updated_at: new Date().toISOString() }) })
    notifyApplyAgent(env, {
      type: "apply.questions",
      posting_id: held.id,
      host: hostOf(String(body?.url || held.url || "")),
      ats: typeof held.ats === "string" ? held.ats : null,
      title: held.title ?? null,
      employer: held.employer_display ?? held.employer ?? null,
      questions,
    })
    void logApplyAgentEvent(env, me.id, "apply.questions", held.id, { n: questions.length, labels: questions.map((q: ApplyQuestion) => q.label).slice(0, 20) })
    return json(200, { status: "ok" })
  }
  // Stuck: rules, then a shared ATS pattern, then Broods (force_llm skips a dead rule label and asks Broods).
  if (route === "suggest-action" && req.method === "POST") {
    const body = await req.json().catch(() => null)
    const buttons = Array.isArray(body?.buttons)
      ? body.buttons.filter((b: unknown) => typeof b === "string" || (b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string")).slice(0, 40)
      : []
    const host = hostOf(typeof body?.url === "string" ? body.url : null)
    const forceLlm = body?.force_llm === true
    const exclude = (Array.isArray(body?.exclude) ? body.exclude : []).filter((t: unknown): t is string => typeof t === "string").map((t: string) => t.replace(/\s+/g, " ").trim()).filter(Boolean)
    const excludeSet = new Set(exclude.map((t: string) => t.toLowerCase()))
    const usable = buttons.filter((b: string | { text?: string }) => {
      const t = (typeof b === "string" ? b : b?.text ?? "").replace(/\s+/g, " ").trim().toLowerCase()
      return t && !excludeSet.has(t)
    })
    let pick = forceLlm ? { action: "none" as const, reason: "force_llm" } : pickSuggestAction(usable.length ? usable : buttons)
    let source = pick.action === "click" ? "rules" : "none"
    if (pick.action === "none" && !forceLlm && host) {
      const fp = await sha256hex(actionButtonsFingerprint(buttons))
      const cached = await svc(env, `apply_agent_action_patterns?host=eq.${encodeURIComponent(host)}&buttons_fp=eq.${fp}&select=text,hits`).catch(() => null)
      const cachedText = typeof cached?.[0]?.text === "string" ? cached[0].text : null
      if (cachedText && !excludeSet.has(cachedText.toLowerCase())) {
        const fromCache = acceptActionPick(buttons, cachedText, "shared_pattern")
        if (fromCache.action === "click") {
          pick = fromCache
          source = "shared_pattern"
          void svc(env, `apply_agent_action_patterns?host=eq.${encodeURIComponent(host)}&buttons_fp=eq.${fp}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ hits: Number(cached[0].hits || 1) + 1, updated_at: new Date().toISOString() }),
          }).catch(() => undefined)
        }
      }
    }
    if (pick.action === "none" || forceLlm) {
      pick = await requestSuggestAction(env, {
        buttons,
        url: typeof body?.url === "string" ? body.url : null,
        status: typeof body?.status === "string" ? body.status : null,
        host,
        force_llm: forceLlm || pick.action === "none",
        exclude,
      })
      source = pick.reason?.startsWith("broods") ? "broods" : pick.reason?.startsWith("llm") || pick.reason === "llm_hands" ? "llm" : pick.action === "click" ? (forceLlm ? "broods_or_rules" : "webhook") : "none"
      if (pick.action === "click" && pick.text && host && !forceLlm) {
        const fp = await sha256hex(actionButtonsFingerprint(buttons))
        void svc(env, "apply_agent_action_patterns?on_conflict=host,buttons_fp", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ host, buttons_fp: fp, text: pick.text, hits: 1, updated_at: new Date().toISOString() }),
        }).catch(() => undefined)
      }
    }
    notifyApplyAgent(env, {
      type: "apply.status",
      posting_id: null,
      run_id: "suggest-action",
      status: pick.action === "click" ? "filling" : "needs_input",
      message: `suggest-action:${source}:${pick.reason}:${pick.text ?? ""}`.slice(0, 200),
      host,
      ats: null,
    })
    void logApplyAgentEvent(env, me.id, "suggest-action", null, { ...pick, n: buttons.length, host, source })
    return json(200, { status: "ok", ...pick })
  }
  // Stuck episode: one page scan (stage + optional click). Caller must not loop.
  if (route === "suggest-scan" && req.method === "POST") {
    const body = await req.json().catch(() => null)
    const snapshot = body?.snapshot && typeof body.snapshot === "object" ? body.snapshot : {}
    // Broods answers from the person's Autofill, not only the name/email/phone the page snapshot carries.
    const pageFacts = snapshot.facts && typeof snapshot.facts === "object" ? snapshot.facts : {}
    snapshot.facts = { ...(await agentFacts(env, me)), ...Object.fromEntries(Object.entries(pageFacts).filter(([, v]) => typeof v === "string" && v.trim())) }
    const host = hostOf(typeof body?.url === "string" ? body.url : null)
    let scan = await requestSuggestScan(env, {
      url: typeof body?.url === "string" ? body.url : null,
      status: typeof body?.status === "string" ? body.status : null,
      host,
      snapshot,
    })
    // Re-validate click against snapshot buttons when present.
    const buttons = Array.isArray(snapshot.buttons) ? snapshot.buttons.filter((b: unknown) => typeof b === "string") : []
    if (scan.action === "click" && scan.text && buttons.length) {
      const ok = acceptActionPick(buttons, scan.text, "broods_scan")
      if (ok.action !== "click") scan = { ...scan, action: "none", text: null, reason: "llm_not_on_page" }
    }
    // Answers from a page scan pass the same checks as suggest-answers: a known field, never a legal/personal question, one of its own options.
    if (Array.isArray(scan.answers) && scan.answers.length) {
      const fields = (Array.isArray(snapshot.fields) ? snapshot.fields : []).filter((f: Json) => f && typeof f.key === "string" && typeof f.label === "string")
      const questions = fields.map((f: Json) => {
        const options = Array.isArray(f.options) ? f.options.filter((o: unknown) => typeof o === "string") : []
        const kind = options.length && ["radio", "choice"].includes(f.kind) ? "radio" : options.length ? "select" : f.kind === "textarea" ? "textarea" : f.kind === "number" ? "number" : "text"
        return { key: f.key, label: f.label, kind, ...(options.length ? { options } : {}) }
      })
      scan = { ...scan, answers: validateSuggestedAnswers(questions, scan.answers).accepted }
    }
    void logApplyAgentEvent(env, me.id, "suggest-scan", null, { stage: scan.stage, action: scan.action, reason: scan.reason, host })
    return json(200, { status: "ok", ...scan })
  }
  // Cloud agent: suggest answers for bounced questions (validated; deny-list; daily cap). Extension refreshes afterwards.
  // Always apply Autofill rules first — Broods/LLM only for leftover gaps. Never return empty when rules know the answer
  // (webhook down / agent disabled used to skip rules and dump the person on outlined questions).
  if (route === "suggest-answers" && req.method === "POST") {
    const body = await req.json().catch(() => null)
    const link = jobLink(String(body?.url || ""), true)
    const held = link ? (await heldJob(env, link))?.[0] : null
    if (!held) return json(404, { error: "Job not registered in Odds." })
    let questions: ApplyQuestion[] = Array.isArray(body?.questions)
      ? body.questions.filter((q: Json) => q && typeof q.key === "string" && typeof q.label === "string").slice(0, 30)
      : []
    if (!questions.length) {
      const prompt = (await svc(env, `application_prompts?user_id=eq.${me.id}&posting_id=eq.${encodeURIComponent(held.id)}&select=questions`))?.[0]
      questions = Array.isArray(prompt?.questions) ? prompt.questions : []
    }
    if (!questions.length) return json(200, { status: "ok", accepted: [], rejected: [] })
    const factMap = await agentFacts(env, me)
    const ruleFacts = factsFromAgentPayload(factMap, held.id)
    // Broods-only: no built-in rules; the person's saved gender is the one thing copied directly (their own answer, never Broods').
    const broodsOnly = body?.broods_only === true
    const fromRules = broodsOnly
      ? questions.flatMap((q) => {
        if (!factMap.gender || !/\b(gender|geslacht|geschlecht|genre)\b/i.test(q.label) || /\b(identity|identit|transgender|pronoun|orientation)/i.test(q.label)) return []
        const opts = q.options ?? []
        const i = opts.length ? chooseOption([...opts], factMap.gender, q.label) : -1
        const answer = opts.length ? (i >= 0 ? opts[i] : null) : factMap.gender
        return answer ? [{ key: q.key, answer, confidence: 1 }] : []
      })
      : suggestFromRules(questions, ruleFacts)
    const have = new Set(fromRules.map((a) => a.key))
    let accepted = [...fromRules]
    let rejected: Array<{ key: string; reason: string }> = []
    let raw = 0
    let reason: string | undefined
    if (!applyAgentEnabled(env)) {
      reason = "rules_only"
    } else {
      const used = await svc(env, `rpc/apply_agent_suggest_count_today`, { method: "POST", body: JSON.stringify({ p_user: me.id }) }).catch(() => null)
      const count = typeof used === "number" ? used : typeof used?.[0] === "number" ? used[0] : typeof used === "object" && used && "apply_agent_suggest_count_today" in used ? Number((used as Json).apply_agent_suggest_count_today) : Number(used)
      if (Number.isFinite(count) && count >= APPLY_AGENT_DAILY_SUGGESTS) {
        reason = "daily_limit"
      } else {
        const gaps = questions.filter((q) => !have.has(q.key))
        if (gaps.length) {
          const result = await suggestAnswers(env, {
            type: "suggest-answers",
            posting_id: held.id,
            host: hostOf(String(body?.url || held.url || "")),
            ats: typeof held.ats === "string" ? held.ats : null,
            title: held.title ?? null,
            employer: held.employer_display ?? held.employer ?? null,
            questions: gaps,
            facts: factMap,
            ...(broodsOnly ? { broods_only: true } : {}),
          })
          raw = result.raw
          rejected = result.rejected
          for (const a of result.accepted) {
            if (have.has(a.key)) continue
            have.add(a.key)
            accepted.push(a)
          }
        }
      }
    }
    if (accepted.length) {
      const rows = accepted.map((a) => {
        const q = questions.find((x) => x.key === a.key)
        return { user_id: me.id, question_key: a.key, question: q?.label ?? a.key, answer: a.answer, source: "odds", updated_at: new Date().toISOString() }
      })
      // Written by Odds, not the person: never over an answer the person gave themselves (their words stay theirs).
      const keys = rows.map((r) => `"${r.question_key.replace(/"/g, '\\"')}"`).join(",")
      const mine = new Set(((await svc(env, `application_questions?user_id=eq.${me.id}&question_key=in.(${encodeURIComponent(keys)})&source=eq.person&select=question_key`).catch(() => null)) ?? []).map((r: Json) => r.question_key))
      const fresh = rows.filter((r) => !mine.has(r.question_key))
      if (fresh.length) await svc(env, "application_questions?on_conflict=user_id,question_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(fresh) })
    }
    void logApplyAgentEvent(env, me.id, "suggest-answers", held.id, {
      accepted: accepted.length,
      rejected: rejected.length,
      raw,
      rules: fromRules.length,
      reason: reason ?? "ok",
      keys: accepted.map((a) => a.key),
    })
    return json(200, { status: "ok", accepted, rejected, ...(reason ? { reason } : {}) })
  }
  if (route === "answers" && req.method === "GET") {
    const rows = await svc(env, `application_questions?user_id=eq.${me.id}&select=question_key,answer&order=updated_at.desc&limit=500`)
    return json(200, { remembered: Object.fromEntries((rows || []).map((r: Json) => [r.question_key, r.answer])) })
  }

  // A real odds sign-in for the person, so the odds app opened inside the extension's panel is signed in as them. The extension key is as strong
  // as that: it is kept only in the extension, rotates when they connect again, and Disconnect on the odds site cuts it off.
  if (route === "session" && req.method === "POST") {
    if (!env.serviceKey) return json(500, { error: "Not configured." })
    const admin = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" }
    const user = await fetch(`${env.url}/auth/v1/admin/users/${me.id}`, { headers: admin }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const email = typeof user?.email === "string" ? user.email : ""
    if (!email) return json(404, { error: "Account not found." })
    const link = await fetch(`${env.url}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email }) })
    const made: Json = link.ok ? await link.json() : null
    const tokenHash = made?.properties?.hashed_token ?? made?.hashed_token
    if (!tokenHash) return json(503, { error: "Could not sign you in yet." })
    const verified = await fetch(`${env.url}/auth/v1/verify`, { method: "POST", headers: { apikey: env.anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }) })
    if (!verified.ok) return json(503, { error: "Could not sign you in yet." })

    return json(200, await verified.json())
  }
  // What the person's chance is for the job on the page, without saving it or paying for anything: only a job odds already holds can be answered.
  // A list of jobs at once ({ urls }, up to 25: the jobs in view) answers { results: { url: answer } }, with the person's profile and the reference read once.
  if (route === "peek" && req.method === "POST") {
    let body: Json = null
    try {
      const raw = await req.text()
      if (raw.length > 20_000) return json(413, { error: "Too large." })
      body = JSON.parse(raw)
    } catch {
      return json(400, { error: "Send { url } or { urls }." })
    }
    const many = Array.isArray(body?.urls)
    const urls: string[] = (many ? body.urls : [body?.url]).slice(0, 25).map((u: unknown) => (typeof u === "string" ? u : ""))
    const links = urls.map((u) => jobLink(u, true))
    if (!many && !links[0]) return json(422, { status: "unsupported", message: "odds cannot tell which job this page is." })
    // One read per job, all at once: the open jobs straight from app_jobs (which carries their address), alongside the person's profile, the
    // reference and their saved jobs. Only a job app_jobs does not have is looked for again among all postings, to tell a closed job from one
    // odds does not hold.
    const early = Promise.all([extProfile(env, me), extensionContextFor(env), svc(env, `saved_jobs?user_id=eq.${me.id}&select=posting_id`)])
    early.catch(() => undefined)
    const t0 = Date.now()
    const marks: string[] = []
    early.then(() => marks.push(`early;dur=${Date.now() - t0}`)).catch(() => undefined)
    const open: Json[] = await Promise.all(links.map((l) => (l ? rest(env, `app_jobs?select=${COLUMNS}&${heldFilter(l)}&limit=1`).then((r) => r?.[0] ?? null).catch(() => null) : Promise.resolve(null))))
    marks.push(`open;dur=${Date.now() - t0}`)
    const helds: Json[] = await Promise.all(links.map((l, i) => (open[i] ? Promise.resolve(open[i]) : l ? heldJob(env, l).then((r) => r?.[0] ?? null) : Promise.resolve(null))))
    marks.push(`held;dur=${Date.now() - t0}`)
    const [profile, w, mine] = await early
    marks.push(`waited;dur=${Date.now() - t0}`)
    const posts = new Map(core.preparePool(open.filter(Boolean)).map((p: Json) => [String(p.id), p]))
    const saved = new Set((mine ?? []).map((m: Json) => String(m.posting_id)))
    const answerFor = (link: JobLink | null, held: Json): Json => {
      if (!link) return { status: "error", message: "odds cannot tell which job this page is." }
      if (!held) return { known: false }
      if (held.closed_at) return { known: true, closed: true, id: held.id }
      const post = posts.get(String(held.id))
      const chance = post && core.hasProfile(profile) ? core.chanceFor(post, profile, w.ref, w.shares) : null

      return { known: true, id: held.id, job: post ? core.jobLine(post, w.ref) : { id: held.id }, saved: saved.has(String(held.id)), chance_pct: chance?.chance_pct ?? null, needs_profile: !core.hasProfile(profile) }
    }
    const answers = links.map((l, i) => answerFor(l, helds[i]))
    marks.push(`chance;dur=${Date.now() - t0}`)
    const timed = (r: Response): Response => {
      r.headers.set("Server-Timing", marks.join(", "))

      return r
    }
    if (!many) return timed(json(200, answers[0]))

    return timed(json(200, { results: Object.fromEntries(urls.map((u, i) => [u, answers[i]])) }))
  }
  // The person's saved jobs, newest first, for the panel the extension opens on LinkedIn.
  if (route === "pool" && req.method === "GET") {
    const mine = await callMe(env, me, "my_jobs", {})
    const all: Json[] = mine.structuredContent?.jobs ?? []
    const jobs = all.filter((j) => j.title).slice(0, 40).map((j) => ({ id: j.id, title: j.title, company: j.company ?? null, city: j.city ?? null, status: j.status, chance_pct: j.chance_pct ?? null, still_open: j.still_open !== false, link: `https://odds.beeblast.co/job/${j.id}` }))

    return json(200, { jobs, total: all.length })
  }
  // ---- Applying from the extension: odds fills the form in, the person checks it and presses Submit, odds marks the job applied. ----
  const readBody = async (): Promise<Json> => {
    const raw = await req.text()
    if (raw.length > 50_000) throw new Error("Too large.")
    return raw ? JSON.parse(raw) : {}
  }
  // Everything a form may ask that odds knows: name, email, phone, place, the standard answers, the person's earlier answers to other
  // questions, and the CV that goes with this job (the one they put on it, else their main CV).
  if (route === "apply-kit" && req.method === "POST") {
    let body: Json
    try {
      body = await readBody()
    } catch {
      return json(400, { error: "Send { url }." })
    }
    const link = jobLink(String(body?.url ?? ""), true)
    const [heldDirect, profile, savedAnswers, remembered, email, mainCv] = await Promise.all([
      link ? heldJob(env, link).then((r) => r?.[0] ?? null) : Promise.resolve(null),
      myProfile(env, me),
      myAnswers(env, me.id),
      svc(env, `application_questions?user_id=eq.${me.id}&select=question_key,question,answer,source&order=updated_at.desc&limit=500`),
      emailOf(env, me),
      svc(env, `documents?user_id=eq.${me.id}&kind=eq.cv&is_main=eq.true&select=id,name,file_name`),
    ])
    // An employer's own form Odds does not list (YETI's Workday for a LinkedIn job): the job it is, from the run's posting, the address
    // seen before for a posting, or the page's job title at an employer named in the address. Learned, so the next visit knows it at once.
    const held = heldDirect ?? await formJob(env, String(body?.url ?? ""), typeof body?.posting_id === "string" ? body.posting_id : null, typeof body?.title === "string" ? body.title : "")
    const answers = { ...personalFromProfile(profile, email), ...educationFromProfile(profile), ...workFromProfile(profile), ...savedAnswers }
    // Gender answered once on a form (Odds drawer or the page) becomes the Autofill answer, so every later form fills it and Autofill shows it.
    if (!savedAnswers.gender) {
      const said = (remembered ?? []).find((r: Json) => /\b(gender|geslacht|geschlecht|genre)\b/.test(String(r.question_key)) && !/\b(identity|transgender|pronoun)/.test(String(r.question_key)) && typeof r.answer === "string" && r.answer.trim() && r.answer.length <= 60)
      if (said) {
        answers.gender = String(said.answer).trim()
        void svc(env, "application_answers?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: me.id, data: { ...savedAnswers, gender: answers.gender }, updated_at: new Date().toISOString() }) }).catch(() => undefined)
      }
    }
    // Whether the person already applied to another job at this employer, known from their own applications; never "no" from silence.
    const appliedIds = ((await svc(env, `applications?user_id=eq.${me.id}&select=posting_id`)) ?? []).map((a: Json) => String(a.posting_id)).filter((id: string) => id && id !== held?.id)
    const sameEmployer = held?.employer && appliedIds.length > 0 ? await svc(env, `postings?id=in.(${appliedIds.map((id: string) => encodeURIComponent(id)).join(",")})&employer=eq.${encodeURIComponent(String(held.employer))}&select=id&limit=1`) : []
    // Facts that hold for nearly everyone, taken from the profile: university education means an adult; no job at this employer on the profile (or CV) means not a current employee.
    const display = String(held?.employer_display ?? "").toLowerCase()
    const history = `${JSON.stringify(profile.positions ?? [])} ${String(profile.cv ?? "")}`.toLowerCase()
    const hasHistory = (Array.isArray(profile.positions) && profile.positions.length > 0) || String(profile.cv ?? "").trim().length > 40
    const sources: Record<string, string> = { linkedin: "LinkedIn", indeed: "Indeed", glassdoor: "Glassdoor", "magnet.me": "Magnet.me", academictransfer: "AcademicTransfer" }
    const attached = held ? (await svc(env, `job_documents?user_id=eq.${me.id}&posting_id=eq.${encodeURIComponent(held.id)}&kind=eq.cv&select=document_id`))?.[0] : null
    const cvRow = attached ? (await svc(env, `documents?user_id=eq.${me.id}&id=eq.${attached.document_id}&select=id,name,file_name`))?.[0] : null
    const cv = cvRow ?? mainCv?.[0] ?? null
    // The job's own cover / motivation letter, when the person made one for it (never a letter written for another job).
    const letterLink = held ? (await svc(env, `job_documents?user_id=eq.${me.id}&posting_id=eq.${encodeURIComponent(held.id)}&kind=eq.cover_letter&select=document_id`))?.[0] : null
    const letter = letterLink ? (await svc(env, `documents?user_id=eq.${me.id}&id=eq.${letterLink.document_id}&select=id,name,file_name`))?.[0] ?? null : null
    notifyApplyAgent(env, {
      type: "apply.started",
      posting_id: held?.id ?? null,
      host: hostOf(String(body?.url ?? "")),
      ats: typeof held?.ats === "string" ? held.ats : link?.site ?? null,
      title: held?.title ?? null,
      employer: held?.employer_display ?? held?.employer ?? null,
    })
    void logApplyAgentEvent(env, me.id, "apply.started", held?.id ?? null, { host: hostOf(String(body?.url ?? "")) })

    // Where this job's form really is, when its listing sits on a job board (learned from earlier runs or the board's own data).
    const direct = held && link && ["linkedin", "indeed", "glassdoor", "magnet.me"].includes(link.site) ? (await svc(env, `posting_apply_links?posting_id=eq.${encodeURIComponent(held.id)}&select=apply_url`).catch(() => null))?.[0]?.apply_url ?? null : null

    return json(200, {
      job_id: held?.id ?? null,
      apply_url: typeof direct === "string" && /^https:\/\//.test(direct) ? direct : null,
      // The job's own title: the extension checks the employer's page is this job, not their list of vacancies.
      job_title: held?.title ?? null,
      job_employer: held?.employer_display ?? held?.employer ?? null,
      // Broods drives the application in the person's tab (switch on Connect; on unless they turned it off).
      broods_drive: (profile as Json)?.broodsDrive !== false,
      facts: {
        job_id: held?.id ?? null,
        job_country: /(?:netherlands|nederland|\bNL\b)/i.test(held?.region || "") ? "NL" : null,
        job_source: link ? sources[link.site] ?? "Company website" : null,
        applied_before: Boolean(sameEmployer?.length),
        adult: Array.isArray(profile.education) && profile.education.length > 0,
        never_worked_here: Boolean(display) && hasHistory && !history.includes(display),
        name: profile.name || null,
        email: answers.email || email,
        phone: answers.phone ?? null,
        place: answers.city || profile.place || null,
        linkedin: answers.linkedin || profile.linkedin || null,
        website: answers.website ?? null,
        dutch: profile.dutch ?? null,
        answers,
        remembered: Object.fromEntries((remembered ?? []).map((r: Json) => [r.question_key, r.answer])),
        // The person's own answers with their question, newest first (never ones Odds wrote): the extension puts one in word for word
        // when a form asks the same question (Broods never rewords or adds to the person's own answer).
        saved_answers: (remembered ?? []).filter((r: Json) => r.source === "person" && typeof r.question === "string" && typeof r.answer === "string" && r.answer.trim()).slice(0, 200).map((r: Json) => ({ q: String(r.question).slice(0, 300), a: String(r.answer).slice(0, 1000) })),
      },
      cv: cv ? { id: cv.id, name: cv.name, file_name: cv.file_name, for_this_job: Boolean(cvRow) } : null,
      letter: letter ? { id: letter.id, name: letter.name, file_name: letter.file_name } : null,
    })
  }
  // What the person answered themselves in a form, kept for the next form that asks the same.
  if (route === "answers" && req.method === "POST") {
    let body: Json
    try {
      body = await readBody()
    } catch {
      return json(400, { error: "Send { questions: [{ question, answer }] }." })
    }
    const answerLink = typeof body?.url === "string" ? jobLink(body.url, true) : null
    const answerJob = answerLink ? (await heldJob(env, answerLink))?.[0] : null
    const rows = (Array.isArray(body?.questions) ? body.questions : []).slice(0, 40).map((q: Json) => {
      const question = typeof q?.question === "string" ? q.question.replace(/\s+/g, " ").trim().slice(0, 500) : ""
      const answer = typeof q?.answer === "string" ? q.answer.replace(/\s+/g, " ").trim().slice(0, 1000) : ""
      const key = applicationQuestionKey(question, answerJob?.id)
      return key.length >= 2 && answer ? { user_id: me.id, question_key: key, question, answer, source: "person", updated_at: new Date().toISOString() } : null
    }).filter(Boolean)
    if (rows.length) await svc(env, "application_questions?on_conflict=user_id,question_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) })

    return json(200, { saved: rows.length })
  }
  // Browser saw "not accepting applications" — close the posting for the whole server (everyone's lists).
  if (route === "job-closed" && req.method === "POST") {
    let body: Json
    try {
      body = await readBody()
    } catch {
      return json(400, { error: "Send { url }." })
    }
    const link = jobLink(String(body?.url ?? ""), true)
    const held = link ? (await heldJob(env, link))?.[0] : null
    if (!held) return json(404, { status: "unknown", message: "odds does not hold that job yet." })
    const pageUrl = typeof body?.page_url === "string" ? body.page_url : ""
    if (!pageUrl || !jobClosedAllowed(pageUrl, String(held.url ?? ""))) {
      void logApplyAgentEvent(env, me.id, "job-closed-rejected", held.id, { url: String(body?.url ?? "").slice(0, 300), page_url: pageUrl.slice(0, 300), posting_url: String(held.url ?? "").slice(0, 300) })
      return json(409, { status: "rejected", reason: "page_url_mismatch", message: "Odds only marks a job closed from its own posting page." })
    }
    if (held.closed_at) return json(200, { status: "closed", id: held.id, already: true })
    const now = new Date().toISOString()
    await svc(env, `postings?id=eq.${encodeURIComponent(held.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ closed_at: now, last_checked: now }),
    })
    // End any in-flight apply queue for this job (this user).
    await svc(env, `application_runs?user_id=eq.${me.id}&posting_id=eq.${encodeURIComponent(held.id)}&status=in.(queued,filling,needs_input,ready)`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed", message: "This job is no longer accepting applications. No application was submitted.", updated_at: now }),
    }).catch(() => undefined)
    void logApplyAgentEvent(env, me.id, "job-closed", held.id, { url: String(body?.url ?? "").slice(0, 300), page_url: pageUrl.slice(0, 300), posting_url: String(held.url ?? "").slice(0, 300) })
    return json(200, { status: "closed", id: held.id })
  }
  // The person pressed Submit and LinkedIn said it was sent: the job is applied on their odds tracker (kept for them first if it was not).
  if (route === "applied" && req.method === "POST") {
    let body: Json
    try {
      body = await readBody()
    } catch {
      return json(400, { error: "Send { url }." })
    }
    const link = jobLink(String(body?.url ?? ""), true)
    const held = link ? (await heldJob(env, link))?.[0] : null
    if (!held) return json(404, { status: "unknown", message: "odds does not hold that job yet." })
    await svc(env, "saved_jobs", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ user_id: me.id, posting_id: held.id }) })
    const existing = await svc(env, `applications?user_id=eq.${me.id}&posting_id=eq.${encodeURIComponent(held.id)}&select=id`)
    if (existing?.[0]) await svc(env, `applications?id=eq.${existing[0].id}&user_id=eq.${me.id}`, { method: "PATCH", body: JSON.stringify({ stage: "applied" }) })
    else await svc(env, "applications", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: me.id, posting_id: held.id, fit_tier: "extension", stage: "applied" }) })
    // The employer confirmed it: the Broods run for this job is done (the tracker drops its live layer and shows Applied).
    await svc(env, `drive_runs?user_id=eq.${me.id}&posting_id=eq.${encodeURIComponent(held.id)}&status=in.(running,review,needs_you,stuck)`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "submitted", message: "The employer confirmed your application.", updated_at: new Date().toISOString() }) }).catch(() => undefined)

    return json(200, { status: "applied", id: held.id })
  }
  // The person's own CV file, for the form's upload (their key only, their own documents only).
  if (route === "file" && req.method === "GET") {
    const doc = new URL(req.url).searchParams.get("doc") ?? ""
    if (!/^[0-9a-f-]{36}$/.test(doc)) return json(400, { error: "Which document?" })
    const row = (await svc(env, `documents?user_id=eq.${me.id}&id=eq.${doc}&select=file_name,mime,path,drive_file_id`))?.[0]
    if (!row) return json(404, { error: "No such document." })
    let r: Response
    if (row.drive_file_id) {
      const denv = driveEnv()
      const dlink = denv ? await linkOf(denv, me.id) : null
      if (!denv || !dlink) return json(502, { error: "The file is in Google Drive, and odds can no longer reach it." })
      r = await contentOf(await accessFor(denv, dlink), row.drive_file_id)
    } else {
      r = await fetch(`${env.url}/storage/v1/object/documents/${String(row.path).split("/").map(encodeURIComponent).join("/")}`, { headers: { apikey: env.serviceKey!, Authorization: `Bearer ${env.serviceKey}` } })
    }
    if (!r.ok || !r.body) return json(502, { error: "Could not get that file right now." })

    return new Response(r.body, { status: 200, headers: { ...CORS, "Content-Type": row.mime || "application/octet-stream", "X-File-Name": encodeURIComponent(String(row.file_name)), "Access-Control-Expose-Headers": "X-File-Name", "Cache-Control": "private, no-store" } })
  }
  if (!["add", "analyze"].includes(route) || req.method !== "POST") return json(404, { error: "Not found." })

  let url = ""
  // The job as the person's browser read it from the page (for LinkedIn, its public page of the job), so odds need not read it itself.
  let posting: Json = null
  try {
    const raw = await req.text()
    if (raw.length > 150_000) return json(413, { error: "Too large." })
    const body = JSON.parse(raw) as Json
    url = String(body?.url ?? "")
    posting = body?.posting && typeof body.posting === "object" ? body.posting : null
  } catch {
    return json(400, { error: "Send { url }." })
  }
  const parsed = jobLink(url, true)
  if (!parsed) return json(422, { status: "unsupported", message: "odds cannot tell which job this page is." })

  // Free first: do we already hold this job? Only a job we do not hold is read, and that is limited per person (LinkedIn reads cost money).
  // Only a LinkedIn job odds reads itself costs money; one the person's browser read from LinkedIn's public page does not.
  const paid = parsed.site === "linkedin" && !posting
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  // What the answer needs at the end is asked for now, alongside: the person's profile, the reference, and the day's reads so far.
  const early = Promise.all([extProfile(env, me), extensionContextFor(env)])
  // An answer that returns before using it (a closed job, the day's allowance) must not leave it failing unheard.
  early.catch(() => undefined)
  const [held, usedToday] = await Promise.all([heldJob(env, parsed), svc(env, `extension_reads?user_id=eq.${me.id}&created_at=gte.${since}&paid=is.${paid}&select=id`)])
  if (!held?.[0]) {
    const cap = paid ? EXT_DAILY_READS : EXT_DAILY_PAGE_READS
    const used = usedToday
    if ((used ?? []).length >= cap) return json(429, { status: "limit", message: `Up to ${cap} new jobs a day. Jobs odds already has are not counted.` })
    await svc(env, "extension_reads", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: me.id, url: parsed.url, paid }) })
  }
  // A known job needs only saving; do not call the scraper/company enrichment again.
  const existing = held?.[0]
  if (existing?.closed_at) return json(200, { status: "closed", message: "That job is closed." })
  let result: Json = { status: "exists", id: existing?.id }
  if (!existing) {
    // With the service key, so jobs/add takes the posting the browser read (and any job page, not only the job sites it knows): this route knows who sent it and counts it.
    const added = await fetch(`${env.url}/functions/v1/jobs/add`, { method: "POST", headers: { "Content-Type": "application/json", apikey: env.serviceKey ?? env.anonKey, Authorization: `Bearer ${env.serviceKey ?? env.anonKey}` }, body: JSON.stringify(posting ? { url: parsed.url, posting } : { url: parsed.url }), signal: AbortSignal.timeout(120_000) }).catch(() => null)
    result = added ? await added.json().catch(() => ({})) : {}
    if (!added || !added.ok) return json(added?.status === 429 ? 429 : 502, { status: "error", message: result?.error ?? "odds could not read that job. Try again in a minute." })
    if (result.status !== "added" && result.status !== "exists") return json(200, { status: result.status ?? "error", message: result.status === "closed" ? "That job is closed." : result.message ?? "That job could not be read." })
  }
  const id: string = result.id
  // Saving it, reading its row, and the profile and reference asked for at the start: all at once.
  const [, rows, [profile, w]] = await Promise.all([
    route === "add" ? svc(env, "saved_jobs", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ user_id: me.id, posting_id: id }) }) : null,
    rest(env, `app_jobs?select=${COLUMNS}&id=eq.${encodeURIComponent(id)}`).catch(() => []),
    early,
  ])
  const post = rows?.[0] ? core.preparePool(rows)[0] : null
  const chance = post && core.hasProfile(profile) ? core.chanceFor(post, profile, w.ref, w.shares) : null
  const line = post ? core.jobLine(post, w.ref) : { id, title: result.title ?? null, company: result.employer ?? null }

  return json(200, { status: result.status, known: true, saved: route === "add", job: line, odds_link: `https://odds.beeblast.co/job/${id}`, chance_pct: chance?.chance_pct ?? null, needs_profile: !core.hasProfile(profile) })
}

export async function handle(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (new URL(req.url).pathname.includes("/ext/")) return handleExt(req, env)
  // Broods' browser tools (one agent drives the person's tab through the Odds extension).
  if (/\/drive\/?$/.test(new URL(req.url).pathname)) return handleDriveMcp(req, env)
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
