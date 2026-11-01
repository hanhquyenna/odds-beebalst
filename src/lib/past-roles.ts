/** How the scraped dates, statuses and roles of past hires and reviews are read and shown (job-company.ts loads them). Kept apart so it can be tested without a database. */

export interface PastRole {
  employer: string | null
  title: string | null
  start: string | null
  end: string | null
  current: boolean | null
  type: string | null
  description: string | null
}

/** Glassdoor NL writes the reviewer's status in Dutch: "Voormalige werknemer, meer dan 3 jaar" -> "Former employee, more than 3 years". */
export function reviewerStatus(s: string | null): string | null {
  if (!s) return null
  if (/^current$/i.test(s.trim())) return "Current employee"
  if (/^former$/i.test(s.trim())) return "Former employee"

  return s
    .replace(/Huidige werknemer/i, "Current employee")
    .replace(/Voormalige werknemer/i, "Former employee")
    .replace(/Huidige stagiair/i, "Current intern")
    .replace(/Voormalige stagiair/i, "Former intern")
    .replace(/Huidige freelancer/i, "Current freelancer")
    .replace(/Voormalige freelancer/i, "Former freelancer")
    .replace(/minder dan (\d+) jaar/i, "less than $1 year")
    .replace(/meer dan (\d+) jaar/i, "more than $1 years")
}

/** "2024-03" or "2024-03-01" or "Mar 2024" -> "Mar 2024"; a bare year stays. */
export function monthYear(d: string | null): string | null {
  if (!d) return null
  const m = /^(\d{4})(?:-(\d{1,2}))?/.exec(d)
  if (!m) return d
  if (!m[2]) return m[1]

  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1] ?? ""} ${m[1]}`.trim()
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

/** A sortable number for a date written as "2024-03", "2024-03-01", "Mar 2024", "March 2024" or "2024": year * 12 + month. Null when unreadable. */
export function dateKey(d: string | null): number | null {
  if (!d) return null
  const iso = /^(\d{4})(?:-(\d{1,2}))?/.exec(d)
  if (iso) return Number(iso[1]) * 12 + (iso[2] ? Number(iso[2]) - 1 : 0)
  const named = /([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(d)
  if (named && MONTHS.includes(named[1].toLowerCase())) return Number(named[2]) * 12 + MONTHS.indexOf(named[1].toLowerCase())
  const year = /(\d{4})/.exec(d)

  return year ? Number(year[1]) * 12 : null
}

/** Newest first: what someone does now on top, then by when each role started. */
export function byNewest(roles: ReadonlyArray<PastRole>): PastRole[] {
  return [...roles].sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)) || (dateKey(b.start) ?? -1) - (dateKey(a.start) ?? -1))
}

/** True when a past role was at this job's employer, matched loosely on the name ("Adyen" in "Adyen N.V."). */
export function atEmployer(role: PastRole, employer: string, display: string): boolean {
  const name = (role.employer ?? "").toLowerCase()
  if (!name) return false

  return [employer, display].map((x) => x.toLowerCase().replace(/\b(n\.?v\.?|b\.?v\.?|inc\.?|ltd\.?|group|groep)\b/g, "").trim()).some((x) => x.length > 2 && (name.includes(x) || x.includes(name)))
}

const DUTCH = new Set(["de", "het", "een", "en", "niet", "wel", "zijn", "voor", "met", "van", "je", "ik", "er", "maar", "ook", "goed", "veel", "werk", "collega's", "werken", "bij", "naar", "geen", "als", "dat", "om"])

/** True when a text reads as Dutch: a fifth or more of its words are common Dutch words. */
export function looksDutch(text: string): boolean {
  const words = text.toLowerCase().match(/[a-zà-ÿ']+/g) ?? []
  if (words.length < 3) return false

  return words.filter((w) => DUTCH.has(w)).length / words.length >= 0.2
}

/** Reviews in English first, Dutch after, each keeping its order (newest first). */
export function englishFirst<T extends { title: string | null; pros: string | null; cons: string | null }>(reviews: ReadonlyArray<T>): T[] {
  const dutch = (r: T): boolean => looksDutch(`${r.title ?? ""} ${r.pros ?? ""} ${r.cons ?? ""}`)

  return [...reviews.filter((r) => !dutch(r)), ...reviews.filter(dutch)]
}
