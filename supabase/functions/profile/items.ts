// The parts of a saved profile that get read: each role, each degree and each line of the pasted CV.
// Shared by the Edge Function (Deno) and the app, so both cut a profile into exactly the same parts and
// give each the same fingerprint. Pure: no network, no clock.

export const MAX_ITEMS = 40
export const MAX_LINE = 400
/** A CV line whose words are at least this share already in the listed roles and degrees is a repeat of them. */
export const REPEAT_SHARE = 0.85

// Lines that say nothing about a track record and should not leave the device: contact details and section headings.
const CONTACT = /@|https?:\/\/|www\.|linkedin\.com|github\.com|\+?\d[\d\s().-]{7,}\d/i
const HEADING =
  /^(summary|profile|about( me)?|objective|experience|work experience|professional experience|employment|education|studies|skills|technical skills|tools|awards?|honou?rs|achievements|scholarships|certifications?|languages?|interests|publications|references|projects|volunteering|contact|personal details|werkervaring|opleiding|vaardigheden|experi[eê]ncia|educa[cç][aã]o|forma[cç][aã]o|habilidades|resumo|eğitim|deneyim|yetenekler|berufserfahrung|ausbildung)\s*:?$/i
/** The first line of a CV is usually the person's name: two to four capitalised words and nothing else. */
const NAME = /^\p{Lu}[\p{L}'.-]+(?:\s+\p{Lu}[\p{L}'.-]+){1,3}$/u

const wordsOf = (s: string): string[] => (s.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])

export type ItemKind = "role" | "education" | "line"
export interface Item {
  kind: ItemKind
  text: string
}

type Row = Record<string, unknown>
export interface ProfileLike {
  cv?: string
  positions?: Row[]
  education?: Row[]
}

/** Text from a field that should be text: numbers are kept as written, anything else (missing, null, an object) is empty. */
const clean = (s: unknown): string => (typeof s === "string" ? s : typeof s === "number" ? String(s) : "").replace(/\s+/g, " ").trim()
const rows = (x: unknown): Row[] => (Array.isArray(x) ? x.filter((r): r is Row => r !== null && typeof r === "object" && !Array.isArray(r)) : [])

/** Role: "Audit intern, KPMG (Amsterdam). Jun 2023 to Aug 2023. Tested controls." */
function roleText(p: Row): string {
  const head = `${clean(p.Title)}${clean(p["Company Name"]) ? `, ${clean(p["Company Name"])}` : ""}${clean(p.Location) ? ` (${clean(p.Location)})` : ""}`
  const dates = [clean(p["Started On"]), clean(p["Finished On"])].filter(Boolean).join(" to ")

  return [head, dates, clean(p.Description)].filter((x) => x !== "").join(". ").slice(0, MAX_LINE)
}

/** Degree: "MSc Finance, Erasmus University, 2023 to 2025. Cum laude." */
function educationText(e: Row): string {
  const parts = [clean(e["Degree Name"]), clean(e["Field Of Study"]), clean(e["School Name"]), [clean(e["Start Date"]), clean(e["End Date"])].filter(Boolean).join(" to "), clean(e.Notes)]

  return parts.filter((x) => x !== "").join(", ").slice(0, MAX_LINE)
}

/**
 * Everything on the profile that can carry a strong point, one part per fact, in a fixed order, without repeats.
 * A part with fewer than 8 characters says nothing and is left out. At most MAX_ITEMS parts are read.
 */
export function itemsOf(profile: ProfileLike): Item[] {
  const out: Item[] = []
  const seen = new Set<string>()
  const add = (kind: ItemKind, text: string): void => {
    const t = text.trim()
    const key = `${kind}|${t.toLowerCase()}`
    if (t.length < 8 || seen.has(key) || out.length >= MAX_ITEMS) return
    seen.add(key)
    out.push({ kind, text: t })
  }
  for (const p of rows(profile.positions)) add("role", roleText(p))
  for (const e of rows(profile.education)) add("education", educationText(e))
  // A CV line that only repeats a role or degree already listed (the rows are often filled from the CV itself) is the same fact,
  // and reading it twice would count it twice.
  const covered = new Set(out.flatMap((i) => wordsOf(i.text)))
  const cvLines = (typeof profile.cv === "string" ? profile.cv : "").split(/\n+/).map((l) => clean(l)).filter(Boolean)
  for (const [n, line] of cvLines.entries()) {
    const text = line.slice(0, MAX_LINE)
    if (CONTACT.test(text) || HEADING.test(text) || (n === 0 && NAME.test(text))) continue
    const w = wordsOf(text)
    if (covered.size > 0 && w.length > 0 && w.filter((x) => covered.has(x)).length / w.length >= REPEAT_SHARE) continue
    add("line", text)
  }

  return out
}

/** A fingerprint of one part, the same in the browser and on the server. */
export async function hashItem(item: Item): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${item.kind}\n${item.text}`))

  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
