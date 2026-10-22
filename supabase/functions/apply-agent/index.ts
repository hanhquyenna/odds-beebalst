// Edge Function `apply-agent`: sync HTTPS endpoint Odds calls via APPLY_AGENT_WEBHOOK_URL.
// Cost plan: rules first → shared ATS patterns (mcp) → cheap model only on gaps.
// Default model: gpt-6-luna (APPLY_AGENT_MODEL). Prefer OpenAI when both keys exist.
// Tiny prompts, hard token caps, max 8 answer gaps / call. Lifecycle pings never call an LLM.
// Deploy: supabase functions deploy apply-agent --project-ref ukpmpyfcnbhngkgbnkxi --use-api
// Secrets: APPLY_AGENT_WEBHOOK_SECRET; OPENAI_API_KEY (preferred) or ANTHROPIC_API_KEY; APPLY_AGENT_MODEL;
// optional APPLY_AGENT_FORWARD_URL (+ APPLY_AGENT_FORWARD_SECRET) for async Broods logging.
// Broods: APPLY_AGENT_BROODS_API_KEY + ODDS_DRIVE_AGENT_ID (odds-apply, answering in pick mode)
// + APPLY_AGENT_BROODS_USER_TOKEN_SECRET; optional APPLY_AGENT_BROODS_BASE_URL.
import {
  acceptActionPick,
  factsFromAgentPayload,
  pickSuggestAction,
  suggestFromRules,
  type ActionCandidate,
  type SuggestActionPick,
} from "../_shared/apply-agent-suggest.ts"
import { isDeniedQuestion, type ApplyQuestion, type SuggestedAnswer } from "../_shared/apply-agent.ts"

type BroodsScanPick = {
  stage: "account" | "captcha" | "form" | "review" | "stuck"
  action: "click" | "fill" | "wait_human" | "none"
  text: string | null
  answers: SuggestedAnswer[]
  reason: string
}

function broodsConfigured(): boolean {
  const key = (Deno.env.get("APPLY_AGENT_BROODS_API_KEY") ?? "").trim()
  const agentId = (Deno.env.get("ODDS_DRIVE_AGENT_ID") ?? "").trim()
  const secret = (Deno.env.get("APPLY_AGENT_BROODS_USER_TOKEN_SECRET") ?? "").trim()
  return Boolean(key && agentId && secret.startsWith("bsig_"))
}

/** Broods user token (buat_…) — same algorithm as broods `signUserToken`. */
async function broodsSignUserToken(userId: string, secret: string, ttlMs = 600_000): Promise<string> {
  const enc = new TextEncoder()
  const b64url = (bytes: Uint8Array): string => {
    let s = ""
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  }
  const payload = { userId, expiresAt: Date.now() + ttlMs }
  const body = b64url(enc.encode(JSON.stringify(payload)))
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`broods-user-token:${secret}`))
  const cryptoKey = await crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(body)))
  return `buat_${body}.${b64url(sig)}`
}

function parseBroodsPick(raw: unknown): BroodsScanPick | null {
  let parsed: Record<string, unknown> | null = null
  if (raw && typeof raw === "object" && !Array.isArray(raw)) parsed = raw as Record<string, unknown>
  else if (typeof raw === "string") {
    const a = raw.indexOf("{")
    const b = raw.lastIndexOf("}")
    if (a >= 0 && b > a) {
      try {
        parsed = JSON.parse(raw.slice(a, b + 1)) as Record<string, unknown>
      } catch {
        parsed = null
      }
    }
  }
  if (!parsed) return null
  // Browse/tool SSE chunks look like {type,value} — not apply_pick.
  if (!("action" in parsed) || !("stage" in parsed)) return null
  const stage = ["account", "captcha", "form", "review", "stuck"].includes(String(parsed.stage))
    ? String(parsed.stage) as BroodsScanPick["stage"]
    : "stuck"
  let action = ["click", "fill", "wait_human", "none"].includes(String(parsed.action))
    ? String(parsed.action) as BroodsScanPick["action"]
    : "none"
  if (stage === "account" || stage === "captcha") action = "wait_human"
  const answers = Array.isArray(parsed.answers)
    ? (parsed.answers as SuggestedAnswer[]).filter((x) => x && typeof x.key === "string" && typeof x.answer === "string").slice(0, 8)
    : []
  return {
    stage,
    action,
    text: typeof parsed.text === "string" ? parsed.text : null,
    answers,
    reason: typeof parsed.reason === "string" && parsed.reason ? parsed.reason : "broods",
  }
}

