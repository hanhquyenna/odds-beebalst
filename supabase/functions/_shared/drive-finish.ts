// Finish guards for Broods drive: which questions Odds already knows, and when a widget stop is too early.
// Structure only. No applicant values.

const PERSONAL = /\b(pronoun|gender|salary|notice period|requirements from your university|thesis|start date you|your (own )?(availability|address|postcode|street))\b/i
const PRONOUN = /\b(pronouns?|gender)\b/i
const OWN = /^(do|did|are|have|can|will|would|is)\b.*\b(experience|experienced|familiar|proficient|knowledge|worked with|used|skills?|located|based|authori[sz]ed|right to work|sponsor\w*|relocat\w*|available|commit|willing|hear about|heard about|consent|agree|worked (at|for)|employed (at|by)|been employed|work(ed)? here|part of (a |an |your |the )?(mandatory |compulsory )?(curriculum|programme|program|studies|study|degree)|integrated (as|into|in|with)|(mandatory|compulsory|elective)\b[^.?]{0,40}(curriculum|programme|program|studies|study))\b/i
const OPEN = /^(why|what|how|describe|tell us|explain|share|give|please (describe|explain|share|tell|write|name|mention|list|elaborate|state|provide)|name|mention|elaborate|in (a few|max|up to)|using (a )?maximum)\b(?!.*\b(salary|expected (pay|salary)|notice period|current (pay|salary)|grade list|transcript|pronoun|gender)\b)/i
/** Worked here / applied here: the facts already say, so Broods must not hand them to the person. */
const APPLIED = /\b(applied (to|at|for|before|here|previously)|previously applied|prior application|application before|have you applied|worked (at|for|here)|employed (at|by)|been employed|work(ed)? (at|for|here))\b/i

/** Told to Broods when a question is sent back: the fact to use, never a guess. */
export const FACT_QUESTION_HINT = "worked at / employed by this employer → worked_at_this_employer_before; applied to this employer before → applied_to_this_employer_before (No unless that fact is Yes). Do not invent either."

/** Questions the rules and facts already cover. Pronouns stay in (prefer not to say). Personal plans and pay stay out. */
export function ownQuestions(questions: string[]): string[] {
  return questions.filter((q) => {
    const text = String(q)
    if (PRONOUN.test(text)) return true
    if (PERSONAL.test(text)) return false
    return OWN.test(text) || OPEN.test(text) || APPLIED.test(text)
  })
}

/**
 * "Applied to this employer before?" Yes only when the tracker has another application at that employer.
 * null when Odds could not look (unknown: the person is asked, never a guessed No).
 */
export function appliedBeforeAnswer(priorEmployers: string[] | null, employer: string): "Yes" | "No" | null {
  if (!Array.isArray(priorEmployers)) return null
  const key = employer.trim().toLowerCase().split(/\s+/).filter(Boolean)[0] ?? ""
  if (key.length < 3) return null
  return priorEmployers.some((name) => name.toLowerCase().includes(key)) ? "Yes" : "No"
}

const INSTANT = new Set(["captcha", "account", "closed", "email"])
const WIDGET_KINDS = new Set(["choice", "combobox", "listbox", "select", "radio"])
const WIDGET_RE = /\b(did ?n.t|did not|not|never|won.t|will not|cannot|can.t) (register|accept\w*|take|stick|keep|respond\w*|work)\b|toggle|autocomplete|not exposing|no (visible )?(next|continue|review|submit) (button|control)|(next|continue) (button )?did not advance|reports? errors?|validation|(correct|fix) (these|them|it|the fields?) (in|on) the (tab|page|form)|(required and )?must have a value/i

export type PageField = {
  id?: string
  label?: string
  kind?: string
  required?: boolean
  filled?: boolean
  invalid?: boolean
  consent?: boolean
}

export type FillCommand = {
  args?: { fields?: Array<{ id?: string; value?: string }> }
  result?: { results?: Array<{ id?: string; ok?: boolean; via?: string; tried?: string[]; error?: string }> }
}

function distinctAttempts(fills: FillCommand[], id: string): number {
  const sigs = new Set<string>()
  for (const cmd of fills || []) {
    const asked = (cmd.args?.fields || []).find((f) => f?.id === id)
    const res = (cmd.result?.results || []).find((r) => r?.id === id)
    if (!asked && !res) continue
    if (String(res?.error || "").startsWith("not tried")) continue
    const value = String(asked?.value ?? "").trim().toLowerCase().slice(0, 80)
    const vias = new Set<string>()
    if (res?.via) vias.add(String(res.via))
    for (const step of res?.tried || []) if (step) vias.add(String(step))
    if (!vias.size) vias.add("plain")
    for (const via of vias) sigs.add(`${via}|${value}`)
  }
  return sigs.size
}

function failedFillFields(fills: FillCommand[]): PageField[] {
  const latest = new Map<string, boolean>()
  for (const cmd of fills || []) {
    for (const row of cmd.result?.results || []) {
      if (!row?.id || String(row.error || "").startsWith("not tried")) continue
      latest.set(String(row.id), row.ok === true)
    }
  }
  return [...latest.entries()].filter(([, ok]) => !ok).map(([id]) => ({ id, label: id, required: true, filled: false, kind: "text" }))
}

/**
 * stuck / needs_you other (and a questions stop that is really a widget) wait until every failing field
 * has two different fill attempts on drive_commands. Captcha, account, closed and email stay instant.
 * At most two refusals, so a field that never records attempts cannot loop the model.
 */
export function widgetAttemptGuard(opts: {
  stage: string
  reason: string | null
  message: string
  fields: PageField[]
  fills: FillCommand[]
  priorRefusals?: number
}): { accept: true } | { accept: false; text: string } {
  const reason = opts.reason || ""
  if (opts.stage === "review") return { accept: true }
  if (INSTANT.has(reason)) return { accept: true }
  const widgetMessage = WIDGET_RE.test(opts.message || "")
  const stop = opts.stage === "stuck" || (opts.stage === "needs_you" && (reason === "other" || (reason === "questions" && widgetMessage)))
  if (!stop) return { accept: true }
  const unfilled = (opts.fields || []).filter((f) => f && f.id && f.kind !== "file" && !f.consent && f.required && (!f.filled || f.invalid))
  const widgetFields = unfilled.filter((f) => f.invalid || WIDGET_KINDS.has(String(f.kind || "")))
  const targets = widgetMessage ? (unfilled.length ? unfilled : failedFillFields(opts.fills)) : widgetFields
  if (!widgetMessage && !targets.length) return { accept: true }
  const prior = opts.priorRefusals ?? 0
  if (!targets.length) {
    if (prior >= 1) return { accept: true }
    return {
      accept: false,
      text: "Not done: a field or button that does not respond is yours, not the person's. read_page again (one scroll to the bottom already ran when Next was missing), then fill the field a second, different way. Only then finish.",
    }
  }
  const short = targets.filter((f) => distinctAttempts(opts.fills, String(f.id)) < 2)
  if (!short.length || prior >= 2) return { accept: true }
  const labels = short.map((f) => String(f.label || f.id)).slice(0, 8)
  return {
    accept: false,
    text: `Not done: these fields need another fill before a stop (each failing field needs 2 different attempts): ${labels.join("; ")}. fill them again a different way (Odds retries the box's own format, key-by-key typing, typeahead, the choice button, then keyboard). A widget that does not keep its value is yours, not the person's.`,
  }
}
