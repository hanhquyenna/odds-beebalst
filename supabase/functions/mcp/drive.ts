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
/** No step from Broods for this long while the run says running (a step takes seconds): its turn ended without finish. */
const QUIET_MS = 100_000
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
/** The person typed or clicked in the form in the last 20 s. */
const personBusy = (run: Json): boolean => Boolean(run?.person_active_at) && Date.now() - Date.parse(run.person_active_at) < 20_000
const live = (run: Json): boolean => run?.status === "running" && Date.parse(run.expires_at) > Date.now()

// ---------------------------------------------------------------- MCP for Broods

const BASE_TOOLS = [
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
    name: "upload_letter",
    description: "Attach the person's cover letter / motivation letter for this job from Odds to a file field (by field id). Only when the task says has_cover_letter; otherwise finish needs_you with reason 'letter'.",
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
    name: "open_job",
    description: "Open this job's own link again in the tab (when the tab ended up somewhere unrelated — a search page, a blank or warmup page, another job — and back does not help). read_page next.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
  },
  {
    name: "wait",
    description: "Wait a few seconds (1-8) for a slow page, then read_page.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, seconds: { type: "number" } }, required: ["run_id"] },
  },
  {
    name: "finish",
    description: "End the run. stage: 'review' (everything filled, only Submit left for the person), 'needs_you' (something only the person can do), 'stuck' (cannot move on). reason (for needs_you/stuck): 'captcha', 'account' (sign in / make an account), 'questions' (only the person can answer — list them in questions), 'letter' (a cover/motivation letter is asked and none is in Odds), 'closed' (the job no longer takes applications), 'other'. message: one plain sentence for the person.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, stage: { type: "string", enum: ["review", "needs_you", "stuck"] }, reason: { type: "string", enum: ["captcha", "account", "questions", "letter", "closed", "other"] }, message: { type: "string" }, questions: { type: "array", items: { type: "string" } } }, required: ["run_id", "stage", "message"] },
  },
]
/** Every tool takes the line Broods writes for the person about this step: the tracker shows it live. */
const SAY = { type: "string", description: "One short line for the person, in plain words: what you are doing now and why (shown live in their tracker), e.g. 'Filling your details from Autofill'." }
const TOOLS = BASE_TOOLS.map((t) => (t.name === "finish" ? t : { ...t, inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, say: SAY } } }))
const REASONS = ["captcha", "account", "questions", "letter", "closed", "other"]

