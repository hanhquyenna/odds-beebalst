/**
 * Logos kept in the database for employers that are not in the logo lists (a job pasted in from a new employer), loaded once with the jobs.
 * Kept apart from companies.ts so the data layer can fill it without pulling the list (~19 kB gzip with its component) into the first download.
 */
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
