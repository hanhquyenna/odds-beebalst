/** Shared site knowledge contains a closed vocabulary of structure, never applicant values. */
export const BUTTONS = ["Apply", "Apply now", "Apply on company website", "Apply on employer's website", "Apply on the employer's website", "Easy Apply", "Next", "Continue", "Review", "Skip", "Not now", "Close", "Reject all", "Necessary only", "Functional only", "Solliciteren", "Volgende"] as const
export const FIELDS = ["first_name", "last_name", "full_name", "email", "phone", "linkedin", "city", "country", "cv"] as const
export type Lesson = { kind: "opener" | "skip_dialog"; button: string } | { kind: "widget" | "mapping"; field: string; method: "typing" | "choosing" | "upload"; autofill_key: string }
export type Evidence = { lesson: Lesson; successes: number; failures: number; source_runs: string[]; last_success?: string; last_failure?: string }
export type ActiveLesson = Evidence & { confidence: number; active: boolean; retired: boolean }
export function sanitizeLesson(input: unknown): Lesson | null {
  if (!input || typeof input !== "object") return null
  const x = input as Record<string, unknown>
  if (["opener", "skip_dialog"].includes(String(x.kind)) && BUTTONS.includes(x.button as typeof BUTTONS[number])) {
    // Never turn a generic Next/Continue into an opener recipe.
    if (x.kind === "opener" && !/^(apply|easy apply|solliciteren)/i.test(String(x.button))) return null
    if (x.kind === "skip_dialog" && !/^(skip|not now|close|reject all|necessary only|functional only)$/i.test(String(x.button))) return null
    return { kind: x.kind as "opener" | "skip_dialog", button: x.button as string }
  }
  if (["widget", "mapping"].includes(String(x.kind)) && FIELDS.includes(x.field as typeof FIELDS[number]) && FIELDS.includes(x.autofill_key as typeof FIELDS[number]) && ["typing", "choosing", "upload"].includes(String(x.method))) {
    return { kind: x.kind as "widget" | "mapping", field: x.field as string, method: x.method as "typing" | "choosing" | "upload", autofill_key: x.autofill_key as string }
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
  return { lessons, recipes: lessons.filter(e => e.successes >= 5 && new Set(e.source_runs).size >= 5 && e.confidence >= 0.6 && (!e.last_failure || now - Date.parse(e.last_failure) > 14 * 86_400_000) && ["opener", "skip_dialog"].includes(e.lesson.kind)) }
}
/** Match only canonical contact labels. Arbitrary labels/answers cannot enter shared storage. */
export function structuralField(label: unknown): string | null {
  if (typeof label !== "string") return null
  const text = label.toLowerCase().replace(/[*:]/g, "").replace(/\s+/g, " ").trim()
  const aliases: Record<string, string> = { "first name": "first_name", "given name": "first_name", "last name": "last_name", "family name": "last_name", surname: "last_name", "full name": "full_name", name: "full_name", email: "email", "email address": "email", phone: "phone", "phone number": "phone", linkedin: "linkedin", "linkedin url": "linkedin", city: "city", "current location": "city", country: "country", "resume / cv": "cv", "resume/cv": "cv", resume: "cv", cv: "cv" }
  return aliases[text] || null
}
