// One CV format for everyone, for the odds connector's save_cv tool: Claude gives the content, this makes the same plain, one-column,
// ATS-safe CV out of it every time (a PDF to upload, and the text the app reads the CV from). Nothing here knows about Deno or the
// database, so the tests run it as it is. The PDF library is handed in (the function imports it from npm, the tests from node_modules).

const MAX = { name: 120, line: 160, bullet: 400, bullets: 8, jobs: 8, schools: 4, skillRows: 8, items: 20, projects: 4, languages: 8, summary: 700 }

export interface CvJob {
  title: string
  company: string
  location?: string
  start?: string
  end?: string
  bullets: string[]
}
export interface CvSchool {
  school: string
  degree?: string
  field?: string
  start?: string
  end?: string
  details?: string
}
export interface CvSkillRow {
  label?: string
  items: string[]
}
export interface CvProject {
  name: string
  when?: string
  bullets: string[]
}
export interface Cv {
  name: string
  headline?: string
  contact: { email?: string; phone?: string; place?: string; linkedin?: string; website?: string }
  summary?: string
  experience: CvJob[]
  education: CvSchool[]
  skills: CvSkillRow[]
  projects: CvProject[]
  languages: string[]
}

type Raw = Record<string, unknown>
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
/** One line of text: trimmed, no line breaks, no more than max characters. Empty becomes undefined. */
const line = (v: unknown, max = MAX.line): string | undefined => {
  if (typeof v !== "string") return undefined
  const t = v.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max)

  return t === "" ? undefined : t
}
const lines = (v: unknown, n: number, max = MAX.bullet): string[] => arr(v).map((x) => line(x, max)).filter((x): x is string => Boolean(x)).slice(0, n)

/** Checks and tidies what Claude sent. Returns the CV, or the first thing wrong, in words Claude can act on. */
export function cleanCv(raw: unknown): { cv: Cv } | { error: string } {
  const r = obj(raw)
  const name = line(r.name, MAX.name)
  if (!name) return { error: "The CV needs the person's name (cv.name)." }
  const c = obj(r.contact)
  const contact = { email: line(c.email), phone: line(c.phone, 40), place: line(c.place), linkedin: line(c.linkedin, 200), website: line(c.website, 200) }
  if (!contact.email) return { error: "The CV needs an email address (cv.contact.email): take it from my_profile." }
  const experience: CvJob[] = arr(r.experience)
    .slice(0, MAX.jobs)
    .map((j) => {
      const o = obj(j)

      return { title: line(o.title) ?? "", company: line(o.company) ?? "", location: line(o.location), start: line(o.start, 30), end: line(o.end, 30), bullets: lines(o.bullets, MAX.bullets) }
    })
    .filter((j) => j.title !== "" || j.company !== "")
  if (experience.some((j) => j.title === "" || j.company === "")) return { error: "Every experience needs a title and a company." }
  const education: CvSchool[] = arr(r.education)
    .slice(0, MAX.schools)
    .map((e) => {
      const o = obj(e)

      return { school: line(o.school) ?? "", degree: line(o.degree), field: line(o.field), start: line(o.start, 30), end: line(o.end, 30), details: line(o.details, MAX.bullet) }
    })
    .filter((e) => e.school !== "")
  if (experience.length === 0 && education.length === 0) return { error: "Give at least one experience or one education (cv.experience, cv.education)." }
  const skills: CvSkillRow[] = arr(r.skills)
    .slice(0, MAX.skillRows)
    .map((s) => {
      // A plain list of skills is allowed too: ["SQL", "Excel"].
      if (typeof s === "string") return { items: [line(s, 60)].filter((x): x is string => Boolean(x)) }
      const o = obj(s)

      return { label: line(o.label, 60), items: lines(o.items, MAX.items, 60) }
    })
    .filter((s) => s.items.length > 0)
  const projects: CvProject[] = arr(r.projects)
    .slice(0, MAX.projects)
    .map((p) => {
      const o = obj(p)

      return { name: line(o.name) ?? "", when: line(o.when, 30), bullets: lines(o.bullets, 4) }
    })
    .filter((p) => p.name !== "")

  return { cv: { name, headline: line(r.headline), contact, summary: line(r.summary, MAX.summary), experience, education, skills, projects, languages: lines(r.languages, MAX.languages, 60) } }
}

const range = (start?: string, end?: string): string => (start && end ? `${start} – ${end}` : (start ?? end ?? ""))
const contactLine = (cv: Cv): string => [cv.contact.place, cv.contact.email, cv.contact.phone, cv.contact.linkedin, cv.contact.website].filter(Boolean).join(" | ")

/**
 * The CV as plain text, in the layout the app's own CV reader (src/lib/cv-parse.ts) is built for: headings in capitals, a role as
 * "Company dates" then the title, then the place, a degree under its school. Saved as the document's text, so the chance and the
 * profile rows read from it exactly as from an uploaded CV.
 */
