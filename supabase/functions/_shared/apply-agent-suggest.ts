// Deterministic suggestions for the apply-agent Edge Function (and tests). Uses the same form rules as the
// extension; zoekjaar / orientation year → no employer sponsorship. Optional LLM fill-in is separate.

import { chooseOption, questionKey, resolveAgentAnswer, type Facts } from "./apply-form.ts"
import { isDeniedQuestion, type ApplyQuestion, type SuggestedAnswer } from "./apply-agent.ts"

/** Common aliases testers / other agents send instead of Odds profile keys. */
const FACT_ALIASES: Record<string, string> = {
  salary_expectation: "expected_salary",
  salary: "expected_salary",
  expected_pay: "expected_salary",
  pay: "expected_salary",
  given_name: "first_name",
  family_name: "last_name",
  mobile: "phone",
  telephone: "phone",
}

/** Normalize a facts map: aliases, numbers→string, keep Odds keys. */
export function normalizeAgentFacts(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw) return out
  for (const [k, v] of Object.entries(raw)) {
    const key = FACT_ALIASES[k] ?? k
    const t = typeof v === "number" && Number.isFinite(v)
      ? String(v)
      : typeof v === "string"
        ? v.replace(/\s+/g, " ").trim()
        : ""
    if (t) out[key] = t.slice(0, 200)
  }
  return out
}

/** Build Facts from the short allow-listed map Odds sends the agent. */
export function factsFromAgentPayload(facts: Record<string, unknown> | null | undefined, postingId?: string | null): Facts {
  const a = normalizeAgentFacts(facts)
  return {
    job_id: postingId ?? null,
    job_country: "NL",
    name: [a.first_name, a.last_name].filter(Boolean).join(" ") || null,
    email: a.email ?? null,
    phone: a.phone ?? null,
    place: a.city ?? null,
    linkedin: a.linkedin ?? null,
    website: a.website ?? null,
    answers: { ...a },
    remembered: {},
  }
}

function evidenceFor(label: string, facts: Facts): string {
  const key = questionKey(label)
  const w = facts.answers?.work_authorization ?? ""
  if (/\b(sponsor\w*|visa|parrainage|authori[sz]|right to work|work permit|allowed to work)\b/.test(key)) {
    if (/\b(zoekjaar|orientation year|search year)\b/i.test(w)) return "work_authorization:zoekjaar"
    return "work_authorization"
  }
  if (/\b(salary|compensation|pay|wage|salaris|salaire|gehalt|stipend)\b/.test(key)) return "expected_salary"
  if (/\b(first name|given name|last name|surname|family name|e ?mail|phone|linkedin)\b/.test(key)) return "profile_contact"
  return "odds_rules"
}

/** Never auto-click these (human-only or destructive). Locale-agnostic deny on meaning. */
// Never Magnet/board signup funnels — always the direct Apply path under "Or continue directly".
const ACTION_DENY = /\b(submit|send application|envoyer|verstuur|versturen|verzenden|absenden|password|captcha|sign[\s-]?in|log[\s-]?in|sign[\s-]?up|register|create (an )?account|create profile|make (an )?account|đăng nhập|se connecter|anmelden|inloggen|cart|giỏ hàng|share|chia sẻ|save job|save for later|accept all|allow all|all cookies)\b/i
/**
 * Apply CTAs in languages Odds users actually see (browser locale ≠ English).
 * Also matched via href / data-automation-id when the visible label is unknown.
 */
