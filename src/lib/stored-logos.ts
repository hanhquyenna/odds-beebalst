/**
 * Logos kept in the database for employers that are not in the logo lists (a job pasted in from a new employer), loaded once with the jobs.
 * Kept apart from companies.ts so the data layer can fill it without pulling the list (~19 kB gzip with its component) into the first download.
 */
import { useSyncExternalStore } from "react"

const STORED = new Map<string, string>()

/**
 * An employer's name as it is compared: "McKinsey &amp; Company", "McKinsey & Company" and "ABN AMRO Bank N.V." against
 * "ABN AMRO" must be the same company. Drops HTML codes, brackets, legal forms and generic words, and punctuation.
 */
export function nameKey(name: string): string {
  return name
    .replace(/&amp;/gi, "&")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}&]+/gu, " ")
    .replace(/\b(b v|bv|n v|nv|ltd|limited|gmbh|inc|llc|sa|ag|plc|bank|europe|europa|nederland|netherlands|holding|group|international|the|and|en)\b/g, " ")
    .replace(/\s*&\s*(co|company)\b/g, " ")
    .replace(/\s+/g, "")
}

/** Keeps the database's logos, called by the data layer each time the jobs load. Looked up by the name as written, then by the loosened name. */
export function registerLogos(rows: ReadonlyArray<{ employer: string; logo: string }>): void {
  for (const { employer, logo } of rows) {
    STORED.set(employer.toLowerCase(), logo)
    STORED.set(nameKey(employer), logo)
  }
}

/** The database's logo for an employer, used by logoFor when the lists have none. */
export function storedLogoFor(employer: string): string | undefined {
  const key = nameKey(employer)

  return STORED.get(employer.toLowerCase()) ?? (key ? STORED.get(key) : undefined)
}

/**
 * Employers found later, mostly from LinkedIn and Indeed postings that link to the job board and not to the company: each one's own
 * site was found and checked against its home page (research-data/logos), then its own icon saved under /logos/auto. Where a site
 * would not give its icon to a script, only the site is kept and the favicon service is asked for it. Both lists are loaded the first
 * time an employer without a logo of the main list is drawn, not with the first page, and the logos already on screen redraw once they are in.
 */
const AUTO = new Map<string, string>()
const SITE = new Map<string, string>()
let started = false
let ready = false
const listeners = new Set<() => void>()

export function loadAutoLogos(): void {
  if (started) return
  started = true
  void Promise.all([import("@/lib/company-logos-auto.json"), import("@/lib/company-domains.json")]).then(([files, domains]) => {
    for (const [name, file] of Object.entries(files.default as Record<string, string>)) {
      AUTO.set(name.toLowerCase(), file)
      AUTO.set(nameKey(name), file)
    }
    for (const [name, domain] of Object.entries(domains.default as Record<string, string>)) {
      SITE.set(name.toLowerCase(), domain)
      SITE.set(nameKey(name), domain)
    }
    ready = true
    listeners.forEach((l) => l())
  })
}

/** The saved icon file, or the company's site for the favicon service, for an employer of the later lists. */
export function autoLogoFor(employer: string): { file?: string; site?: string } {
  const key = nameKey(employer)
  const low = employer.toLowerCase()

  return { file: AUTO.get(low) ?? (key ? AUTO.get(key) : undefined), site: SITE.get(low) ?? (key ? SITE.get(key) : undefined) }
}

/** Redraws a logo once the later lists have arrived. */
export function useAutoLogosReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)

      return () => listeners.delete(l)
    },
    () => ready,
  )
}