export function cvText(cv: Cv): string {
  const out: string[] = [cv.name.toUpperCase(), ""]
  if (cv.headline) out.push(cv.headline, "")
  const contact = contactLine(cv)
  if (contact) out.push(contact, "")
  if (cv.summary) out.push("SUMMARY", "", cv.summary, "")
  if (cv.education.length > 0) {
    out.push("EDUCATION", "")
    for (const e of cv.education) {
      out.push(e.school, "")
      const degree = [e.degree, e.field].filter(Boolean).join(" ")
      const dates = range(e.start, e.end)
      const head = [degree, dates && (e.end && /^(expected|exp\.?)\b/i.test(e.end) ? "" : dates)].filter(Boolean).join(" ")
      if (head) out.push(head)
      if (e.details) out.push(e.details)
      out.push("")
    }
  }
  if (cv.skills.length > 0) {
    out.push("SKILLS", "")
    for (const s of cv.skills) out.push(`${s.label ? `${s.label}: ` : ""}${s.items.join(", ")}`, "")
  }
  if (cv.experience.length > 0) {
    out.push("EXPERIENCE", "")
    for (const j of cv.experience) {
      out.push([j.company, range(j.start, j.end)].filter(Boolean).join(" "), j.title)
      if (j.location) out.push(j.location)
      for (const b of j.bullets) out.push(`• ${b}`)
      out.push("")
    }
  }
  if (cv.projects.length > 0) {
    out.push("PROJECTS", "")
    for (const p of cv.projects) {
      out.push([p.name, p.when].filter(Boolean).join(" "))
      for (const b of p.bullets) out.push(`• ${b}`)
      out.push("")
    }
  }
  if (cv.languages.length > 0) out.push("LANGUAGES", "", cv.languages.join(", "), "")

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * The standard fonts of a PDF cover Latin-1 only. A character outside it (a Vietnamese tone mark, a curly quote) is replaced by its
 * plain letter, or dropped, so the PDF is always made; the document's text keeps the original.
 */
export function printable(s: string): string {
  const map: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "•": "-", "…": "...", "đ": "d", "Đ": "D", " ": " " }
  let out = ""
  for (const ch of s) {
    const m = map[ch]
    if (m !== undefined) {
      out += m
      continue
    }
    const code = ch.codePointAt(0) ?? 0
    if ((code >= 32 && code < 127) || (code >= 160 && code <= 255)) {
      out += ch
      continue
    }
    // Split the letter from its mark (ạ -> a + dot below) and keep the letter.
    const plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, "")
    out += [...plain].filter((c) => (c.codePointAt(0) ?? 0) < 256 && (c.codePointAt(0) ?? 0) >= 32).join("")
  }

  return out
}

// ---- The PDF ----

/** The pieces of pdf-lib this uses, so the caller can pass the library in whichever way it imports it. */
interface PdfLib {
  PDFDocument: { create(): Promise<PdfDoc> }
  StandardFonts: { Helvetica: string; HelveticaBold: string }
  rgb(r: number, g: number, b: number): unknown
}
interface PdfFont {
  widthOfTextAtSize(text: string, size: number): number
}
interface PdfPage {
  drawText(text: string, o: { x: number; y: number; size: number; font: PdfFont; color: unknown }): void
  drawLine(o: { start: { x: number; y: number }; end: { x: number; y: number }; thickness: number; color: unknown }): void
}
interface PdfDoc {
  getPageCount(): number
  addPage(size: [number, number]): PdfPage
  embedFont(name: string): Promise<PdfFont>
  setTitle(t: string): void
  setAuthor(t: string): void
  save(): Promise<Uint8Array>
}

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 48
const BODY = 10
/** The scales tried, in order, when a CV has to fit one page: the layout stays, the type and the spacing shrink a little. */
const FIT_SCALES = [1, 0.95, 0.9, 0.86, 0.82]

/** Breaks one paragraph into lines that fit the width. A word wider than the line is cut. */
export function wrap(text: string, width: number, size: number, font: PdfFont): string[] {
  const out: string[] = []
  let cur = ""
  for (const word of text.split(" ").filter(Boolean)) {
    let w = word
    while (font.widthOfTextAtSize(w, size) > width) {
      let n = w.length - 1
      while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n--
      if (cur) {
        out.push(cur)
        cur = ""
      }
      out.push(w.slice(0, n))
      w = w.slice(n)
    }
    const next = cur ? `${cur} ${w}` : w
    if (font.widthOfTextAtSize(next, size) <= width) cur = next
    else {
      out.push(cur)
      cur = w
    }
  }
  if (cur) out.push(cur)

  return out
}

/** The CV as a PDF: A4, one column, Helvetica, headings in bold capitals with a rule, bullets as hyphens. Several pages when it is long. */
export async function renderCvPdf(lib: PdfLib, cv: Cv): Promise<Uint8Array> {
  return (await buildCvPdf(lib, cv, 1)).bytes
}

/** The same CV on one page: the largest type that fits. `pages` is how many it came to at the smallest size (more than 1: too long). */
export async function renderCvOnePage(lib: PdfLib, cv: Cv): Promise<{ bytes: Uint8Array; pages: number }> {
  let made = await buildCvPdf(lib, cv, 1)
  for (const scale of FIT_SCALES) {
    made = await buildCvPdf(lib, cv, scale)
    if (made.pages === 1) break
  }

  return made
}

