// Cloud apply agent: Odds notifies a webhook on Apply events and may ask it to suggest
// answers (suggest-answers) or one allow-listed click (suggest-action / drive-by-hands).
// The agent never invents controls — text must match a visible label; extension clicks it.
// Secrets stay in env; the extension key and full CV are never sent.

export interface ApplyAgentEnv {
  applyAgentWebhookUrl?: string
  applyAgentWebhookSecret?: string
  /** webhook when URL set; none otherwise (or forced). */
  applyAgentBackend?: "webhook" | "none"
}

export interface ApplyQuestion {
  key: string
  label: string
  kind: string
  options?: string[]
}

export interface SuggestedAnswer {
  key: string
  answer: string
  confidence?: number
  evidence?: string
}

export type ApplyAgentEvent =
  | {
      type: "apply.started"
      posting_id: string | null
      host: string | null
      ats: string | null
      title?: string | null
      employer?: string | null
    }
  | {
      type: "apply.questions"
      posting_id: string
      host: string | null
      ats: string | null
      title?: string | null
      employer?: string | null
      questions: ApplyQuestion[]
    }
  | {
      type: "apply.status"
      posting_id: string | null
      run_id: string
      status: string
      message: string
      host?: string | null
      ats?: string | null
    }
  | {
      type: "suggest-answers"
      posting_id: string
      host: string | null
      ats: string | null
      title?: string | null
      employer?: string | null
      questions: ApplyQuestion[]
      /** Only keys a question may need — never the whole CV. */
      facts: Record<string, string>
      /** Broods answers every question (no rules, no small model). */
      broods_only?: boolean
    }

// Demographics / legal / secrets only. Never bare "family"/"parent"/"terms" — those false-hit
// "Family name", "Parent company", "Terms of the internship" and Broods never gets the question.
const DENY = /\b(gender|genre|divulgation volontaire|identit\w* de genre|race|ethnic\w*|veteran|pronouns?|lgbt\w*|sexual orientation|transgender|disabilit\w*|religio\w*|family member|immediate family|relative|spouse|sibling|famille|parents?\b.{0,40}\b(?:work|employ|company|here)|non[- ]?compet|non[- ]?concurrence|confidential|proprietary|patent|brevet|privacy statement|terms (?:and|&) conditions|terms of (?:use|service|privacy)|consent|agree to|password|captcha|verification code|credit card|social security|\bbsn\b)\b/i

const CONFIDENCE_FLOOR = 0.55
const MAX_ANSWER = 500
// Broods (gpt-6.1-sol, medium) takes ~6–8s for a quick pick and up to ~25s more when it browses; a short wait threw its replies away.
// The extension waits a little longer than each of these.
const SUGGEST_TIMEOUT_MS = 32000
const SCAN_TIMEOUT_MS = 42000
const NOTIFY_TIMEOUT_MS = 3000

export function applyAgentEnabled(env: ApplyAgentEnv): boolean {
  if (env.applyAgentBackend === "none") return false
  const url = (env.applyAgentWebhookUrl ?? "").trim()
  return Boolean(url) && /^https:\/\//i.test(url)
}

/** Labels the cloud agent must never answer (legal, demographics, secrets). */
export function isDeniedQuestion(label: string): boolean {
  const t = label.replace(/\s+/g, " ").trim()
  // Contact / org labels that look like deny tokens but are safe for Broods + rules.
  if (/\b(family name|surname|last name|given name|first name|parent company|holding company)\b/i.test(t)) return false
  return DENY.test(t)
}

/**
 * Keep only safe, form-valid suggestions. Radio/select must match an option;
 * deny-list and low confidence are dropped.
 */
