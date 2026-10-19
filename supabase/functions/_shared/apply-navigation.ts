// Where Apply may navigate, and when a page may close a job. Pure: the extension bundle and the edge function use this file.
import { jobLink } from "./job-sites.ts"

const WORKDAY_HOST = /\.myworkday(jobs|site)\.com$/i
const SUCCESSFACTORS_HOST = /\.successfactors\.(com|eu)$/i
const LOCALE_QUERY = ["locale", "lang", "language", "localeCode"]

export type MissingPageAction = "close" | "return" | "unknown"

function parsed(input: string): URL | null {
  try {
    const url = new URL(input)
    return url.protocol === "https:" || url.protocol === "http:" ? url : null
  } catch {
    return null
  }
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "")
}

function pathOf(url: URL): string {
  const path = decodeURIComponent(url.pathname).replace(/\/+$/, "")
  return path || "/"
}

function atsLocale(hostname: string): boolean {
  return WORKDAY_HOST.test(hostname) || SUCCESSFACTORS_HOST.test(hostname)
}

/** Two addresses are the same navigation target. Tracking may differ; a different path is a different page. */
export function sameNavigationTarget(a: string, b: string): boolean {
  const left = parsed(a)
  const right = parsed(b)
  if (!left || !right) return false
  return hostOf(left) === hostOf(right) && pathOf(left) === pathOf(right)
}

function englishLocaleQuery(url: URL): string {
  const next = new URL(url.href)
  for (const key of LOCALE_QUERY) {
    const value = next.searchParams.get(key)
    if (value && !/^en/i.test(value)) next.searchParams.set(key, value.includes("_") ? "en_US" : "en-US")
  }
  if (atsLocale(next.hostname)) {
    const locale = next.searchParams.get("locale") || ""
    if (!locale || !/^en/i.test(locale)) next.searchParams.set("locale", "en_US")
  }
  return next.href
}

function workdayQueryOnly(from: string, to: string): boolean {
  const left = parsed(from)
  const right = parsed(to)
  if (!left || !right || !atsLocale(left.hostname) || hostOf(left) !== hostOf(right) || pathOf(left) !== pathOf(right)) return false
  const keys = new Set([...left.searchParams.keys(), ...right.searchParams.keys()])
  for (const key of keys) {
    if (LOCALE_QUERY.includes(key)) continue
    if (left.searchParams.get(key) !== right.searchParams.get(key)) return false
  }
  return true
}

function englishAlternate(current: URL, alternates: string[]): string | null {
  for (const candidate of alternates) {
    const link = parsed(candidate)
    if (!link || hostOf(link) !== hostOf(current)) continue
    const path = pathOf(link)
    if (!/^\/en(?:-[a-z]{2})?(?:\/|$)/i.test(path)) continue
    return link.href
  }
  return null
}

/**
 * English only for Workday/SuccessFactors locale query params, or an English hreflang/language link already on the page.
 * A path such as /nl/ is never rewritten to /en-US/.
 */
export function preferEnglishApplyUrl(url: string, alternates: string[] = []): string {
  const current = parsed(url)
  if (!current) return url
  if (atsLocale(current.hostname)) return englishLocaleQuery(current)
  return englishAlternate(current, alternates) ?? url
}

/** The URL Apply may open. Null means the destination was not on the page or in the job record. */
export function destinationForApply(url: string, ctx: { seen?: string[]; jobUrls?: string[]; alternates?: string[] } = {}): string | null {
  const next = preferEnglishApplyUrl(url, ctx.alternates ?? [])
  const known = [...(ctx.seen ?? []), ...(ctx.jobUrls ?? []), ...(ctx.alternates ?? [])]
  const knownTarget = known.some((item) => sameNavigationTarget(item, url) || sameNavigationTarget(item, next))
  if (!knownTarget) return null
  if (next !== url && !workdayQueryOnly(url, next) && !known.some((item) => sameNavigationTarget(item, next))) return null
  return next
}

/**
 * A 404 or closed notice counts only on the posting's stored URL.
 * Known boards match by their job id. An Odds-made locale path or locale query does not.
 */
export function sameStoredPostingUrl(pageUrl: string, storedUrl: string): boolean {
  const page = parsed(pageUrl)
  const stored = parsed(storedUrl)
  if (!page || !stored) return false
  for (const key of LOCALE_QUERY) {
    const storedValue = stored.searchParams.get(key) || ""
    const pageValue = page.searchParams.get(key) || ""
    if (storedValue !== pageValue) return false
  }
  const pageJob = jobLink(pageUrl, true)
  const storedJob = jobLink(storedUrl, true)
  if (pageJob && storedJob && pageJob.site !== "web" && pageJob.site === storedJob.site && pageJob.id === storedJob.id) return true
  return hostOf(page) === hostOf(stored) && pathOf(page) === pathOf(stored)
}

export function jobClosedAllowed(pageUrl: string, storedUrl: string): boolean {
  return sameStoredPostingUrl(pageUrl, storedUrl)
}

/** A missing page on the stored posting can close it. A derived 404 returns once, then stays unknown. */
export function page404Action(pageUrl: string, storedUrl: string, alreadyReturned: boolean): MissingPageAction {
  if (sameStoredPostingUrl(pageUrl, storedUrl)) return "close"
  return alreadyReturned ? "unknown" : "return"
}
