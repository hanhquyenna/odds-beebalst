import { levelOf, LEVELS, type Level } from "@/lib/engine"
import { FAMILIES, guessFamily } from "@/lib/field"
import { industryOf, type Industry } from "@/lib/industries"
import { cityOf, jobTypesOf, workplaceOf, type JobType, type Workplace } from "@/lib/job-facts"
import type { Reference } from "@/lib/jobs"
import type { Signals } from "@/lib/jobs"
import { sourceNamesOf } from "@/lib/sources"
import { payMid } from "@/lib/spec"
import type { Posting } from "@/lib/types"

/**
 * Narrowing the list, done on the postings the page already holds. The whole
 * pool loads in one go, so a filter is a pure function over that array.
 */
export interface JobFilters {
  /** Words that must all appear in the title, company, place, industry or level. */
  query: string
  /** Any of these lines of work (the job's own family, whatever the employer does). Empty is any. */
  field: string[]
  /** Any of these employer industries. Empty is any industry. */
  industry: Industry[]
  /** Any of these levels. Empty is any level. */
  level: Level[]
  /** Null is any language; "english" keeps postings that do not require Dutch. One or the other, so there is nothing to multi-select. */
  language: Array<"english" | "dutch">
  /** Only employers on the IND register of recognised sponsors. */
  sponsorOnly: boolean
  /** How recently it was posted. One window. */
  posted: "any" | "day" | "week" | "month"
  /** Any of these kinds of job. Empty is any kind. */
  type: JobType[]
  /** Any of these: remote, hybrid or on-site. Empty is anywhere. */
  workplace: Workplace[]
  /** Any of these towns. Empty is any town. */
  city: string[]
  /** Jobs whose pay, stated or typical, reaches this much a month. Null is any. One threshold. */
  minPay: number | null
  /** Only jobs found on any of these sites, by name. Empty is any site. */
  source: string[]
}

/** The lines of work to filter by: what the job is, not what the employer does. "Other" is not something anyone filters for. */
export const FIELD_OPTIONS: ReadonlyArray<string> = FAMILIES.filter((f) => f !== "Other")

/** The guessed line of work per posting, kept with the title and skills it was guessed from, so a posting given a new title or skills list is guessed again. */
const guessedFields = new WeakMap<object, { title: string; skills: ReadonlyArray<string>; field: string | null }>()

/** A job's line of work: Jev's reading, or the title-and-skills guess for a job Jev has not read yet. Null when neither is sure. The guess is kept per posting: every keystroke asks for every row. */
export function fieldOf(post: Pick<Posting, "family" | "title" | "title_clean" | "skills">): string | null {
  if (post.family !== null && post.family !== undefined) {
    return post.family
  }
  const title = post.title_clean ?? post.title
  const hit = guessedFields.get(post)
  if (hit && hit.title === title && hit.skills === post.skills) {
    return hit.field
  }
  const field = guessFamily(title, post.skills)
  guessedFields.set(post, { title: title, skills: post.skills, field: field })

  return field
}

export const NO_FILTERS: JobFilters = { query: "", field: [], industry: [], level: [], language: [], sponsorOnly: false, posted: "any", type: [], workplace: [], city: [], minPay: null, source: [] }

export const POSTED_DAYS = { day: 1, week: 7, month: 30 } as const

/** Levels worth offering: "Not stated" is not something anyone filters for. */
export const LEVEL_OPTIONS: ReadonlyArray<Level> = LEVELS.filter((level) => level !== "Not stated")

/** The level filter's starting point: internships and entry-level roles, an international student's first jobs. */
export const STARTING_LEVELS: ReadonlyArray<Level> = ["Internship", "Entry"]

/** What the page opens with: first jobs (the database view active_internship_entry) that do not need Dutch, posted any time. Clear all goes back to this, not to everything. */
export const DEFAULT_FILTERS: JobFilters = { ...NO_FILTERS, level: [...STARTING_LEVELS], posted: "any", language: ["english"] }

/** The same set of values, whatever the order. */
const sameSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean => a.length === b.length && a.every((x) => b.includes(x))

/**
 * Filters saved before several values could be chosen held one value or null (and "Starting out" for the first jobs).
 * Reads either shape into the current one, drops anything it does not know, and fills what is missing, so a saved
 * preference never breaks the page and never silently turns into "everything".
 */
export function normalizeFilters(raw: unknown): JobFilters {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : typeof v === "string" && v !== "" ? [v] : [])
  const levels = list(r.level).flatMap((l) => (l === "Starting out" ? [...STARTING_LEVELS] : [l])).filter((l): l is Level => (LEVEL_OPTIONS as ReadonlyArray<string>).includes(l))
  const posted = r.posted === "day" || r.posted === "week" || r.posted === "month" || r.posted === "any" ? r.posted : DEFAULT_FILTERS.posted
  const pay = typeof r.minPay === "number" && Number.isFinite(r.minPay) ? r.minPay : null

  return {
    query: typeof r.query === "string" ? r.query : "",
    field: list(r.field).filter((f) => FIELD_OPTIONS.includes(f)),
    industry: list(r.industry) as Industry[],
    level: [...new Set(levels)],
    language: [...new Set(list(r.language).filter((x): x is "english" | "dutch" => x === "english" || x === "dutch"))],
    sponsorOnly: r.sponsorOnly === true,
    posted,
    type: list(r.type) as JobType[],
    workplace: list(r.workplace) as Workplace[],
    city: list(r.city),
    minPay: pay,
    source: list(r.source),
  }
}

/** What the filters need besides the posting: the text signals and the pay tables, each absent until loaded. */
export interface FilterEnv {
  signals?: Record<string, Signals> | null
  reference?: Reference | null
}

