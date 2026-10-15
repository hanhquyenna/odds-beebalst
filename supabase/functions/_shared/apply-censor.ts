// Apply censor: DOM-truth helpers shared by the extension (via build) and unit tests.
// Ready / "Filled in by odds" is only allowed when required fields are actually answered in the DOM.
// LLM/Broods never set status — they only propose clicks/answers; the script re-verifies.

/** Flags the script sets from the page (truth). LLM never invents these. */
export type CensorFlag =
  | "empty_required"
  | "fill_failed"
  | "no_apply_cta"
  | "no_next"
  | "wrong_page"
  | "stuck_loop"
  | "account_gate"
  | "captcha"
  | "listing_gone"

/** Compact page snapshot for suggest-scan / suggest-action (no passwords, no CV bytes). */
export type ApplyPageSnapshot = {
  url?: string
  title: string
  headings: string[]
  stage_guess?: "listing" | "apply_cta" | "form" | "review" | "account" | "captcha" | "unknown"
  fields: Array<{ key: string; label: string; kind: string; required: boolean; empty: boolean }>
  buttons: Array<{ text: string; href?: string; hint?: string } | string>
  errors: string[]
  censor_flags: CensorFlag[]
  exclude_clicks?: string[]
  facts?: Record<string, string | null>
}

/** One field as the censor sees it after a fill attempt. */
export type FieldFillState = {
  label: string
  kind: string
  /** Required for Ready, or contact field that must not be empty when present. */
  required: boolean
  answered: boolean
  /** Rules/Autofill know an answer but DOM is still empty after type. */
  fillFailed?: boolean
}

export type ApplyStage = "filling" | "agent_answers" | "agent_scan" | "human" | "ready" | "stuck"

/** ATS widget kinds — mechanics in the extension; meaning stays in apply-form. */
export type WidgetKind = "plain" | "typeahead" | "card" | "choice" | "combobox" | "listbox" | "file"

/** Detect widget kind from DOM signatures (not employer names). */
export function detectWidgetKind(el: {
  id?: string
  name?: string
  tagName?: string
  role?: string | null
  ariaAutocomplete?: string | null
  className?: string
  /** Lever custom question card */
  inCustomQuestion?: boolean
  kind?: string
}): WidgetKind {
  if (el.kind === "file") return "file"
  if (el.kind === "choice") return "choice"
  if (el.kind === "listbox") return "listbox"
  if (el.kind === "combobox") return "typeahead"
  const id = el.id || ""
  const cls = el.className || ""
  const role = el.role || ""
  const auto = el.ariaAutocomplete || ""
  if (id === "location-input" || /\blocation-input\b/.test(cls) || role === "combobox" || auto === "list") return "typeahead"
  if (el.inCustomQuestion) return "card"
  return "plain"
}

const CONTACT =
  /\b(first name|given name|voornaam|last name|family name|surname|achternaam|full name|e-?mail|courriel|phone|telephone|telefoon|mobile|mobiel)\b/i

/** Contact labels that must be non-empty whenever they appear on the step. */
export function isContactLabel(label: string): boolean {
  return CONTACT.test((label || "").replace(/\s+/g, " ").trim())
}

/**
 * Ready / "Filled in by odds" only when every required (and every contact) field is answered.
 * Checkboxes are ignored here (consent handled separately).
 */
export function formActuallyFilled(fields: ReadonlyArray<FieldFillState>): boolean {
  for (const f of fields) {
    if (f.kind === "checkbox") continue
    if (f.kind === "file") {
      if (f.required && !f.answered) return false
      continue
    }
    if ((f.required || isContactLabel(f.label)) && !f.answered) return false
  }
  return true
}

/** True when any Autofill-known field is still empty in the DOM. */
export function hasFillFailed(fields: ReadonlyArray<FieldFillState>): boolean {
  return fields.some((f) => f.fillFailed && !f.answered)
}

export function classifyCensorFlags(input: {
  fields: ReadonlyArray<FieldFillState>
  hasForm: boolean
  hasApplyCta: boolean
  hasNext: boolean
  captcha: boolean
  account: boolean
  stuckLoop: boolean
  listingGone: boolean
  /** Submit/Review visible — no Next needed. */
  onReview?: boolean
}): CensorFlag[] {
  const flags: CensorFlag[] = []
  if (input.listingGone) flags.push("listing_gone")
  if (input.captcha) flags.push("captcha")
  if (input.account) flags.push("account_gate")
  if (input.stuckLoop) flags.push("stuck_loop")
  if (!input.hasForm && !input.hasApplyCta) flags.push("wrong_page", "no_apply_cta")
  else if (!input.hasForm) flags.push("no_apply_cta")
  if (input.hasForm && !input.hasNext && !input.onReview) flags.push("no_next")
  if (input.fields.some((f) => f.kind !== "checkbox" && f.required && !f.answered)) flags.push("empty_required")
  if (hasFillFailed(input.fields)) flags.push("fill_failed")
  return [...new Set(flags)]
}

/**
 * Status chip rules: never claim Ready with gaps; never "Checking…" while Autofill gaps remain.
 */
export function chipAllowed(opts: {
  stillEmptyGaps: boolean
  formFilled: boolean
  message: string
  state: "filling" | "busy" | "ask" | "done" | "problem"
}): boolean {
  if (opts.state === "done" && (!opts.formFilled || opts.stillEmptyGaps)) return false
  if (/Checking that the website kept/i.test(opts.message) && opts.stillEmptyGaps) return false
  if (/Filled in by odds/i.test(opts.message) && (!opts.formFilled || opts.stillEmptyGaps)) return false
  return true
}

/** Next stage after a censor read — Broods scan required when known gaps stall. */
export function nextApplyStage(opts: {
  formFilled: boolean
  stillEmptyGaps: boolean
  agentAnswersTried: boolean
  agentScanTried: boolean
  captcha: boolean
  account: boolean
  /** Rounds spent with the same Autofill gaps and no agent turn yet. */
  gapRounds?: number
}): ApplyStage {
  if (opts.captcha || opts.account) return "human"
  if (opts.formFilled && !opts.stillEmptyGaps) return "ready"
  if (!opts.stillEmptyGaps) return "filling"
  // Never linger in filling with known gaps — invite answers then scan.
  if (!opts.agentAnswersTried) return "agent_answers"
  if (!opts.agentScanTried) return "agent_scan"
  return "human"
}

/**
 * Forbidden chip while gaps remain (unit-tested contract for the extension say()).
 * Checking… / Ready / Filled in by odds must never appear with stillEmptyGaps.
 */
export function forbiddenGapChip(message: string, stillEmptyGaps: boolean): boolean {
  if (!stillEmptyGaps) return false
  return /Checking that the website kept|Filled in by odds/i.test(message)
}
