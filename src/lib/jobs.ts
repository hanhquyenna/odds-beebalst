import { daysSince } from "@/lib/format"
import { withSkillTiers } from "@/lib/skill-tiers"
import { supabase } from "@/lib/supabase"
import type { Application, Band, Posting, Profile, TaxParams, Transition } from "@/lib/types"

const COLUMNS =
  "id,employer,employer_display,ats,source,title,region,cat,cbs_group,url,ind_sponsor,ind_sponsor_name,years_min,dutch_required,visa_mention,junior_title,degree_asked,skills,pay_posted,applicants,applicants_text,valid_through,seniority,posted_at,days_open,freshness_state,fetched_at,title_clean,level_jev,level_conf,usable,industry,workplace,job_type,dutch_jev,family"
/** Written by the hourly open/closed check. Left out until the columns exist (supabase/migrations/20261002120100_posting_checks.sql). */
const CHECK_COLUMNS = ",closed_at,last_checked,posted_on,skill_tiers,enrollment"

const PAGE = 1000

/** What only the view app_jobs has: the level the database works out, and which posting each one was merged into. */
const VIEW_COLUMNS = ",level_view,kept_id,pick_rank,role_kind,work_signals"

/** Pages fetched at once after the first: a few in parallel instead of one after another, so the list arrives sooner. */
const PARALLEL_PAGES = 4

const comparisonKey = (value: string | null | undefined): string => (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")

type GlassdoorPay = { employer: string; position: string; reports: number; pay_min: number | null; pay_max: number | null; unit: string | null; read_on: string }

async function attachGlassdoor(rows: Posting[]): Promise<void> {
  const { data, error } = await supabase.from("employer_glassdoor_pay").select("employer,position,reports,pay_min,pay_max,unit,read_on")
  if (error) {
    // Glassdoor is a secondary validation source; a missing table or a blocked read must never hide jobs.
    return
  }
  const byKey = new Map((data as GlassdoorPay[]).map((g) => [`${comparisonKey(g.employer)}|${comparisonKey(g.position)}`, g]))
  for (const post of rows) {
    const g = byKey.get(`${comparisonKey(post.employer)}|${comparisonKey(post.title)}`)
    if (g) {
      post.glassdoor = { position: g.position, reports: g.reports, payMin: g.pay_min, payMax: g.pay_max, unit: g.unit, readOn: g.read_on }
    }
  }
}

/**
 * One table or view, a thousand rows at a time. The first page settles the columns; the rest come several at once.
 * Null when it does not exist (the view is not there yet).
 */
async function readAll(table: string, columns: string): Promise<{ rows: Posting[]; columns: string } | null> {
  let cols = columns
  const page = (from: number) => supabase.from(table).select(cols).order("id").range(from, from + PAGE - 1)

  let { data, error } = await page(0)
  if (error?.code === "42703" && cols.includes(CHECK_COLUMNS)) {
    cols = cols.replace(CHECK_COLUMNS, "")
    ;({ data, error } = await page(0))
  }
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") return null
    throw new Error(error.message)
  }
  const rows: Posting[] = [...((data ?? []) as unknown as Posting[])]
  let more = (data ?? []).length === PAGE

  for (let from = PAGE; more; from += PAGE * PARALLEL_PAGES) {
    const batch = await Promise.all(Array.from({ length: PARALLEL_PAGES }, (_, i) => page(from + i * PAGE)))
    for (const result of batch) {
      if (result.error) throw new Error(result.error.message)
      const got = (result.data ?? []) as unknown as Posting[]
      rows.push(...got)
      if (got.length < PAGE) {
        more = false
        break
      }
    }
  }

  return { rows, columns: cols }
}

/**
 * The whole pool, a thousand rows at a time, without the descriptions. It is read from the database view app_jobs, so the database
 * decides which jobs are active, which are the same job found twice, and which level each is. Where the view is missing it falls back to
 * the table and the browser works those out as before.
 */
