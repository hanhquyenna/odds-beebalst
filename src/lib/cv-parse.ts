/**
 * Turns the text of an uploaded CV into the rows of a profile: roles with their dates, degrees, and skills. A CV with nothing else
 * on the profile would otherwise read as zero years of work and no degree, because every gate and the fit read those rows, not
 * the free text. The rows are the same ones LinkedIn fills, shown on the profile page where they can be corrected.
 *
 * Plain rules, no model: sections are found by their headings (English, Dutch, Portuguese, Spanish, Turkish, German), a role is
 * a heading line with a date range beside it, a degree is a line in the education section. Anything not recognised is left out
 * rather than guessed at; the full text still goes to the reader of the profile (the profile function, /profile/read) whole.
 */
import { MONTH_PATTERN } from "@/lib/months"
import type { Profile } from "@/lib/types"

type Row = Record<string, string>
type Section = "experience" | "education" | "skills" | "other"

const HEADINGS: Array<[Section, RegExp]> = [
  ["experience", /^(work |professional |relevant |employment |internship |career )?(experience|experiences|history|employment|werkervaring|ervaring|experi[eê]ncia|experiencia|iş deneyimi|deneyim|berufserfahrung)( history| summary)?$/i],
  ["education", /^(education|academic background|academic|studies|qualifications?|opleiding|opleidingen|educa[cç][aã]o|educaci[oó]n|forma[cç][aã]o( acad[eê]mica)?|eğitim|ausbildung|bildung)$/i],
  ["skills", /^(skills|technical skills|key skills|core skills|competenc(e|ies)|tools|technologies|vaardigheden|habilidades|compet[eê]ncias|yetenekler|f[aä]higkeiten)$/i],
  ["other", /^(summary|profile|about( me)?|objective|awards?|honou?rs|achievements|scholarships|certifications?|certificates|languages?|interests|publications|references|projects|volunteer(ing)?|contact|personal)$/i],
]

