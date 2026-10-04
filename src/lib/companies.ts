import local from "@/lib/company-logos-local.json"
import remote from "@/lib/company-logos.json"

const LOCAL = local as Record<string, string | null>
const REMOTE = remote as Record<string, string>

/**
 * An employer's name as it is compared: "McKinsey &amp; Company", "McKinsey & Company" and "ABN AMRO Bank N.V." against
 * "ABN AMRO" must be the same company. Drops HTML codes, brackets, legal forms and generic words, and punctuation.
 */
export function nameKey(name: string): string {
  const key = name
    .replace(/&amp;/gi, "&")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}&]+/gu, " ")
    .replace(/\b(b v|bv|n v|nv|ltd|limited|gmbh|inc|llc|sa|ag|plc|bank|europe|europa|nederland|netherlands|holding|group|international|the|and|en)\b/g, " ")
    .replace(/\s*&\s*(co|company)\b/g, " ")
    .replace(/\s+/g, "")

  return key
}

/** Postings spell an employer as "PwC" where the logo list says "pwc": match on lower case, then on the loosened name. */
const BY_LOWER = new Map<string, string>()
const BY_KEY = new Map<string, string>()
for (const [name, file] of Object.entries(LOCAL)) {
  if (file) {
    BY_LOWER.set(name.toLowerCase(), file)
    BY_KEY.set(nameKey(name), file)
  }
}
for (const [name, source] of Object.entries(REMOTE)) {
  if (!BY_LOWER.has(name.toLowerCase())) BY_LOWER.set(name.toLowerCase(), source)
  if (!BY_KEY.has(nameKey(name))) BY_KEY.set(nameKey(name), source)
}

/**
 * Logos kept in the database for employers that are not in the lists above (a job pasted in from a new employer), loaded once with the jobs.
 * Looked up the same way as the lists: by the name as written, then by the loosened name.
 */
const DYNAMIC = new Map<string, string>()
export function registerLogos(rows: ReadonlyArray<{ employer: string; logo: string }>): void {
  for (const { employer, logo } of rows) {
    DYNAMIC.set(employer.toLowerCase(), logo)
    DYNAMIC.set(nameKey(employer), logo)
  }
}

/**
 * The employer's logo with its background cut out, so it can float on the page
 * without a square behind it. Cut out once, ahead of time, by scripts/make_logos.py,
 * and served from /logos. An employer whose picture could not be cut out keeps the
 * original from its source; one with none gets null.
 */
export function logoFor(employer: string, url?: string | null): string | null {
  const key = nameKey(employer)
  const known = LOCAL[employer] ?? REMOTE[employer] ?? BY_LOWER.get(employer.toLowerCase()) ?? (key ? BY_KEY.get(key) : undefined)
  if (known) {
    return known
  }
  const stored = DYNAMIC.get(employer.toLowerCase()) ?? (key ? DYNAMIC.get(key) : undefined)
  if (stored) {
    return stored
  }
  const domain = url ? siteDomain(url) : null

  return domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : null
}

/** Sites that list other companies' jobs: their icon is theirs, not the employer's. */
const JOB_BOARDS = /(^|\.)(linkedin|indeed|glassdoor|lever|greenhouse|ashbyhq|smartrecruiters|myworkdayjobs|workable|recruitee|teamtailor|bamboohr|personio|join|magnet|academictransfer|werkenbijdeeu|epso|jooble|adzuna|monster|nationalevacaturebank|werk|werkzoeken|welcometothejungle|wellfound|otta|google|bing|facebook|x|twitter)\./i

/**
 * The company's own site, taken from a link to one of its jobs: "careers.acme.com/jobs/1"
 * is "acme.com". A link to a job board says nothing about the employer, so it gives null.
 */
export function siteDomain(url: string): string | null {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase()
    if (JOB_BOARDS.test(host)) {
      return null
    }
    const domain = host.replace(/^(www|jobs|careers?|werken|vacatures|apply)\./, "")

    return domain.includes(".") ? domain : null
  } catch {
    return null
  }
}

/** One or two letters for a company with no logo: "Adyen" is "A", "Flow Traders" is "FT". */
export function monogram(name: string): string {
  const words = name.replace(/&amp;/g, "&").trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? [words[0], words[1]] : words

  return letters.map((word) => [...word][0]?.toUpperCase() ?? "").join("") || "?"
}
