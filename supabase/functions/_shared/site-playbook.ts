/** Shared site knowledge contains a closed vocabulary of structure, never applicant values. */
export const BUTTONS = ["Apply", "Apply now", "Apply for this job", "Apply on company website", "Apply on employer's website", "Apply on the employer's website", "Easy Apply", "Next", "Continue", "Review", "Skip", "Not now", "Close", "Reject all", "Necessary only", "Functional only", "Solliciteren", "Volgende"] as const
export const FIELDS = ["first_name", "last_name", "full_name", "email", "phone", "linkedin", "city", "country", "cv"] as const
/** A mapping may carry where the field sits: its label normalized by fieldPattern (page structure, never an answer) and which of the
 * same-labelled fields it is (nth). Only those carry enough to be replayed by the extension before Broods' first step. */
export type Lesson = { kind: "opener" | "skip_dialog"; button: string } | { kind: "widget" | "mapping"; field: string; method: "typing" | "choosing" | "upload"; autofill_key: string; label?: string; nth?: number }
export type Evidence = { lesson: Lesson; successes: number; failures: number; source_runs: string[]; last_success?: string; last_failure?: string }
export type ActiveLesson = Evidence & { confidence: number; active: boolean; retired: boolean }
export function sanitizeLesson(input: unknown): Lesson | null {
  if (!input || typeof input !== "object") return null
  const x = input as Record<string, unknown>
  // Buttons are matched without case (Lever writes APPLY FOR THIS JOB) and stored in their one canonical spelling.
  const button = typeof x.button === "string" ? BUTTONS.find(b => b.toLowerCase() === String(x.button).replace(/\s+/g, " ").trim().toLowerCase()) : undefined
  if (["opener", "skip_dialog"].includes(String(x.kind)) && button) {
    // Never turn a generic Next/Continue into an opener recipe.
    if (x.kind === "opener" && !/^(apply|easy apply|solliciteren)/i.test(button)) return null
    if (x.kind === "skip_dialog" && !/^(skip|not now|close|reject all|necessary only|functional only)$/i.test(button)) return null
    return { kind: x.kind as "opener" | "skip_dialog", button }
  }
  if (["widget", "mapping"].includes(String(x.kind)) && FIELDS.includes(x.field as typeof FIELDS[number]) && FIELDS.includes(x.autofill_key as typeof FIELDS[number]) && ["typing", "choosing", "upload"].includes(String(x.method))) {
    // A CV is only ever uploaded, and contact details are never uploaded.
    if ((x.field === "cv") !== (x.method === "upload")) return null
    const lesson: Lesson = { kind: x.kind as "widget" | "mapping", field: x.field as string, method: x.method as "typing" | "choosing" | "upload", autofill_key: x.autofill_key as string }
    if (x.kind === "mapping" && x.label !== undefined) {
      if (typeof x.label !== "string" || fieldPattern(x.label) !== x.label) return null
      const nth = x.nth === undefined ? 0 : x.nth
      if (!Number.isInteger(nth) || (nth as number) < 0 || (nth as number) > 4) return null
      return { ...lesson, label: x.label, nth: nth as number }
    }
    return lesson
  }
  return null
}
export function siteIdentity(url: string): { host: string; ats: string | null } {
  try {
    const host = new URL(url).hostname.toLowerCase()
    const ats = /(^|\.)lever\.co$/.test(host) ? "lever" : /greenhouse\.io$/.test(host) ? "greenhouse" : /ashbyhq\.com$/.test(host) ? "ashby" : /myworkday(jobs|site)\.com$/.test(host) ? "workday" : /oraclecloud\.com$/.test(host) ? "oracle" : /smartrecruiters\.com$/.test(host) ? "smartrecruiters" : null
    return { host, ats }
  } catch { return { host: "", ats: null } }
}
export function assessLesson(e: Evidence, now = Date.now()): ActiveLesson {
  const successAt = Date.parse(e.last_success || "")
  const age = Number.isFinite(successAt) ? Math.max(0, now - successAt) / 86_400_000 : 365
  const independent = new Set(e.source_runs).size
  const confidence = Math.min(1, e.successes / (e.successes + 2 * e.failures + 2)) * Math.pow(0.5, age / 60)
  const retired = e.failures >= 3
  return { ...e, confidence, retired, active: independent >= 3 && e.successes >= 3 && !retired && confidence >= 0.45 }
}
export function playbookFor(rows: Array<{ lessons?: Record<string, Evidence> }>, now = Date.now()): { lessons: ActiveLesson[]; recipes: ActiveLesson[] } {
  const all = rows.flatMap(r => Object.values(r.lessons || {})).filter(e => sanitizeLesson(e.lesson)).map(e => assessLesson(e, now))
  // A lesson may exist in host and ATS scopes. Keep one copy, never double-count its evidence.
  const unique = new Map<string, ActiveLesson>()
  for (const e of all) {
    const k = JSON.stringify(e.lesson), prev = unique.get(k)
    if (!prev || e.confidence > prev.confidence) unique.set(k, e)
  }
  const lessons = [...unique.values()].filter(e => e.active)
  const calm = (e: ActiveLesson) => !e.last_failure || now - Date.parse(e.last_failure) > 14 * 86_400_000
  // Clicks need five independent runs. A field mapping only fills the person's own contact detail into a field three verified runs
  // agreed on, is checked in the page as it fills, and Broods still sees it: active (three runs, no recent failure) is enough.
  const clicks = lessons.filter(e => e.successes >= 5 && new Set(e.source_runs).size >= 5 && e.confidence >= 0.6 && calm(e) && ["opener", "skip_dialog"].includes(e.lesson.kind))
  const fields = lessons.filter(e => e.lesson.kind === "mapping" && "label" in e.lesson && typeof e.lesson.label === "string" && e.confidence >= 0.55 && calm(e))
  return { lessons, recipes: [...clicks, ...fields] }
}
/** A field label as structure: lowercase words only, short. Anything with digits, @, dots or other marks (a file name, an email, a
 * value echoed into the label) is not a pattern and is never stored. The extension normalizes with the same rule. */
export function fieldPattern(label: unknown): string | null {
  if (typeof label !== "string") return null
  const text = label.toLowerCase().replace(/[*:✱★•]/g, " ").replace(/\((optional|required)\)/g, " ").replace(/\s+/g, " ").trim()
  if (!/^[a-z][a-z '&/()?,-]{0,47}$/.test(text) || text.split(" ").length > 6) return null
  return text
}
/** Match only canonical contact labels. Arbitrary labels/answers cannot enter shared storage. */
export function structuralField(label: unknown): string | null {
  if (typeof label !== "string") return null
  const text = label.toLowerCase().replace(/[*:]/g, "").replace(/\s+/g, " ").trim()
  const aliases: Record<string, string> = { "first name": "first_name", "given name": "first_name", "last name": "last_name", "family name": "last_name", surname: "last_name", "full name": "full_name", name: "full_name", email: "email", "email address": "email", phone: "phone", "phone number": "phone", linkedin: "linkedin", "linkedin url": "linkedin", city: "city", "current location": "city", country: "country", "resume / cv": "cv", "resume/cv": "cv", resume: "cv", cv: "cv" }
  return aliases[text] || null
}
