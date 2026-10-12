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

/** Words that make a line a job title ("Corporate Finance Specialist", "CEO & Co-Founder"), as against a company name. */
const TITLE_WORDS = /\b(intern|internship|stagiair|trainee|manager|analyst|engineer|specialist|consultant|director|founder|co-founder|ceo|cto|cfo|coo|officer|assistant|associate|developer|designer|lead|head|coordinator|executive|researcher|advisor|adviser|administrator|representative|owner|president|chief|scientist|architect|accountant|controller|auditor|strategist|planner|buyer|recruiter|teacher|nurse|technician|mechanic|clerk|agent|partner|apprentice|werkstudent|student assistant|medewerker|adviseur|stagiaire)\b/i
/** "Hanoi, Vietnam" or "Amsterdam": a short place line, no digits, no bullet. */
const looksLikePlace = (s: string): boolean => s.length >= 3 && s.length <= 50 && !/\d/.test(s) && !/^[-•*·▪◦●–—]/.test(s) && s.split(/\s+/).length <= 5
const SCHOOL = /\b(universit(y|eit)|college|school|institute|institut|hogeschool|academy|academie|polytechnic|hbo|université|universidad|universidade|üniversite)\b/i
const DEGREE = /\b(b\.?sc|m\.?sc|b\.?a|m\.?a|bba|mba|ph\.?d|bachelor|master|licen[cs]e|diploma|degree|b\.?tech|m\.?tech|b\.?eng|m\.?eng|llb|llm|associate degree|wo|hbo)\b/i

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
  /** The index of the next line with text after i (CVs often leave a blank line between a school and its degree), or -1. */
  const nextIdx = (i: number): number => {
    for (let j = i + 1; j < lines.length && j <= i + 3; j++) if (lines[j] !== "") return j

    return -1
  }
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
        const above = pending
        pending = null
        let { title, company, place } = splitHeader(header)
        // Many CVs put only the company beside the dates and the title on the next line ("FLC Group  Mar 2026 - Aug 2026", then
        // "Corporate Finance Specialist", then "Hanoi, Vietnam"), or the title on the line above. One name with no title word in it
        // beside the dates, and a title word in the line below (or above), is the company.
        if (remainder.length >= 3 && company === "" && !TITLE_WORDS.test(remainder)) {
          const nj = nextIdx(i)
          const next = nj >= 0 ? lines[nj] : ""
          const nextIsPlain = next !== "" && !headingOf(next) && !/^[-•*·▪◦●–—]/.test(next) && !RANGE.test(next)
          if (nextIsPlain && TITLE_WORDS.test(next)) {
            const rest = splitHeader(clean(next))
            company = remainder
            title = rest.title
            place = rest.company ? [rest.company, rest.place].filter(Boolean).join(", ") : ""
            i = nj
            const aj = nextIdx(i)
            const after = aj >= 0 ? lines[aj] : ""
            if (!place && after !== "" && !headingOf(after) && !RANGE.test(after) && looksLikePlace(clean(after))) {
              place = clean(after)
              i = aj
            }
          } else if (above && TITLE_WORDS.test(above)) {
            company = remainder
            title = above
          }
        }
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
      const expected = new RegExp(`\\b(?:expected|expected graduation|graduating|verwacht)\\s*:?\\s*(${DATE})`, "iu").exec(raw)
      const bare = clean(raw.replace(RANGE, "").replace(expected?.[0] ?? "", ""))
      if (bare.length >= 3) {
        const parts = bare.split(/\s*,\s*/)
        const nj = nextIdx(i)
        const nextRaw = nj >= 0 ? lines[nj] : ""
        const next = clean(nextRaw.replace(RANGE, ""))
        // The school on one line and the degree on the next ("University of Amsterdam", then "BSc Communication Science Expected June 2027"), or the other way round.
        if (parts.length === 1 && SCHOOL.test(bare) && !DEGREE.test(bare) && next && DEGREE.test(next) && !headingOf(next)) {
          const nextExpected = new RegExp(`\\b(?:expected|expected graduation|graduating|verwacht)\\s*:?\\s*(${DATE})`, "iu").exec(nextRaw)
          const nextRange = RANGE.exec(nextRaw)
          const degree = clean(next.replace(nextExpected?.[0] ?? "", ""))
          education.push({ "Degree Name": degree, "School Name": bare, "Field Of Study": "", "Start Date": nextRange ? fixDate(nextRange[1]) : "", "End Date": nextRange ? fixDate(nextRange[2]) : nextExpected ? fixDate(nextExpected[1]) : "", Notes: "" })
          i = nj
        } else if (parts.length === 1 && DEGREE.test(bare) && !SCHOOL.test(bare) && next && SCHOOL.test(next) && !DEGREE.test(next) && !headingOf(next)) {
          education.push({ "Degree Name": bare, "School Name": next, "Field Of Study": "", "Start Date": range ? fixDate(range[1]) : "", "End Date": range ? fixDate(range[2]) : expected ? fixDate(expected[1]) : "", Notes: "" })
          i = nj
        } else {
          education.push({ "Degree Name": parts[0] ?? bare, "School Name": parts[1] ?? "", "Field Of Study": "", "Start Date": range ? fixDate(range[1]) : "", "End Date": range ? fixDate(range[2]) : expected ? fixDate(expected[1]) : "", Notes: parts.slice(2).join(", ") })
        }
      }
      continue
    }
    if (section === "skills") {
      let line = clean(raw)
      // A line that carries on from the one above (it starts in lower case) is joined to it, so a wrapped list is not cut into odd skills.
      while (/^[a-zà-ÿ]/.test(clean(lines[i + 1] ?? "")) && clean(lines[i + 1] ?? "").length <= 40 && !headingOf(lines[i + 1] ?? "")) {
        i++
        line = `${line} ${clean(lines[i])}`
      }
      // "Financial Analysis: Financial modeling, SQL" is a group label and its skills; "Languages: ..." is not a skill list.
      const labelled = /^([^:,]{2,40}):\s*(.+)$/.exec(line)
      if (labelled && /^languages?$/i.test(labelled[1].trim())) continue
      const list = labelled ? labelled[2] : line.replace(/^skills?:/i, "")
      for (const name of list.split(/[,;•|·]|\s{2,}/).map((x) => x.trim()).filter((x) => x.length >= 1 && x.length <= 40 && /[\p{L}\d]/u.test(x))) skills.push({ Name: name })
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
