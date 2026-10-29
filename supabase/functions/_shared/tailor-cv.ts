// Tailoring a CV or a cover letter for one job, and the rule that keeps it honest. No imports but the CV template, no Deno, no
// network: the edge function `tailor` (model call), the app (shows and checks the draft again) and the tests all use this file.
//
// The rule: a keyword the posting wants goes onto the CV only when the CV or the profile already backs it. Everything a model
// proposes passes through here, unit by unit (a bullet, the summary, a skills item). A unit that brings in a keyword nothing backs,
// a number or a name that is not in the CV, is thrown out and the person's own words stay. Employers, titles, schools, degrees and
// dates are copied and checked word for word against the CV; if they do not match, nothing is built at all.
import { cvText, type Cv, type CvJob, type CvProject, type CvSchool, type CvSkillRow } from "./cv-template.ts"

export type Tier = "must" | "strong" | "optional" | "nice"

/** One keyword the posting asks for. `pattern` is the regular expression source the app finds it with (src/lib/skills.ts), tried on lower-case text. */
export interface Wanted {
  name: string
  label: string
  tier: Tier
  pattern: string
}

/** What is known about the person besides the CV text: their profile's skills, roles and schooling as plain text, and their contact facts. */
export interface Facts {
  /** Profile skills, positions, education and languages, as one text. */
  extra: string
  name?: string
  email?: string
  phone?: string
  place?: string
  linkedin?: string
  website?: string
}

export interface Job {
  title: string
  employer: string
}

export interface Ctx {
  cv: string
  facts: Facts
  wanted: Wanted[]
  job: Job
}

export interface Change {
  part: string
  kind: "added" | "reworded" | "unchanged"
  before: string | null
  after: string
}

export interface Tailored {
  cv: Cv
  changes: Change[]
  counts: { added: number; reworded: number; unchanged: number; left_out: number }
  /** Keywords now on the CV that were not on it before (all of them backed by the CV or profile). */
  added_keywords: string[]
  /** What the posting wants and nothing the person has backs: never written in. */
  missing: Array<{ name: string; label: string; tier: Tier }>
  /** Lines the model changed in a way that was not safe; the person's own words were kept. */
  kept_original: string[]
}

// ---------------------------------------------------------------- reading text

