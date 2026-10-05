import { departmentOf } from "@/lib/field"
import { DEPARTMENT_TITLES, adjacentDepartments } from "../../supabase/functions/_shared/departments"
/** A position someone holds now, as the search read it. */
export interface PersonPosition {
  title: string
  company: string
  since?: string
}

export interface Suggestion {
  name: string
  headline: string
  place: string
  url: string
  /** The profile picture address, when the search returns one. */
  photo?: string
  /** Their About text, cut short. */
  about?: string
  /** The positions they hold now. */
  positions?: PersonPosition[]
}

/** Titles too far up to ask for a favour: leaders and owners. They are left out of the suggestions. */
const LEADERS = /\b(director|vp|vice president|head of|chief|c[a-z]o|president|partner|founder|co-founder|managing|owner|general manager|principal|board member|member of the board|general counsel)\b/i
/** Titles a step above the usual starter: kept, but listed after people closer to the role. */
const SENIORS = /\b(senior|sr\.?|lead|manager|staff)\b/i

/**
 * People you could ask, nearest to the role first: people near the role, then seniors, then heads and directors (a head can still say yes
 * or pass you on, so they are a shot, only a later one), and people whose position is unknown last. Order within each group is kept.
 */
export function rankSuggestions(people: ReadonlyArray<Suggestion>): Suggestion[] {
  const known = people.filter((p) => p.headline.trim() !== "")
  const leaders = known.filter((p) => LEADERS.test(p.headline))
  const rest = known.filter((p) => !LEADERS.test(p.headline))
  const near = rest.filter((p) => !SENIORS.test(p.headline))
  const far = rest.filter((p) => SENIORS.test(p.headline))
  // Someone whose position we could not read goes last: nothing says what they do, so nothing says they are the right person.
  const unknown = people.filter((p) => p.headline.trim() === "")

  return [...near, ...far, ...leaders, ...unknown]
}

/** The department of a position: the classifier's answer, else the first department whose title words (accountant, auditor, recruiter...) the position contains. */
export function departmentOfPosition(headline: string): string | null {
  const direct = departmentOf(headline)
  if (direct) return direct
  const text = headline.toLowerCase()
  for (const [dept, words] of Object.entries(DEPARTMENT_TITLES)) {
    if (words.some((w) => w.length > 2 && new RegExp(`\\b${w.toLowerCase().replace(/[^a-z0-9& ]/g, "")}`).test(text))) return dept
  }

  return null
}