/** Lower case, accents off, so "Nestlé" is found by "nestle". */
const plain = (text: string): string => text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
/** Only letters and digits (and the signs that make a name: c++, c#), no spaces, so "ecommerce" is found in "e-commerce" and "dataengineer" in "Data Engineer". */
const squashed = (text: string): string => text.replace(/[^a-z0-9+#]/g, "")
/** Whether `short` starts any word of `text`. */
function startsAWord(text: string, short: string): boolean {
  const at = (from: number): number => text.indexOf(short, from)
  for (let i = at(0); i !== -1; i = at(i + 1)) {
    if (i === 0 || /[^a-z0-9]/.test(text[i - 1])) {
      return true
    }
  }

  return false
}
/** The fewest letters a word needs before it may match run together with its neighbours. */
const RUN_TOGETHER_FROM = 6

/** The words a search looks in for one job, written both ways. Kept per posting, because every keystroke looks through all of them. */
const searchable = new WeakMap<object, { text: string; squashed: string }>()
function searchTextOf(post: Posting): { text: string; squashed: string } {
  const hit = searchable.get(post)
  if (hit) {
    return hit
  }
  const text = plain(`${post.title} ${post.employer_display} ${post.region ?? ""} ${fieldOf(post) ?? ""} ${industryOf(post) ?? ""} ${levelOf(post)}`)
  const made = { text: text, squashed: squashed(text) }
  searchable.set(post, made)

  return made
}

/** Every word typed is found in the job: as written, run together ("ecommerce"), or as a plural ("interns"). Takes the query already split by applyFilters. */
function matchesWords(post: Posting, words: ReadonlyArray<string>): boolean {
  if (words.length === 0) {
    return true
  }
  const { text, squashed: run } = searchTextOf(post)

  return words.every((w) => {
    const forms = w.length > 3 && w.endsWith("s") ? [w, w.slice(0, -1)] : [w]
    // A word of up to three letters ("ai", "hr", "ing") is found only where a word starts, not inside others ("retail", "maintenance").
    if (w.length <= 3) {
      return startsAWord(text, w)
    }

    // Running words together ("ecommerce" in "e-commerce") only for a longer word: a short one would match across the join of two words ("ai" inside "data intern").
    return forms.some((f) => text.includes(f) || (squashed(f).length >= RUN_TOGETHER_FROM && run.includes(squashed(f))))
  })
}

export function applyFilters<T extends Posting>(posts: ReadonlyArray<T>, filters: JobFilters, env: FilterEnv = {}): ReadonlyArray<T> {
  // Split once for the whole list: lower-casing and stripping accents per posting was most of the cost of a keystroke.
  const words = plain(filters.query).split(/\s+/).filter(Boolean)

  // Cheapest checks first, so a posting that fails a ticked box never pays for the text search or the derived facts.
  return posts.filter((post) => {
    if (filters.sponsorOnly && !post.ind_sponsor) {
      return false
    }
    // English keeps jobs that do not need Dutch, Dutch keeps the ones that do; both ticked, or none, is every job.
    if (filters.language.length === 1 && filters.language[0] === "english" && post.dutch_required) {
      return false
    }
    if (filters.language.length === 1 && filters.language[0] === "dutch" && !post.dutch_required) {
      return false
    }
    if (filters.posted !== "any" && (post.days_open === null || post.freshness_state === "still_listed_30_plus" || post.days_open > POSTED_DAYS[filters.posted])) {
      return false
    }
    if (filters.level.length > 0 && !filters.level.includes(levelOf(post))) {
      return false
    }
    if (filters.field.length > 0 && !filters.field.includes(fieldOf(post) ?? "")) {
      return false
    }
    if (filters.industry.length > 0 && !filters.industry.includes(industryOf(post) as Industry)) {
      return false
    }
    if (filters.city.length > 0 && !filters.city.includes(cityOf(post))) {
      return false
    }
    if (filters.type.length > 0) {
      const kinds = jobTypesOf(post, env.signals?.[post.id])
      if (!filters.type.some((t) => kinds.includes(t))) {
        return false
      }
    }
    if (filters.workplace.length > 0 && !filters.workplace.includes(workplaceOf(post, env.signals?.[post.id]) as Workplace)) {
      return false
    }
    if (filters.source.length > 0) {
      const names = sourceNamesOf(post)
      if (!filters.source.some((n) => names.includes(n))) {
        return false
      }
    }
    if (filters.minPay !== null && (payMid(post, env.reference ?? null)?.month ?? 0) < filters.minPay) {
      return false
    }
    if (!matchesWords(post, words)) {
      return false
    }

    return true
  })
}

/** How many filters are set, for a Clear control that says so. */
export function activeCount(filters: JobFilters): number {
  // The starting level and the posting window are where the page begins, so they are not filters anyone has set.
  const lists = [filters.field, filters.industry, sameSet(filters.level, STARTING_LEVELS) ? [] : filters.level, filters.type, filters.workplace, filters.city, filters.source].filter((each) => each.length > 0).length
  // English is where the page begins, so it is not a filter anyone has set; asking for Dutch is. Both languages, or none, is no filter.
  const language = filters.language.length === 1 && !sameSet(filters.language, DEFAULT_FILTERS.language) ? 1 : 0
  const single = language + (filters.minPay !== null ? 1 : 0)

  return lists + single + (filters.sponsorOnly ? 1 : 0) + (filters.posted !== "any" && filters.posted !== DEFAULT_FILTERS.posted ? 1 : 0) + (filters.query.trim() ? 1 : 0)
}

/** Whether the level choice is the page's starting point. */
export const isStartingLevel = (level: ReadonlyArray<string>): boolean => sameSet(level, STARTING_LEVELS)
