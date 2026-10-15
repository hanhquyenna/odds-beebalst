// Broods drives the person's own Chrome through the Odds extension.
//
//   Broods agent (odds-apply) ──MCP tools──▶ POST /mcp/drive (this file, shared secret) ──queue──▶ drive_commands
//   Odds extension (the person's tab) ──/ext/drive-next──▶ takes a command, does it in the tab ──/ext/drive-result──▶ back to Broods
//
// One run per application (drive_runs). Broods only reaches a run by its id, the extension only with the person's own key. The extension
// enforces the hard rules itself (never Submit/Send, passwords, captchas, consent); the tools here only carry commands and results.
// Secrets: ODDS_DRIVE_SECRET (also set in Broods as ODDS_DRIVE_SECRET), ODDS_DRIVE_AGENT_ID, APPLY_AGENT_BROODS_API_KEY,
// APPLY_AGENT_BROODS_USER_TOKEN_SECRET, optional APPLY_AGENT_BROODS_BASE_URL.

// deno-lint-ignore no-explicit-any
type Json = any
type Env = { url: string; serviceKey?: string }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-odds-drive-key, mcp-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}
const TOOL_WAIT_MS = 25_000
const NEXT_WAIT_MS = 20_000
const MAX_STEPS = 120
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function svc(env: Env, path: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.serviceKey!, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`db ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const runOf = async (env: Env, id: string): Promise<Json | null> => (UUID.test(id) ? (await svc(env, `drive_runs?id=eq.${id}&select=*`))?.[0] ?? null : null)
const live = (run: Json): boolean => run?.status === "running" && Date.parse(run.expires_at) > Date.now()

// ---------------------------------------------------------------- MCP for Broods

const TOOLS = [
  {
    name: "read_page",
    description: "Read the application tab now: url, title, headings, errors, captcha/password flags, every question (id, label, kind, required, filled, value, known options, consent) and every button (id, text, href, blocked). Call it first and after every click.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
  },
  {
    name: "fill",
    description: "Answer questions on the page: fields [{id, value}] from the last read_page. Text is typed; for select/radio/choice/combobox/listbox the value must be one of its options (call options first when none are listed); a non-consent checkbox takes 'yes' or 'no'. Returns per-field ok/value/error.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, fields: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: "string" } }, required: ["id", "value"] } } }, required: ["run_id", "fields"] },
  },
  {
    name: "options",
    description: "Open a dropdown (by field id) and list its choices, for dropdowns read_page shows without options.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, id: { type: "string" } }, required: ["run_id", "id"] },
  },
  {
    name: "upload_cv",
    description: "Attach the person's CV from Odds to a file field (by field id). Only for CV/resume fields.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, id: { type: "string" } }, required: ["run_id", "id"] },
  },
  {
    name: "click",
    description: "Press a button or link (by button id): Apply, Next, Continue, Review, a cookie 'reject/necessary only', a job link. Never Submit/Send (refused). The page may change: read_page next.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, id: { type: "string" } }, required: ["run_id", "id"] },
  },
  {
    name: "screenshot",
    description: "See the tab as an image (when read_page cannot show or move what you need: custom widgets, overlays, canvas). Returns the image and its pixel size.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
  },
  {
    name: "click_at",
    description: "Click at a point (x, y in pixels of the last screenshot). Submit/Send and password fields are refused. screenshot or read_page next.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, x: { type: "number" }, y: { type: "number" } }, required: ["run_id", "x", "y"] },
  },
  {
    name: "type_text",
    description: "Type text into the field that has focus (click_at it first). append: true keeps what is there.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, text: { type: "string" }, append: { type: "boolean" } }, required: ["run_id", "text"] },
  },
  {
    name: "press_key",
    description: "Press one key on the focused element: Enter, Tab, Escape, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Space, Backspace.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, key: { type: "string" } }, required: ["run_id", "key"] },
  },
  {
    name: "scroll",
    description: "Scroll the page by dy pixels (positive = down).",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, dy: { type: "number" } }, required: ["run_id"] },
  },
  {
    name: "back",
    description: "Go back one page in the tab (when a click landed somewhere unrelated, e.g. a search page). read_page next.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
  },
  {
    name: "wait",
    description: "Wait a few seconds (1-8) for a slow page, then read_page.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, seconds: { type: "number" } }, required: ["run_id"] },
  },
  {
    name: "finish",
    description: "End the run. stage: 'review' (everything filled, only Submit left for the person), 'needs_you' (a captcha, sign-in/account, or questions only the person can answer — list them in questions), 'stuck' (cannot move on). message: one plain sentence for the person.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, stage: { type: "string", enum: ["review", "needs_you", "stuck"] }, message: { type: "string" }, questions: { type: "array", items: { type: "string" } } }, required: ["run_id", "stage", "message"] },
  },
]

async function callTool(env: Env, name: string, args: Json): Promise<{ text: string; error?: boolean; image?: string }> {
  const run = await runOf(env, String(args?.run_id ?? ""))
  if (!run) return { text: "Unknown run_id.", error: true }
  if (name === "finish") {
    const stage = ["review", "needs_you", "stuck"].includes(args.stage) ? args.stage : "stuck"
    const questions = Array.isArray(args.questions) ? args.questions.filter((q: unknown) => typeof q === "string").slice(0, 20) : []
    const message = `${String(args.message ?? "").slice(0, 600)}${questions.length ? ` Questions for you: ${questions.join("; ").slice(0, 380)}` : ""}`.trim()
    await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: stage, message, updated_at: new Date().toISOString() }) })
    return { text: "Finished." }
  }
  if (!live(run)) return { text: `This run is over (${run.status}). Stop.`, error: true }
  if (run.steps >= MAX_STEPS) return { text: "Step limit reached: call finish now.", error: true }
  if (name === "wait") {
    await sleep(Math.min(8, Math.max(1, Number(args.seconds) || 2)) * 1000)
    return { text: "Waited. read_page next." }
  }
  if (!["read_page", "fill", "options", "upload_cv", "click", "back", "screenshot", "click_at", "type_text", "press_key", "scroll"].includes(name)) return { text: `Unknown tool ${name}.`, error: true }
  const { run_id: _r, ...rest } = args ?? {}
  const [cmd] = await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: name, args: rest }) })
  await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ steps: run.steps + 1, updated_at: new Date().toISOString() }) })
  for (let waited = 0; waited < TOOL_WAIT_MS; waited += 400) {
    await sleep(400)
    const row = (await svc(env, `drive_commands?id=eq.${cmd.id}&select=status,result`))?.[0]
    if (row?.status === "done") {
      const res = row.result ?? {}
      // A screenshot goes back as an image the model can see; the rest as JSON text.
      if (name === "screenshot" && typeof res.image === "string") {
        // The image is only needed once: drop it from the stored row.
        void svc(env, `drive_commands?id=eq.${cmd.id}`, { method: "PATCH", body: JSON.stringify({ result: { ...res, image: "(sent)" } }) }).catch(() => undefined)
        return { text: JSON.stringify({ width: res.width, height: res.height, note: res.note }), image: res.image }
      }
      return { text: JSON.stringify(res).slice(0, 30_000) }
    }
  }
  return { text: "The browser did not answer in time (the page may be loading). Call read_page again.", error: true }
}

/** POST /mcp/drive: MCP (Streamable HTTP, stateless JSON) for the Broods agent. */
export async function handleDriveMcp(req: Request, env: Env): Promise<Response> {
  const reply = (body: Json, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } })
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  // TEMP debug: what Broods sends (no secrets stored).
  const debug = (method: string, authed: boolean) => svc(env, "drive_mcp_debug", { method: "POST", body: JSON.stringify({ method, http: req.method, authed, ua: (req.headers.get("user-agent") ?? "").slice(0, 120), accept: (req.headers.get("accept") ?? "").slice(0, 120) }) }).catch(() => undefined)
  if (req.method !== "POST") { await debug("-", false); return reply({ error: "POST only." }, 405) }
  const want = (Deno.env.get("ODDS_DRIVE_SECRET") ?? "").trim()
  const got = (req.headers.get("x-odds-drive-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim()
  const authorized = Boolean(want) && got === want
  const msg = await req.json().catch(() => null)
  // Discovery (initialize, tools/list) is open: Broods lists the tools when it syncs, before any secret is attached. Every tool call needs the secret.
  await debug((Array.isArray(msg) ? msg : [msg]).map((m: Json) => m?.method).join(","), Boolean(want) && ((req.headers.get("x-odds-drive-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim() === want))
  const calls = (Array.isArray(msg) ? msg : [msg]).some((m: Json) => m?.method === "tools/call")
  if (calls && !authorized) return reply({ jsonrpc: "2.0", id: Array.isArray(msg) ? null : msg?.id ?? null, error: { code: -32001, message: "Unauthorized." } }, 401)
  // MCP 2026-07-28: every result names its kind; "complete" for all of ours (older clients ignore the extra key).
  const done = (r: Json): Json => (r && typeof r === "object" && "result" in r ? { ...r, result: { resultType: "complete", ...r.result } } : r)
  const one = async (m: Json): Promise<Json | null> => done(await answer(m))
  const answer = async (m: Json): Promise<Json | null> => {
    const id = m?.id
    // Newer stateless MCP clients (Broods) open with server/discover instead of initialize: same server card, plus the tools.
    // MCP 2026-07-28 (stateless): server/discover advertises versions + capabilities; versions after that ride in each request's _meta.
    if (m?.method === "server/discover") return { jsonrpc: "2.0", id, result: { supportedVersions: ["2026-07-28", "2025-06-18", "2025-03-26", "2024-11-05"], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "odds-browser", version: "1.0.0" }, instructions: "Browser tools for one Odds application run: always pass run_id." } }
    if (m?.method === "initialize") return { jsonrpc: "2.0", id, result: { protocolVersion: m?.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "odds-browser", version: "1.0.0" } } }
    if (typeof m?.method === "string" && m.method.startsWith("notifications/")) return null
    if (m?.method === "ping") return { jsonrpc: "2.0", id, result: {} }
    // 2026-07-28 list results carry their cache rules: the tool list is the same for everyone, kept 5 minutes.
    if (m?.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS, ttlMs: 300_000, cacheScope: "public" } }
    if (m?.method === "tools/call") {
      const out = await callTool(env, String(m.params?.name ?? ""), m.params?.arguments ?? {}).catch((e) => ({ text: `Error: ${String(e?.message ?? e)}`, error: true }))
      return { jsonrpc: "2.0", id, result: { content: [...("image" in out && out.image ? [{ type: "image", data: out.image, mimeType: "image/jpeg" }] : []), { type: "text", text: out.text }], ...(out.error ? { isError: true } : {}) } }
    }
    return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: "Method not found" } }
  }
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map(one))).filter((x) => x !== null)
    return out.length ? reply(out) : new Response(null, { status: 202, headers: CORS })
  }
  const out = await one(msg)
  return out === null ? new Response(null, { status: 202, headers: CORS }) : reply(out)
}

// ---------------------------------------------------------------- Broods run (one agent)

async function signUserToken(userId: string, secret: string, ttlMs = 3_600_000): Promise<string> {
  const enc = new TextEncoder()
  const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  const body = b64url(enc.encode(JSON.stringify({ userId, expiresAt: Date.now() + ttlMs })))
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`broods-user-token:${secret}`))
  const key = await crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return `buat_${body}.${b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body))))}`
}

/** Start the Broods agent on a run with the person's own context; it then drives through the tools. Reads the stream in the background. */
async function startBroods(env: Env, run: Json, job: Json, facts: Record<string, string>): Promise<string | null> {
  const key = (Deno.env.get("APPLY_AGENT_BROODS_API_KEY") ?? "").trim()
  const agentId = (Deno.env.get("ODDS_DRIVE_AGENT_ID") ?? "").trim()
  const secret = (Deno.env.get("APPLY_AGENT_BROODS_USER_TOKEN_SECRET") ?? "").trim()
  if (!key || !agentId || !secret) return "Broods is not set up on the server."
  const base = ((Deno.env.get("APPLY_AGENT_BROODS_BASE_URL") ?? "https://gateway.broods.app").trim() || "https://gateway.broods.app").replace(/\/$/, "")
  const task = {
    run_id: run.id,
    job: { title: job?.title ?? null, employer: job?.employer_display ?? job?.employer ?? null, url: run.url },
    person: facts,
    goal: "Apply to this job in the person's browser tab with the odds-browser tools until only Submit is left (finish review), or something only the person can do (finish needs_you).",
  }
  const res = await fetch(`${base}/v1/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream", "X-Broods-User-Token": await signUserToken(run.user_id, secret) },
    body: JSON.stringify({ agentId, eventId: crypto.randomUUID(), conversationKey: `odds-drive-${run.id}`, events: [{ role: "user", content: [{ type: "text", text: JSON.stringify(task).slice(0, 20_000) }] }] }),
  }).catch(() => null)
  if (!res?.ok || !res.body) return `Broods did not start (${res?.status ?? "no answer"}).`
  // Keep reading so the run is not dropped; the agent reports its end through the finish tool, not this stream.
  const reader = res.body.getReader()
  const drain = (async () => {
    const dec = new TextDecoder()
    let tail = ""
    const until = Date.now() + 380_000
    try {
      while (Date.now() < until) {
        const { done, value } = await reader.read()
        if (done) break
        tail = (tail + dec.decode(value, { stream: true })).slice(-4000)
      }
    } catch { /* stream closed */ }
    const fresh = await runOf(env, run.id).catch(() => null)
    // The agent ended without calling finish: say so, never a silent run.
    if (fresh?.status === "running") {
      const err = /"type":"error","error":"([^"]{0,200})/.exec(tail)?.[1]
      await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "stuck", message: err ? `Broods stopped: ${err}` : "Broods stopped before the end of the form.", updated_at: new Date().toISOString() }) }).catch(() => undefined)
    }
  })()
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(drain)
  return null
}