/** A LinkedIn people search for a company and a kind of work, opened by the person themselves: the free way in when no one is stored for the employer yet. */
export function linkedinPeopleSearch(company: string, family: string | null | undefined): string {
  const word = family ? (DEPARTMENT_TITLES[family] ?? [])[0] ?? "" : ""

  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([company, word].filter(Boolean).join(" "))}`
}

/** How many people a job offers, best first, one more each time the button is pressed. */
export const JOB_POOL = 3
const HR = "HR & recruiting"

/**
 * The people stored for an employer, picked for ONE job: the job's own department first, then departments next to it (nobody further away), and
 * within each the people closer to the role (seniors after the others) first. Heads and directors come after everyone else, not never. The same person can serve several jobs at the
 * employer: nothing is spent per job. Someone whose position is unknown goes after everyone whose position is known.
 */
export function rankForJob(people: ReadonlyArray<Suggestion>, jobFamily: string | null | undefined, take = JOB_POOL): Suggestion[] {
  const near = jobFamily ? adjacentDepartments(jobFamily) : []
  const dept = (p: Suggestion): string | null => (p.headline.trim() ? departmentOfPosition(p.headline) : null)
  // Who can be asked: the job's own department and the ones next to it. Not the rest of the company, and never HR or recruiters for a job
  // that is not an HR job: they take applications, they are not who gives a referral for another team's job. Where the job's department is
  // unknown, anyone qualifies. Someone whose position does not point to a department stays in, after those who do.
  const eligible = people.filter((p) => {
    const d = dept(p)
    if (!jobFamily) return true
    if (d === HR && jobFamily !== HR) return false

    return d === null || d === jobFamily || near.includes(d)
  })
  const tier = (p: Suggestion): number => {
    const d = dept(p)
    if (!p.headline.trim()) return 20
    // A head or director is a later shot than anyone who is not one, whatever the department.
    const later = LEADERS.test(p.headline) ? 10 : 0
    if (jobFamily && d === jobFamily) return later
    if (d && near.includes(d)) return later + 1

    return later + 2
  }
  const ranked = rankSuggestions(eligible)
  const order = new Map(ranked.map((p, i) => [p.url, i]))

  return [...ranked].sort((a, b) => tier(a) - tier(b) || (order.get(a.url) ?? 0) - (order.get(b.url) ?? 0)).slice(0, take)
}

/** Why a person is on the list, in a line: their department against the job's. Said plainly when the position is unknown or the department is not the job's. */
export function whyThisPerson(headline: string, jobFamily: string | null | undefined): string {
  if (headline.trim() === "") return "We could not read what they do, so we cannot say how close they are to this job."
  const dept = departmentOfPosition(headline)
  if (!dept) return "Their position does not point to one department. They work at the company and the search matched their title."
  if (!jobFamily) return `Works in ${dept}.`
  if (dept === jobFamily) return `Works in ${dept}, the same department as this job.`
  if (adjacentDepartments(jobFamily).includes(dept)) return `Works in ${dept}, a department next to this job's (${jobFamily}).`

  return `Works in ${dept}, not this job's department (${jobFamily}). They may still know the team.`
}

export const isUrl = (v: string): boolean => /^https?:\/\//i.test(v.trim())

