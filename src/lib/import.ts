import { crosswalk, extractPosting, occupationCategory } from "@/lib/engine"
import type { Posting, PropertyType } from "@/lib/types"

/** What each column of a file can become: one of the fields of a job, a property of your own, or nothing. */
export type Target = "title" | "company" | "place" | "link" | "pay" | "text" | "property" | "ignore"
export type Mapping = Record<string, Target>

/** The names a column is recognised by, in English and Dutch. A header matches when, with spaces and signs removed, it equals one of these or contains it. */
const ALIASES: Record<Exclude<Target, "property" | "ignore">, ReadonlyArray<string>> = {
  title: ["jobtitle", "title", "position", "positie", "role", "job", "jobname", "vacature", "functie", "vacaturetitel", "opening"],
  company: ["company", "companyname", "employer", "organisation", "organization", "bedrijf", "werkgever", "firm", "account", "bedrijfsnaam"],
  place: ["location", "city", "place", "region", "locatie", "plaats", "stad", "town", "address"],
  link: ["link", "url", "joburl", "joblink", "posting", "applylink", "website", "href", "vacatureurl"],
  pay: ["pay", "salary", "compensation", "salaris", "wage", "payrange", "salaryrange", "rate", "loon"],
  text: ["description", "jobdescription", "about", "requirements", "omschrijving", "functieomschrijving", "details"],
}

export const TARGETS: ReadonlyArray<{ value: Target; label: string }> = [
  { value: "title", label: "Job title" },
  { value: "company", label: "Company" },
  { value: "place", label: "Location" },
  { value: "link", label: "Link" },
  { value: "pay", label: "Pay" },
  { value: "text", label: "Description" },
  { value: "property", label: "Keep as a property" },
  { value: "ignore", label: "Skip" },
]

export interface ImportedJob {
  post: Posting
  /** Columns that were not one of the above, with this job's value. */
  extras: Record<string, string>
}

export interface ImportResult {
  jobs: ImportedJob[]
  /** Property names found in the file, in file order. */
  columns: string[]
  /** The type each of those properties was read as (date, number, link, select, checkbox or text). */
  types: Record<string, PropertyType>
  /** The choices of those read as a select. */
  options: Record<string, string[]>
  /** Rows skipped for having no title. */
  skipped: number
}

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)

const norm = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "")

const isUrl = (v: string): boolean => /^(https?:\/\/|www\.)\S+$/i.test(v.trim())
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