const squash = (s: string): string => s.replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim().toLowerCase()
/** Letters and digits only, for comparing a copied fact (a date, a school) with the CV whatever the spacing and punctuation. */
const alnum = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "")
const words = (s: string): string[] => s.toLowerCase().replace(/['’]/g, "").normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean)

function regexOf(pattern: string): RegExp | null {
  if (!pattern || pattern.length > 400) return null
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

/** True when the keyword's own words appear in the text. */
export function mentions(text: string, w: Wanted): boolean {
  const rx = regexOf(w.pattern)

  return rx ? rx.test(squash(text)) : squash(text).includes(squash(w.label))
}

/** The numbers a text names ("10+", "$100M", "3,5%"), as digits only. */
function numbersOf(s: string): string[] {
  return (s.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]+$/, "").replace(/[.,]/g, ""))
}

/** Capitalised words that are not the first word of a sentence: the names (employers, tools, places) a line brings in. */
function namesOf(s: string): string[] {
  const out: string[] = []
  const sentences = s.split(/(?<=[.!?])\s+|\n+/)
  for (const sentence of sentences) {
    const tokens = sentence.split(/\s+/).filter(Boolean)
    tokens.forEach((t, i) => {
      if (i === 0) return
      const bare = t.replace(/^["'“‘([]+/, "")
      if (/^[A-Z]/.test(bare) && !/^I(['’]|$)/.test(bare)) out.push(...words(bare))
    })
  }

  return out
}

// ---------------------------------------------------------------- what the person backs

export interface Analysis {
  supported: Wanted[]
  missing: Wanted[]
}

/** Splits the wanted keywords into those the CV or the profile backs and those nothing backs. */
export function analyse(cv: string, facts: Facts, wanted: Wanted[]): Analysis {
  const known = `${cv}\n${facts.extra}`
  const supported: Wanted[] = []
  const missing: Wanted[] = []
  for (const w of wanted) (mentions(known, w) ? supported : missing).push(w)

  return { supported, missing }
}

interface Known {
  all: string
  allAlnum: string
  words: Set<string>
  numbers: Set<string>
  supported: Wanted[]
  missing: Wanted[]
  cvAlnum: string
}

function knownOf(ctx: Ctx): Known {
  const { supported, missing } = analyse(ctx.cv, ctx.facts, ctx.wanted)
  const all = `${ctx.cv}\n${ctx.facts.extra}\n${[ctx.facts.name, ctx.facts.email, ctx.facts.phone, ctx.facts.place, ctx.facts.linkedin, ctx.facts.website].filter(Boolean).join("\n")}`
  // A tool the person has may be written with its proper name even where their CV spells it differently: the label is allowed once the keyword is backed.
  const labelWords = supported.flatMap((w) => words(w.label))

  return { all, allAlnum: alnum(all), words: new Set([...words(all), ...labelWords]), numbers: new Set(numbersOf(all)), supported, missing, cvAlnum: alnum(ctx.cv) }
}

/** The keywords nothing backs that this text names. */
export function leaks(text: string, missing: Wanted[]): string[] {
  return missing.filter((w) => mentions(text, w)).map((w) => w.label)
}

/** Why a line the model wrote cannot be used, or an empty list. */
function problems(now: string, k: Known, max = 420): string[] {
  const out: string[] = []
  if (now.trim() === "") out.push("empty")
  if (now.length > max) out.push("too long")
  if (/\[[^\]]*\]|\{[^}]*\}/.test(now)) out.push("placeholder")
  const leak = leaks(now, k.missing)
  if (leak.length > 0) out.push(`names "${leak.join('", "')}", which is not on the CV`)
  const nums = numbersOf(now).filter((n) => !k.numbers.has(n))
  if (nums.length > 0) out.push(`brings in the number ${nums.join(", ")}, which is not on the CV`)
  const names = [...new Set(namesOf(now).filter((n) => !k.words.has(n)))]
  if (names.length > 0) out.push(`brings in "${names.join('", "')}", which is not on the CV`)

  return out
}

// ---------------------------------------------------------------- what the model sends back

type Raw = Record<string, unknown>
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown, max = 300): string | undefined => {
  if (typeof v !== "string") return undefined
  const t = v.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max)

  return t === "" ? undefined : t
}

interface Unit {
  was: string | null
  now: string | undefined
}

/** A line the model sends as { was, now } (or just text, which counts as new). */
function unitOf(v: unknown): Unit {
  if (typeof v === "string") return { was: null, now: str(v, 700) }
  const o = obj(v)

  return { was: str(o.was, 700) ?? null, now: str(o.now, 700) }
}

const PRESENT = /\b(present|current|now|ongoing|heden|huidig|nu)\b/i

/** A copied fact (employer, title, school, date) is only true if the CV says it. */
function copied(value: string | undefined, k: Known, what: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined
  if (alnum(value) === "" || k.allAlnum.includes(alnum(value))) return value
  if (PRESENT.test(value) && PRESENT.test(k.all)) return value
  errors.push(`${what} "${value}" is not on the CV`)

  return undefined
}

/**
 * Turns what the model sent into a CV that is safe to show. Returns the errors when the facts do not match the CV (nothing is built then);
 * otherwise every line is either the person's own words or a rewording that passed the checks.
 */
export function assemble(raw: unknown, ctx: Ctx): { ok: true; result: Tailored } | { ok: false; errors: string[] } {
  const k = knownOf(ctx)
  const r = obj(raw)
  const errors: string[] = []
  const changes: Change[] = []
  const kept: string[] = []
  const used: string[] = []

  /** One line of text: the rewording if it is safe, else the person's own line, else nothing. */
  const line = (part: string, v: unknown, mayBeNew: boolean): string | undefined => {
    const u = unitOf(v)
    const was = u.was !== null && k.cvAlnum.includes(alnum(u.was)) ? u.was : null
    if (u.now === undefined) return was ?? undefined
    if (was !== null && alnum(was) === alnum(u.now)) {
      changes.push({ part, kind: "unchanged", before: was, after: was })
      used.push(was)

      return was
    }
    const bad = problems(u.now, k)
    if (bad.length === 0 && (was !== null || mayBeNew)) {
      changes.push({ part, kind: was === null ? "added" : "reworded", before: was, after: u.now })
      if (was !== null) used.push(was)

      return u.now
    }
    if (bad.length > 0 && u.now) kept.push(`${part}: ${bad.join("; ")}`)
    if (was !== null) {
      changes.push({ part, kind: "unchanged", before: was, after: was })
      used.push(was)

      return was
    }

    return undefined
  }

  const name = copied(str(r.name, 120), k, "The name", []) ?? ctx.facts.name
  const c = obj(r.contact)
  const mine = (v: unknown, fallback: string | undefined): string | undefined => {
    const t = str(v, 200)

    return t !== undefined && k.allAlnum.includes(alnum(t)) ? t : fallback
  }
  const contact = {
    email: mine(c.email, ctx.facts.email),
    phone: mine(c.phone, ctx.facts.phone),
    place: mine(c.place, ctx.facts.place),
    linkedin: mine(c.linkedin, ctx.facts.linkedin),
    website: mine(c.website, ctx.facts.website),
  }
  if (!name) errors.push("The CV has no name")
  if (!contact.email) errors.push("The CV has no email address")

  const experience: CvJob[] = arr(r.experience).map((j) => {
    const o = obj(j)
    const title = copied(str(o.title, 160), k, "The job title", errors) ?? ""
    const company = copied(str(o.company, 160), k, "The employer", errors) ?? ""
    const where = `${title || "Job"}, ${company || "employer"}`

    return {
      title,
      company,
      location: copied(str(o.location, 160), k, "The place", errors),
      start: copied(str(o.start, 30), k, "The start date", errors),
      end: copied(str(o.end, 30), k, "The end date", errors),
      bullets: arr(o.bullets).map((b) => line(where, b, false)).filter((b): b is string => Boolean(b)),
    }
  })
  const education: CvSchool[] = arr(r.education).map((e) => {
    const o = obj(e)
    const school = copied(str(o.school, 160), k, "The school", errors) ?? ""

    return {
      school,
      degree: copied(str(o.degree, 160), k, "The degree", errors),
      field: copied(str(o.field, 160), k, "The field of study", errors),
      start: copied(str(o.start, 30), k, "The start date", errors),
      end: copied(str(o.end, 30), k, "The end date", errors),
      details: o.details === undefined ? undefined : line(`Education, ${school}`, o.details, false),
    }
  })
  const projects: CvProject[] = arr(r.projects).map((p) => {
    const o = obj(p)
    const pname = copied(str(o.name, 160), k, "The project", errors) ?? ""

    return { name: pname, when: copied(str(o.when, 30), k, "The project date", errors), bullets: arr(o.bullets).map((b) => line(`Project, ${pname}`, b, false)).filter((b): b is string => Boolean(b)) }
  })

  // Skills: kept if the CV or profile has it or it is one of the keywords they back; anything the posting wants that nothing backs is out.
  const skills: CvSkillRow[] = arr(r.skills).map((s) => {
    const o = obj(s)
    const items: string[] = []
    for (const raw of typeof s === "string" ? [s] : arr(o.items)) {
      const item = str(raw, 60)
      if (!item) continue
      const inCv = k.allAlnum.includes(alnum(item)) || k.supported.some((w) => mentions(item, w))
      if (!inCv || leaks(item, k.missing).length > 0) {
        kept.push(`Skills: "${item}" is not on your CV, so it was left out`)
        continue
      }
      const before = k.cvAlnum.includes(alnum(item))
      changes.push({ part: "Skills", kind: before ? "unchanged" : "added", before: before ? item : null, after: item })
      items.push(item)
    }

    return { label: str(o.label, 60), items }
  }).filter((s) => s.items.length > 0)

  const headline = r.headline === undefined ? undefined : line("Headline", r.headline, true)
  const summary = r.summary === undefined ? undefined : line("Summary", r.summary, true)

  if (experience.length === 0 && education.length === 0) errors.push("No experience or education came back")
  if (experience.some((j) => !j.title || !j.company) || education.some((e) => !e.school) || projects.some((p) => !p.name)) errors.push("A job, school or project is missing its title or name")
  if (errors.length > 0 || !name || !contact.email) return { ok: false, errors: [...new Set(errors)].slice(0, 8) }

  const cv: Cv = { name, headline, contact, summary, experience, education, skills, projects, languages: arr(r.languages).map((l) => str(l, 60)).filter((l): l is string => Boolean(l) && k.allAlnum.includes(alnum(l as string))).slice(0, 8) }

  // The safety net: whatever the pieces did, the finished text must not name a keyword nothing backs.
  const still = leaks(cvText(cv), k.missing)
  if (still.length > 0) return { ok: false, errors: [`The CV names "${still.join('", "')}", which is not on your CV`] }

  // Keywords now on the CV that were not before, among the wanted ones the person backs.
  const finalText = cvText(cv)
  const added_keywords = k.supported.filter((w) => mentions(finalText, w) && !mentions(ctx.cv, w)).map((w) => w.label)

  // Lines of the original CV that did not come back: left out (to keep one page), counted for the person.
  const original = ctx.cv.split("\n").map((l) => l.trim()).filter((l) => /^[•\-–*·▪◦●]\s?/.test(l) && l.length > 30).map((l) => alnum(l.replace(/^[•\-–*·▪◦●]\s?/, "")))
  const left_out = original.filter((o) => !used.some((u) => o.includes(alnum(u)) || alnum(u).includes(o))).length

  const counts = {
    added: changes.filter((x) => x.kind === "added").length,
    reworded: changes.filter((x) => x.kind === "reworded").length,
    unchanged: changes.filter((x) => x.kind === "unchanged").length,
    left_out,
  }

  return { ok: true, result: { cv, changes, counts, added_keywords, missing: k.missing.map(({ name: n, label, tier }) => ({ name: n, label, tier })), kept_original: kept } }
}

// ---------------------------------------------------------------- the cover letter

/** Why a letter the model wrote cannot be used, or an empty list. */
export function checkLetter(letter: string, ctx: Ctx): string[] {
  const k = knownOf(ctx)
  const own = words(`${ctx.job.title} ${ctx.job.employer}`)
  const out: string[] = []
  const body = letter.trim()
  if (body.length < 200 || body.length > 4000) out.push("write 3-5 short paragraphs (200-4000 characters)")
  if (/\[[^\]]*\]|\{[^}]*\}/.test(body)) out.push("no placeholders like [Company]: write the real words")
  const leak = leaks(body, k.missing)
  if (leak.length > 0) out.push(`it names "${leak.join('", "')}", which is not on the CV`)
  const nums = [...new Set(numbersOf(body).filter((n) => !k.numbers.has(n)))]
  if (nums.length > 0) out.push(`it brings in the number ${nums.join(", ")}, which is not on the CV`)
  const names = [...new Set(namesOf(body).filter((n) => !k.words.has(n) && !own.includes(n)))]
  if (names.length > 0) out.push(`it brings in "${names.join('", "')}", which is not on the CV`)

  return out
}