async function buildCvPdf(lib: PdfLib, cv: Cv, scale: number): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await lib.PDFDocument.create()
  const regular = await doc.embedFont(lib.StandardFonts.Helvetica)
  const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold)
  const ink = lib.rgb(0.1, 0.1, 0.1)
  const grey = lib.rgb(0.35, 0.35, 0.35)
  const width = A4[0] - MARGIN * 2
  let page = doc.addPage(A4)
  let y = A4[1] - MARGIN

  const room = (need: number): void => {
    if (y - need < MARGIN) {
      page = doc.addPage(A4)
      y = A4[1] - MARGIN
    }
  }
  const write = (text: string, o: { size?: number; font?: PdfFont; color?: unknown; indent?: number; gap?: number } = {}): void => {
    const size = (o.size ?? BODY) * scale
    const font = o.font ?? regular
    const indent = o.indent ?? 0
    for (const l of wrap(printable(text), width - indent, size, font)) {
      room(size * 1.32)
      y -= size * 1.32
      page.drawText(l, { x: MARGIN + indent, y, size, font, color: o.color ?? ink })
    }
    y -= (o.gap ?? 0) * scale
  }
  const heading = (text: string): void => {
    room(34 * scale)
    y -= 12 * scale
    write(text.toUpperCase(), { size: 10.5, font: bold, gap: 1 })
    page.drawLine({ start: { x: MARGIN, y: y + 1 }, end: { x: A4[0] - MARGIN, y: y + 1 }, thickness: 0.6, color: grey })
    y -= 3 * scale
  }

  write(cv.name, { size: 20, font: bold, gap: 2 })
  if (cv.headline) write(cv.headline, { size: 11, color: grey })
  const contact = contactLine(cv)
  if (contact) write(contact, { size: 9.5, color: grey })
  if (cv.summary) {
    heading("Summary")
    write(cv.summary)
  }
  if (cv.education.length > 0) {
    heading("Education")
    for (const e of cv.education) {
      const dates = range(e.start, e.end)
      write(e.school, { font: bold })
      write([[e.degree, e.field].filter(Boolean).join(" "), dates].filter(Boolean).join("   "), { color: grey, gap: e.details ? 0 : 4 })
      if (e.details) write(e.details, { gap: 4 })
    }
  }
  if (cv.skills.length > 0) {
    heading("Skills")
    for (const s of cv.skills) write(`${s.label ? `${s.label}: ` : ""}${s.items.join(", ")}`, { gap: 2 })
  }
  if (cv.experience.length > 0) {
    heading("Experience")
    for (const j of cv.experience) {
      write(`${j.title}, ${j.company}`, { font: bold })
      write([range(j.start, j.end), j.location].filter(Boolean).join("   |   "), { color: grey, gap: 1 })
      for (const b of j.bullets) write(`- ${b}`, { indent: 8 })
      y -= 5 * scale
    }
  }
  if (cv.projects.length > 0) {
    heading("Projects")
    for (const p of cv.projects) {
      write([p.name, p.when].filter(Boolean).join("   "), { font: bold })
      for (const b of p.bullets) write(`- ${b}`, { indent: 8 })
      y -= 5 * scale
    }
  }
  if (cv.languages.length > 0) {
    heading("Languages")
    write(cv.languages.join(", "))
  }
  doc.setTitle(printable(`${cv.name} CV`))
  doc.setAuthor(printable(cv.name))

  return { bytes: await doc.save(), pages: doc.getPageCount() }
}

/** A cover letter as a PDF: A4, Helvetica 11, the sender's name on top, paragraphs as given (blank line between them). One page or more. */
export async function renderLetterPdf(lib: PdfLib, name: string, letter: string): Promise<Uint8Array> {
  const doc = await lib.PDFDocument.create()
  const regular = await doc.embedFont(lib.StandardFonts.Helvetica)
  const bold = await doc.embedFont(lib.StandardFonts.HelveticaBold)
  const ink = lib.rgb(0.1, 0.1, 0.1)
  const size = 11
  const width = A4[0] - MARGIN * 2
  let page = doc.addPage(A4)
  let y = A4[1] - MARGIN
  const line = (text: string, font: PdfFont, s: number): void => {
    if (y - s * 1.4 < MARGIN) {
      page = doc.addPage(A4)
      y = A4[1] - MARGIN
    }
    y -= s * 1.4
    page.drawText(text, { x: MARGIN, y, size: s, font, color: ink })
  }
  if (name.trim()) {
    line(printable(name.trim()), bold, 14)
    y -= size
  }
  for (const para of letter.replace(/\r/g, "").split(/\n\s*\n|\n/)) {
    for (const l of wrap(printable(para.trim()), width, size, regular)) line(l, regular, size)
    y -= size * 0.8
  }
  doc.setTitle(`Cover letter${name ? ` - ${printable(name)}` : ""}`)
  if (name) doc.setAuthor(printable(name))

  return doc.save()
}
