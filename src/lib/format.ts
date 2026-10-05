import type { Posting } from "@/lib/types"

/** Whole days from the employer's posting date (YYYY-MM-DD) to today, by calendar day. */
export function daysSince(posted: string, now = new Date()): number {
  const [y, m, d] = posted.split("-").map(Number)

  return Math.max(0, Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86_400_000))
}

/** When it went up, in the words someone would use. */
export function formatAge(post: Pick<Posting, "days_open" | "freshness_state">): string {
  if (post.freshness_state === "still_listed_30_plus") {
    return "30+ days ago"
  }
  if (post.days_open === null) {
    return "Date not shown"
  }
  if (post.days_open === 0) {
    return "Today"
  }
  if (post.days_open === 1) {
    return "Yesterday"
  }

  return `${post.days_open} days ago`
}

/** "Amsterdam; London Wall" is how some boards list two offices. The first is where it is. */
export function formatPlace(region: string | null): string {
  if (!region) {
    return "Location not stated"
  }

  return region.split(/[;|]/)[0].replace(/, Netherlands$/i, "").trim() || "Location not stated"
}

/** The place for a property: the first city, and how many more when the posting lists several ("Amsterdam, +4 more"). Never blank. */
export function placeOf(region: string | null): string {
  const cities = (region ?? "").split(/[;|]/).map((c) => c.replace(/\(\+\d+ more\)/i, "").replace(/, Netherlands$/i, "").trim()).filter(Boolean)
  if (cities.length === 0) {
    return "Not stated"
  }
  const extra = /\(\+(\d+) more\)/i.exec(region ?? "")
  const more = cities.length - 1 + (extra ? Number(extra[1]) : 0)

  return more > 0 ? `${cities[0]}, +${more} more` : cities[0]
}

export function stripMarkup(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—" }

  return text
    .replace(/\*\*/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => named[name.toLowerCase()] ?? whole)
    .replace(/\n{3,}/g, "\n\n")
}

/**
 * Pay as a card says it. Employers write it every way ("€4,500.00/mo - €6,200.00/mo",
 * "€ 61,185 – € 101,976", "€ 3.516 and € 5.021"), so this reads the numbers and
 * says them the same way each time, or returns null when it cannot tell.
 */
/** An hourly rate the posting states ("€ 17.75 / hour", "€ 18 - € 21 per uur"), or null. Hourly pay is shown as it is written: nobody knows the hours a week. */
export function formatHourly(text: string | null): { low: number; high: number } | null {
  if (!text || !/(per\s+(hour|uur|hr)|\/\s*(hour|hr|uur|h)\b|an hour|p\.?u\.?\b)/i.test(text)) {
    return null
  }
  const numbers = [...text.matchAll(/\d+(?:[.,]\d{1,2})?/g)].map((m) => Number(m[0].replace(",", "."))).filter((n) => n >= 5 && n <= 250)
  if (numbers.length === 0) {
    return null
  }

  return { low: Math.min(numbers[0], numbers[numbers.length - 1]), high: Math.max(numbers[0], numbers[numbers.length - 1]) }
}

export function formatPosted(text: string | null): { low: number; high: number; unit: "month" | "year" } | null {
  if (!text) {
    return null
  }
  const numbers = [...text.matchAll(/\d[\d.,]*/g)]
    .map((m) => Number(m[0].replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 100)
  if (numbers.length === 0) {
    return null
  }
  const low = Math.min(numbers[0], numbers[numbers.length - 1])
  const high = Math.max(numbers[0], numbers[numbers.length - 1])
  const unit = /\b(mo|month|maand|p\.?m\.?)\b|\/mo/i.test(text) || high < 20000 ? "month" : "year"

  return { low, high, unit }
}

/**
 * When the postings were collected, from the postings themselves: "29 September 2026",
 * "29 and 30 September 2026", or "29 September to 3 October 2026". Nothing is written
 * by hand, so new rows in the database change it.
 */
export function collectedOn(posts: ReadonlyArray<Pick<Posting, "fetched_at">>): string {
  const days = [...new Set(posts.map((p) => p.fetched_at?.slice(0, 10)).filter((d): d is string => Boolean(d) && /^\d{4}-\d{2}-\d{2}$/.test(d!)))].sort()
  if (days.length === 0) {
    return "recently"
  }
  const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`)
  const fmt = (iso: string, parts: Intl.DateTimeFormatOptions): string => at(iso).toLocaleDateString("en-GB", { timeZone: "UTC", ...parts })
  const first = days[0]
  const last = days[days.length - 1]
  if (first === last) {
    return fmt(first, { day: "numeric", month: "long", year: "numeric" })
  }
  const sameMonth = first.slice(0, 7) === last.slice(0, 7)
  const consecutive = days.length === 2 && (at(last).getTime() - at(first).getTime()) / 86_400_000 === 1
  if (sameMonth) {
    return `${fmt(first, { day: "numeric" })}${consecutive ? " and " : " to "}${fmt(last, { day: "numeric", month: "long", year: "numeric" })}`
  }

  return `${fmt(first, { day: "numeric", month: "long" })} to ${fmt(last, { day: "numeric", month: "long", year: "numeric" })}`
}