// ---------------------------------------------------------------- extension routes

/** /ext/drive-start | drive-next | drive-result for the person's own extension. */
export async function driveExt(route: string, req: Request, env: Env, userId: string, ctx: { facts: () => Promise<Record<string, string>>; job: (url: string) => Promise<Json | null> }): Promise<Response> {
  const json = (status: number, body: Json) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  const body = await req.json().catch(() => null)
  if (route === "drive-start") {
    // A page load in the same application resumes its run (Broods is still driving), never a second agent.
    if (typeof body?.run_id === "string") {
      const run = await runOf(env, body.run_id)
      if (run && run.user_id === userId && live(run)) return json(200, { run_id: run.id, resumed: true })
    }
    const url = String(body?.url || body?.page || "").slice(0, 2000)
    if (!/^https:\/\//.test(url)) return json(400, { error: "No application address." })
    const job = await ctx.job(url).catch(() => null)
    const [run] = await svc(env, "drive_runs", { method: "POST", body: JSON.stringify({ user_id: userId, posting_id: job?.id ?? null, url: String(body?.page || url).slice(0, 2000) }) })
    const problem = await startBroods(env, run, job, await ctx.facts().catch(() => ({})))
    if (problem) {
      await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "failed", message: problem }) }).catch(() => undefined)
      return json(200, { error: problem })
    }
    return json(200, { run_id: run.id, resumed: false })
  }
  const run = await runOf(env, String(body?.run_id ?? ""))
  if (!run || run.user_id !== userId) return json(404, { error: "No such run." })
  if (route === "drive-result") {
    const id = Number(body?.id)
    if (!Number.isInteger(id)) return json(400, { error: "Bad command." })
    await svc(env, `drive_commands?id=eq.${id}&run_id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "done", result: body?.result ?? {}, done_at: new Date().toISOString() }) })
    return json(200, { ok: true })
  }
  if (route === "drive-next") {
    for (let waited = 0; waited < NEXT_WAIT_MS; waited += 400) {
      const queued = (await svc(env, `drive_commands?run_id=eq.${run.id}&status=eq.queued&order=id.asc&limit=1&select=id,tool,args`))?.[0]
      if (queued) {
        // Taken once: a reloaded page never runs the same command twice.
        const taken = await svc(env, `drive_commands?id=eq.${queued.id}&status=eq.queued`, { method: "PATCH", body: JSON.stringify({ status: "taken", taken_at: new Date().toISOString() }) })
        if (Array.isArray(taken) && taken.length) return json(200, { command: queued, steps: run.steps })
      }
      const fresh = await runOf(env, run.id)
      if (!fresh || !live(fresh)) return json(200, { done: true, status: fresh?.status ?? "failed", message: fresh?.message ?? "The run ended." })
      await sleep(400)
    }
    return json(200, { idle: true, steps: run.steps })
  }
  return json(404, { error: "Unknown route." })
}