async function callTool(env: Env, name: string, args: Json): Promise<{ text: string; error?: boolean; image?: string }> {
  const run = await runOf(env, String(args?.run_id ?? ""))
  if (!run) return { text: "Unknown run_id.", error: true }
  if (name === "finish") {
    const stage = ["review", "needs_you", "stuck"].includes(args.stage) ? args.stage : "stuck"
    const questions = Array.isArray(args.questions) ? args.questions.filter((q: unknown) => typeof q === "string").slice(0, 20) : []
    const message = `${String(args.message ?? "").slice(0, 600)}${questions.length ? ` Questions for you: ${questions.join("; ").slice(0, 380)}` : ""}`.trim()
    const reason = stage === "review" ? null : REASONS.includes(args.reason) ? args.reason : questions.length ? "questions" : "other"
    await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: stage, reason, message, last_note: String(args.message ?? "").slice(0, 300) || null, updated_at: new Date().toISOString() }) })
    // Questions only the person can answer: they appear in Odds (the job's page) to answer there; saving them carries Broods on.
    if (questions.length && run.posting_id) {
      const slug = (q: string): string => `broods_${q.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60)}`
      await svc(env, "application_prompts?on_conflict=user_id,posting_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: run.user_id, posting_id: run.posting_id, questions: questions.slice(0, 30).map((q: string) => ({ key: slug(q), label: q.slice(0, 300), kind: "text" })), updated_at: new Date().toISOString() }) }).catch(() => undefined)
    }
    return { text: "Finished." }
  }
  if (!live(run)) return { text: `This run is over (${run.status}). Stop.`, error: true }
  if (run.steps >= MAX_STEPS) return { text: "Step limit reached: call finish now.", error: true }
  if (name === "wait") {
    await sleep(Math.min(8, Math.max(1, Number(args.seconds) || 2)) * 1000)
    return { text: "Waited. read_page next." }
  }
  // The person is filling in the form themselves: Broods waits for them to stop (20 s of quiet), then carries on around what they entered.
  for (let waited = 0; personBusy(run) && waited < 20_000; waited += 1000) {
    await sleep(1000)
    Object.assign(run, (await runOf(env, run.id)) ?? {})
  }
  if (personBusy(run)) return { text: "The person is filling in the form themselves right now. Call wait, then read_page, and keep everything they entered.", error: true }
  if (!["read_page", "fill", "options", "upload_cv", "upload_letter", "click", "back", "open_job", "screenshot", "click_at", "type_text", "press_key", "scroll"].includes(name)) return { text: `Unknown tool ${name}.`, error: true }
  const { run_id: _r, say, ...rest } = args ?? {}
  const note = typeof say === "string" && say.trim() ? say.trim().slice(0, 300) : null
  const [cmd] = await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: name, args: rest, note }) })
  await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ steps: run.steps + 1, ...(note ? { last_note: note } : {}), updated_at: new Date().toISOString() }) })
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
  if (req.method !== "POST") return reply({ error: "POST only." }, 405)
  const want = (Deno.env.get("ODDS_DRIVE_SECRET") ?? "").trim()
  const got = (req.headers.get("x-odds-drive-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim()
  const authorized = Boolean(want) && got === want
  const msg = await req.json().catch(() => null)
  // Discovery (initialize, tools/list) is open: Broods lists the tools when it syncs, before any secret is attached. Every tool call needs the secret.
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
async function startBroods(env: Env, run: Json, job: Json, facts: Record<string, string>, resume?: string): Promise<string | null> {
  const key = (Deno.env.get("APPLY_AGENT_BROODS_API_KEY") ?? "").trim()
  const agentId = (Deno.env.get("ODDS_DRIVE_AGENT_ID") ?? "").trim()
  const secret = (Deno.env.get("APPLY_AGENT_BROODS_USER_TOKEN_SECRET") ?? "").trim()
  if (!key || !agentId || !secret) return "Broods is not set up on the server."
  const base = ((Deno.env.get("APPLY_AGENT_BROODS_BASE_URL") ?? "https://gateway.broods.app").trim() || "https://gateway.broods.app").replace(/\/$/, "")
  // Whether Odds holds this job's own cover / motivation letter (upload_letter), else the person is asked for one.
  const letter = run.posting_id ? (await svc(env, `job_documents?user_id=eq.${run.user_id}&posting_id=eq.${encodeURIComponent(run.posting_id)}&kind=eq.cover_letter&select=document_id&limit=1`).catch(() => null))?.[0] : null
  // What the person answered in Odds since (Broods' own questions included): Broods fills those in when it carries on.
  const answered = resume ? ((await svc(env, `application_questions?user_id=eq.${run.user_id}&updated_at=gt.${encodeURIComponent(new Date(Date.now() - 3 * 3_600_000).toISOString())}&select=question,answer&limit=40`).catch(() => null)) ?? []) : []
  const task = resume
    ? { run_id: run.id, resume, has_cover_letter: Boolean(letter), person_answers: answered, goal: "Carry on with the same application in the same tab: read_page first, then go on until only Submit is left (finish review), or something only the person can do (finish needs_you)." }
    : {
        run_id: run.id,
        job: { title: job?.title ?? null, employer: job?.employer_display ?? job?.employer ?? null, url: run.url },
        person: facts,
        has_cover_letter: Boolean(letter),
        goal: "Apply to this job in the person's browser tab with the odds-browser tools until only Submit is left (finish review), or something only the person can do (finish needs_you).",
      }
  // A background run: Broods accepts it (202) and keeps working on its side for as long as the form takes. Holding the stream open
  // here capped every run at this function's ~150 s wall clock ("Caller stopped reading the stream" cancelled real applications).
  // The agent reports its end through the finish tool; the extension says so when Broods goes quiet.
  const res = await fetch(`${base}/v1/runs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", "X-Broods-User-Token": await signUserToken(run.user_id, secret) },
    body: JSON.stringify({ agentId, eventId: crypto.randomUUID(), conversationKey: `odds-drive-${run.id}`, background: true, events: [{ role: "user", content: [{ type: "text", text: JSON.stringify(task).slice(0, 20_000) }] }] }),
  }).catch(() => null)
  if (!res || (res.status !== 202 && !res.ok)) return `Broods did not start (${res?.status ?? "no answer"}${res ? `: ${(await res.text().catch(() => "")).slice(0, 160)}` : ""}).`
  await res.body?.cancel().catch(() => undefined)
  return null
}

// ---------------------------------------------------------------- extension routes

const MAX_RESUMES = 6
/** A run that waits for the person (or got stuck) and may pick up again by itself: recent, and not resumed too often. */
const resumeRun = (run: Json): boolean => ["needs_you", "stuck"].includes(run?.status) && Date.now() - Date.parse(run.updated_at) < 30 * 60_000 && (run.resumes ?? 0) < MAX_RESUMES
const resumePatch = (run: Json): Json => ({ status: "running", reason: null, message: null, resume_pending: true, resumes: (run.resumes ?? 0) + 1, last_note: "Carrying on where it stopped…", expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), updated_at: new Date().toISOString() })

/** /ext/drive-start | drive-next | drive-result for the person's own extension. */
export async function driveExt(route: string, req: Request, env: Env, userId: string, ctx: { facts: () => Promise<Record<string, string>>; job: (url: string) => Promise<Json | null> }): Promise<Response> {
  const json = (status: number, body: Json) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  const body = await req.json().catch(() => null)
  if (route === "drive-start") {
    // A page load in the same application resumes its run (Broods is still driving), never a second agent.
    if (typeof body?.run_id === "string") {
      const run = await runOf(env, body.run_id)
      if (run && run.user_id === userId && live(run)) return json(200, { run_id: run.id, resumed: true })
      // The page moved on while Broods waited for the person (they signed in, solved the captcha): the same run carries on.
      if (run && run.user_id === userId && resumeRun(run)) {
        await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify(resumePatch(run)) })
        return json(200, { run_id: run.id, resumed: true })
      }
    }
    const url = String(body?.url || body?.page || "").slice(0, 2000)
    if (!/^https:\/\//.test(url)) return json(400, { error: "No application address." })
    // The same application asked to start twice (two frames, a quick reload): join the live run started moments ago — one agent per form.
    const page = String(body?.page || url).slice(0, 2000)
    const recent = (await svc(env, `drive_runs?user_id=eq.${userId}&status=eq.running&url=eq.${encodeURIComponent(page)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 120_000).toISOString())}&order=created_at.desc&limit=1&select=id`).catch(() => null))?.[0]
    if (recent?.id) return json(200, { run_id: recent.id, resumed: true })
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
  if (route === "drive-stop") {
    // The person took the tab back (or stopped the run): Broods' next tool call sees the run is over and ends.
    // The tab is gone either way. At review it stays review (did they send it? the app asks once); otherwise the run ends.
    const gone = new Date(0).toISOString()
    if (run.status === "review") await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ last_seen_at: gone }) })
    else if (!["submitted", "stopped"].includes(run.status)) await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "stopped", resume_pending: false, last_seen_at: gone, message: String(body?.message ?? "Stopped by the person.").slice(0, 300), updated_at: new Date().toISOString() }) })
    return json(200, { ok: true })
  }
  if (route === "drive-continue") {
    // The person handled what Broods waited for (in the tab): it picks the same run up again, a few times at most.
    if (!resumeRun(run)) return json(200, { ok: false })
    await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify(resumePatch(run)) })
    return json(200, { ok: true })
  }
  if (route === "drive-result") {
    const id = Number(body?.id)
    if (!Number.isInteger(id)) return json(400, { error: "Bad command." })
    await svc(env, `drive_commands?id=eq.${id}&run_id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "done", result: body?.result ?? {}, done_at: new Date().toISOString() }) })
    if (!run.last_seen_at || Date.now() - Date.parse(run.last_seen_at) > 15_000) void svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_seen_at: new Date().toISOString() }) }).catch(() => undefined)
    return json(200, { ok: true })
  }
  if (route === "drive-next" && body?.hold === true) {
    // The person is filling in the form: no step is handed out, and Broods waits for them.
    await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ person_active_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }) })
    return json(200, { idle: true, hold: true })
  }
  if (route === "drive-next") {
    // The tab is there: the tracker tells a live run from one whose tab or Chrome is gone.
    if (!run.last_seen_at || Date.now() - Date.parse(run.last_seen_at) > 15_000) void svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_seen_at: new Date().toISOString() }) }).catch(() => undefined)
    // The person pressed Continue in the tracker: Broods picks the same run up again, once.
    if (run.resume_pending && live(run)) {
      const claimed = await svc(env, `drive_runs?id=eq.${run.id}&resume_pending=is.true`, { method: "PATCH", body: JSON.stringify({ resume_pending: false, updated_at: new Date().toISOString() }) }).catch(() => null)
      if (Array.isArray(claimed) && claimed.length) {
        const problem = await startBroods(env, run, null, {}, "Carry on with this application: the person may have handled what you stopped for (signed in, solved a captcha, answered, filled some fields themselves), or your last turn ended early. The page may have moved on; keep everything already filled.")
        if (problem) await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "stuck", reason: "other", message: problem }) }).catch(() => undefined)
      }
    }
    // A page that just loaded (body.fresh): a step its previous page took but never answered (the site reloaded under it) is handed again,
    // instead of Broods waiting out its 25 s.
    if (body?.fresh === true) {
      await svc(env, `drive_commands?run_id=eq.${run.id}&status=eq.taken&taken_at=lt.${encodeURIComponent(new Date(Date.now() - 1500).toISOString())}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "queued", taken_at: null }) }).catch(() => undefined)
    }
    for (let waited = 0; waited < NEXT_WAIT_MS; waited += 400) {
      const queued = (await svc(env, `drive_commands?run_id=eq.${run.id}&status=eq.queued&order=id.asc&limit=1&select=id,tool,args,note`))?.[0]
      if (queued) {
        // Taken once: a reloaded page never runs the same command twice.
        const taken = await svc(env, `drive_commands?id=eq.${queued.id}&status=eq.queued`, { method: "PATCH", body: JSON.stringify({ status: "taken", taken_at: new Date().toISOString() }) })
        if (Array.isArray(taken) && taken.length) return json(200, { command: queued, steps: run.steps })
      }
      const fresh = await runOf(env, run.id)
      if (!fresh || !live(fresh)) return json(200, { done: true, status: fresh?.status ?? "failed", reason: fresh?.reason ?? null, message: fresh?.message ?? "The run ended." })
      // Broods has sent nothing for 100 s (not waiting on the person): it ended without saying so. Retry once by itself; only then say it.
      if (Date.now() - Date.parse(fresh.updated_at) > QUIET_MS && !personBusy(fresh)) {
        const patch = (fresh.retries ?? 0) < 1
          ? { retries: (fresh.retries ?? 0) + 1, resume_pending: true, last_note: "Picking up again…", updated_at: new Date().toISOString() }
          : { status: "stuck", reason: "other", message: "Broods could not carry on with this application. Finish it in the tab, or press Apply with Odds to start again.", updated_at: new Date().toISOString() }
        await svc(env, `drive_runs?id=eq.${run.id}&status=eq.running`, { method: "PATCH", body: JSON.stringify(patch) }).catch(() => undefined)
        return json(200, { idle: true, steps: run.steps })
      }
      await sleep(400)
    }
    return json(200, { idle: true, steps: run.steps })
  }
  return json(404, { error: "Unknown route." })
}