export function validateSuggestedAnswers(
  questions: ReadonlyArray<ApplyQuestion>,
  suggestions: ReadonlyArray<SuggestedAnswer>,
): { accepted: SuggestedAnswer[]; rejected: Array<{ key: string; reason: string }> } {
  const byKey = new Map(questions.map((q) => [q.key, q]))
  const accepted: SuggestedAnswer[] = []
  const rejected: Array<{ key: string; reason: string }> = []
  const seen = new Set<string>()

  for (const raw of suggestions) {
    const key = typeof raw?.key === "string" ? raw.key.trim().slice(0, 300) : ""
    const answer = typeof raw?.answer === "string" ? raw.answer.replace(/\s+/g, " ").trim().slice(0, MAX_ANSWER) : ""
    if (!key || seen.has(key)) {
      rejected.push({ key: key || "(missing)", reason: "duplicate_or_missing_key" })
      continue
    }
    seen.add(key)
    const q = byKey.get(key)
    if (!q) {
      rejected.push({ key, reason: "unknown_key" })
      continue
    }
    if (isDeniedQuestion(q.label)) {
      rejected.push({ key, reason: "deny_list" })
      continue
    }
    if (!answer) {
      rejected.push({ key, reason: "empty" })
      continue
    }
    const confidence = typeof raw.confidence === "number" ? raw.confidence : 1
    if (confidence < CONFIDENCE_FLOOR) {
      rejected.push({ key, reason: "low_confidence" })
      continue
    }
    if (q.kind === "radio" || q.kind === "select") {
      // Custom dropdowns ("Select an option") list no options until opened; the extension still has to match a real one when it fills.
      const opts = q.options ?? []
      if (opts.length && !opts.includes(answer)) {
        rejected.push({ key, reason: "not_an_option" })
        continue
      }
    }
    if (q.kind === "number" && !/^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$/.test(answer)) {
      rejected.push({ key, reason: "not_a_number" })
      continue
    }
    accepted.push({
      key,
      answer,
      confidence,
      evidence: typeof raw.evidence === "string" ? raw.evidence.slice(0, 300) : undefined,
    })
  }

  return { accepted, rejected }
}

/** Facts safe to show the agent: short contact/study strings only, never free-form CV text. */
export function factsForAgent(answers: Record<string, string> | null | undefined): Record<string, string> {
  const allow = new Set([
    "first_name", "last_name", "email", "phone", "city", "country", "postcode", "address",
    "linkedin", "website", "university", "degree", "field_of_study", "graduation_date",
    "study_year", "study_status", "internship_agreement", "nationality", "gender", "work_authorization", "expected_salary",
    "start_date", "hours_per_week", "notice_period", "relocation", "onsite_ok", "current_job_title", "current_company",
    // The person's own words for open questions (why this role, what they bring) — Autofill fields meant for exactly that.
    "role_values", "notes",
  ])
  const out: Record<string, string> = {}
  if (!answers) return out
  for (const [k, v] of Object.entries(answers)) {
    if (!allow.has(k) || typeof v !== "string") continue
    const t = v.trim().slice(0, k === "role_values" || k === "notes" ? 600 : 200)
    if (t) out[k] = t
  }
  return out
}

async function postWebhook(env: ApplyAgentEnv, body: unknown, timeoutMs: number): Promise<Response | null> {
  if (!applyAgentEnabled(env)) return null
  const url = env.applyAgentWebhookUrl!.trim()
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" }
  const secret = (env.applyAgentWebhookSecret ?? "").trim()
  if (secret) headers.Authorization = `Bearer ${secret}`
  try {
    return await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return null
  }
}

/** Fire-and-forget lifecycle ping. Never throws; never blocks Apply. */
export function notifyApplyAgent(env: ApplyAgentEnv, event: ApplyAgentEvent): void {
  if (!applyAgentEnabled(env)) return
  if (event.type === "suggest-answers") return
  void postWebhook(env, { source: "odds", ...event }, NOTIFY_TIMEOUT_MS)
}

/**
 * Ask the sync webhook which visible control to click (rules + optional LLM hands).
 * `force_llm` / `exclude`: after a dead click, skip the same rule pick and let the LLM choose another.
 * Falls back to local pickSuggestAction when webhook is off / slow / invalid.
 */