/** A date written the usual ways (2026-11-15, 15/11/2026, 15-11-26, 15 Nov 2026, Nov 15, 2026) as YYYY-MM-DD, or null. Day first, as is usual here. */
export function toIsoDate(raw: string): string | null {
  const v = raw.trim()
  const pad = (n: number): string => String(n).padStart(2, "0")
  const make = (y: number, m: number, d: number): string | null => {
    const year = y < 100 ? 2000 + y : y
    const t = new Date(Date.UTC(year, m - 1, d))

    return t.getUTCFullYear() === year && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${year}-${pad(m)}-${pad(d)}` : null
  }
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/)
  if (m) return make(Number(m[1]), Number(m[2]), Number(m[3]))
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/)
  if (m) return make(Number(m[3]), Number(m[2]), Number(m[1]))
  m = v.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/)
  if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) return make(Number(m[3]), MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, Number(m[1]))
  m = v.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/)
  if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) return make(Number(m[3]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2]))

  return null
}

/** What kind of property a column is, from its values: all dates, all numbers, all links, yes/no, a few repeated words (a select), else text. */
export function guessType(values: ReadonlyArray<string>): { type: PropertyType; options?: string[] } {
  const v = values.map((x) => x.trim()).filter(Boolean)
  if (v.length === 0) return { type: "text" }
  if (v.every((x) => toIsoDate(x))) return { type: "date" }
  if (v.every((x) => /^-?\d+([.,]\d+)?$/.test(x))) return { type: "number" }
  if (v.every(isUrl)) return { type: "url" }
  if (v.every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) return { type: "email" }
  if (v.every((x) => /^\+?[\d\s().-]{7,}$/.test(x) && x.replace(/\D/g, "").length >= 7)) return { type: "phone" }
  if (v.every((x) => /^(true|false|yes|no|ja|nee|x|y|n|1|0|✓)$/i.test(x)) && v.some((x) => /^(true|yes|ja|x|y|1|✓)$/i.test(x))) return { type: "checkbox" }
  const distinct = [...new Set(v)]
  if (v.length >= 4 && distinct.length <= 8 && distinct.length <= v.length / 2 && distinct.every((x) => x.length <= 30)) return { type: "select", options: distinct }

  return { type: "text" }
}

/** Which column is which: by the name of the column first, then by what is in it (links look like links, the first column of words is the title). A name used by one field is not used by another. */
export function guessMapping(headers: ReadonlyArray<string>, rows: ReadonlyArray<Record<string, string>>): Mapping {
  const out: Mapping = Object.fromEntries(headers.map((h) => [h, "property" as Target]))
  const taken = new Set<string>()
  const key = (h: string): string => norm(h)
  for (const target of Object.keys(ALIASES) as Array<keyof typeof ALIASES>) {
    const names = ALIASES[target]
    const exact = headers.find((h) => !taken.has(h) && names.includes(key(h)))
    const loose = exact ?? headers.find((h) => !taken.has(h) && names.some((n) => n.length >= 4 && key(h).includes(n)))
    if (loose) {
      out[loose] = target
      taken.add(loose)
    }
  }
  const values = (h: string): string[] => rows.map((r) => r[h] ?? "").filter(Boolean)
  if (!Object.values(out).includes("link")) {
    const h = headers.find((x) => !taken.has(x) && values(x).length > 0 && values(x).every(isUrl))
    if (h) {
      out[h] = "link"
      taken.add(h)
    }
  }
  if (!Object.values(out).includes("title")) {
    const h = headers.find((x) => !taken.has(x) && guessType(values(x)).type === "text" && values(x).length > 0)
    if (h) {
      out[h] = "title"
      taken.add(h)
    }
  }

  return out
}

/** How to read jobs you bring: rows of a spreadsheet saved as CSV, with each column read as the field or property `mapping` says (by default, as guessed from the names and the values). Only a title is needed; a row without a company gets "Not stated". */
export function readJobs(rows: ReadonlyArray<Record<string, string>>, known: ReadonlyArray<Posting>, mapping?: Mapping): ImportResult {
  const headers = rows.length ? Object.keys(rows[0]) : []
  const map = mapping ?? guessMapping(headers, rows)
  const pick = (field: Target): string | undefined => headers.find((h) => map[h] === field)
  const at = { title: pick("title"), company: pick("company"), place: pick("place"), link: pick("link"), pay: pick("pay"), text: pick("text") }
  const columns = headers.filter((h) => map[h] === "property")
  const types: Record<string, PropertyType> = {}
  const options: Record<string, string[]> = {}
  for (const c of columns) {
    const g = guessType(rows.map((r) => r[c] ?? ""))
    types[c] = g.type
    if (g.options) options[c] = g.options
  }
  const fix = (c: string, v: string): string => (types[c] === "date" ? (toIsoDate(v) ?? v) : types[c] === "checkbox" ? (/^(true|yes|ja|x|y|1|✓)$/i.test(v.trim()) ? "true" : "") : types[c] === "url" && /^www\./i.test(v) ? `https://${v}` : v)
  const employers = new Map<string, Posting>()
  for (const post of known) {
    employers.set(norm(post.employer_display), post)
    employers.set(norm(post.employer), post)
  }
  const stamp = Date.now().toString(36)
  const jobs: ImportedJob[] = []
  let skipped = 0

  rows.forEach((row, index) => {
    const title = at.title ? row[at.title] : ""
    const company = (at.company ? row[at.company] : "") || "Not stated"
    if (!title) {
      skipped++

      return
    }
    const text = at.text ? (row[at.text] ?? "") : ""
    const match = employers.get(norm(company))
    const code = crosswalk(title)
    const found = extractPosting(title, text)
    const post: Posting = {
      id: `mine-${stamp}-${index}-${slug(company)}`,
      employer: match?.employer ?? company,
      employer_display: match?.employer_display ?? company,
      ats: "mine",
      source: "mine",
      title,
      region: (at.place ? row[at.place] : "") || null,
      cat: code ? occupationCategory(code) : "other",
      cbs_group: code,
      url: (at.link ? row[at.link] : "") || null,
      ind_sponsor: match?.ind_sponsor ?? false,
      ind_sponsor_name: match?.ind_sponsor_name ?? null,
      years_min: found.years_min ?? null,
      dutch_required: found.dutch_required ?? false,
      visa_mention: found.visa_mention ?? false,
      junior_title: found.junior_title ?? false,
      degree_asked: found.degree_asked ?? null,
      skills: found.skills ?? [],
      pay_posted: (at.pay ? row[at.pay] : "") || null,
      applicants: null,
      applicants_text: null,
      valid_through: null,
      seniority: null,
      posted_at: null,
      days_open: null,
      freshness_state: "unknown",
      fetched_at: null,
      body: text,
      local: true,
    }
    jobs.push({ post, extras: Object.fromEntries(columns.map((c) => [c, fix(c, row[c] ?? "")]).filter(([, v]) => v !== "")) })
  })

  return { jobs, columns, types, options, skipped }
}
