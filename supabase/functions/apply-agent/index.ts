// Edge Function `apply-agent`: sync HTTPS endpoint Odds calls via APPLY_AGENT_WEBHOOK_URL.
// Ladder: extension rules and recoverFill, then Broods odds-apply (cx/gpt-6-luna: apply-stuck, then apply-roam), then a person.
// No OpenAI or Anthropic call on apply, fill, or answer decisions. Lifecycle pings never call a model.
// Deploy: supabase functions deploy apply-agent --project-ref ukpmpyfcnbhngkgbnkxi --use-api
// Secrets: APPLY_AGENT_WEBHOOK_SECRET;
// optional APPLY_AGENT_FORWARD_URL (+ APPLY_AGENT_FORWARD_SECRET) for async Broods logging.
// Broods: APPLY_AGENT_BROODS_API_KEY + APPLY_AGENT_BROODS_AGENT_ID (stuck) + optional ROAM_AGENT_ID
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
  const agentId = (Deno.env.get("APPLY_AGENT_BROODS_AGENT_ID") ?? "").trim()
  const secret = (Deno.env.get("APPLY_AGENT_BROODS_USER_TOKEN_SECRET") ?? "").trim()
  return Boolean(key && agentId && secret.startsWith("bsig_"))
}

function broodsRoamAgentId(): string {
  return (Deno.env.get("APPLY_AGENT_BROODS_ROAM_AGENT_ID") ?? "").trim()
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

/** Stuck pick (~6–8s; gpt-6.1-sol, medium effort). */
async function broodsStuckPick(userPayload: Record<string, unknown>, timeoutMs = 15000): Promise<BroodsScanPick | null> {
  const agentId = (Deno.env.get("APPLY_AGENT_BROODS_AGENT_ID") ?? "").trim()
  return broodsRunPick(agentId, userPayload, timeoutMs)
}

/** Free-roam browse when stuck pick is empty (~12s). */
async function broodsRoamPick(userPayload: Record<string, unknown>): Promise<BroodsScanPick | null> {
  const roamId = broodsRoamAgentId()
  if (!roamId) return null
  return broodsRunPick(roamId, { ...userPayload, roam: true }, 25000)
}

async function broodsBestPick(userPayload: Record<string, unknown>): Promise<BroodsScanPick | null> {
  const stuck = await broodsStuckPick(userPayload)
  if (stuck && (stuck.action !== "none" || stuck.stage === "account" || stuck.stage === "captcha")) return stuck
  const roam = await broodsRoamPick(userPayload)
  return roam ?? stuck
}

/** Questions the rules left open: apply-stuck, then apply-roam for whatever stuck did not answer. */
async function broodsFillGaps(payload: Record<string, unknown>, questions: ApplyQuestion[], timeoutMs = 15000): Promise<SuggestedAnswer[]> {
  const pack = (qs: ApplyQuestion[]) => qs.map((q) => ({
    key: q.key,
    label: q.label.slice(0, 200),
    kind: q.kind,
    options: (q.options ?? []).slice(0, 60).map((o) => String(o).slice(0, 120)),
  }))
  const take = (rows: SuggestedAnswer[] | undefined, into: SuggestedAnswer[], have: Set<string>) => {
    for (const a of rows ?? []) {
      if (a && typeof a.key === "string" && a.answer.trim() && !have.has(a.key)) {
        have.add(a.key)
        into.push(a)
      }
    }
  }
  const out: SuggestedAnswer[] = []
  const have = new Set<string>()
  const stuck = await broodsStuckPick({ ...payload, questions: pack(questions) }, timeoutMs)
  take(stuck?.answers, out, have)
  const left = questions.filter((q) => !have.has(q.key))
  if (left.length) {
    const roam = await broodsRoamPick({ ...payload, questions: pack(left) })
    take(roam?.answers, out, have)
  }
  return out
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

const MAX_GAPS = 8
const MAX_BUTTONS = 24

/** Every Autofill fact the server allowed (factsForAgent). Keeping only contact keys starved study/start/nationality questions. */
function sliceFacts(facts: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(facts ?? {})) {
    if (typeof v !== "string" || !v.trim()) continue
    out[k] = v.trim().slice(0, k === "cv_excerpt" ? 1500 : ["role_values", "notes", "education", "experience", "skills", "work_permit"].includes(k) ? 600 : 160)
  }
  return out
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
    // force_llm: skip the dead rule label and ask Broods. Rules run again only when Broods is not configured.
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
      if (broodsConfigured()) {
        const broods = await broodsBestPick({
          kind: "suggest-action",
          host,
          status,
          url,
          buttons: (usable.length ? usable : buttons).slice(0, MAX_BUTTONS),
          exclude: [...exclude],
        })
        if (broods?.action === "click" && broods.text) {
          const accepted = acceptActionPick(usable.length ? usable : buttons, broods.text, "broods")
          if (accepted.action === "click") pick = accepted
        } else if (broods?.action === "wait_human") {
          pick = { action: "none", reason: `broods_${broods.stage}` }
        }
      } else if (forceLlm && usable.length) {
        pick = pickSuggestAction(usable)
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
    const broods = broodsConfigured()
      ? await broodsBestPick({
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
      : null
    const fallback = { stage: "stuck" as const, action: "none" as const, text: null as string | null, answers: [] as SuggestedAnswer[], reason: "no_broods" }
    let out = fallback
    if (broods) {
      let text: string | null = null
      let action = broods.action
      if (action === "click" && broods.text) {
        const pick = acceptActionPick(buttons, broods.text, "broods_scan")
        if (pick.action === "click") text = pick.text ?? null
        else action = "none"
      }
      out = {
        stage: broods.stage,
        action,
        text,
        answers: broods.answers,
        reason: broods.reason.startsWith("broods") ? broods.reason : `broods_${broods.reason}`,
      }
    }
    forwardAsync({ ...body, type: "suggest-scan.done", ...out })
    return json(200, out)
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

  const answerPayload = {
    kind: "suggest-answers",
    title: (body as { title?: string | null }).title ?? null,
    employer: (body as { employer?: string | null }).employer ?? null,
    host: (body as { host?: string | null }).host ?? null,
    facts: sliceFacts(factsMap),
  }
  // Broods-only: every question goes to Broods (apply-stuck, then apply-roam). No rules.
  if ((body as { broods_only?: boolean }).broods_only === true) {
    const askable = questions.filter((q) => !isDeniedQuestion(q.label)).slice(0, 30)
    const fromBroods = askable.length && broodsConfigured() ? await broodsFillGaps(answerPayload, askable, 28000) : []
    const want = new Set(askable.map((q) => q.key))
    const answers = fromBroods.filter((a) => want.has(a.key)).map((a) => ({ key: a.key, answer: a.answer, confidence: 0.8, evidence: "broods" }))
    forwardAsync({ ...body, type: "suggest-answers.done", n: answers.length, broods_only: true })
    return json(200, { answers })
  }
  const fromRules = suggestFromRules(questions, facts)
  const have = new Set(fromRules.map((a) => a.key))
  const gaps = questions.filter((q) => !have.has(q.key) && !isDeniedQuestion(q.label)).slice(0, MAX_GAPS)
  const answers = [...fromRules]
  // Gaps go straight to Broods (apply-stuck, then apply-roam). The server re-checks every answer.
  if (gaps.length && broodsConfigured()) {
    const filled = new Set(have)
    for (const a of await broodsFillGaps(answerPayload, gaps)) {
      if (filled.has(a.key) || !a.answer.trim()) continue
      filled.add(a.key)
      answers.push({ key: a.key, answer: a.answer, confidence: 0.8, evidence: "broods" })
    }
  }
  forwardAsync({ ...body, type: "suggest-answers.done", n: answers.length })
  return json(200, { answers })
})