/** Broods SSE run → apply_pick. `timeoutMs` higher for free-roam browse. */
async function broodsRunPick(
  agentId: string,
  userPayload: Record<string, unknown>,
  timeoutMs: number,
): Promise<BroodsScanPick | null> {
  if (!broodsConfigured() || !agentId) return null
  const key = (Deno.env.get("APPLY_AGENT_BROODS_API_KEY") ?? "").trim()
  const secret = (Deno.env.get("APPLY_AGENT_BROODS_USER_TOKEN_SECRET") ?? "").trim()
  const base = ((Deno.env.get("APPLY_AGENT_BROODS_BASE_URL") ?? "https://gateway.broods.app").trim() || "https://gateway.broods.app").replace(/\/$/, "")
  const eventId = crypto.randomUUID()
  const conversationKey = `apply-${agentId.slice(0, 8)}-${eventId}`
  try {
    const userToken = await broodsSignUserToken("odds-apply-agent", secret)
    const start = await fetch(`${base}/v1/runs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-Broods-User-Token": userToken,
      },
      body: JSON.stringify({
        agentId,
        eventId,
        conversationKey,
        events: [{
          role: "user",
          content: [{ type: "text", text: JSON.stringify(userPayload).slice(0, 16000) }],
        }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!start.ok || !start.body) return null
    const reader = start.body.getReader()
    const dec = new TextDecoder()
    let buf = ""
    let textAcc = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const chunks = buf.split("\n")
      buf = chunks.pop() ?? ""
      for (const line of chunks) {
        if (!line.startsWith("data:")) continue
        const data = line.slice(5).trim()
        if (!data || data === "[DONE]") continue
        let ev: { type?: string; text?: string; object?: unknown; output?: unknown; error?: unknown }
        try {
          ev = JSON.parse(data) as typeof ev
        } catch {
          continue
        }
        if (ev.type === "text-delta" && typeof ev.text === "string") textAcc += ev.text
        if (ev.type === "error") return null
        const fromEv = parseBroodsPick(ev.object ?? ev.output)
        if (fromEv) {
          try {
            await reader.cancel()
          } catch {
            /* ignore */
          }
          return fromEv
        }
        if (ev.type === "finish" || ev.type === "step-finish") {
          const fromText = parseBroodsPick(textAcc)
          if (fromText) {
            try {
              await reader.cancel()
            } catch {
              /* ignore */
            }
            return fromText
          }
        }
      }
    }
    return parseBroodsPick(textAcc)
  } catch {
    return null
  }
}

/** One pick from the odds-apply agent: no run_id, so it answers in pick mode with no tools. */
async function broodsPick(userPayload: Record<string, unknown>): Promise<BroodsScanPick | null> {
  const agentId = (Deno.env.get("ODDS_DRIVE_AGENT_ID") ?? "").trim()
  return broodsRunPick(agentId, userPayload, 25000)
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } })
}

function bearerOk(req: Request): boolean {
  const want = (Deno.env.get("APPLY_AGENT_WEBHOOK_SECRET") ?? "").trim()
  if (!want) return false
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
  return got.length > 0 && got === want
}

function forwardAsync(body: unknown): void {
  const url = (Deno.env.get("APPLY_AGENT_FORWARD_URL") ?? "").trim()
  if (!url || !/^https:\/\//i.test(url)) return
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const secret = (Deno.env.get("APPLY_AGENT_FORWARD_SECRET") ?? "").trim()
  if (secret) headers.Authorization = `Bearer ${secret}`
  void fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) }).catch(() => undefined)
}

/** Cheap default: gpt-6-luna. Prefer OpenAI when both keys exist. */
const MAX_LLM_GAPS = 8
const MAX_BUTTONS_LLM = 24

function cheapModel(provider: "openai" | "anthropic"): string {
  const override = (Deno.env.get("APPLY_AGENT_MODEL") ?? "").trim()
  if (override) return override
  return provider === "openai" ? "gpt-6-luna" : "claude-3-5-haiku-latest"
}

/** One short JSON completion; OpenAI first. Empty string on miss/timeout. */
async function cheapJsonChat(system: string, user: string, maxTokens: number): Promise<string> {
  const openai = (Deno.env.get("OPENAI_API_KEY") ?? "").trim()
  const anthropic = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim()
  try {
    if (openai) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
        body: JSON.stringify({
          model: cheapModel("openai"),
          temperature: 0,
          max_completion_tokens: maxTokens,
          reasoning_effort: "none",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(3000),
      })
      if (!res.ok) return ""
      const data = await res.json()
      return String(data?.choices?.[0]?.message?.content ?? "")
    }
    if (anthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropic,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cheapModel("anthropic"),
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(3000),
      })
      if (!res.ok) return ""
      const data = await res.json()
      return Array.isArray(data?.content) ? data.content.map((c: { text?: string }) => c.text ?? "").join("") : ""
    }
  } catch {
    return ""
  }
  return ""
}

/** Every Autofill fact the server allowed (factsForAgent). Keeping only contact keys starved study/start/nationality questions. */
function sliceFacts(facts: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(facts ?? {})) {
    if (typeof v !== "string" || !v.trim()) continue
    out[k] = v.trim().slice(0, k === "cv_excerpt" ? 1500 : ["role_values", "notes", "education", "experience", "skills", "work_permit"].includes(k) ? 600 : 160)
  }
  return out
}

async function llmSuggest(
  questions: ApplyQuestion[],
  facts: Record<string, string>,
  meta: { title?: string | null; employer?: string | null; host?: string | null },
): Promise<SuggestedAnswer[]> {
  const askable = questions.filter((q) => q && !isDeniedQuestion(q.label)).slice(0, MAX_LLM_GAPS)
  if (!askable.length) return []

  const system = `Fill job-app answers. JSON only: {"answers":[{"key":"","answer":"","confidence":0.8,"evidence":""}]}.
Radio/select: answer must be an exact option. Use facts. Zoekjaar/orientation year → no sponsorship, yes right-to-work.
Facts hold Autofill plus the person's profile (nationality_group, work_permit, lives_in, education, experience, skills, cv_excerpt): REASON from them.
E.g. nationality_group Non-EU → "Non-EU"; education ending in the future → enrolled / currently studying, its degree → education type; lives_in a Dutch city → based in the Netherlands;
hours_per_week 40 → 5 days. Dates as YYYY-MM-DD. Open text (why, motivation, reasons): 1–3 plain sentences from role_values, notes, experience, education, cv_excerpt.
Never state something the facts contradict. Never invent passwords/consent. Skip only what nothing in facts supports.`

  const user = JSON.stringify({
    job: { title: meta.title ?? null, employer: meta.employer ?? null, host: meta.host ?? null },
    facts: sliceFacts(facts),
    questions: askable.map((q) => ({
      key: q.key,
      label: q.label.slice(0, 160),
      kind: q.kind,
      options: (q.options ?? []).slice(0, 12).map((o) => String(o).slice(0, 80)),
    })),
  })

  return parseAnswersJson(await cheapJsonChat(system, user, 900))
}

function parseAnswersJson(text: string): SuggestedAnswer[] {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return []
  try {
    const body = JSON.parse(text.slice(start, end + 1)) as { answers?: SuggestedAnswer[] }
    return Array.isArray(body.answers) ? body.answers : []
  } catch {
    return []
  }
}

/** LLM picks one exact visible control; server validates; extension clicks that label only. */
async function llmSuggestAction(
  buttons: ActionCandidate[],
  meta: { host?: string | null; status?: string | null; url?: string | null },
): Promise<SuggestActionPick> {
  const labels = buttons
    .map((b) => typeof b === "string" ? b : (b?.text ?? ""))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 2)
    .slice(0, MAX_BUTTONS_LLM)
  if (!labels.length) return { action: "none", reason: "no_buttons" }

  const system = `Pick one button to open/continue a job application. JSON: {"text":"<exact>"} or {"text":null}.
Copy label exactly. Cookie banner → Functional only / Reject (never Accept all). Prefer Apply now / continue directly — never Create profile / Sign up.
Never Submit/login/captcha/register/cart/share.`
  const user = JSON.stringify({ host: meta.host ?? null, status: meta.status ?? null, buttons: labels })
  const rawText = await cheapJsonChat(system, user, 48)
  if (!rawText) return { action: "none", reason: (Deno.env.get("OPENAI_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY")) ? "llm_error" : "no_llm_key" }

  const start = rawText.indexOf("{")
  const end = rawText.lastIndexOf("}")
  if (start < 0 || end <= start) return { action: "none", reason: "llm_parse" }
  try {
    const body = JSON.parse(rawText.slice(start, end + 1)) as { text?: string | null }
    return acceptActionPick(buttons, body.text, "llm_hands")
  } catch {
    return { action: "none", reason: "llm_parse" }
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json(405, { error: "POST only." })
  if (!bearerOk(req)) return json(401, { error: "Unauthorized." })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return json(400, { error: "Invalid JSON." })

  const type = String((body as { type?: string }).type ?? "")
  if (type === "apply.started" || type === "apply.questions" || type === "apply.status") {
    forwardAsync(body)
    return json(200, { status: "ok" })
  }

  if (type === "suggest-action") {
    const buttons = Array.isArray((body as { buttons?: unknown }).buttons)
      ? (body as { buttons: unknown[] }).buttons.filter((b) => typeof b === "string" || (b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string")).slice(0, 40) as ActionCandidate[]
      : []
    const forceLlm = Boolean((body as { force_llm?: boolean }).force_llm)
    const exclude = new Set(
      (Array.isArray((body as { exclude?: unknown }).exclude) ? (body as { exclude: unknown[] }).exclude : [])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.replace(/\s+/g, " ").trim().toLowerCase())
        .filter(Boolean),
    )
    const usable = buttons.filter((b) => {
      const t = (typeof b === "string" ? b : b?.text ?? "").replace(/\s+/g, " ").trim().toLowerCase()
      return t && !exclude.has(t)
    })
    // force_llm: skip rules so a dead Apply/cookie label cannot loop; LLM picks among remaining controls.
    let pick: SuggestActionPick = forceLlm
      ? { action: "none", reason: "force_llm" }
      : pickSuggestAction(usable.length ? usable : buttons)
    const host = typeof (body as { host?: string }).host === "string"
      ? (body as { host: string }).host
      : (() => {
        try {
          const u = typeof (body as { url?: string }).url === "string" ? (body as { url: string }).url : ""
          return u ? new URL(u).hostname : null
        } catch {
          return null
        }
      })()
    const status = typeof (body as { status?: string }).status === "string" ? (body as { status: string }).status : null
    const url = typeof (body as { url?: string }).url === "string" ? (body as { url: string }).url : null
    if (forceLlm || pick.action === "none") {
      const llmButtons = forceLlm ? usable : (usable.length ? usable : buttons)
      const fromLlm = await llmSuggestAction(llmButtons, { host, status, url })
      if (fromLlm.action === "click") pick = fromLlm
      else if (!forceLlm && pick.action !== "click") pick = fromLlm
      else if (forceLlm && fromLlm.action === "none" && usable.length) {
        pick = pickSuggestAction(usable)
      }
    }
    // Stuck / force: race Broods agent when mini still has no click.
    if ((forceLlm || pick.action === "none") && broodsConfigured()) {
      const broods = await broodsPick({
        kind: "suggest-action",
        host,
        status,
        url,
        buttons: (usable.length ? usable : buttons).slice(0, MAX_BUTTONS_LLM),
        exclude: [...exclude],
      })
      if (broods?.action === "click" && broods.text) {
        const accepted = acceptActionPick(usable.length ? usable : buttons, broods.text, "broods")
        if (accepted.action === "click") pick = accepted
      } else if (broods?.action === "wait_human") {
        pick = { action: "none", reason: `broods_${broods.stage}` }
      }
    }
    forwardAsync({ ...body, type: "suggest-action.done", ...pick, force_llm: forceLlm })
    return json(200, pick)
  }

  if (type === "suggest-scan") {
    const snap = (body as { snapshot?: Record<string, unknown> }).snapshot && typeof (body as { snapshot: unknown }).snapshot === "object"
      ? (body as { snapshot: Record<string, unknown> }).snapshot
      : {}
    const buttons = Array.isArray(snap.buttons) ? snap.buttons.filter((b): b is string => typeof b === "string").slice(0, 40) : []
    // The person's Autofill (server adds it to snapshot.facts) — without it Broods could only press buttons, never answer.
    const scanFacts = snap.facts && typeof snap.facts === "object" ? sliceFacts(snap.facts as Record<string, string>) : {}
    const system = `Job-application page scan. JSON only: {"stage":"account|captcha|form|review|stuck","action":"click|fill|wait_human|none","text":"<exact button or null>","answers":[{"key":"...","answer":"..."}]}.
stage=account/captcha → action=wait_human. Prefer Functional only / Reject cookies, then Apply/Next. Never Submit/login/signup/Accept all/password.
Click text must be an exact button label from the list. answers only for empty required fields with keys from snapshot.fields, from facts only (choice → exact option).`
    const user = JSON.stringify({
      host: typeof (body as { host?: string }).host === "string" ? (body as { host: string }).host : null,
      status: typeof (body as { status?: string }).status === "string" ? (body as { status: string }).status : null,
      title: snap.title ?? null,
      headings: Array.isArray(snap.headings) ? snap.headings.slice(0, 5) : [],
      errors: Array.isArray(snap.errors) ? snap.errors.slice(0, 10) : [],
      fields: Array.isArray(snap.fields) ? snap.fields.slice(0, 25) : [],
      buttons,
      facts: scanFacts,
    }).slice(0, 3200)
    const miniPromise = cheapJsonChat(system, user, 120)
    const broodsPromise = broodsConfigured()
      ? broodsPick({
        kind: "suggest-scan",
        host: typeof (body as { host?: string }).host === "string" ? (body as { host: string }).host : null,
        status: typeof (body as { status?: string }).status === "string" ? (body as { status: string }).status : null,
        url: typeof (body as { url?: string }).url === "string" ? (body as { url: string }).url : null,
        title: snap.title ?? null,
        headings: Array.isArray(snap.headings) ? snap.headings.slice(0, 5) : [],
        errors: Array.isArray(snap.errors) ? snap.errors.slice(0, 10) : [],
        fields: Array.isArray(snap.fields) ? snap.fields.slice(0, 25) : [],
        buttons,
        facts: scanFacts,
      })
      : Promise.resolve(null)
    const [rawText, broods] = await Promise.all([miniPromise, broodsPromise])
    const fallback = { stage: "stuck" as const, action: "none" as const, text: null as string | null, answers: [] as SuggestedAnswer[], reason: rawText ? "llm_parse" : "no_llm" }

    const fromBroods = (): typeof fallback | null => {
      if (!broods) return null
      let text: string | null = null
      let action = broods.action
      if (action === "click" && broods.text) {
        const pick = acceptActionPick(buttons, broods.text, "broods_scan")
        if (pick.action === "click") text = pick.text ?? null
        else action = "none"
      }
      return {
        stage: broods.stage,
        action,
        text,
        answers: broods.answers,
        reason: broods.reason.startsWith("broods") ? broods.reason : `broods_${broods.reason}`,
      }
    }

    if (!rawText) {
      const out = fromBroods() ?? fallback
      forwardAsync({ ...body, type: "suggest-scan.done", ...out })
      return json(200, out)
    }
    const start = rawText.indexOf("{")
    const end = rawText.lastIndexOf("}")
    if (start < 0 || end <= start) {
      const out = fromBroods() ?? fallback
      forwardAsync({ ...body, type: "suggest-scan.done", ...out })
      return json(200, out)
    }
    try {
      const parsed = JSON.parse(rawText.slice(start, end + 1)) as {
        stage?: string
        action?: string
        text?: string | null
        answers?: SuggestedAnswer[]
      }
      const stage = ["account", "captcha", "form", "review", "stuck"].includes(String(parsed.stage)) ? String(parsed.stage) : "stuck"
      let action = ["click", "fill", "wait_human", "none"].includes(String(parsed.action)) ? String(parsed.action) : "none"
      if (stage === "account" || stage === "captcha") action = "wait_human"
      let text: string | null = null
      if (action === "click" && typeof parsed.text === "string") {
        const pick = acceptActionPick(buttons, parsed.text, "llm_scan")
        if (pick.action === "click") text = pick.text ?? null
        else action = "none"
      }
      const answers = Array.isArray(parsed.answers)
        ? parsed.answers.filter((a) => a && typeof a.key === "string" && typeof a.answer === "string").slice(0, 8)
        : []
      let out = { stage, action, text, answers, reason: "llm_scan" }
      // Prefer Broods when mini has no useful click/fill.
      if ((action === "none" || (action === "click" && !text)) && broods) {
        const b = fromBroods()
        if (b && (b.action !== "none" || b.stage === "account" || b.stage === "captcha")) out = b
      }
      forwardAsync({ ...body, type: "suggest-scan.done", ...out })
      return json(200, out)
    } catch {
      const out = fromBroods() ?? fallback
      forwardAsync({ ...body, type: "suggest-scan.done", ...out })
      return json(200, out)
    }
  }

  if (type !== "suggest-answers") {
    forwardAsync(body)
    return json(200, { status: "ok", answers: [] })
  }

  const questions: ApplyQuestion[] = Array.isArray((body as { questions?: unknown }).questions)
    ? ((body as { questions: ApplyQuestion[] }).questions).filter((q) => q && typeof q.key === "string" && typeof q.label === "string").slice(0, 30)
    : []
  const factsMap = (body as { facts?: Record<string, string> }).facts && typeof (body as { facts: unknown }).facts === "object"
    ? (body as { facts: Record<string, string> }).facts
    : {}
  const postingId = typeof (body as { posting_id?: string }).posting_id === "string" ? (body as { posting_id: string }).posting_id : null
  const facts = factsFromAgentPayload(factsMap, postingId)

  // Broods-only: every question goes to Broods (one call for the whole step); no rules, no small model.
  if ((body as { broods_only?: boolean }).broods_only === true) {
    const askable = questions.filter((q) => !isDeniedQuestion(q.label)).slice(0, 30)
    const broods = askable.length && broodsConfigured() ? await broodsPick({
      kind: "suggest-answers",
      title: (body as { title?: string | null }).title ?? null,
      employer: (body as { employer?: string | null }).employer ?? null,
      host: (body as { host?: string | null }).host ?? null,
      questions: askable.map((q) => ({
        key: q.key,
        label: q.label.slice(0, 200),
        kind: q.kind,
        options: (q.options ?? []).slice(0, 60).map((o) => String(o).slice(0, 120)),
      })),
      facts: sliceFacts(factsMap),
    }, 28000) : null
    const want = new Set(askable.map((q) => q.key))
    const answers = (broods?.answers ?? []).filter((a) => want.has(a.key) && a.answer.trim()).map((a) => ({ key: a.key, answer: a.answer, confidence: 0.8, evidence: "broods" }))
    forwardAsync({ ...body, type: "suggest-answers.done", n: answers.length, broods_only: true })
    return json(200, { answers })
  }
  const fromRules = suggestFromRules(questions, facts)
  const have = new Set(fromRules.map((a) => a.key))
  const gaps = questions.filter((q) => !have.has(q.key) && !isDeniedQuestion(q.label)).slice(0, MAX_LLM_GAPS)
  const fromLlm = gaps.length ? await llmSuggest(gaps, factsMap, {
    title: (body as { title?: string | null }).title,
    employer: (body as { employer?: string | null }).employer,
    host: (body as { host?: string | null }).host,
  }) : []

  const answers = [...fromRules, ...fromLlm.filter((a) => a && typeof a.key === "string" && !have.has(a.key))]
  // Broods answers what rules and the small model left open, from the same Autofill facts (the server re-checks every answer).
  const filled = new Set(answers.map((a) => a.key))
  const left = gaps.filter((q) => !filled.has(q.key))
  if (left.length && broodsConfigured()) {
    const broods = await broodsPick({
      kind: "suggest-answers",
      title: (body as { title?: string | null }).title ?? null,
      employer: (body as { employer?: string | null }).employer ?? null,
      host: (body as { host?: string | null }).host ?? null,
      questions: left.map((q) => ({
        key: q.key,
        label: q.label.slice(0, 160),
        kind: q.kind,
        options: (q.options ?? []).slice(0, 20).map((o) => String(o).slice(0, 80)),
      })),
      facts: sliceFacts(factsMap),
    })
    const want = new Set(left.map((q) => q.key))
    for (const a of broods?.answers ?? []) {
      if (want.has(a.key) && !filled.has(a.key) && a.answer.trim()) {
        filled.add(a.key)
        answers.push({ key: a.key, answer: a.answer, confidence: 0.8, evidence: "broods" })
      }
    }
  }
  forwardAsync({ ...body, type: "suggest-answers.done", n: answers.length })
  return json(200, { answers })
})