const overlap = (a: string, b: string): number => {
  const x = new Set(words(a))
  const y = new Set(words(b))
  if (x.size === 0 || y.size === 0) return 0
  let same = 0
  for (const w of x) if (y.has(w)) same++

  return same / Math.min(x.size, y.size)
}

/** The paragraphs of the new letter against the person's own letter: unchanged, reworded or added. */
export function letterChanges(letter: string, previous: string | null): Change[] {
  const paras = (t: string): string[] => t.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const before = previous ? paras(previous) : []

  return paras(letter).map((p, i) => {
    const same = before.find((b) => alnum(b) === alnum(p))
    if (same) return { part: `Paragraph ${i + 1}`, kind: "unchanged" as const, before: same, after: p }
    const close = before.map((b) => ({ b, o: overlap(b, p) })).sort((a, b) => b.o - a.o)[0]

    return close && close.o >= 0.5 ? { part: `Paragraph ${i + 1}`, kind: "reworded" as const, before: close.b, after: p } : { part: `Paragraph ${i + 1}`, kind: "added" as const, before: null, after: p }
  })
}

// ---------------------------------------------------------------- what the model is told

export const CV_SYSTEM = `You tailor one person's CV for one job. You never invent anything.
Reply with JSON only, no text around it.

Hard rules:
- Use only facts that are in the CV text and the profile facts given. Never add an employer, job title, school, degree, date, grade, number, tool or skill that is not there.
- "Keywords you may use" are backed by the person's CV or profile: work them in where they are true (summary, skills, bullets), in the posting's wording, most important first.
- "Keywords you must NOT write" are not backed by anything. Do not write them, or a near synonym, anywhere.
- Copy employers, job titles, locations, schools, degrees, fields and dates exactly as the CV writes them. Keep every job and school, in the same order.
- Every bullet comes as {"was": "<the CV's own line, copied exactly>", "now": "<your version>"}. Reword only to bring the job's words in and to lead with the most relevant result. Same meaning, same numbers. If a bullet needs no change, "now" equals "was". Never write a bullet with no "was".
- Keep it to one page: short bullets, no more bullets than the CV has, drop the least relevant lines if you must.
- Plain words, no buzzwords, no first person.

JSON shape: {"name","contact":{"email","phone","place","linkedin","website"},"headline":{"was","now"}|null,"summary":{"was","now"}|null,"skills":[{"label","items":["..."]}],"experience":[{"title","company","location","start","end","bullets":[{"was","now"}]}],"education":[{"school","degree","field","start","end","details":{"was","now"}|null}],"projects":[{"name","when","bullets":[{"was","now"}]}],"languages":["..."]}`