const MONTH = MONTH_PATTERN
const DATE = `(?:${MONTH}\\s+\\d{4}|\\d{1,2}\\s*[/.-]\\s*\\d{4}|\\d{4}\\s*[/-]\\s*\\d{1,2}|\\d{4})`
const NOW = "(?:present|now|current|today|heden|nu|actualidad|presente|atual|devam|bugün|heute)"
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until|tot|a|até|bis|-->)\\s*(${DATE}|${NOW})`, "iu")

const ENDS_NOW = new RegExp(`^${NOW}$`, "i")
const clean = (s: string): string => s.replace(/^[\s\-•*·▪◦●–—]+/, "").replace(/\s+/g, " ").trim()

function headingOf(line: string): Section | null {
  const t = clean(line).replace(/[:：]+$/, "").trim()
  if (t.length === 0 || t.length > 40) return null
  for (const [kind, re] of HEADINGS) if (re.test(t)) return kind

  return null
}

/** "Financial Analyst, Vietcombank, Hanoi, Vietnam" or "Analyst at Vietcombank" or "Analyst | Vietcombank": title, company, place. */
function splitHeader(line: string): { title: string; company: string; place: string } {
  const t = line.replace(RANGE, "").replace(/[()|]+\s*$/g, "").replace(/\s+/g, " ").trim().replace(/[,;|\-–—\s]+$/, "")
  const at = /^(.+?)\s+(?:at|@|bij|na|en)\s+(.+)$/i.exec(t)
  if (at && !t.includes(",")) return { title: at[1].trim(), company: at[2].trim(), place: "" }
  const bar = t.split(/\s+[|–—]\s+/)
  const parts = bar.length > 1 ? bar : t.split(/\s*,\s*/)

  return { title: parts[0]?.trim() ?? t, company: parts[1]?.trim() ?? "", place: parts.slice(2).join(", ").trim() }
}

const fixDate = (s: string): string => s.replace(/\s+/g, " ").trim()

export interface CvRows {
  positions: Row[]
  education: Row[]
  skills: Row[]
}

export function parseCv(text: string): CvRows {
  const positions: Row[] = []
  const education: Row[] = []
  const skills: Row[] = []
  let section: Section = "other"
  const lines = text.split("\n").map((l) => l.trim())
  let current: Row | null = null
  let pending: string | null = null
  const bullets: string[] = []
  const flush = (): void => {
    if (current) {
      positions.push({ ...current, Description: bullets.join(" ").slice(0, 600) })
      current = null
    }
    bullets.length = 0
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw === "") continue
    const h = headingOf(raw)
    if (h) {
      flush()
      pending = null
      section = h
      continue
    }
    if (section === "experience") {
      const isBullet = /^[\s]*[-•*·▪◦●–—]/.test(raw)
      const range = isBullet ? null : RANGE.exec(raw)
      if (range) {
        // A role starts at a date range. Its title and company are on the same line, or on the last plain line above.
        flush()
        const remainder = clean(raw.replace(RANGE, ""))
        const header = remainder.length >= 3 ? remainder : (pending ?? "")
        pending = null
        const { title, company, place } = splitHeader(header)
        if (title.length >= 2) {
          current = { Title: title, "Company Name": company, Location: place, "Started On": fixDate(range[1]), "Finished On": ENDS_NOW.test(range[2].trim()) ? "" : fixDate(range[2]), Description: "" }
        }
        continue
      }
      if (isBullet) {
        if (current) bullets.push(clean(raw))
      } else {
        pending = clean(raw)
      }
      continue
    }
    if (section === "education") {
      const range = RANGE.exec(raw)
      const bare = clean(raw.replace(RANGE, ""))
      if (bare.length >= 3) {
        const parts = bare.split(/\s*,\s*/)
        education.push({ "Degree Name": parts[0] ?? bare, "School Name": parts[1] ?? "", "Field Of Study": "", "Start Date": range ? fixDate(range[1]) : "", "End Date": range ? fixDate(range[2]) : "", Notes: parts.slice(2).join(", ") })
      }
      continue
    }
    if (section === "skills") {
      for (const name of clean(raw).replace(/^skills?:/i, "").split(/[,;•|·]|\s{2,}/).map((s) => s.trim()).filter((s) => s.length >= 1 && s.length <= 40 && /[\p{L}\d]/u.test(s))) skills.push({ Name: name })
    }
  }
  flush()

  return { positions: positions.slice(0, 12), education: education.slice(0, 6), skills: skills.slice(0, 40) }
}

/** What was filled in, in words for the person. */
export function describeFilled(f: Filled["filled"], hadAnyRows: boolean, where: "above" | "later" = "above"): string {
  const bits = [f.roles ? `${f.roles} ${f.roles === 1 ? "role" : "roles"}` : "", f.degrees ? `${f.degrees} ${f.degrees === 1 ? "degree" : "degrees"}` : "", f.skills ? `${f.skills} ${f.skills === 1 ? "skill" : "skills"}` : ""].filter(Boolean)
  if (bits.length > 0) return `Filled in from your CV: ${bits.join(", ")}. ${where === "above" ? "Check them above and correct anything that is wrong." : "You can check and correct them in your profile after this step."}`

  if (hadAnyRows) return where === "above" ? "Your roles, degrees and skills above were kept as they are." : "The roles, degrees and skills you already have were kept as they are."

  return `We read your CV but could not pick out roles and degrees from it. ${where === "above" ? "Add them above" : "Add them in your profile after this step"} so jobs can be checked against them.`
}

export interface Filled {
  patch: Partial<Profile>
  filled: { roles: number; degrees: number; skills: number }
}

/**
 * What an uploaded CV adds to a profile. Only rows that are still empty are filled, so roles and degrees from LinkedIn or typed
 * by hand are never overwritten.
 */
export function fillFromCv(profile: Pick<Profile, "positions" | "education" | "skills">, text: string): Filled {
  const rows = parseCv(text)
  const patch: Partial<Profile> = {}
  const filled = { roles: 0, degrees: 0, skills: 0 }
  if (profile.positions.length === 0 && rows.positions.length > 0) {
    patch.positions = rows.positions
    filled.roles = rows.positions.length
  }
  if (profile.education.length === 0 && rows.education.length > 0) {
    patch.education = rows.education
    filled.degrees = rows.education.length
  }
  if (profile.skills.length === 0 && rows.skills.length > 0) {
    patch.skills = rows.skills
    filled.skills = rows.skills.length
  }

  return { patch, filled }
}