export async function fetchPostings(): Promise<Posting[]> {
  const fromView = await readAll("app_jobs", COLUMNS + VIEW_COLUMNS + CHECK_COLUMNS)
  const all = fromView?.rows ?? (await readAll("postings", COLUMNS + CHECK_COLUMNS))?.rows ?? (await readAll("postings", COLUMNS))?.rows ?? []

  // Posts the reader of the text found to be no real job (an advert, a list of links) stay out of every list.
  const pool = all.filter((p) => (p.usable == null || p.usable >= 0.5) && !p.closed_at).map((p) => withSkillTiers(p))
  await attachGlassdoor(pool)
  // Where the text plainly asks for Dutch and the first reading missed it, Dutch is required.
  for (const p of pool) {
    if (!p.dutch_required && (p.dutch_jev ?? 0) >= 0.8) {
      p.dutch_required = true
    }
  }
  refreshAges(pool)
  // One industry per employer: the commonest answer across its postings, so one odd reading cannot split an employer in two.
  const votes = new Map<string, Map<string, number>>()
  for (const p of pool) {
    if (p.industry) {
      const v = votes.get(p.employer) ?? new Map<string, number>()
      v.set(p.industry, (v.get(p.industry) ?? 0) + 1)
      votes.set(p.employer, v)
    }
  }
  for (const p of pool) {
    const v = votes.get(p.employer)
    p.industry = v ? [...v.entries()].sort((a, b) => b[1] - a[1])[0][0] : null
  }

  return pool
}

/**
 * Works each posting's age out from its posting date today, not from the crawl day, so "7 days ago" stays true as days pass.
 * Run on every fresh read and on the copy kept in this browser, which can be days old.
 */
export function refreshAges(pool: Posting[]): void {
  for (const p of pool) {
    if (p.posted_on) {
      p.days_open = daysSince(p.posted_on)
      p.freshness_state = p.days_open <= 6 ? "fresh" : p.days_open <= 44 ? "active" : "aging"
    }
  }
}

export async function fetchBody(id: string): Promise<string> {
  const { data, error } = await supabase.from("postings").select("body").eq("id", id).maybeSingle()
  if (error) {
    throw new Error(error.message)
  }

  return data?.body ?? ""
}

/**
 * Jev's reading of what a posting asks for: each line with how much it insists. Null when the column or the
 * posting's reading is not there yet, so the page falls back to reading the text itself.
 */
let jevColumn: boolean | null = null

export async function fetchJevRequirements(id: string): Promise<Array<{ text: string; tier: "must" | "strong" | "optional" | "nice" }> | null> {
  if (jevColumn === false) {
    return null
  }
  const { data, error } = await supabase.from("postings").select("requirements").eq("id", id).maybeSingle()
  if (error) {
    // The column is not in the database yet: ask once, then stop asking.
    jevColumn = false

    return null
  }
  jevColumn = true
  if (!data) {
    return null
  }
  const rows = (data as { requirements?: unknown }).requirements

  return Array.isArray(rows) ? (rows as Array<{ text: string; tier: "must" | "strong" | "optional" | "nice" }>) : null
}

export interface Reference {
  bands: Record<string, Band>
  ageFactors: Record<string, Record<string, number>>
  tax: TaxParams
  transitions: Record<string, Transition>
}

export async function fetchReference(): Promise<Reference> {
  const [bands, ages, tax, transitions] = await Promise.all([
    supabase.from("cbs_bands").select("*"),
    supabase.from("cbs_age_factors").select("sector,age_band,factor"),
    supabase.from("tax_params").select("params").eq("year", 2026).single(),
    supabase.from("transitions").select("*"),
  ])
  for (const result of [bands, ages, tax, transitions]) {
    if (result.error) {
      throw new Error(result.error.message)
    }
  }
  const ageFactors: Record<string, Record<string, number>> = {}
  for (const row of ages.data as Array<{ sector: string; age_band: string; factor: number }>) {
    ;(ageFactors[row.sector] ??= {})[row.age_band] = Number(row.factor)
  }

  return {
    bands: Object.fromEntries((bands.data as unknown as Band[]).map((b) => [b.code, b])),
    ageFactors,
    tax: (tax.data as { params: TaxParams }).params,
    transitions: Object.fromEntries((transitions.data as unknown as Transition[]).map((t) => [t.title, t])),
  }
}

// ---- the signed-in user's own rows (row-level security keeps them private) ----

export async function loadProfile(userId: string): Promise<Partial<Profile> | null> {
  const { data, error } = await supabase.from("profiles").select("data").eq("user_id", userId).maybeSingle()
  if (error) {
    throw new Error(error.message)
  }

  return data?.data ?? null
}

export async function saveProfile(userId: string, profile: Profile): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, data: profile, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (error) {
    throw new Error(error.message)
  }
}

interface ApplicationRow {
  id: number
  posting_id: string
  fit_tier: string
  stage: Application["stage"]
  logged_at: string
}