const ACTION_APPLY = /^(apply(\s+now|\s+for this job|\s+on\b|\s+to this job)?|i'?m interested|solliciteer(\s+nu)?|solliciteren|nu solliciteren|bewerben|jetzt bewerben|postuler|candidat(e|er|ura)?|candidati|aplicar(\s+ahora)?|postular|ứng tuyển(\s+ngay)?|nộp đơn|nop ngay|aplikuj|başvur|応募|申请|立即申请)\b/i
const ACTION_NEXT = /^(next|continue|save and continue|review|volgende|verder|weiter|suivant|continuar|tiếp tục|tiếp theo|dalej|devam|次へ|继续)\b/i
/** Cookie / CMP dismiss that must clear before Apply (Magnet.me "Functional only", OneTrust reject, …). Never Accept all. */
const ACTION_COOKIE = /^(functional( cookies)? only|necessary( cookies)? only|only (necessary|essential|required|functional|strictly necessary)( cookies)?|(necessary|essential|required|functional)( cookies)? only|reject( all)?( cookies)?|decline( all)?|use necessary|alleen (noodzakelijke|functionele)|tout refuser|alle ablehnen)$/i
/** Language-agnostic: URL / automation id / class says this opens an application. */
const APPLY_SIGNAL = /apply|job-?app|jobapplication|applicationbutton|sollicit|bewerb|postul|candidat|aplicar|aplikuj/i

export type ActionCandidate = string | { text?: string; href?: string; hint?: string }

type NormalizedAction = { text: string; href: string; hint: string }

function normalizeActionCandidates(buttons: ReadonlyArray<ActionCandidate>): NormalizedAction[] {
  const out: NormalizedAction[] = []
  for (const raw of buttons.slice(0, 40)) {
    if (typeof raw === "string") {
      const text = raw.replace(/\s+/g, " ").trim()
      if (text.length >= 2 && text.length <= 80) out.push({ text, href: "", hint: "" })
      continue
    }
    if (!raw || typeof raw !== "object") continue
    const text = typeof raw.text === "string" ? raw.text.replace(/\s+/g, " ").trim() : ""
    if (text.length < 2 || text.length > 80) continue
    out.push({
      text,
      href: typeof raw.href === "string" ? raw.href : "",
      hint: typeof raw.hint === "string" ? raw.hint : "",
    })
  }
  return out.filter((b) => !ACTION_DENY.test(b.text))
}

export type SuggestActionPick = { action: "click" | "none"; text?: string; reason: string }

/** Stable fingerprint of visible labels (no PII) so all users share the same ATS-page pattern. */
export function actionButtonsFingerprint(buttons: ReadonlyArray<ActionCandidate>): string {
  const labels = normalizeActionCandidates(buttons)
    .map((b) => b.text.toLowerCase())
    .sort()
  return labels.join("\n").slice(0, 2000)
}

/**
 * Pick one safe Apply/Next control for a stuck listing.
 * Works across locales: known labels first, then href/automation signals (so a Dutch/VN/DE browser still progresses).
 */
export function pickSuggestAction(buttons: ReadonlyArray<ActionCandidate>): SuggestActionPick {
  const clean = normalizeActionCandidates(buttons)
  // Cookie overlays block Apply — clear them first so the LLM is not wasted on a buried CTA.
  const cookie = clean.find((b) => ACTION_COOKIE.test(b.text))
  if (cookie) return { action: "click", text: cookie.text, reason: "cookie_dismiss" }
  const byLabel = clean.find((b) => ACTION_APPLY.test(b.text))
  if (byLabel) return { action: "click", text: byLabel.text, reason: "apply_label" }
  const bySignal = clean.find((b) => APPLY_SIGNAL.test(`${b.href} ${b.hint}`) && !ACTION_DENY.test(b.text))
  if (bySignal) return { action: "click", text: bySignal.text, reason: "apply_signal" }
  const next = clean.find((b) => ACTION_NEXT.test(b.text))
  if (next) return { action: "click", text: next.text, reason: "next_label" }
  return { action: "none", reason: "no_safe_button" }
}

/**
 * Accept an LLM/drive-by-hands pick only if `text` is an exact visible control and not deny-listed.
 * Extension clicks that label; server never invents a new button.
 */
export function acceptActionPick(
  buttons: ReadonlyArray<ActionCandidate>,
  text: string | null | undefined,
  reason = "llm_hands",
): SuggestActionPick {
  const want = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : ""
  if (!want || ACTION_DENY.test(want)) return { action: "none", reason: "llm_denied" }
  const clean = normalizeActionCandidates(buttons)
  const hit = clean.find((b) => b.text === want)
  if (!hit) return { action: "none", reason: "llm_not_on_page" }
  return { action: "click", text: hit.text, reason }
}

/** Pick answers Odds rules already know (including zoekjaar → no sponsor). */
export function suggestFromRules(
  questions: ReadonlyArray<ApplyQuestion>,
  facts: Facts,
): SuggestedAnswer[] {
  const out: SuggestedAnswer[] = []
  for (const q of questions) {
    if (!q?.key || !q.label || isDeniedQuestion(q.label)) continue
    const raw = resolveAgentAnswer(q.label, facts, q.options ?? [])
    if (!raw) continue
    let answer = raw
    if ((q.kind === "radio" || q.kind === "select") && Array.isArray(q.options) && q.options.length) {
      const i = chooseOption(q.options, raw, q.label)
      if (i < 0) continue
      answer = q.options[i]
    }
    out.push({ key: q.key, answer, confidence: 0.95, evidence: evidenceFor(q.label, facts) })
  }
  return out
}