export async function requestSuggestAction(
  env: ApplyAgentEnv,
  payload: {
    buttons: Array<string | { text?: string; href?: string; hint?: string }>
    url?: string | null
    status?: string | null
    host?: string | null
    force_llm?: boolean
    exclude?: string[]
  },
): Promise<{ action: "click" | "none"; text?: string; reason: string }> {
  const { acceptActionPick, pickSuggestAction } = await import("./apply-agent-suggest.ts")
  const exclude = new Set((payload.exclude ?? []).map((t) => t.replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean))
  const usable = payload.buttons.filter((b) => {
    const t = (typeof b === "string" ? b : b?.text ?? "").replace(/\s+/g, " ").trim().toLowerCase()
    return t && !exclude.has(t)
  })
  // Stuck retries: only consider controls not already tried. Never re-pick a dead label via rules fallback.
  const pool = payload.force_llm ? usable : (usable.length ? usable : payload.buttons)
  const local = pool.length ? pickSuggestAction(pool) : { action: "none" as const, reason: "all_excluded" }
  if (!applyAgentEnabled(env)) return local
  // Fast path only when not forcing LLM and rules found something not already tried.
  if (!payload.force_llm && local.action === "click") return local

  const res = await postWebhook(
    env,
    {
      source: "odds",
      type: "suggest-action",
      buttons: payload.buttons,
      url: payload.url ?? null,
      status: payload.status ?? null,
      host: payload.host ?? null,
      force_llm: Boolean(payload.force_llm),
      exclude: [...exclude],
    },
    SCAN_TIMEOUT_MS,
  )
  if (!res?.ok) return local
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return local
  }
  const action = (body as { action?: string })?.action
  const text = typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text : null
  const reason = typeof (body as { reason?: unknown })?.reason === "string" ? (body as { reason: string }).reason : "webhook"
  if (action === "click" && text) {
    const accepted = acceptActionPick(pool.length ? pool : payload.buttons, text, reason)
    if (accepted.action === "click" && !exclude.has((accepted.text || "").toLowerCase())) return accepted
  }
  if (action === "none") return { action: "none", reason }
  return local
}

/** One stuck-episode page scan: stage + optional click/fills. Never loops — caller stops after one use. */
export async function requestSuggestScan(
  env: ApplyAgentEnv,
  payload: {
    url?: string | null
    status?: string | null
    host?: string | null
    snapshot: Record<string, unknown>
  },
): Promise<{
  stage: string
  action: string
  text?: string | null
  answers: SuggestedAnswer[]
  reason: string
}> {
  const empty = { stage: "stuck", action: "none", text: null as string | null, answers: [] as SuggestedAnswer[], reason: "disabled" }
  if (!applyAgentEnabled(env)) return empty
  const res = await postWebhook(
    env,
    {
      source: "odds",
      type: "suggest-scan",
      url: payload.url ?? null,
      status: payload.status ?? null,
      host: payload.host ?? null,
      snapshot: payload.snapshot,
    },
    SCAN_TIMEOUT_MS,
  )
  if (!res?.ok) return { ...empty, reason: "webhook_error" }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ...empty, reason: "webhook_parse" }
  }
  const stage = typeof (body as { stage?: string })?.stage === "string" ? (body as { stage: string }).stage : "stuck"
  const action = typeof (body as { action?: string })?.action === "string" ? (body as { action: string }).action : "none"
  const text = typeof (body as { text?: unknown })?.text === "string" ? (body as { text: string }).text : null
  const reason = typeof (body as { reason?: unknown })?.reason === "string" ? (body as { reason: string }).reason : "webhook"
  const answers = Array.isArray((body as { answers?: unknown }).answers)
    ? ((body as { answers: SuggestedAnswer[] }).answers).filter((a) => a && typeof a.key === "string" && typeof a.answer === "string").slice(0, 8)
    : []
  return { stage, action, text, answers, reason }
}

/** Ask the agent for answers; returns validated suggestions or empty on timeout / misconfig. */
export async function suggestAnswers(
  env: ApplyAgentEnv,
  payload: Extract<ApplyAgentEvent, { type: "suggest-answers" }>,
): Promise<{ accepted: SuggestedAnswer[]; rejected: Array<{ key: string; reason: string }>; raw: number }> {
  const empty = { accepted: [] as SuggestedAnswer[], rejected: [] as Array<{ key: string; reason: string }>, raw: 0 }
  if (!applyAgentEnabled(env)) return empty
  const askable = payload.questions.filter((q) => !isDeniedQuestion(q.label))
  if (!askable.length) return empty

  const res = await postWebhook(
    env,
    {
      source: "odds",
      type: "suggest-answers",
      posting_id: payload.posting_id,
      host: payload.host,
      ats: payload.ats,
      title: payload.title ?? null,
      employer: payload.employer ?? null,
      questions: askable,
      facts: payload.facts,
      ...(payload.broods_only ? { broods_only: true } : {}),
    },
    SUGGEST_TIMEOUT_MS,
  )
  if (!res?.ok) return empty

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return empty
  }
  const list = Array.isArray((body as { answers?: unknown })?.answers)
    ? (body as { answers: SuggestedAnswer[] }).answers
    : Array.isArray(body)
      ? (body as SuggestedAnswer[])
      : []
  const validated = validateSuggestedAnswers(askable, list)
  return { ...validated, raw: list.length }
}

export function hostOf(url: string | null | undefined): string | null {
  try {
    return url ? new URL(url).hostname : null
  } catch {
    return null
  }
}