export async function fetchApplications(postings: Map<string, Posting>): Promise<Application[]> {
  const { data, error } = await supabase.from("applications").select("id,posting_id,fit_tier,stage,logged_at").order("id", { ascending: false })
  if (error) {
    throw new Error(error.message)
  }

  return (data as unknown as ApplicationRow[]).map((row) => ({
    ...row,
    title: postings.get(row.posting_id)?.title ?? row.posting_id,
    employer: postings.get(row.posting_id)?.employer_display ?? "",
  }))
}

export async function insertApplication(userId: string, postingId: string, fitTier: string): Promise<void> {
  const { error } = await supabase.from("applications").insert({ user_id: userId, posting_id: postingId, fit_tier: fitTier })
  if (error) {
    throw new Error(error.message)
  }
}

export async function updateStage(id: number | string, stage: Application["stage"]): Promise<void> {
  const { error } = await supabase.from("applications").update({ stage }).eq("id", id)
  if (error) {
    throw new Error(error.message)
  }
}

export async function deleteApplication(id: number | string): Promise<void> {
  const { error } = await supabase.from("applications").delete().eq("id", id)
  if (error) {
    throw new Error(error.message)
  }
}

/** What a posting's own text says about how and where the work is done. Found on the server, so the list need not download every posting. */
export interface Signals {
  hybrid: boolean
  remote: boolean
  partTime: boolean
  fullTime: boolean
  contract: boolean
}

/** Each posting's signals, from the work_signals the database works out once per posting (supabase/migrations/20261006120200_work_signals.sql). */
export function signalsOf(posts: Posting[]): Record<string, Signals> {
  const out: Record<string, Signals> = {}
  for (const post of posts) {
    const found = post.work_signals ?? []
    if (found.length > 0) {
      out[post.id] = {
        hybrid: found.includes("hybrid"),
        remote: found.includes("remote"),
        partTime: found.includes("partTime"),
        fullTime: found.includes("fullTime"),
        contract: found.includes("contract"),
      }
    }
  }

  return out
}

export interface EmployerFacts {
  name: string | null
  description: string | null
  website: string | null
  founded_year: number | null
  employees: number | null
  employee_range: string | null
  company_type: string | null
  headquarters: string | null
  top_schools: Array<{ title: string; count: number }> | null
  top_functions: Array<{ title: string; count: number }> | null
  top_locations: Array<{ title: string; count: number }> | null
  linkedin_url: string | null
  fetched_at: string
  /** The headcount readings kept so far, oldest first. Growth is only shown from two of them. */
  headcount: Array<{ read_on: string; employees: number }>
}

/** Facts read from the employer's LinkedIn page, and the headcount readings kept for it. Null when the employer has not been read. */
export async function fetchEmployerFacts(employer: string): Promise<EmployerFacts | null> {
  const [facts, counts] = await Promise.all([
    supabase.from("employer_facts").select("name,description,website,founded_year,employees,employee_range,company_type,headquarters,top_schools,top_functions,top_locations,linkedin_url,fetched_at").eq("employer", employer).maybeSingle(),
    supabase.from("employer_headcount").select("read_on,employees").eq("employer", employer).order("read_on"),
  ])
  if (facts.error || !facts.data) {
    return null
  }

  return { ...(facts.data as Omit<EmployerFacts, "headcount">), headcount: (counts.data ?? []) }
}

/** The logos kept in the database (employer_facts.logo), for employers the app's own logo lists do not have. Empty when there are none. */
export async function fetchStoredLogos(): Promise<Array<{ employer: string; logo: string }>> {
  const { data, error } = await supabase.from("employer_facts").select("employer,logo").not("logo", "is", null)
  if (error || !data) {
    return []
  }

  return (data as Array<{ employer: string; logo: string | null }>).filter((r): r is { employer: string; logo: string } => Boolean(r.logo))
}

/**
 * The jobs a person kept (saved or applied to) that are no longer in the open pool: closed since, or left out of it (a posting too old). They are read straight from the
 * table, closed ones included, so a kept job never disappears from the list; its "Still open" says it has closed. A few hundred ids at a time.
 */
export async function fetchKeptPostings(ids: ReadonlyArray<string>): Promise<Posting[]> {
  const out: Posting[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const part = ids.slice(i, i + 150)
    const { data, error } = await supabase.from("postings").select(COLUMNS + CHECK_COLUMNS).in("id", part)
    if (error) {
      // The check columns may not be there on an older database: ask again without them.
      const retry = await supabase.from("postings").select(COLUMNS).in("id", part)
      if (!retry.error) out.push(...((retry.data ?? []) as unknown as Posting[]))
      continue
    }
    out.push(...((data ?? []) as unknown as Posting[]))
  }

  return out.map((p) => withSkillTiers(p))
}