/** Where Connect goes for a person in your list: their LinkedIn page if we hold the link, otherwise a LinkedIn search for the name and company. */
export function linkedinHref(person: { name: string; company: string; contact: string }): string {
  if (isUrl(person.contact)) {
    return person.contact.trim()
  }

  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent([person.name, person.company].filter(Boolean).join(" "))}`
}

/** How many jobs' past searches are kept with the profile. */
export const PAST_SEARCHES_KEPT = 25

/** How many people one press of Find shows. */
export const REVEAL = 1

/**
 * What searching one job's company has found so far. A search brings 10 people; they are shown 5 at a time (free), and the next
 * 10 are fetched only when those run out. `shown` is how many of `pool` have been handed out, in order.
 */
export interface PastSearch {
  at: string
  pool: Suggestion[]
  shown: number
  /** The last search fetched (10 people from that page of 25). */
  page: number
  /** Whether the lookup has further pages. */
  more: boolean
  /** Where the people came from: the stored, checked list. Searches saved before that (from the earlier live scrapers) are not read. */
  src: "stored"
}

const isSuggestion = (x: unknown): x is Suggestion => !!x && typeof x === "object" && typeof (x as Suggestion).name === "string" && typeof (x as Suggestion).url === "string"

/**
 * Reads a saved search. Only searches made from the stored, checked list are kept: the live scrapers before it left results with
 * employer names and place text for positions, so those saved searches are dropped. Anything unreadable is no search.
 */
export function readPast(raw: unknown): PastSearch | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.src !== "stored") return null
  const list = Array.isArray(r.pool) ? r.pool : null
  const pool = (list ?? []).filter(isSuggestion).map((p) => ({ name: p.name, headline: typeof p.headline === "string" ? p.headline : "", place: typeof p.place === "string" ? p.place : "", url: p.url, ...(typeof p.photo === "string" && p.photo ? { photo: p.photo } : {}), ...(typeof p.about === "string" && p.about ? { about: p.about } : {}), ...(Array.isArray(p.positions) && p.positions.length > 0 ? { positions: p.positions.filter((x): x is PersonPosition => !!x && typeof x.title === "string") } : {}) }))
  if (pool.length === 0) return null
  const shown = Math.min(pool.length, Math.max(0, Math.floor(Number(r.shown)) || 0))

  return { at: typeof r.at === "string" ? r.at : new Date(0).toISOString(), pool, shown, page: Math.max(1, Math.floor(Number(r.page)) || 1), more: r.more === true, src: "stored" }
}

/** The first page of a search, with the first few handed out. No one found means nothing to keep. */
export function firstPage(people: ReadonlyArray<Suggestion>, page: number, more: boolean, now: Date = new Date()): PastSearch | null {
  if (people.length === 0) return null

  return { at: now.toISOString(), pool: [...people], shown: Math.min(REVEAL, people.length), page, more, src: "stored" }
}

/** Hand out the next few from what is already fetched. */
export const revealNext = (rec: PastSearch): PastSearch => ({ ...rec, shown: Math.min(rec.pool.length, rec.shown + REVEAL) })

/** Whether there are more people already fetched to show, which costs nothing. */
export const hasFree = (rec: PastSearch): boolean => rec.shown < rec.pool.length

/** Whether pressing Find would show anyone: more already fetched, or another page to fetch. */
export const canFindMore = (rec: PastSearch | null): boolean => rec === null || hasFree(rec) || rec.more

/** A newly fetched page added behind what was found, leaving out anyone already there, and the next few handed out. A page with no one new ends the search. */
export function addPage(rec: PastSearch, people: ReadonlyArray<Suggestion>, page: number, more: boolean): PastSearch {
  const seen = new Set(rec.pool.map((p) => p.url))
  const fresh = people.filter((p) => !seen.has(p.url))
  const next = { ...rec, pool: [...rec.pool, ...fresh], page, more: more && fresh.length > 0 }

  return revealNext(next)
}

/** Take one person out for good (the X). What was already handed out stays handed out. */
export function dropPerson(rec: PastSearch, url: string): PastSearch {
  const at = rec.pool.findIndex((p) => p.url === url)
  if (at < 0) return rec

  return { ...rec, pool: rec.pool.filter((_, i) => i !== at), shown: at < rec.shown ? rec.shown - 1 : rec.shown }
}

/** The saved searches with one job's replaced (or removed with null); only the newest few jobs stay. */
export function keepPast(all: Record<string, PastSearch> | undefined, postingId: string, rec: PastSearch | null): Record<string, PastSearch> {
  const rest = Object.fromEntries(Object.entries(all ?? {}).filter(([id]) => id !== postingId))
  const next = rec ? { ...rest, [postingId]: rec } : rest

  return Object.fromEntries(Object.entries(next).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, PAST_SEARCHES_KEPT))
}

/**
 * People already in your list who turn up again in a search: fill in what their record is missing (position, picture, place, About,
 * positions) from the search result, and never overwrite anything the person has typed. Matched on their LinkedIn page. Returns one
 * change per person that has something to gain.
 */
export function backfillPeople(
  people: ReadonlyArray<{ id: string; contact: string; role?: string; photo?: string; place?: string; about?: string; positions?: PersonPosition[] }>,
  found: ReadonlyArray<Suggestion>,
): Array<{ id: string; patch: { role?: string; photo?: string; place?: string; about?: string; positions?: PersonPosition[] } }> {
  const byUrl = new Map(found.map((s) => [s.url, s]))
  const out: Array<{ id: string; patch: { role?: string; photo?: string; place?: string; about?: string; positions?: PersonPosition[] } }> = []
  for (const p of people) {
    const s = byUrl.get(p.contact.trim())
    if (!s) continue
    const patch: { role?: string; photo?: string; place?: string; about?: string; positions?: PersonPosition[] } = {}
    if (!p.role?.trim() && s.headline) patch.role = s.headline
    if (!p.photo && s.photo) patch.photo = s.photo
    if (!p.place && s.place) patch.place = s.place
    if (!p.about && s.about) patch.about = s.about
    if ((!p.positions || p.positions.length === 0) && s.positions && s.positions.length > 0) patch.positions = s.positions
    if (Object.keys(patch).length > 0) out.push({ id: p.id, patch })
  }

  return out
}