const tierWord: Record<Tier, string> = { must: "must have", strong: "strong plus", optional: "preferred", nice: "nice to have" }

export function cvUser(ctx: Ctx, retry: string[] = []): string {
  const { supported, missing } = analyse(ctx.cv, ctx.facts, ctx.wanted)
  const list = (ws: Wanted[]): string => (ws.length > 0 ? ws.map((w) => `${w.label} (${tierWord[w.tier]})`).join(", ") : "none")

  return [
    `Job: ${ctx.job.title} at ${ctx.job.employer}`,
    `Keywords you may use: ${list(supported)}`,
    `Keywords you must NOT write: ${list(missing)}`,
    `Profile facts (also true): ${ctx.facts.extra.slice(0, 3000) || "none"}`,
    retry.length > 0 ? `Your last answer was refused because:\n- ${retry.join("\n- ")}\nFix exactly these and answer again.` : "",
    `The CV text:\n${ctx.cv.slice(0, 14000)}`,
  ].filter(Boolean).join("\n\n")
}

export const LETTER_SYSTEM = `You write one person's cover letter for one job. You never invent anything.
Write 3-5 short paragraphs, plain words, first person, no placeholders, no greeting line with a made-up name (start "Dear hiring team,"), end with the person's name.
Use only facts in the CV text and profile facts given. Never add an employer, school, degree, date, number, tool or skill that is not there.
Name the employer and the job. Work in the "Keywords you may use" where they are true. Never write the "Keywords you must NOT write", or a near synonym.
If a previous letter is given, keep what still fits it and reword the rest for this job.
Reply with the letter text only.`

export function letterUser(ctx: Ctx, previous: string | null, retry: string[] = []): string {
  const { supported, missing } = analyse(ctx.cv, ctx.facts, ctx.wanted)
  const list = (ws: Wanted[]): string => (ws.length > 0 ? ws.map((w) => `${w.label} (${tierWord[w.tier]})`).join(", ") : "none")

  return [
    `Job: ${ctx.job.title} at ${ctx.job.employer}`,
    `Person: ${ctx.facts.name ?? ""}`,
    `Keywords you may use: ${list(supported)}`,
    `Keywords you must NOT write: ${list(missing)}`,
    `Profile facts (also true): ${ctx.facts.extra.slice(0, 3000) || "none"}`,
    previous ? `Previous letter:\n${previous.slice(0, 4000)}` : "",
    retry.length > 0 ? `Your last answer was refused because: ${retry.join("; ")}. Fix exactly this and write the letter again.` : "",
    `The CV text:\n${ctx.cv.slice(0, 14000)}`,
  ].filter(Boolean).join("\n\n")
}

/** Pulls the JSON object out of a model reply (it may come in a code fence). */
export function jsonOf(text: string): unknown {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}
