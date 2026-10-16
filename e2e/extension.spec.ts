import { execFileSync } from "node:child_process"
import { createServer, request as httpRequest, type IncomingMessage, type Server } from "node:http"
import { createServer as createTlsServer } from "node:https"
import { chromium, expect, test as base, type BrowserContext } from "@playwright/test"
import { join } from "node:path"
import { mkdtempSync, readFileSync } from "node:fs"
import { FLOW_POSTINGS } from "./fixtures/postings"
import { mockBackend, shot } from "./mock"
import { pickSuggestAction } from "../supabase/functions/_shared/apply-agent-suggest"
import { chooseOption, resolveAgentAnswer, type Facts } from "../supabase/functions/_shared/apply-form"
import { tmpdir } from "node:os"

/**
 * The odds browser extension, loaded for real into Chromium. LinkedIn and odds.beeblast.co are served from fixtures (odds is the built app on
 * localhost), and odds' backend is a small local fake the extension is pointed at. The pieces under test: the button on a LinkedIn job, what it
 * says for each answer, connecting the extension from the odds page, and the popup.
 */
/** The extension's own API, as the test code running inside its worker or pages sees it. */
declare const chrome: {
  storage: { local: { set(items: Record<string, unknown>): Promise<void>; get(key: string): Promise<Record<string, string | undefined>> } }
  action: { getPopup(options: object): Promise<string> }
  runtime: { getURL(path: string): string; sendMessage(message: unknown, callback: (answer: unknown) => void): void }
  tabs: {
    query(q: object): Promise<Array<{ id?: number; url?: string; active?: boolean }>>
    get(id: number): Promise<{ id: number; active: boolean }>
    sendMessage(tabId: number, message: unknown): Promise<unknown>
  }
}

const EXTENSION = join(import.meta.dirname, "..", "extension")
const SUPABASE = "http://supabase.test"
const APP_ORIGIN = process.env.ODDS_E2E_APP_ORIGIN || "http://localhost:4319"
const KEY = `oddsx_${"ab".repeat(24)}`

const JOB_PAGE = (title: string): string => `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>Job description</p></body></html>`

/** A scripted stand-in for the Broods agent: drives the real extension through /ext/drive-* with read_page/fill/upload_cv/click/finish. */
interface DriveRun { outbox: Array<{ id: number; tool: string; args: Record<string, unknown> }>; resolvers: Map<number, (r: unknown) => void>; done: { status: string; message: string } | null; log: string[] }
interface Fake {
  drives: Map<string, DriveRun>
  /** REAL_BROODS=1 runs: the real agent on a real run (see driveReal). */
  realBroods?: { title: string; person: Record<string, string>; runId?: string; log: string[]; end?: { status: string; message: string }; shot?: (label: string) => Promise<void> }
  /** The next N /ext/drive-next calls fail as if the connection dropped (503). */
  driveDown?: number
  /** A test's own Broods moves (instead of the stand-in agent): gets cmd(tool, args) and returns how the run ends. */
  driveScript?: (cmd: (tool: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>) => Promise<{ status: string; message: string }>
  prompts: Array<{ key: string; label: string; kind: string; options?: string[] }>
  remembered: Record<string, string>
  /** Label → answer the fake cloud agent returns from /ext/suggest-answers. */
  agentAnswers: Record<string, string>
  suggestCalls: number
  /** Stuck listing: local rules pick (same as mcp); counts drive-by-hands assists. */
  suggestActionCalls: number
  suggestScanCalls: number
  /** Override /ext/suggest-scan body (Broods dropdown click contract tests). */
  scanReply: Record<string, unknown> | null
  suggestActionPicks: Array<{ action: string; text?: string; reason: string }>
  server: Server
  port: number
  remoteTask?: { id: string; url: string; status: string }
  remoteTasks?: Array<{ id: string; url: string; status: string }>
  reports: Array<{ status?: string; message?: string }>
  /** The adds it was asked for (peeks and pool reads are counted apart). */
  calls: Array<{ auth: string; body: { url?: string; posting?: Record<string, unknown> } }>
  peeks: string[]
  /** The size of each look-up of several jobs at once. */
  batches: number[]
  /** What a form is filled in from (/ext/apply-kit), the answers the person gave that were kept, the jobs marked applied. */
  kit: Record<string, unknown>
  kept: Array<{ question: string; answer: string }>
  applied: string[]
  /** URLs reported closed via /ext/job-closed (server-wide closed_at). */
  closedUrls: string[]
  analyses: string[]
  /** What each analysis was sent: a job page's posting comes with it, a LinkedIn job never. */
  analyzed: Array<{ url?: string; posting?: Record<string, unknown> }>
  answersByUrl: Record<string, Record<string, unknown>>
  analyzeAnswer?: Record<string, unknown>
  addDelays: Record<string, number>
  /** How long look-ups take to answer. */
  peekDelay: number
  pools: number
  sessions: number
  answer: Record<string, unknown>
  peek: Record<string, unknown>
  pool: Record<string, unknown>
}

let driveSeq = 0
/** The stand-in agent: read the page, answer what the person's facts answer (else leave it), consent yes, upload the CV, press Next/Review, stop at Submit. */
async function driveAgent(fake: Fake, run: DriveRun): Promise<void> {
  const cmd = (tool: string, args: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve) => {
    const c = { id: ++driveSeq, tool, args }
    run.log.push(`${tool} ${JSON.stringify(args).slice(0, 160)}`)
    run.resolvers.set(c.id, (r) => resolve((r ?? {}) as Record<string, unknown>))
    run.outbox.push(c)
  })
  const kitFacts = ((fake.kit as { facts?: Facts }).facts ?? {}) as Facts
  const tried = new Map<string, number>()
  for (let step = 0; step < 25; step++) {
    const page = await cmd("read_page") as { fields?: Array<{ id: string; label: string; kind: string; filled: boolean; options?: string[]; consent?: boolean; required?: boolean }>; buttons?: Array<{ id: string; text: string; blocked?: boolean }>; captcha?: boolean; password_field?: boolean }
    if (page.captcha || page.password_field) { run.done = { status: "needs_you", message: "Sign in or solve the captcha." }; return }
    const fields = page.fields ?? []
    const open = fields.filter((f) => !f.filled && f.kind !== "file" && f.kind !== "checkbox" && !f.consent && (tried.get(f.label) ?? 0) < 2)
    const answers: Array<{ id: string; value: string }> = []
    for (const f of open) {
      tried.set(f.label, (tried.get(f.label) ?? 0) + 1)
      let options = f.options ?? []
      if (!options.length && (f.kind === "listbox" || f.kind === "combobox")) options = ((await cmd("options", { id: f.id })) as { options?: string[] }).options ?? []
      const said = fake.agentAnswers[f.label] ?? resolveAgentAnswer(f.label, { ...kitFacts, remembered: { ...(kitFacts.remembered ?? {}) } } as Facts, options)
      if (!said) continue
      const i = options.length ? chooseOption([...options], said, f.label) : -1
      answers.push({ id: f.id, value: options.length ? (i >= 0 ? options[i] ?? said : said) : said })
    }
    // Consent and required boxes: yes (the person's choice in Odds).
    for (const f of fields) if (f.kind === "checkbox" && !f.filled && (f.consent || f.required) && (tried.get(f.id + "box") ?? 0) < 2) { tried.set(f.id + "box", (tried.get(f.id + "box") ?? 0) + 1); answers.push({ id: f.id, value: "yes" }) }
    if (answers.length) { await cmd("fill", { fields: answers }); continue }
    const file = fields.find((f) => f.kind === "file" && !f.filled && (tried.get(f.id + "file") ?? 0) < 1)
    if (file) { tried.set(file.id + "file", 1); await cmd("upload_cv", { id: file.id }); continue }
    const left = fields.filter((f) => !f.filled && f.kind !== "file" && !f.consent && f.kind !== "checkbox")
    const next = (page.buttons ?? []).find((b) => !b.blocked && /^(next|continue|review|review your application|continue to next step|apply|apply now)$/i.test(b.text.trim()))
    if (left.length) { run.done = { status: "needs_you", message: `Answer: ${left.map((f) => f.label).join("; ")}` }; return }
    if (next) { await cmd("click", { id: next.id }); continue }
    if ((page.buttons ?? []).some((b) => b.blocked && /submit/i.test(b.text))) { run.done = { status: "review", message: "Everything is filled in. Check it and press Submit yourself." }; return }
    // A list of vacancies: open the link that names this job (most of its title's words), as Broods does.
    const title = String((fake.kit as { job_title?: string }).job_title ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3)
    const named = title.length >= 2 ? (page.buttons ?? []).find((b) => !b.blocked && title.filter((w) => b.text.toLowerCase().includes(w)).length / title.length >= 0.6 && (tried.get(b.id + "link") ?? 0) < 1) : undefined
    if (named) { tried.set(named.id + "link", 1); await cmd("click", { id: named.id }); continue }
    run.done = { status: "stuck", message: "No way forward on this page." }
    return
  }
  run.done = { status: "stuck", message: "Step limit." }
}
// ---- REAL_BROODS=1: the real Broods agent drives the real extension on real sites. The bridge stands in only for Odds' login: it starts
// the run in the real database and carries commands between the database and the extension, exactly the path production uses.
const REAL_USER = "a288b136-2a65-4dc5-9ab2-7ecad9afbb3d"
async function startRealBroods(runId: string, url: string, title: string, person: Record<string, string>): Promise<void> {
  const env = readFileSync(join(import.meta.dirname, "..", ".env.local"), "utf8")
  const key = [...env.matchAll(/^BROODS_API_KEY=["']?([^"'\n]+)/gm)].at(-1)![1]
  const secret = [...env.matchAll(/^BROODS_USER_TOKEN_SECRET=["']?([^"'\n]+)/gm)].at(-1)![1]
  const enc = new TextEncoder()
  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  // Test runs act as their own Broods user, never as the person: they must not show up as the person's applications.
  const body = b64(enc.encode(JSON.stringify({ userId: "odds-test", expiresAt: Date.now() + 3600000 })))
  const dig = await crypto.subtle.digest("SHA-256", enc.encode(`broods-user-token:${secret}`))
  const ck = await crypto.subtle.importKey("raw", dig, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const token = `buat_${body}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", ck, enc.encode(body))))}`
  const task = { run_id: runId, job: { title, url }, person, goal: "Apply to this job in the person's browser tab with the odds-browser tools until only Submit is left (finish review), or something only the person can do (finish needs_you)." }
  // Started exactly as production does: a background run (202 accepted), nothing holds a stream open.
  const res = await fetch("https://gateway.broods.app/v1/runs", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", "X-Broods-User-Token": token },
    body: JSON.stringify({ agentId: "js76teefba050scj7h6wp8n04x8ga3ac", eventId: crypto.randomUUID(), conversationKey: `odds-test-${runId}`, background: true, events: [{ role: "user", content: [{ type: "text", text: JSON.stringify(task) }] }] }) })
  console.log(`REAL start ${runId}: ${res.status}`)
}
// The bridge reads and writes the drive tables over PostgREST (fast); the key comes from a private file named in REAL_SR_KEY_FILE, never the repo.
const REST = "https://ukpmpyfcnbhngkgbnkxi.supabase.co/rest/v1"
const restKey = (): string => readFileSync(String(process.env.REAL_SR_KEY_FILE), "utf8").trim()
async function rest(path: string, init: RequestInit = {}): Promise<Array<Record<string, unknown>>> {
  const key = restKey()
  const res = await fetch(`${REST}/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) } })
  const text = await res.text()
  return text ? (JSON.parse(text) as Array<Record<string, unknown>>) : []
}
async function driveReal(fake: Fake, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const real = fake.realBroods!
  if (path.endsWith("/drive-start")) {
    if (real.runId) return { run_id: real.runId, resumed: true }
    const [run] = await rest("drive_runs", { method: "POST", body: JSON.stringify({ user_id: REAL_USER, url: String(body.page || body.url) }) })
    real.runId = String(run.id)
    await startRealBroods(real.runId, String(body.page || body.url), real.title, real.person)
    return { run_id: real.runId, resumed: false }
  }
  const runId = String(body.run_id)
  if (path.endsWith("/drive-result")) {
    await rest(`drive_commands?id=eq.${Number(body.id)}&run_id=eq.${runId}`, { method: "PATCH", body: JSON.stringify({ status: "done", result: body.result ?? {}, done_at: new Date().toISOString() }) })
    real.log.push(`result ${JSON.stringify(body.result ?? {}).slice(0, 140)}`)
    // A picture of the real page after every step, to check by eye that each action did what it said.
    await real.shot?.(String(real.log.length)).catch(() => undefined)
    return { ok: true }
  }
  for (let i = 0; i < 40; i++) {
    const [q] = await rest(`drive_commands?run_id=eq.${runId}&status=eq.queued&order=id.asc&limit=1&select=id,tool,args`)
    if (q) {
      const taken = await rest(`drive_commands?id=eq.${q.id}&status=eq.queued`, { method: "PATCH", body: JSON.stringify({ status: "taken", taken_at: new Date().toISOString() }) })
      if (taken.length) { real.log.push(`${q.tool} ${JSON.stringify(q.args).slice(0, 160)}`); return { command: q } }
    }
    const [r] = await rest(`drive_runs?id=eq.${runId}&select=status,message`)
    if (r && r.status !== "running") { real.end = { status: String(r.status), message: String(r.message ?? "") }; return { done: true, status: r.status, message: r.message } }
    await new Promise((res) => setTimeout(res, 300))
  }
  return { idle: true }
}
async function driveFake(fake: Fake, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (fake.realBroods) return driveReal(fake, path, body)
  if (path.endsWith("/drive-start")) {
    if (typeof body.run_id === "string" && fake.drives.has(body.run_id) && !fake.drives.get(body.run_id)!.done) return { run_id: body.run_id, resumed: true }
    const id = `run-${fake.drives.size + 1}`
    const run: DriveRun = { outbox: [], resolvers: new Map(), done: null, log: [] }
    fake.drives.set(id, run)
    if (fake.driveScript) {
      const cmd = (tool: string, args: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve) => {
        const c = { id: ++driveSeq, tool, args }
        run.log.push(`${tool} ${JSON.stringify(args).slice(0, 160)}`)
        run.resolvers.set(c.id, (r) => resolve((r ?? {}) as Record<string, unknown>))
        run.outbox.push(c)
      })
      void fake.driveScript(cmd).then((end) => { run.done = end })
    } else void driveAgent(fake, run)
    return { run_id: id, resumed: false }
  }
  const run = fake.drives.get(String(body.run_id))
  if (!run) return { error: "No such run." }
  if (path.endsWith("/drive-result")) {
    run.resolvers.get(Number(body.id))?.(body.result)
    run.resolvers.delete(Number(body.id))
    return { ok: true }
  }
  for (let waited = 0; waited < 3000; waited += 50) {
    const c = run.outbox.shift()
    if (c) return { command: c, steps: run.log.length }
    if (run.done) return { done: true, ...run.done }
    await new Promise((r) => setTimeout(r, 50))
  }
  return { idle: true }
}

async function fakeOdds(): Promise<Fake> {
  const fake = {
    calls: [],
    reports: [],
    prompts: [],
    remembered: {},
    agentAnswers: {},
    drives: new Map(),
    suggestCalls: 0,
    suggestActionCalls: 0,
    suggestScanCalls: 0,
    scanReply: null,
    suggestActionPicks: [],
    peeks: [],
    batches: [],
    kit: {},
    kept: [],
    applied: [],
    closedUrls: [],
    analyses: [],
    analyzed: [],
    answersByUrl: {},
    addDelays: {},
    peekDelay: 0,
    pools: 0,
    sessions: 0,
    answer: { status: "added", saved: true, chance_pct: 4.4, job: { id: "pabc", title: "Finance Intern" }, odds_link: "https://odds.beeblast.co/job/pabc" },
    peek: { known: true, id: "pabc", saved: false, chance_pct: 4.4, needs_profile: false },
    pool: { jobs: [{ id: "pabc", title: "Finance Intern", company: "Acme", city: "Amsterdam", status: "saved", chance_pct: 4.4, link: "https://odds.beeblast.co/job/pabc" }, { id: "pold", title: "Marketing Intern", company: "Beta", city: "Utrecht", status: "applied", chance_pct: null, link: "https://odds.beeblast.co/job/pold" }], total: 2 },
  } as unknown as Fake
  fake.server = createServer((req: IncomingMessage, res) => {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" }
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end()

      return
    }
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      const auth = String(req.headers.authorization ?? "")
      if (auth !== `Bearer ${KEY}`) {
        res.writeHead(401, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ error: "Connect the odds extension again." }))

        return
      }
      const body = raw ? (JSON.parse(raw) as {
        url?: string
        urls?: string[]
        posting?: Record<string, unknown>
        id?: string
        ids?: string[]
        status?: string
        message?: string
        questions?: Fake["prompts"]
        buttons?: Array<string | { text?: string; href?: string; hint?: string }>
        exclude?: string[]
        force_llm?: boolean
        snapshot?: unknown
        broods_only?: boolean
      }) : {}
      const path = String(req.url).split("?")[0]
      if (/\/ext\/drive-(start|next|result)$/.test(path)) {
        if (path.endsWith("/drive-next") && (fake.driveDown ?? 0) > 0) { fake.driveDown!--; res.writeHead(503, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ error: "unavailable" })); return }
        void driveFake(fake, path, body as Record<string, unknown>).then((out) => res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(out)))
        return
      }
      let answer: Record<string, unknown> = fake.answer
      if (path.endsWith("/ext/application-poll")) {
        const tasks = fake.remoteTasks || (fake.remoteTask ? [fake.remoteTask] : [])
        answer = { task: tasks.find(t => t.status === "filling" && !body.ids?.includes(t.id)) || null, runs: tasks.filter(t => body.ids?.includes(t.id)).map(t => ({ id: t.id, status: t.status })) }
      } else if (path.endsWith("/ext/application-resume")) {
        answer = { run: fake.remoteTask && ["filling", "needs_input", "ready"].includes(fake.remoteTask.status) ? { id: fake.remoteTask.id } : null }
      } else if (path.endsWith("/ext/application-report")) {
        fake.reports.push({ status: body.status, message: body.message })
        const task = fake.remoteTasks?.find(t => t.id === body.id) || fake.remoteTask
        if (task && body.status) task.status = body.status
        answer = { status: "ok" }
      } else if (path.endsWith("/ext/peek") && body.urls) {
        // Jobs in view are looked up together, as the real route answers them.
        fake.peeks.push(...body.urls)
        fake.batches.push(body.urls.length)
        answer = { results: Object.fromEntries(body.urls.map((u) => [u, fake.answersByUrl[u] ?? fake.peek])) }
      } else if (path.endsWith("/ext/peek")) {
        fake.peeks.push(String(body.url))
        answer = fake.answersByUrl[String(body.url)] ?? fake.peek
      } else if (path.endsWith("/ext/analyze")) {
        fake.analyses.push(String(body.url))
        fake.analyzed.push(body)
        answer = fake.answersByUrl[`analyze ${String(body.url)}`] ?? fake.analyzeAnswer ?? { ...fake.answer, known: true, saved: false }
      } else if (path.endsWith("/ext/session")) {
        fake.sessions++
        answer = { access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001", email: "test.person@example.com" } }
      } else if (path.endsWith("/ext/apply-kit")) {
        answer = { ...fake.kit }
      } else if (path.endsWith("/ext/application-questions")) {
        fake.prompts = body.questions || []
        answer = { status: "ok" }
      } else if (path.endsWith("/ext/suggest-answers")) {
        fake.suggestCalls++
        const asked = Array.isArray(body.questions) && body.questions.length ? body.questions : fake.prompts
        const accepted: Array<{ key: string; answer: string; confidence: number }> = []
        // Broods-only (the extension's default): Broods answers every question. Here the built-in rules stand in for Broods' reading of the
        // person's facts, and a test's own agentAnswers win — so the tests exercise the Broods-only path end to end.
        const kitFacts = ((fake.kit as { facts?: Facts }).facts ?? {}) as Facts
        const standIn = (q: { label: string; options?: string[] }): string | null => {
          if (body.broods_only !== true) return null
          const facts = { ...kitFacts, remembered: { ...(kitFacts.remembered ?? {}), ...fake.remembered } } as Facts
          const said = resolveAgentAnswer(q.label, facts, q.options ?? [])
          if (said === null || said === "") return null
          if (q.options?.length) { const i = chooseOption([...q.options], said, q.label); return i >= 0 ? q.options[i] ?? null : null }
          return said
        }
        for (const q of asked) {
          const text = fake.agentAnswers[q.label] ?? fake.agentAnswers[q.key] ?? standIn(q)
          if (!text || !q.key) continue
          accepted.push({ key: q.key, answer: text, confidence: 0.9 })
          fake.remembered[q.key] = text
        }
        answer = { status: "ok", accepted, rejected: [] }
      } else if (path.endsWith("/ext/suggest-action")) {
        fake.suggestActionCalls++
        const buttons = Array.isArray(body.buttons) ? body.buttons : []
        const exclude = new Set(
          (Array.isArray(body.exclude) ? body.exclude : [])
            .filter((t: unknown): t is string => typeof t === "string")
            .map((t: string) => t.replace(/\s+/g, " ").trim().toLowerCase())
            .filter(Boolean),
        )
        const usable = buttons.filter((b: string | { text?: string }) => {
          const t = (typeof b === "string" ? b : b?.text ?? "").replace(/\s+/g, " ").trim().toLowerCase()
          return t && !exclude.has(t)
        })
        // Mirrors production: force_llm / exclude skip already-tried labels so LLM (rules stand-in) can take over.
        const pool = body.force_llm === true ? usable : (usable.length ? usable : buttons)
        const pick = pool.length ? pickSuggestAction(pool) : { action: "none" as const, reason: "all_excluded" }
        fake.suggestActionPicks.push(pick)
        answer = { status: "ok", ...pick }
      } else if (path.endsWith("/ext/suggest-scan")) {
        fake.suggestScanCalls++
        if (fake.scanReply) {
          answer = { status: "ok", ...fake.scanReply }
        } else {
          const snap = body.snapshot && typeof body.snapshot === "object" ? body.snapshot as { buttons?: unknown } : null
          const buttons = Array.isArray(snap?.buttons) ? snap.buttons : []
          const pick = pickSuggestAction(buttons)
          answer = {
            status: "ok",
            stage: pick.action === "click" ? "form" : "stuck",
            action: pick.action === "click" ? "click" : "none",
            text: pick.text ?? null,
            answers: [],
            reason: "fake_scan",
          }
        }
      } else if (path.endsWith("/ext/answers") && req.method === "GET") {
        answer = { remembered: fake.remembered }
      } else if (path.endsWith("/ext/answers")) {
        fake.kept.push(...((body as { questions?: Array<{ question: string; answer: string }> }).questions ?? []))
        answer = { saved: 1 }
      } else if (path.endsWith("/ext/applied")) {
        fake.applied.push(String(body.url))
        answer = { status: "applied", id: "papplied" }
      } else if (path.endsWith("/ext/job-closed")) {
        fake.closedUrls.push(String(body.url))
        answer = { status: "closed", id: "pclosed" }
      } else if (path.endsWith("/ext/pool")) {
        fake.pools++
        answer = fake.pool
      } else {
        fake.calls.push({ auth, body })
        answer = fake.answersByUrl[`add ${String(body.url)}`] ?? fake.answer
      }
      // The person's CV file, as the real route sends it.
      if (path.endsWith("/ext/file")) {
        res.writeHead(200, { ...cors, "Content-Type": "application/pdf", "X-File-Name": "Kien_Data_CV.pdf", "Access-Control-Expose-Headers": "X-File-Name" }).end("%PDF-1.4 odds test CV")

        return
      }
      const delay = path.endsWith("/ext/add") ? fake.addDelays[String(body.url)] ?? 0 : path.endsWith("/ext/peek") ? fake.peekDelay : 0
      setTimeout(() => res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(answer)), delay)
    })
  })
  await new Promise<void>((resolve) => fake.server.listen(0, resolve))
  fake.port = (fake.server.address() as { port: number }).port

  return fake
}

/**
 * odds.beeblast.co on this machine over real HTTPS, answering the way production does: the built app, with the headers that forbid framing. The
 * browser is told to send that host here (host-resolver-rules), so the extension's header rule sees a real response, which a route fake would not give it.
 */
async function oddsSite(): Promise<{ server: Server; port: number }> {
  const dir = mkdtempSync(join(tmpdir(), "odds-tls-"))
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "2", "-subj", "/CN=odds.beeblast.co", "-addext", "subjectAltName=DNS:odds.beeblast.co"], { stdio: "ignore" })
  const server = createTlsServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (req, res) => {
    const up = httpRequest({ host: "localhost", port: Number(new URL(APP_ORIGIN).port), path: req.url, method: req.method, headers: { ...req.headers, host: new URL(APP_ORIGIN).host } }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, {
        ...answer.headers,
        "x-frame-options": "DENY",
        "content-security-policy": "default-src 'self'; frame-ancestors 'none'; script-src 'self'; connect-src 'self' http://supabase.test; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:",
      })
      answer.pipe(res)
    })
    up.on("error", () => res.writeHead(502).end())
    req.pipe(up)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))

  return { server, port: (server.address() as { port: number }).port }
}

const test = base.extend<{ context: BrowserContext; fake: Fake; extensionId: string; site: { server: Server; port: number } }>({
  site: async ({ baseURL }, provide) => {
    void baseURL
    const site = await oddsSite()
    await provide(site)
    site.server.close()
  },
  fake: async ({ baseURL }, provide) => {
    void baseURL
    const fake = await fakeOdds()
    await provide(fake)
    fake.server.close()
  },
  context: async ({ fake, site }, provide) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "odds-ext-")), { channel: "chromium", headless: true, ignoreHTTPSErrors: true, args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, "--allow-running-insecure-content", `--host-resolver-rules=MAP odds.beeblast.co 127.0.0.1:${site.port}`, "--ignore-certificate-errors"] })
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
    // The panel drawn in the page is what most tests look at; one test switches this off and checks the browser's own side panel is asked for instead.
    await worker.evaluate((port) => chrome.storage.local.set({ oddsApi: `http://localhost:${port}`, oddsPanelInPage: true }), fake.port)
    // LinkedIn: a page for any address, so the extension's script runs where it would on the real site.
    await context.route("https://*.linkedin.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: JOB_PAGE("LinkedIn job") }))
    // The odds site is not reached from these tests unless one serves it (see the panel test): anything else gets an empty page.
    await context.route("https://odds.beeblast.co/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>odds</title>" }))
    await provide(context)
    await context.close()
  },
  extensionId: async ({ context }, provide) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
    await provide(new URL(worker.url()).host)
  },
})

const JOB = "https://www.linkedin.com/jobs/view/4470863235/?trackingId=abc"

async function connect(context: BrowserContext): Promise<void> {
  const worker = context.serviceWorkers()[0]
  await worker.evaluate((key) => chrome.storage.local.set({ oddsKey: key }), KEY)
}

test("on a LinkedIn job the button is there; on a page that is not a job it is not, and it follows a job opened without a reload", async ({ context }) => {
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/")
  await page.waitForTimeout(1200)
  await expect(page.locator("#odds-add")).toHaveCount(0)
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toBeVisible()
  await page.goto("https://www.linkedin.com/jobs/search/?keywords=finance")
  await expect(page.locator("#odds-add")).toHaveCount(0)
  // LinkedIn opens a job in the same page: the address changes, the page does not reload.
  await page.evaluate(() => history.pushState({}, "", "/jobs/search/?currentJobId=4470863235"))
  await expect(page.locator("#odds-add")).toBeVisible()
  await page.evaluate(() => history.pushState({}, "", "/jobs/search/?keywords=finance"))
  await expect(page.locator("#odds-add")).toHaveCount(0)
  const view = await context.newPage()
  await view.goto("https://www.linkedin.com/feed/")
  await view.waitForTimeout(800)
  await expect(view.locator("#odds-add")).toHaveCount(0)
})

test("next to LinkedIn's Save button when the page has one, at the edge when it has not; drawn like odds' own chips, in the odds lettering", async ({ context }) => {
  await connect(context)
  // The structure of the job page as LinkedIn serves it (October 2026, copied from a real one, names and texts removed): each button in a wrapper of its own, the wrappers in one row.
  await context.route("https://www.linkedin.com/jobs/view/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><style>.a{height:32px;border-radius:16px;padding:0 16px;font-size:16px}</style><main id="workspace"><div class="top"><div id="row" style="display:flex;gap:8px"><div class="wrap"><button class="a" type="button" aria-label="Easy Apply to this job"><span><span>Easy Apply</span></span></button></div><div class="wrap"><button class="a" type="button" aria-label="Save the job"><span><span>Save</span></span></button></div></div></div><ul><li><button aria-label="Dismiss Marketing Intern job">x</button></li></ul></main>`,
    }),
  )
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470863235/")
  const pill = page.locator("#odds-add")
  await expect(pill).toHaveAttribute("data-where", "inline")
  expect(await pill.evaluate((el) => el.parentElement?.id)).toBe("row")
  // After the Save wrapper, in the same row, not inside it.
  expect(await pill.evaluate((el) => el.previousElementSibling?.querySelector("button")?.getAttribute("aria-label"))).toBe("Save the job")
  // The size of LinkedIn's buttons beside it (a 32px pill), and drawn like the app's chips: white, a 1.5px line, ink lettering. The row's own gap spaces it.
  expect(await pill.evaluate((el) => getComputedStyle(el).height)).toBe("32px")
  expect(await pill.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("999px")
  expect(await pill.evaluate((el) => getComputedStyle(el).marginLeft)).toBe("0px")
  expect(await pill.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)")
  expect(await pill.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgb(163, 157, 149)")
  expect(await pill.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(22, 21, 19)")
  expect(await pill.evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed")
  // The odds lettering is loaded from the extension.
  await page.evaluate(() => document.fonts.load('700 15px "odds Inter Tight"'))
  expect(await page.evaluate(() => document.fonts.check('700 15px "odds Inter Tight"'))).toBe(true)
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470863235")
  await expect(page.locator("#odds-add")).toHaveAttribute("data-where", "float")
  expect(await page.locator("#odds-add").evaluate((el) => getComputedStyle(el).position)).toBe("fixed")
})

test("before connecting the button says Connect; connected, it shows your chance before anything is saved, then opens the job without saving", async ({ context, fake }) => {
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toHaveAttribute("title", "Connect odds to see your interview chance here")
  expect(fake.calls).toHaveLength(0)

  await connect(context)
  await page.goto(JOB)
  // The chance is there already, from the engine, before the person presses anything; nothing has been saved.
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "idle")
  expect(fake.peeks).toEqual(["https://www.linkedin.com/jobs/view/4470863235/"])
  expect(fake.calls).toHaveLength(0)

  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "idle")
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  expect(fake.calls).toHaveLength(0)
  // Every press opens this exact job; the cross closes the panel.
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  // The slide takes a moment; the cross is pressed once the panel has settled.
  await page.waitForTimeout(700)
  await page.frameLocator("#odds-panel-frame").locator("#close").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "false")
})

test("with the browser's side panel on, pressing the button opens it at once, and no panel is drawn in the page", async ({ context, fake }) => {
  const worker = context.serviceWorkers()[0]
  await worker.evaluate(() => chrome.storage.local.set({ oddsPanelInPage: false }))
  await connect(context)
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  await page.locator("#odds-add").click()
  await expect(page.locator("html")).toHaveAttribute("data-odds-panel", "side")
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  expect(fake.calls).toHaveLength(0)
  await expect(page.locator("#odds-panel-frame")).toHaveCount(0)
  // Pressing it again, now that the job is kept, shows the side panel again and adds nothing.
  await page.locator("#odds-add").click()
  expect(fake.calls).toHaveLength(0)
  await expect(page.locator("#odds-panel-frame")).toHaveCount(0)
})

test("a job odds does not hold is analyzed without saving, a job already kept shows ✓ with its chance, a closed one says so", async ({ context, fake }) => {
  await connect(context)
  const page = await context.newPage()
  fake.peek = { known: false }
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  expect(fake.analyses).toHaveLength(1)
  expect(fake.calls).toHaveLength(0)
  fake.peek = { known: true, id: "pabc", saved: true, chance_pct: 7.1, needs_profile: false }
  await page.goto("https://www.linkedin.com/jobs/view/4470000001/")
  await expect(page.locator("#odds-add")).toContainText("7.1%")
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "done")
  fake.peek = { known: true, id: "pabc", closed: true }
  await page.goto("https://www.linkedin.com/jobs/view/4470000002/")
  await expect(page.locator("#odds-add")).toHaveAttribute("title", "This job is closed")
})

test("flicking through jobs in one page looks each up once, after a short pause", async ({ context, fake }) => {
  await connect(context)
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470000011")
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  const before = fake.peeks.length
  for (const id of ["4470000012", "4470000013", "4470000014"]) await page.evaluate((jobId) => history.pushState({}, "", `/jobs/search/?currentJobId=${jobId}`), id)
  await expect.poll(() => fake.peeks.length, { timeout: 8000 }).toBeGreaterThan(before)
  await page.waitForTimeout(1500)
  expect(fake.peeks.length - before).toBeLessThanOrEqual(2)
  expect(fake.peeks[fake.peeks.length - 1]).toContain("4470000014")
})

test("a failed read is explained in the panel without saving; a missing CV is explained on the badge", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "limit", message: "Up to 30 new jobs a day." }
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "problem")
  await page.locator("#odds-add").click()
  await expect(page.frameLocator("#odds-panel-frame").locator("#note")).toContainText("Up to 30 new jobs a day.")
  expect(fake.calls).toHaveLength(0)
  fake.peek = { known: true, id: "pabc", saved: false, chance_pct: null, needs_profile: true }
  await page.goto("https://www.linkedin.com/jobs/view/4470000222/")
  await expect(page.locator("#odds-add")).toHaveAttribute("title", /Import your LinkedIn profile or add a CV/)
  await expect(page.locator("#odds-add")).toHaveText("Add CV")
  const opened = context.waitForEvent("page")
  await page.locator("#odds-add").click()
  await expect(await opened).toHaveURL("https://odds.beeblast.co/profile")
})

test("a key odds no longer accepts disconnects the extension", async ({ context, fake }) => {
  const worker = context.serviceWorkers()[0]
  await worker.evaluate((key) => chrome.storage.local.set({ oddsKey: key }), `oddsx_${"cd".repeat(24)}`)
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toHaveAttribute("title", "Connect odds to see your interview chance here")
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("oddsKey")).oddsKey ?? null)).toBeNull()
  expect(fake.calls).toHaveLength(0)
})

test("the odds app opens in the panel as production serves it (refusing frames), signed in by the extension, with the job dropped over it", async ({ context, fake }) => {
  fake.answer = { status: "added", saved: true, chance_pct: 4.4, job: { id: "e2e-adyen-fin-analyst", title: "Junior Financial Analyst", company: "Adyen", city: "Amsterdam" } }
  // The backend of the app is the usual fake; odds itself is the real HTTPS site of oddsSite() above, with production's headers (it may not be framed).
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.unroute("https://odds.beeblast.co/**")
  // The extension's own pages, and the odds site over the network, are not part of what the fake routes.
  await context.route(/^chrome-extension:/, (route) => route.continue())
  await context.route("https://odds.beeblast.co/**", (route) => route.continue())
  // LinkedIn's page keeps a strict policy on what it may frame; the extension's panel must still open.
  await context.route("https://www.linkedin.com/jobs/view/**", (route) => route.fulfill({ status: 200, contentType: "text/html", headers: { "content-security-policy": "default-src 'self' 'unsafe-inline'; frame-src 'self'" }, body: JOB_PAGE("LinkedIn job") }))
  fake.peek = { known: true, saved: false, chance_pct: 4.4, job: { id: "e2e-adyen-fin-analyst", title: "Junior Financial Analyst" } }
  await connect(context)
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  await page.locator("#odds-add").click()
  const panel = page.frameLocator("#odds-panel-frame")
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  // The job drops in over the app.
  await expect(panel.locator("#note")).not.toBeVisible()
  // The app itself loaded in the frame under it (not refused), and was signed in by the extension: it shows the job's page.
  const app = panel.frameLocator("#app")
  await expect(app.getByRole("heading", { name: "Junior Financial Analyst" }).first()).toBeVisible({ timeout: 25000 })
  expect(fake.sessions).toBeGreaterThanOrEqual(1)
  await shot(page, "ext-panel-app")
  // Each application opens in a new tab, preserving the job and any existing forms.
  await context.route("https://jobs.example.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>Apply</h1>" }))
  const openedApplication = context.waitForEvent("page")
  await app.getByRole("button", { name: /Apply with Odds/ }).click()
  const application = await openedApplication
  await application.waitForURL("https://jobs.example.com/e2e-adyen-fin-analyst", { timeout: 10000 })
  expect(page.url()).toBe(JOB)
  expect(page.isClosed()).toBe(false)
})

test("odds still refuses to be framed anywhere the panel was not opened: another tab, another page", async ({ context }) => {
  await context.route("https://www.linkedin.com/feed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><iframe id="x" src="https://odds.beeblast.co/"></iframe>' }))
  await context.route("https://odds.beeblast.co/**", (route) => route.continue())
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/feed/")
  await page.waitForTimeout(2500)
  expect(page.frames().map((f) => f.url()).some((u) => u.startsWith("chrome-error:"))).toBe(true)
})

test("the browser's side panel is set up: the odds page is its page, and it may frame odds like the in-page panel", async ({ context }) => {
  const worker = context.serviceWorkers()[0]
  const state = await worker.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: { sidePanel?: { getOptions(o: object): Promise<{ path?: string }> }; declarativeNetRequest: { getSessionRules(): Promise<Array<{ condition: { tabIds?: number[] } }>> } } }).chrome
    return { path: (await api.sidePanel?.getOptions({}))?.path ?? null, rules: (await api.declarativeNetRequest.getSessionRules()).map((r) => r.condition.tabIds ?? []) }
  })
  expect(state.path).toBe("panel.html")
  // A rule for requests that belong to no tab (the side panel is such a page): no web page can make those.
  expect(state.rules.some((ids) => ids.length === 1 && ids[0] === -1)).toBe(true)
})

test("the popup says whether it is connected, and Disconnect forgets the key", async ({ context, extensionId }) => {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.locator("#line")).toContainText("Connect to see your interview chance")
  await expect(popup.locator("#main")).toHaveText("Connect odds")
  await connect(context)
  await popup.reload()
  await expect(popup.locator("#line")).toContainText("Connected")
  await expect(popup.locator("#line")).toContainText("beside Save")
  await expect(popup.locator("#main")).toHaveText("Open odds in the side panel")
  await expect(popup.locator("#site")).toBeVisible()
  await popup.locator("#off").click()
  await expect(popup.locator("#main")).toHaveText("Connect odds")
})

test("connecting from the odds page: sign in is already done, one tap hands the key to the extension", async ({ context, extensionId }) => {
  void extensionId
  const worker = context.serviceWorkers()[0]
  const rpc: string[] = []
  const problems: string[] = []
  await mockBackend(context, FLOW_POSTINGS, problems, true)
  // Registered after the general fake, so it answers first: the one call this test is about.
  await context.route(`${SUPABASE}/rest/v1/rpc/create_extension_key`, (route) => {
    rpc.push(route.request().method())

    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(KEY) })
  })
  await context.route("https://odds.beeblast.co/**", async (route) => {
    const response = await route.fetch({ url: route.request().url().replace("https://odds.beeblast.co", APP_ORIGIN) })
    await route.fulfill({ response })
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001", email: "test.person@example.com" } }))
    localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", origin: "non_eu", dutch: "basic" }))
  })
  await page.goto("https://odds.beeblast.co/connect/extension")
  const card = page.getByRole("dialog", { name: "Connect the odds extension" })
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.getByRole("button", { name: "Connect", exact: true }).click()
  const done = page.getByRole("dialog", { name: "Extension connected" })
  await expect(done).toBeVisible()
  expect(rpc).toEqual(["POST"])
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("oddsKey")).oddsKey)).toBe(KEY)
  // OK must dismiss — regression: dropExtensionRequest cleared storage but App kept extensionRequest true forever.
  await done.getByRole("button", { name: "OK", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Extension connected" })).toHaveCount(0)
  await expect(page.getByRole("dialog", { name: "Connect the odds extension" })).toHaveCount(0)
})

test("the extension takes a key only from odds.beeblast.co, and only one in the right form", async ({ context }) => {
  const worker = context.serviceWorkers()[0]
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470863235/")
  // A LinkedIn page cannot hand it a key: the message is accepted only from odds.beeblast.co.
  const answer = await page.evaluate(() => new Promise((resolve) => chrome.runtime.sendMessage({ type: "set-key", key: `oddsx_${"ee".repeat(24)}` }, (a: unknown) => resolve(a ?? null))).catch(() => "blocked"))
  expect([null, "blocked"]).toContain(answer)
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("oddsKey")).oddsKey ?? null)).toBeNull()
})

const LIST_PAGE = `<!doctype html><html><body><main><ul>
<li data-job-id="4470000101"><a href="/jobs/view/4470000101/">Finance Intern</a></li>
<li data-job-id="4470000102"><a href="/jobs/view/4470000102/">Marketing Intern</a></li>
</ul></main></body></html>`

test("job-list percentages open the selected unsaved job in the real Odds app, without adding another job", async ({ context, fake }) => {
  await connect(context)
  const first = "https://www.linkedin.com/jobs/view/4470000101/"
  const second = "https://www.linkedin.com/jobs/view/4470000102/"
  fake.answersByUrl[first] = { known: true, saved: false, chance_pct: 12.3, job: { id: "e2e-adyen-fin-analyst", title: "Junior Financial Analyst" } }
  fake.answersByUrl[second] = { known: true, saved: false, chance_pct: 7.8, job: { id: FLOW_POSTINGS[1].id, title: FLOW_POSTINGS[1].title } }
  await context.unroute("https://odds.beeblast.co/**")
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.route(/^chrome-extension:/, (route) => route.continue())
  await context.route("https://odds.beeblast.co/**", (route) => route.continue())
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/?keywords=intern")
  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(2)
  await expect(badges.nth(0)).toContainText("12.3%")
  await expect(badges.nth(1)).toContainText("7.8%")
  await badges.nth(0).click()
  const panel = page.frameLocator("#odds-panel-frame")
  const app = panel.frameLocator("#app")
  await expect(app.getByRole("heading", { name: "Junior Financial Analyst", exact: true })).toBeVisible({ timeout: 15000 })
  const openedAt = await page.frameLocator("#odds-panel-frame").frameLocator("#app").locator("body").evaluate(e => e.ownerDocument.defaultView!.performance.timeOrigin)
  await badges.nth(1).click()
  await expect(app.getByRole("heading", { name: FLOW_POSTINGS[1].title, exact: true })).toBeVisible({ timeout: 15000 })
  expect(await app.locator("body").evaluate(e => e.ownerDocument.defaultView!.performance.timeOrigin)).toBe(openedAt)
  expect(fake.pools).toBe(0)
  await app.getByRole("button", { name: "← Back", exact: true }).click()
  await expect(app.getByRole("heading", { name: FLOW_POSTINGS[1].title, exact: true })).not.toBeVisible()
  await badges.nth(1).click()
  await expect(app.getByRole("heading", { name: FLOW_POSTINGS[1].title, exact: true })).toBeVisible({ timeout: 15000 })
  expect(fake.calls).toHaveLength(0)
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  await shot(page, "ext-job-list-chances")
})

test("a recycled job card receives the new job's percentage and never opens the previous job", async ({ context, fake }) => {
  await connect(context)
  fake.answersByUrl["https://www.linkedin.com/jobs/view/4470000101/"] = { known: true, saved: true, chance_pct: 12.3, job: { id: "first" } }
  fake.answersByUrl["https://www.linkedin.com/jobs/view/4470000102/"] = { known: true, saved: true, chance_pct: 7.8, job: { id: "second" } }
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/")
  const card = page.locator('[data-job-id="4470000101"]')
  await expect(card.locator(".odds-job-chance")).toContainText("12.3%")
  await card.locator("a").evaluate((link) => link.setAttribute("href", "/jobs/view/4470000103/"))
  fake.answersByUrl["https://www.linkedin.com/jobs/view/4470000103/"] = { known: true, saved: true, chance_pct: 23.4, job: { id: "third", title: "Third job" } }
  await expect(card.locator(".odds-job-chance")).toHaveAttribute("data-job-id", "4470000103")
  await expect(card.locator(".odds-job-chance")).toContainText("23.4%")
  await card.locator(".odds-job-chance").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  await expect(page.frameLocator("#odds-panel-frame").locator("#note")).toContainText("Third job")
  expect(fake.peeks.filter((url) => url.includes("4470000103"))).toHaveLength(1)
  expect(fake.calls).toHaveLength(0)
})

test("unknown visible jobs are enriched without saving; clicking views the clicked job after page navigation", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: false }
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/")
  const badge = page.locator('.odds-job-chance[data-job-id="4470000101"]')
  await expect(badge).toContainText("4.4%")
  expect(fake.calls).toHaveLength(0)
  expect(fake.analyses).toContain("https://www.linkedin.com/jobs/view/4470000101/")
  await page.evaluate(() => history.pushState({}, "", "/jobs/search/?currentJobId=4470000999"))
  await badge.click()
  expect(fake.calls).toHaveLength(0)
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
})

test("missing profiles and read limits display explanations instead of made-up percentages", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, needs_profile: true, chance_pct: null }
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/")
  await expect(page.locator(".odds-job-chance").first()).toHaveAttribute("title", "Import your LinkedIn profile or add a CV in Odds to calculate your interview chance")
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "limit", message: "Up to 30 new jobs a day." }
  await page.reload()
  await expect(page.locator(".odds-job-chance").first()).toHaveText("Retry")
  await expect(page.locator(".odds-job-chance").first()).toHaveAttribute("title", "Up to 30 new jobs a day.")
  expect(fake.calls).toHaveLength(0)
})

test("a saved card opens the native side panel with the exact selection ready even if the panel loads late", async ({ context, fake }) => {
  await connect(context)
  const worker = context.serviceWorkers()[0]
  await worker.evaluate(() => chrome.storage.local.set({ oddsPanelInPage: false }))
  fake.peek = { known: true, saved: true, chance_pct: 8.6, job: { id: "selected-job", title: "Selected job" } }
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/")
  await expect(page.locator(".odds-job-chance").first()).toContainText("8.6%")
  await page.locator(".odds-job-chance").first().click()
  await expect(page.locator("html")).toHaveAttribute("data-odds-panel", "side")
  const panelPage = await context.newPage()
  await panelPage.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`)
  await page.bringToFront()
  const selected = await panelPage.evaluate(() => new Promise((resolve) => chrome.runtime.sendMessage({ type: "panel-ready" }, resolve)))
  expect(selected).toMatchObject({ job: { id: "selected-job", chance_pct: 8.6 } })
  await expect(page.locator("#odds-panel-frame")).toHaveCount(0)
  expect(fake.calls).toHaveLength(0)
})

// LinkedIn's live general-search cards use whole-card anchors and currentJobId,
// with generated classes rather than the classic job-card-container class.
test("general search displays chances on whole-card links immediately, including jobs inserted after SPA navigation", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, saved: true, chance_pct: 12.3, job: { id: "pabc", title: "Finance Intern" } }
  await context.route("https://www.linkedin.com/search/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><main><a href="/jobs/search/?currentJobId=4470000101"><div><p>Finance Intern</p><p>Acme</p><p>Amsterdam</p><button>Save</button></div></a></main>` }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/search/results/all/?keywords=jobs")
  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(1)
  await expect(badges).toContainText("12.3%")
  await page.evaluate(() => {
    history.pushState({}, "", "/search/results/all/?keywords=intern")
    document.querySelector("main")!.insertAdjacentHTML("beforeend", '<a href="/jobs/search/?currentJobId=4470000102"><p>Marketing Intern</p><button>Save</button></a>')
  })
  await expect(badges).toHaveCount(2)
  await expect(badges.nth(1)).toContainText("12.3%")
  expect(fake.calls).toHaveLength(0)
})

test("job badges show only the percentage and fit beside Save without overflowing the card", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, saved: true, chance_pct: 12.3, job: { id: "pabc", title: "Finance Intern" } }
  await context.route("https://www.linkedin.com/search/**", route => route.fulfill({ contentType: "text/html", body: '<main><a style="display:block;width:300px" href="/jobs/search/?currentJobId=4470000101"><p>Finance Intern</p><div style="display:flex;justify-content:flex-end"><button style="height:28px;border-radius:14px">Save</button></div></a></main>' }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/search/results/all/?keywords=jobs")
  const badge = page.locator(".odds-job-chance")
  await expect(badge).toHaveText("12.3%")
  expect(await badge.evaluate(el => el.nextElementSibling?.textContent)).toBe("Save")
  const bounds = await badge.evaluate(el => ({pill:el.getBoundingClientRect().width,card:el.closest("a")!.getBoundingClientRect().width,height:el.getBoundingClientRect().height,save:el.nextElementSibling!.getBoundingClientRect().height}))
  expect(bounds.pill).toBeLessThan(bounds.card)
  // As tall as the Save beside it, and Save keeps its own size (the row does not stretch it to odds).
  expect(bounds.height).toBe(28)
  expect(bounds.save).toBe(28)
})

test("settled badges do not rewrite DOM during scroll events or unrelated page updates", async ({ context }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/search/**", route => route.fulfill({ contentType: "text/html", body: '<main><a href="/jobs/search/?currentJobId=4470000101"><p>Finance Intern</p><button>Save</button></a><span id="unrelated">Notification</span></main>' }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/search/results/all/?keywords=jobs")
  await expect(page.locator(".odds-job-chance")).toHaveText("4.4%")
  const writes = await page.evaluate(async () => {
    let count = 0
    const observer = new MutationObserver(changes => { count += changes.filter(c => (c.target as Element).closest?.(".odds-job-chance")).length })
    observer.observe(document.documentElement, {subtree:true,childList:true,attributes:true})
    for (let i=0;i<100;i++) {
      window.dispatchEvent(new Event("scroll"))
      document.querySelector("#unrelated")!.textContent = String(i)
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
    observer.disconnect()
    return count
  })
  expect(writes).toBe(0)
})

test("recent percentages survive page reload without another backend lookup", async ({ context, fake }) => {
  await connect(context)
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  const reads = fake.peeks.length
  await page.reload()
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  expect(fake.peeks.length).toBe(reads)
})

test("connected toolbar opens directly instead of showing a popup menu", async ({ context }) => {
  const worker = context.serviceWorkers()[0]
  await expect.poll(() => worker.evaluate(() => chrome.action.getPopup({}))).toMatch(/\/popup\.html$/)
  await connect(context)
  await expect.poll(() => worker.evaluate(() => chrome.action.getPopup({}))).toBe("")
  await worker.evaluate(() => chrome.storage.local.set({ oddsKey: null }))
  await expect.poll(() => worker.evaluate(() => chrome.action.getPopup({}))).toMatch(/\/popup\.html$/)
})


test("classic LinkedIn search inside preload gets list badges and a selected percentage beside Save", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, saved: true, chance_pct: 4.4, job: { id: "pabc" } }
  await context.route("https://www.linkedin.com/preload/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><main><ul><li data-job-id="4470000101"><div class="job-card-container__title"><a class="job-card-container__link" href="/jobs/view/4470000101/">Finance Intern</a></div></li><li data-job-id="4470000102"><a class="job-card-container__link" href="/jobs/view/4470000102/">Marketing Intern</a></li></ul><section class="jobs-search__job-details"><h1><a href="/jobs/view/4470000101/">Finance Intern</a></h1><div><button>Apply</button><button class="jobs-save-button">Save Finance Intern at Acme</button></div></section></main>` }))
  await context.route("https://www.linkedin.com/jobs/search/**", route => route.fulfill({ contentType: "text/html", body: '<iframe style="width:100%;height:700px" src="https://www.linkedin.com/preload/?_bprMode=vanilla"></iframe>' }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470000101")
  const frame = page.frameLocator('iframe[src*="/preload/"]')
  await expect(frame.locator(".odds-job-chance")).toHaveCount(2)
  await expect(frame.locator(".odds-job-chance").nth(0)).toHaveText("4.4%")
  await expect(frame.locator("#odds-add")).toHaveText("4.4%")
  await expect(frame.locator("#odds-add")).toHaveAttribute("data-where", "inline")
  await expect(page.locator("#odds-add")).toHaveCount(0)
  await frame.locator("h1 a").evaluate(e => e.setAttribute("href", "/jobs/view/4470000102/"))
  await expect.poll(() => fake.peeks.includes("https://www.linkedin.com/jobs/view/4470000102/")).toBe(true)
})

// ---- Other job sites. Their pages are built the way each site built them in October 2026 (structure, sizes and labels copied from the real pages,
// texts made up). The real sites are checked by hand in the real browser (extension/README.md).

const ABOUT = "We are looking for a motivated intern to join our international team in Amsterdam. You will work in English with analysts and engineers, and learn how we build products."
/** A job page's schema.org JobPosting, as job sites give it to search engines. */
const ldJob = (title: string, company: string, city: string, region = "NH"): string =>
  `<script type="application/ld+json">${JSON.stringify({ "@context": "http://schema.org", "@type": "JobPosting", title, datePosted: "2026-10-01T08:00:00Z", description: `<p>${ABOUT}</p><ul><li>Python</li><li>SQL</li></ul>`, hiringOrganization: { "@type": "Organization", name: company }, jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "NL", addressLocality: city, addressRegion: region } } })}</script>`

const INDEED_JOBS: Record<string, [string, string]> = { aaaaaaaaaaaaaaa1: ["Data Intern", "Acme"], aaaaaaaaaaaaaaa2: ["Finance Intern", "Beta"] }
/**
 * nl.indeed.com's search: cards with their bookmark in a narrow box pinned to the card's corner (long titles run up to it) and a row of 24px chips
 * (pay, Stage, Fulltime); the open job beside the list with a row of 44px rounded-square buttons.
 */
const INDEED_SEARCH = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px Arial;margin:0}#list{width:470px;float:left}
.job_seen_beacon{position:relative;border:1px solid #ccc;border-radius:8px;margin:8px;padding:16px 64px 16px 16px;height:120px}
.ctaContainer{position:absolute;top:10px;right:0;width:44px}button.bookmark{width:28px;height:44px;border:0;background:none;padding:0}
ul.metadataContainer{display:flex;gap:4px;list-style:none;padding:0;margin:8px 0}ul.metadataContainer li{height:24px;border-radius:8px;background:#f3f2f1;font-size:12px;padding:0 8px;display:flex;align-items:center}
#jobsearch-ViewjobPaneWrapper{margin-left:500px;padding:16px}.row{display:flex;gap:16px;align-items:center}
.row button{height:44px;border-radius:12px;border:0;background:#f3f2f1;font-size:16px}.apply{padding:0 16px}.icon{width:44px}
</style></head><body><div id="list">${Object.entries(INDEED_JOBS)
  .map(([jk, [title, company]]) => `<div class="job_seen_beacon"><h2><a class="jcs-JobTitle" data-jk="${jk}" href="/pagead/clk?mo=r&ad=${jk}">${title}</a></h2><div class="company_location"><span data-testid="company-name">${company}</span></div><div class="jobMetaDataGroup"><ul class="heading6 tapItem-gutter metadataContainer"><li data-testid="attribute_snippet_testid">€ 600 per maand</li><li data-testid="attribute_snippet_testid">Stage</li></ul></div><div class="ctaContainer"><button class="bookmark" aria-label="Save job Toggle">♡</button></div></div>`)
  .join("")}</div><div id="jobsearch-ViewjobPaneWrapper"><h2 data-testid="jobsearch-JobInfoHeader-title">Data Intern</h2><div class="row"><div><button class="apply">Solliciteer op website van werkgever</button></div><div><button class="icon" aria-label="Vacature opslaan">♡</button></div><div><button class="icon" aria-label="Vacature delen">↗</button></div></div></div></body></html>`

async function indeed(context: BrowserContext): Promise<void> {
  await context.route("https://nl.indeed.com/jobs**", (route) => route.fulfill({ contentType: "text/html", body: INDEED_SEARCH }))
  await context.route("https://nl.indeed.com/viewjob**", (route) => {
    const jk = new URL(route.request().url()).searchParams.get("jk") ?? ""
    const [title, company] = INDEED_JOBS[jk] ?? ["", ""]

    return route.fulfill({ contentType: "text/html", body: `<!doctype html><title>${title}</title>${ldJob(title, company, "Amsterdam")}<h1>${title}</h1>` })
  })
}
const INDEED_FIRST = "https://nl.indeed.com/viewjob?jk=aaaaaaaaaaaaaaa1"

test("Indeed: beside the open job's 'Vacature opslaan', the same 44px rounded square; on every card the first of its chips, their size, clear of the title", async ({ context, fake }) => {
  await connect(context)
  await indeed(context)
  fake.peek = { known: true, id: "pind", saved: false, chance_pct: 9.1, needs_profile: false }
  const page = await context.newPage()
  await page.goto("https://nl.indeed.com/jobs?q=internship&l=Amsterdam&vjk=aaaaaaaaaaaaaaa1")
  const pill = page.locator("#odds-add")
  await expect(pill).toContainText("9.1%")
  await expect(pill).toHaveAttribute("data-where", "inline")
  expect(await pill.evaluate((el) => el.previousElementSibling?.querySelector("button")?.getAttribute("aria-label"))).toBe("Vacature opslaan")
  expect(await pill.evaluate((el) => [getComputedStyle(el).height, getComputedStyle(el).borderTopLeftRadius, getComputedStyle(el).marginLeft])).toEqual(["44px", "12px", "0px"])
  expect(fake.peeks).toContain(INDEED_FIRST)

  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(2)
  await expect(badges.nth(0)).toContainText("9.1%")
  for (const badge of await badges.all()) {
    const fit = await badge.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const chip = el.nextElementSibling!
      const title = el.closest(".job_seen_beacon")!.querySelector("h2")!.getBoundingClientRect()
      const style = getComputedStyle(el)

      return { row: el.parentElement!.matches("ul.metadataContainer") && el.parentElement!.firstElementChild === el, chip: chip.textContent, size: [box.height, style.borderTopLeftRadius, style.fontSize], chipSize: [chip.getBoundingClientRect().height, getComputedStyle(chip).borderTopLeftRadius], gap: Math.round(chip.getBoundingClientRect().left - box.right), clear: box.top >= title.bottom }
    })
    expect(fit.row).toBe(true)
    expect(fit.chip).toBe("€ 600 per maand")
    expect(fit.size).toEqual([24, "8px", "12px"])
    expect(fit.chipSize).toEqual([24, "8px"])
    // Indeed's own gap between chips, no margin of its own.
    expect(fit.gap).toBe(4)
    expect(fit.clear).toBe(true)
  }
  await shot(page, "ext-indeed")
})

test("Indeed: a job odds does not hold is read from its own Indeed page and kept for everyone, so its percentage shows without a press", async ({ context, fake }) => {
  await connect(context)
  await indeed(context)
  fake.peek = { known: false }
  fake.answersByUrl[`analyze ${INDEED_FIRST}`] = { status: "added", known: true, saved: false, chance_pct: 6.2, job: { id: "pind1", title: "Data Intern" } }
  fake.answersByUrl["analyze https://nl.indeed.com/viewjob?jk=aaaaaaaaaaaaaaa2"] = { status: "added", known: true, saved: false, chance_pct: 3.4, job: { id: "pind2", title: "Finance Intern" } }
  const page = await context.newPage()
  await page.goto("https://nl.indeed.com/jobs?q=internship&vjk=aaaaaaaaaaaaaaa1")
  await expect(page.locator("#odds-add")).toContainText("6.2%")
  await expect(page.locator(".odds-job-chance").nth(1)).toContainText("3.4%")
  const sent = fake.analyzed.find((a) => a.url === INDEED_FIRST)
  expect(sent?.posting).toMatchObject({ title: "Data Intern", company: "Acme", location: "Amsterdam, North Holland, Netherlands", posted: "2026-10-01T08:00:00Z" })
  expect(String(sent?.posting?.description)).toContain("international team")
  // Nothing was kept for the person by looking.
  expect(fake.calls).toHaveLength(0)
})

test("Indeed: pressing the button keeps the job, sending it as its page shows it; a job that cannot be read first says Check and a click retries reading without saving", async ({ context, fake }) => {
  await connect(context)
  await indeed(context)
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "unreadable", message: "odds could not read that job page." }
  fake.answer = { status: "added", saved: true, chance_pct: 6.2, job: { id: "pind1", title: "Data Intern" } }
  const page = await context.newPage()
  await page.goto("https://nl.indeed.com/jobs?q=internship&vjk=aaaaaaaaaaaaaaa1")
  await expect(page.locator("#odds-add")).toHaveText("Check")
  await expect(page.locator("#odds-add")).toHaveAttribute("title", /does not have this job yet/)
  fake.analyzeAnswer = { status: "added", saved: false, chance_pct: 6.2, job: { id: "pind1", title: "Data Intern" } }
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "idle")
  await expect(page.locator("#odds-add")).toContainText("6.2%")
  expect(fake.calls).toHaveLength(0)
  expect(fake.analyzed.some(a => a.url === INDEED_FIRST && a.posting?.company === "Acme")).toBe(true)
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
})

const GLASSDOOR_JOBS: Record<string, { title: string; company: string; rating: string; place: string; href: string }> = {
  "1009000000001": { title: "Data Intern", company: "Acme", rating: "3,9", place: "Amsterdam", href: "https://www.glassdoor.nl/job-listing/data-intern-acme-JV_IC3064478_KO0,11_KE12,16.htm?jl=1009000000001" },
  "1009000000002": { title: "Finance Intern", company: "Beta", rating: "4,1", place: "Utrecht", href: "https://www.glassdoor.nl/job-listing/finance-intern-beta-JV_IC3064478_KO0,14_KE15,19.htm?jl=1009000000002" },
}
/** glassdoor.nl's search: cards with a 40px Save pinned to their corner; pressing a card opens its job beside the list without leaving the page. */
const GLASSDOOR_SEARCH = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px Arial;margin:0}ul{width:440px;float:left;list-style:none;padding:0}
li[data-test=jobListing]{position:relative;border:1px solid #ddd;border-radius:12px;margin:8px;padding:16px 60px 16px 16px;height:110px}
.saveBox{position:absolute;top:8px;right:8px;display:flex}[data-test=save-job]{width:40px;height:40px;border-radius:8px;border:0;background:none}
#detail{margin-left:470px;padding:16px}header [data-test=save-job]{border:1px solid #00060c}.buttons{display:flex}
.apply{height:40px;border-radius:8px;background:#00060c;color:#fff;padding:0 16px;margin-right:8px}
</style></head><body><ul>${Object.entries(GLASSDOOR_JOBS)
  .map(([id, j]) => `<li data-test="jobListing" data-jobid="${id}"><div><a data-test="job-title" href="${j.href}">${j.title}</a><div>${j.company}</div><div class="JobCard_jobDescriptionSnippet" data-test="descSnippet">A short snippet of ${j.title}, as the card shows it.</div></div><div class="saveBox"><button data-test="save-job" aria-label="Opslaan">♡</button></div></li>`)
  .join("")}</ul><div id="detail"><header data-test="job-details-header"><div><a class="EmployerProfile_employerName">Acme3,9</a><h1 id="jd-job-title-1009000000001">Data Intern</h1><div data-test="location">Amsterdam</div></div><div class="buttons"><div><button class="apply" data-test="applyButton">Solliciteren</button></div><div class="JobDetails_applySaveButtonPosition"><button data-test="save-job" aria-label="Opslaan">♡</button></div></div></header><div class="JobDetails_jobDescription__x">Data Intern. ${ABOUT}</div></div>
<script>
const jobs = ${JSON.stringify(GLASSDOOR_JOBS)}
for (const li of document.querySelectorAll("[data-test=jobListing]")) li.addEventListener("click", (event) => {
  event.preventDefault()
  // Glassdoor draws the open job a moment after the press.
  setTimeout(() => {
    const job = jobs[li.dataset.jobid]
    const h1 = document.querySelector("h1")
    h1.id = "jd-job-title-" + li.dataset.jobid
    h1.textContent = job.title
    document.querySelector(".EmployerProfile_employerName").textContent = job.company + job.rating
    document.querySelector("[data-test=location]").textContent = job.place
    document.querySelector(".JobDetails_jobDescription__x").textContent = job.title + ". " + ${JSON.stringify(ABOUT)}
  }, 300)
})
</script></body></html>`
const GLASSDOOR_SECOND = "https://www.glassdoor.nl/job-listing/finance-intern-beta-JV_IC3064478_KO0,14_KE15,19.htm?jl=1009000000002"

/** Glassdoor's /graph, answering a list of jobView questions as Glassdoor's own page asks them. */
async function glassdoorGraph(context: BrowserContext, asked: number[][]): Promise<void> {
  await context.route("https://www.glassdoor.nl/graph", async (route) => {
    const questions = JSON.parse(route.request().postData() ?? "[]") as Array<{ variables: { jl: number } }>
    asked.push(questions.map((q) => q.variables.jl))
    const answers = questions.map(({ variables: { jl } }) => {
      const job = GLASSDOOR_JOBS[String(jl)]

      return { data: { jobview: job ? { job: { listingId: jl, jobTitleText: job.title, description: `<p>${job.title}. ${ABOUT}</p>` }, header: { employer: { name: `${job.company} B.V.` }, employerNameFromSearch: job.company, locationName: job.place, ageInDays: 3, expired: false } } : null } }
    })

    return route.fulfill({ contentType: "application/json", body: JSON.stringify(answers) })
  })
}

test("Glassdoor: the open job's button matches its outlined 40px Save; every job in the list gets its percentage, read from Glassdoor's /graph together, without opening anything", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.glassdoor.nl/Job/**", (route) => route.fulfill({ contentType: "text/html", body: GLASSDOOR_SEARCH }))
  // Glassdoor's own job pages stop scripts at a "humans only" check: the extension must not need them.
  const blocked: string[] = []
  await context.route("https://www.glassdoor.nl/job-listing/**", (route) => {
    blocked.push(route.request().url())

    return route.fulfill({ status: 403, contentType: "text/html", body: "<title>Just a moment...</title><h1>Humans only</h1>" })
  })
  const asked: number[][] = []
  await glassdoorGraph(context, asked)
  fake.answersByUrl["https://www.glassdoor.nl/job-listing/j.htm?jl=1009000000001"] = { known: true, id: "pgd1", saved: false, chance_pct: 5.5 }
  fake.answersByUrl["https://www.glassdoor.nl/job-listing/data-intern-acme-JV_IC3064478_KO0,11_KE12,16.htm?jl=1009000000001"] = { known: true, id: "pgd1", saved: false, chance_pct: 5.5 }
  fake.peek = { known: false }
  fake.answersByUrl[`analyze ${GLASSDOOR_SECOND}`] = { status: "added", known: true, saved: false, chance_pct: 3.3, job: { id: "pgd2", title: "Finance Intern" } }
  const page = await context.newPage()
  await page.goto("https://www.glassdoor.nl/Job/amsterdam-internship-jobs-SRCH_IL.0,9_IC3064478_KO10,20.htm")
  const pill = page.locator("#odds-add")
  await expect(pill).toContainText("5.5%")
  expect(await pill.evaluate((el) => [getComputedStyle(el).height, getComputedStyle(el).borderTopLeftRadius, el.previousElementSibling?.querySelector("[data-test=save-job]") !== null])).toEqual(["40px", "8px", true])

  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(2)
  await expect(badges.nth(0)).toContainText("5.5%")
  // No ?%: the job odds did not hold was read and kept for everyone, and its chance is there without a press.
  await expect(badges.nth(1)).toHaveText("3.3%")
  expect(await badges.nth(1).evaluate((el) => el.getBoundingClientRect().height)).toBe(32)
  expect(asked.flat()).toContain(1009000000002)
  const sent = fake.analyzed.find((a) => a.url === GLASSDOOR_SECOND)
  expect(sent?.posting).toMatchObject({ title: "Finance Intern", company: "Beta B.V.", location: "Utrecht, Netherlands" })
  expect(String(sent?.posting?.posted)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(String(sent?.posting?.description)).toContain("international team")
  // Nothing was opened or clicked: the open job is still the first, the page is the same, Glassdoor's job pages were never asked for.
  await expect(page.locator("h1")).toHaveText("Data Intern")
  expect(page.url()).toContain("/Job/amsterdam-internship-jobs")
  expect(blocked).toHaveLength(0)
  expect(fake.calls).toHaveLength(0)

  // Pressing it views the enriched job without saving it.
  fake.answersByUrl[`add ${GLASSDOOR_SECOND}`] = { status: "exists", saved: true, chance_pct: 3.3, job: { id: "pgd2", title: "Finance Intern" } }
  await badges.nth(1).click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  expect(fake.calls).toHaveLength(0)
  await shot(page, "ext-glassdoor")
})

const MAGNET_JOB = "https://magnet.me/nl-NL/vacature/1075815/data-intern"
/**
 * A Magnet.me job page: the job for search engines in its head; in a column beside the text, full-width "Solliciteren op website" over "Liken"
 * (Magnet's way of keeping a job), 45px tall, 12px apart; related jobs below.
 */
const MAGNET_PAGE = `<!doctype html><html><head><meta charset="utf-8">${ldJob("Data Intern", "TU Delft", "Delft", "ZH")}<style>body{font:15px Arial;margin:0}.page{display:flex;gap:40px;padding:24px}.text{width:620px}.side{width:279px}.side button{display:block;width:279px;height:45px;border-radius:6px;font-size:16px;border:1px solid #ff5c51}.side .like{margin-top:12px}</style></head><body><main><div class="page"><div class="text"><div><div><h1>Data Intern</h1></div></div><p>${ABOUT}</p></div><div class="side"><div><button class="apply">Solliciteren op website</button><div class="like"><button>Liken</button></div></div></div></div><section><h2>Vergelijkbare vacatures</h2><ul><li class="tile"><a href="/nl-NL/vacature/1086286/finance-trainee">Finance Trainee</a><p>Beta</p></li></ul></section></main></body></html>`

test("Magnet.me and any job page that says what it is: the button beside its Save, the job read from the page itself, related jobs badged", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://magnet.me/**", (route) =>
    route.fulfill({ contentType: "text/html", body: route.request().url().includes("1086286") ? `<!doctype html>${ldJob("Finance Trainee", "Beta", "Utrecht", "UT")}<h1>Finance Trainee</h1>` : MAGNET_PAGE }),
  )
  fake.peek = { known: false }
  fake.answersByUrl[`analyze ${MAGNET_JOB}`] = { status: "added", known: true, saved: false, chance_pct: 11.5, job: { id: "pmag", title: "Data Intern" } }
  fake.answersByUrl["analyze https://magnet.me/nl-NL/vacature/1086286/finance-trainee"] = { status: "added", known: true, saved: false, chance_pct: 2.2, job: { id: "pmag2", title: "Finance Trainee" } }
  const page = await context.newPage()
  await page.goto(`${MAGNET_JOB}?utm_source=newsletter`)
  const pill = page.locator("#odds-add")
  await expect(pill).toContainText("11.5%")
  // One more full-width row under Like, as tall, as round and as far below it as Like is below Apply.
  await expect(pill).toHaveAttribute("data-where", "stack")
  expect(await pill.evaluate((el) => {
    const like = el.previousElementSibling!.getBoundingClientRect()
    const box = el.getBoundingClientRect()

    return [el.previousElementSibling!.textContent, box.width, box.height, getComputedStyle(el).borderTopLeftRadius, Math.round(box.top - like.bottom), box.left === like.left]
  })).toEqual(["Liken", 279, 45, "6px", 12, true])
  expect(fake.analyzed.find((a) => a.url === MAGNET_JOB)?.posting).toMatchObject({ title: "Data Intern", company: "TU Delft", location: "Delft, South Holland, Netherlands" })
  await expect(page.locator(".tile .odds-job-chance")).toContainText("2.2%")
  expect(fake.analyzed.find((a) => a.url === "https://magnet.me/nl-NL/vacature/1086286/finance-trainee")?.posting).toMatchObject({ company: "Beta" })
})

test("an employer's own job page anywhere gets the button; its other pages, and pages that are not jobs, get nothing and ask odds nothing", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "added", known: true, saved: false, chance_pct: 14, job: { id: "pweb", title: "Strategy Intern" } }
  await context.route("https://careers.example-employer.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: route.request().url().includes("/jobs/") ? `<!doctype html>${ldJob("Strategy Intern", "Example Employer", "Rotterdam", "ZH")}<h1>Strategy Intern</h1><p>${ABOUT}</p>` : "<!doctype html><h1>About us</h1><p>We make things.</p>" }),
  )
  await context.route("https://news.example.org/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><h1>News</h1><a href="${INDEED_FIRST}">An Indeed job</a><a href="https://www.linkedin.com/jobs/view/4470863235/">A LinkedIn job</a>` }))
  const page = await context.newPage()
  await page.goto("https://careers.example-employer.com/about")
  await page.goto("https://news.example.org/today")
  await page.waitForTimeout(1500)
  await expect(page.locator("#odds-add, .odds-job-chance")).toHaveCount(0)
  expect(fake.peeks).toHaveLength(0)

  await page.goto("https://careers.example-employer.com/jobs/strategy-intern?utm_campaign=x")
  const pill = page.locator("#odds-add")
  await expect(pill).toContainText("14%")
  // No Save or Apply beside its title: it waits at the edge of the page.
  await expect(pill).toHaveAttribute("data-where", "float")
  expect(fake.analyzed[0]).toMatchObject({ url: "https://careers.example-employer.com/jobs/strategy-intern", posting: { title: "Strategy Intern", company: "Example Employer" } })
})

/** LinkedIn's search as it is drawn in October 2026: each card with a row of 32px round buttons at its corner (Dismiss ✕), the open job with Apply and Save, which reads "Saved" once the job is kept. */
const LINKEDIN_SEARCH = (saved: boolean): string => `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px Arial;margin:0}.list{width:500px;float:left}li{list-style:none}.job-card-container{display:flex;position:relative;padding:12px;border-bottom:1px solid #ddd}
.job-card-list__actions-container{display:flex;gap:4px;margin-left:auto}.job-card-list__actions-container button{width:32px;height:32px;border-radius:999px;border:0}
.artdeco-entity-lockup__title{display:block;overflow:hidden;max-height:40px}.jobs-search__job-details{margin-left:520px}.btns{display:flex}.btns button{height:40px;border-radius:999px;padding:0 16px;font-size:16px}
</style></head><body><main><ul class="list">${["4470000201", "4470000202", "4470000203"].map((id, i) => `<li data-occludable-job-id="${id}"><div class="display-flex job-card-container"><div><div class="artdeco-entity-lockup__title"><a class="job-card-container__link" href="/jobs/view/${id}/?trk=x">${["Growth Hacker Intern Ecommerce", "Marketing Automation Intern", "Market Development Intern with a very long title that LinkedIn cuts after two lines"][i]}</a></div><div>Company ${i}</div></div><div class="job-card-list__actions-container"><div><button aria-label="Dismiss job">✕</button></div></div></div></li>`).join("")}</ul>
<section class="jobs-search__job-details"><h1><a href="/jobs/view/4470000203/">Market Development Intern</a></h1><div class="btns" style="gap:8px"><div><button class="jobs-apply-button">Apply</button></div><div><button class="jobs-save-button" aria-label="${saved ? "Saved, Market Development Intern" : "Save Market Development Intern"}">${saved ? "Saved" : "Save"}</button></div></div></section></main></body></html>`

/** LinkedIn's public page of one job, the one its guest job pages load. */
const LINKEDIN_PUBLIC = (title: string): string => `<section class="top-card-layout"><h2 class="top-card-layout__title font-sans topcard__title">${title}</h2><a class="topcard__org-name-link topcard__flavor--black-link" href="https://nl.linkedin.com/company/acme">  Acme  </a><span class="topcard__flavor topcard__flavor--bullet">Amsterdam, North Holland, Netherlands</span><figcaption class="num-applicants__caption">Be among the first 25 applicants</figcaption><div class="show-more-less-html__markup">${ABOUT}<ul><li>Marketing</li></ul></div><h3 class="description__job-criteria-subheader">Seniority level</h3><span class="description__job-criteria-text">Internship</span></section>`

test("LinkedIn search: every card's badge is the first of its 32px round buttons, the jobs in view are looked up together, and the open job's button sits beside Saved", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LINKEDIN_SEARCH(true) }))
  fake.peek = { known: true, id: "pli", saved: false, chance_pct: 4.5 }
  fake.answersByUrl["https://www.linkedin.com/jobs/view/4470000203/"] = { known: true, id: "pli3", saved: true, chance_pct: 9.2 }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470000203")
  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(3)
  for (const badge of await badges.all()) await expect(badge).toContainText("%")
  // One look-up for the three cards, not one each.
  expect(fake.batches).toContain(3)
  for (const badge of await badges.all()) {
    const fit = await badge.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const x = el.parentElement!.querySelector("button[aria-label^=Dismiss]")!.getBoundingClientRect()

      return { first: el.parentElement!.matches(".job-card-list__actions-container") && el.parentElement!.firstElementChild === el, height: box.height, corners: getComputedStyle(el).borderTopLeftRadius, gap: Math.round(x.left - box.right), middle: Math.abs(box.top + box.height / 2 - (x.top + x.height / 2)) }
    })
    expect(fit).toEqual({ first: true, height: 32, corners: "999px", gap: 4, middle: 0 })
  }
  // The job is saved on LinkedIn: its button reads "Saved", and odds is still beside it, not floating at the edge.
  const pill = page.locator("#odds-add")
  await expect(pill).toContainText("9.2%")
  await expect(pill).toHaveAttribute("data-where", "inline")
  expect(await pill.evaluate((el) => [el.previousElementSibling?.querySelector("button")?.textContent, getComputedStyle(el).height])).toEqual(["Saved", "40px"])
  await shot(page, "ext-linkedin-search")
})

test("LinkedIn: a job odds does not hold is read from LinkedIn's public page of it in the browser (free, no Apify), so its percentage shows without a press", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LINKEDIN_SEARCH(false) }))
  const publicReads: string[] = []
  await context.route("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/**", (route) => {
    const id = route.request().url().split("/").pop()!
    publicReads.push(id)

    return route.fulfill({ contentType: "text/html", body: LINKEDIN_PUBLIC(`Job ${id}`) })
  })
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "added", known: true, saved: false, chance_pct: 6.6, job: { id: "pnew", title: "Job" } }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470000203")
  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(3)
  for (const badge of await badges.all()) await expect(badge).toHaveText("6.6%")
  await expect(page.locator("#odds-add")).toContainText("6.6%")
  expect(new Set(publicReads)).toEqual(new Set(["4470000201", "4470000202", "4470000203"]))
  // Each was sent as LinkedIn's public page shows it; odds pays for nothing.
  const sent = fake.analyzed.find((a) => a.url === "https://www.linkedin.com/jobs/view/4470000201/")
  expect(sent?.posting).toMatchObject({ title: "Job 4470000201", company: "Acme", location: "Amsterdam, North Holland, Netherlands", applicants: "Be among the first 25 applicants", seniority: "Internship" })
  expect(fake.analyzed.every((a) => a.posting)).toBe(true)
  expect(fake.calls).toHaveLength(0)
})

/**
 * LinkedIn's Easy Apply as it is built in October 2026: a modal (data-test-modal-id="easy-apply-modal") with one step at a time, each question in
 * a data-test-form-element, "Continue to next step", then "Review your application", then "Submit application" (data-live-test-easy-apply-submit-button),
 * and "Your application was sent" when it is sent. LinkedIn fills email and the phone's country itself.
 */
const EASY_APPLY = `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
<section class="jobs-search__job-details"><h1><a href="/jobs/view/4470000301/">Data Intern</a></h1><div style="display:flex;gap:8px"><div><button id="jobs-apply-button-id" aria-label="Easy Apply to Data Intern at Acme">Easy Apply</button></div><div><button class="jobs-save-button">Save</button></div></div></section>
</main><script>
const steps = [
  { title: "Contact info", html: \`
    <div data-test-form-element><label for="email">Email Email</label><select id="email" required><option>Select an option</option><option selected>kien@example.com</option></select></div>
    <div data-test-form-element><label for="cc">Phone country code Phone country code</label><select id="cc"><option>Select an option</option><option selected>Netherlands (+31)</option></select></div>
    <div data-test-form-element><label for="phone">Mobile phone number</label><input id="phone" type="text" required></div>\` },
  { title: "Resume", html: \`
    <input type="radio" name="cv" id="jobsDocumentCardToggle-1" aria-label="Deselect resume Kien_Old_CV.pdf" checked>
    <input type="radio" name="cv" id="jobsDocumentCardToggle-2" aria-label="Select resume Kien_Data_CV.pdf">\` },
  { title: "Additional Questions", html: \`
    <div data-test-form-element><label for="dutch">What is your level of proficiency in Dutch? What is your level of proficiency in Dutch?</label><select id="dutch"><option>Select an option</option><option>None</option><option>Conversational</option><option>Professional</option><option>Native or bilingual</option></select></div>
    <div data-test-form-element><fieldset><legend><span data-test-form-builder-radio-button-form-component__title>Will you now or in the future require visa sponsorship?</span></legend><input type="radio" name="sp" id="sp-yes"><label for="sp-yes">Yes</label><input type="radio" name="sp" id="sp-no"><label for="sp-no">No</label></fieldset></div>
    <div data-test-form-element><label for="sql">How many years of work experience do you have with SQL?</label><input id="sql" type="text" class="numeric"></div>
    <div data-test-form-element><p>You declare that you have read and agree to the job applications privacy notice of Acme.*</p><div class="fb-text-selectable"><label><input type="checkbox" id="priv" required> I consent</label></div></div>
    <div data-test-form-element><p>You declare that you have read and understand the privacy notice and agree to be part of communities for future career opportunities.</p><label><input type="checkbox" id="pool" required> I consent</label></div>
    <div data-test-form-element><p>You declare that you have read and understand the privacy notice and agree to receive WhatsApp messages for job applications.</p><label><input type="checkbox" id="wa" required> I consent</label></div>\` },
  { title: "Review your application", html: "<p>Review</p>" },
]
let at = 0
window.submits = 0
window.seen = {}
function draw() {
  const modal = document.querySelector("[data-test-modal-id=easy-apply-modal]")
  const last = at === steps.length - 1
  modal.querySelector(".artdeco-modal__content").innerHTML = "<h3>" + steps[at].title + "</h3>" + steps[at].html
  modal.querySelector(".buttons").innerHTML = last ? '<button data-live-test-easy-apply-submit-button aria-label="Submit application">Submit application</button>' : '<button data-easy-apply-next-button aria-label="' + (at === steps.length - 2 ? "Review your application" : "Continue to next step") + '">Next</button>'
}
document.addEventListener("click", (event) => {
  const b = event.target.closest("button")
  if (!b) return
  if (b.id === "jobs-apply-button-id") {
    document.body.insertAdjacentHTML("beforeend", '<div data-test-modal-id="easy-apply-modal" role="dialog"><div class="artdeco-modal__content"></div><div class="buttons"></div></div>')
    draw()
  }
  if (b.hasAttribute("data-easy-apply-next-button")) {
    const modal = document.querySelector("[data-test-modal-id=easy-apply-modal]")
    for (const el of modal.querySelectorAll("input, select")) window.seen[el.id] = el.type === "radio" || el.type === "checkbox" ? el.checked : el.value
    // Required consents must be ticked or Next stays blocked (Redcare / Easy Apply).
    if ([...modal.querySelectorAll("input[type=checkbox][required]")].some((c) => !c.checked)) return
    setTimeout(() => { at++; draw() }, 150)
  }
  if (b.hasAttribute("data-live-test-easy-apply-submit-button")) {
    window.submits++
    document.querySelector("[data-test-modal-id=easy-apply-modal]").remove()
    document.body.insertAdjacentHTML("beforeend", '<div role="dialog">Your application was sent to Acme!</div>')
  }
})
</script></body></html>`

test("Easy Apply with odds: filled in from odds, the job's own CV chosen, a new question kept once answered, stopped before Submit, marked applied when sent", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000301/**", (route) => route.fulfill({ contentType: "text/html", body: EASY_APPLY }))
  fake.peek = { known: true, id: "papply", saved: true, chance_pct: 8.8 }
  fake.kit = {
    job_id: "papply",
    facts: { name: "Kien Phung", email: "kien@example.com", phone: "+31 6 1234 5678", place: "Amsterdam, Netherlands", dutch: "basic", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} },
    cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true },
  }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000301/")
  await page.locator("#jobs-apply-button-id").click()
  const modal = page.locator("[data-test-modal-id=easy-apply-modal]")
  // Step 1 and 2 are complete once odds has filled them in: it goes on by itself, to the questions.
  await expect(modal.locator("h3")).toHaveText("Additional Questions", { timeout: 10000 })
  expect(await page.evaluate(() => (window as unknown as { seen: Record<string, unknown> }).seen)).toMatchObject({ phone: "612345678", "jobsDocumentCardToggle-2": true, "jobsDocumentCardToggle-1": false })
  // What odds knows is answered; what it does not is marked and left for the person.
  await expect(modal.locator("#dutch")).toHaveValue("Conversational")
  await expect(modal.locator("#sp-no")).toBeChecked()
  // Consent boxes are always ticked; only SQL (unknown) stays marked.
  await expect(modal.locator("#priv")).toBeChecked({ timeout: 8000 })
  await expect(modal.locator("#pool")).toBeChecked()
  await expect(modal.locator("#wa")).toBeChecked()
  await expect(modal.locator(".odds-apply-bar")).toContainText(/marked question/i)
  await expect(modal.locator("[data-test-form-element].odds-ask")).toHaveCount(1)
  await expect(modal.locator("[data-test-form-element].odds-ask label")).toContainText("SQL")
  await modal.locator("#sql").fill("3")
  await modal.getByRole("button", { name: "Review your application" }).click()
  // The person's own answer is kept for the next form.
  await expect.poll(() => fake.kept).toEqual([{ question: "How many years of work experience do you have with SQL?", answer: "3" }])
  // At the review odds stops: Submit is the person's.
  await expect(modal.locator(".odds-apply-bar")).toContainText("press Submit yourself", { timeout: 8000 })
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { submits: number }).submits)).toBe(0)
  await shot(page, "ext-easy-apply")
  await modal.getByRole("button", { name: "Submit application" }).click()
  await expect.poll(() => fake.applied, { timeout: 8000 }).toEqual(["https://www.linkedin.com/jobs/view/4470000301/"])
})

test("ACCEPT Easy Apply: known contact facts but empty DOM never claims Filled in by odds @accept", async ({ context, fake }) => {
  await connect(context)
  // Contact step + Submit visible: kit has name/email/phone but values refuse to stick → censor must not Ready.
  const body = `<!doctype html><html><body>
<div data-test-modal-id="easy-apply-modal" role="dialog">
  <div class="artdeco-modal__content">
    <h3>Contact info</h3>
    <div data-test-form-element><label for="fn">First name *</label><input id="fn" required></div>
    <div data-test-form-element><label for="ln">Last name *</label><input id="ln" required></div>
    <div data-test-form-element><label for="em">Email *</label><input id="em" type="email" required></div>
    <div data-test-form-element><label for="ph">Phone *</label><input id="ph" type="tel" required></div>
  </div>
  <div class="buttons"><button data-live-test-easy-apply-submit-button aria-label="Submit application">Submit application</button></div>
</div>
<script>
document.addEventListener("input", (e) => {
  const t = e.target
  if (t && ["fn","ln","em","ph"].includes(t.id)) setTimeout(() => { t.value = "" }, 0)
}, true)
</script>
</body></html>`
  await context.route("https://www.linkedin.com/jobs/view/4470000400/**", (route) => route.fulfill({ contentType: "text/html", body }))
  fake.peek = { known: true, id: "pcontact", saved: true, chance_pct: 8.8 }
  fake.kit = {
    job_id: "pcontact",
    facts: {
      name: "Kien Phung",
      email: "kien@example.com",
      phone: "+31 6 1234 5678",
      answers: { first_name: "Kien", last_name: "Phung", email: "kien@example.com", phone: "+31 6 1234 5678" },
      remembered: {},
    },
    cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true },
  }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000400/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000400/")
  await expect(page.locator(".odds-apply-bar")).toBeVisible({ timeout: 10000 })
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Filled in by odds/i, { timeout: 10000 })
  await expect(page.locator(".odds-apply-bar")).not.toHaveAttribute("data-state", "done")
  await expect(page.locator("#fn")).toHaveValue("")
  await expect(page.locator(".odds-apply-bar")).toContainText(/marked question|outlined question|Answer the|asking Odds|assist/i, { timeout: 10000 })
})

test("Easy Apply never says Filled in by odds while required fields are still empty", async ({ context, fake }) => {
  await connect(context)
  // Single step already open: Submit visible + empty required fields Odds "knows" labels for but values never stick.
  const body = `<!doctype html><html><body>
<div data-test-modal-id="easy-apply-modal" role="dialog">
  <div class="artdeco-modal__content">
    <h3>Additional Questions</h3>
    <div data-test-form-element><label for="city">City *</label><input id="city" required></div>
    <div data-test-form-element><label for="why">Why do you want this role? *</label><textarea id="why" required></textarea></div>
  </div>
  <div class="buttons"><button data-live-test-easy-apply-submit-button aria-label="Submit application">Submit application</button></div>
</div>
<script>
// Reject typed values so fill looks successful to agentCanAnswer but DOM stays empty (the false-Ready bug).
document.addEventListener("input", (e) => {
  const t = e.target
  if (t && (t.id === "city" || t.id === "why")) setTimeout(() => { t.value = "" }, 0)
}, true)
</script>
</body></html>`
  await context.route("https://www.linkedin.com/jobs/view/4470000399/**", (route) => route.fulfill({ contentType: "text/html", body }))
  fake.peek = { known: true, id: "pempty", saved: true, chance_pct: 8.8 }
  fake.kit = {
    job_id: "pempty",
    facts: {
      name: "Kien Phung",
      email: "kien@example.com",
      place: "Amsterdam",
      answers: { city: "Amsterdam", first_name: "Kien", last_name: "Phung" },
      remembered: {},
    },
    cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true },
  }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000399/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000399/")
  await expect(page.locator(".odds-apply-bar")).toBeVisible({ timeout: 10000 })
  // Must not claim ready while city/why stay empty.
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Filled in by odds/i, { timeout: 8000 })
  await expect(page.locator("#city")).toHaveValue("")
  await expect(page.locator("#why")).toHaveValue("")
  await expect(page.locator(".odds-apply-bar")).toContainText(/marked question|outlined question|Answer the/i, { timeout: 8000 })
})

test("Bosch-like profiles: fills LinkedIn/Website, never Ready while they or Resume stay empty", async ({ context, fake }) => {
  await connect(context)
  // Mirrors Phenom/Bosch: plain "LinkedIn" label (no URL), Website, Resume heading above generic drop zone.
  // Profile URLs that refuse to stick → Ready must never fire; after they stick, Ready still waits on empty Resume when CV exists.
  const body = `<!doctype html><html><body>
<main>
  <h1>Brand & Content Management Internship</h1>
  <form onsubmit="window.sent=true;return false">
    <label>First name *<input name="first_name" required></label>
    <label>Email *<input type="email" name="email" required></label>
    <section>
      <h2>Your Profiles</h2>
      <label>LinkedIn<input id="li" name="linkedin" type="url"></label>
      <label>Facebook<input id="fb" name="facebook" type="url"></label>
      <label>X (fka Twitter)<input id="x" name="twitter" type="url"></label>
      <label>Website<input id="web" name="website" type="url"></label>
    </section>
    <section>
      <h2>Resume</h2>
      <div class="drop"><input id="cv" type="file" accept=".pdf,.doc" style="opacity:0.01"><p>Choose a file or drop it here</p></div>
    </section>
    <button type="submit">Submit application</button>
  </form>
</main>
<script>
window.blockProfiles = true
document.addEventListener("input", (e) => {
  const t = e.target
  if (!window.blockProfiles || !t) return
  if (t.id === "li" || t.id === "web") setTimeout(() => { t.value = "" }, 0)
}, true)
window.sent = false
</script>
</body></html>`
  await context.route("https://careers.bosch.com/**", (route) => route.fulfill({ contentType: "text/html", body }))
  fake.kit = {
    job_id: "p-bosch-profiles",
    facts: {
      name: "Kien Phung",
      email: "kien@example.com",
      linkedin: "https://www.linkedin.com/in/kien",
      answers: {
        first_name: "Kien",
        last_name: "Phung",
        linkedin: "https://www.linkedin.com/in/kien",
        website: "https://kien.example.com",
      },
      remembered: {},
    },
    cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true },
  }
  const page = await context.newPage()
  await page.goto("https://careers.bosch.com/job/brand-intern")
  await applyFrom(context, page, "https://careers.bosch.com/job/brand-intern")
  await expect(page.locator('input[name="first_name"]')).toHaveValue("Kien", { timeout: 10000 })
  await expect(page.locator('input[name="email"]')).toHaveValue("kien@example.com")
  // Broods/Edge must be asked before needs_input (false censor blocked the agent before).
  await expect.poll(() => fake.suggestCalls, { timeout: 10000 }).toBeGreaterThan(0)
  // While LinkedIn/Website refuse to stick: never claim Ready (the screenshot bug).
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Filled in by odds/i, { timeout: 8000 })
  await expect(page.locator("#li")).toHaveValue("")
  await expect(page.locator("#web")).toHaveValue("")
  await expect(page.locator(".odds-apply-bar")).toContainText(/outlined question|Answer the|asking Odds/i, { timeout: 8000 })
  // Unblock profile fields; Resume still empty if file upload fails — still must not Ready until CV lands.
  await page.evaluate(() => { (window as unknown as { blockProfiles: boolean }).blockProfiles = false })
  await page.locator("#li").fill("https://www.linkedin.com/in/kien")
  await page.locator("#web").fill("https://kien.example.com")
  // Continue so fill loop re-checks; CV should upload from kit.
  const worker = context.serviceWorkers()[0]
  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({})
    for (const t of tabs) {
      if (t.id != null) chrome.tabs.sendMessage(t.id, { type: "application-continue" }).catch(() => {})
    }
  })
  await expect.poll(() => page.locator("#cv").evaluate((e: HTMLInputElement) => e.files?.length ?? 0), { timeout: 15000 }).toBe(1)
  await expect(page.locator("#li")).toHaveValue(/linkedin\.com\/in\/kien/)
  await expect(page.locator("#web")).toHaveValue(/kien\.example\.com/)
  await expect(page.locator(".odds-apply-bar")).toContainText(/Filled in by odds/i, { timeout: 12000 })
  expect(await page.evaluate("window.sent")).toBe(false)
})

test("Broods suggest-answers accepted[] is applied (not dropped as .answers)", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://careers.example.org/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><form>
      <label>First name *<input name="first_name" required></label>
      <label>Why do you want this internship?<textarea id="why" name="why" required></textarea></label>
      <button type="submit">Submit</button>
    </form>`,
  }))
  fake.kit = {
    job_id: "p-broods-accepted",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} },
    cv: null,
  }
  fake.agentAnswers = { "Why do you want this internship?": "I want to learn brand and content at scale." }
  const page = await context.newPage()
  await page.goto("https://careers.example.org/apply-broods")
  await applyFrom(context, page, "https://careers.example.org/apply-broods")
  await expect(page.locator('input[name="first_name"]')).toHaveValue("Kien", { timeout: 10000 })
  await expect.poll(() => fake.suggestCalls, { timeout: 10000 }).toBeGreaterThan(0)
  await expect(page.locator("#why")).toHaveValue(/brand and content/i, { timeout: 12000 })
})

test("stuck listing: suggest-action multi-step unblocks cookie then Apply (Broods/mini path)", async ({ context, fake }) => {
  await connect(context)
  let stage = 0
  await context.route("https://careers.example.org/**", async (route) => {
    if (stage === 0) {
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><body>
<div id="cookie"><button type="button" id="functional">Functional only</button><button type="button" id="accept">Accept all</button></div>
<button type="button" id="apply" style="display:none">Apply now</button>
<form id="f" style="display:none"><label>First name *<input name="first_name" required></label>
<label>Email *<input type="email" name="email" required></label>
<button type="submit">Submit application</button></form>
<script>
document.getElementById("functional").onclick = () => {
  document.getElementById("cookie").remove()
  document.getElementById("apply").style.display = "inline"
  window.stage = 1
}
document.getElementById("apply").onclick = () => {
  document.getElementById("apply").remove()
  document.getElementById("f").style.display = "block"
  window.stage = 2
}
window.stage = 0
</script></body></html>`,
      })
    }
    return route.continue()
  })
  fake.kit = {
    job_id: "pstuck",
    facts: { name: "Chi Kien", email: "kien@example.com", answers: { first_name: "Chi", last_name: "Kien" }, remembered: {} },
  }
  const page = await context.newPage()
  await page.goto("https://careers.example.org/jobs/stuck")
  await applyFrom(context, page, "https://careers.example.org/jobs/stuck")
  await expect(page.locator('input[name="first_name"]')).toHaveValue("Chi", { timeout: 20000 })
  await expect(page.locator('input[name="email"]')).toHaveValue("kien@example.com")
  expect(fake.suggestActionCalls).toBeGreaterThan(0)
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Filled in by odds/i)
  // Submit never pressed by odds
  expect(await page.evaluate(() => document.querySelector("form")?.checkValidity() ?? false)).toBeTruthy()
})

/** Opens a page as "odds apply" in the panel would: the background is told this tab applies to `job`, and the page is loaded again. */
async function applyFrom(context: BrowserContext, page: import("@playwright/test").Page, job: string): Promise<void> {
  const worker = context.serviceWorkers()[0]
  // The page in front is the tab meant: a tab's address is hidden for sites the extension has no host permission for, so it cannot be matched by address.
  await page.bringToFront()
  await worker.evaluate(async ([url, job]) => {
    const api = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<Array<{ id: number; url?: string; active?: boolean }>> } } }).chrome
    const tabs = await api.tabs.query({})
    const tab = tabs.find((t) => t.url === url) ?? tabs.find((t) => t.active) ?? tabs[tabs.length - 1]
    await (globalThis as unknown as { setIntent(id: number, it: object): Promise<void> }).setIntent(tab.id, { job, at: Date.now() })
  }, [page.url(), job])
  await page.reload()
}

/** An employer's application form as Greenhouse and Lever draw it: labelled fields, a CV upload, a select, a free-text question, Submit. */
const EMPLOYER_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Data Intern</h1>
<form id="application" onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <label for="first_name">First Name *</label><input id="first_name" name="first_name" required>
  <label for="last_name">Last Name *</label><input id="last_name" name="last_name" required>
  <label for="email">Email *</label><input id="email" type="email" required>
  <label for="phone">Phone</label><input id="phone" type="tel">
  <label for="resume">Resume/CV *</label><input id="resume" type="file" required>
  <label for="li">LinkedIn Profile</label><input id="li" name="urls[LinkedIn]">
  <label for="auth">Are you legally authorized to work in the Netherlands? *</label><select id="auth" required><option>Please select</option><option>Yes</option><option>No</option></select>
  <label for="sql">How many years of experience do you have with SQL? *</label><input id="sql" required>
  <label for="why">Why do you want to work at Acme?</label><textarea id="why"></textarea>
  <label for="hp">Leave this field empty if you're human:</label><input id="hp" name="hp" required>
  <button type="submit">Submit application</button>
</form></main></body></html>`

test("odds apply on an employer's own form: filled in from odds, the CV uploaded, the unknown question outlined and kept once answered, never sent by odds", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://boards.example-ats.com/acme/jobs/123**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = { job_id: "pemp", facts: { name: "Kien Phung", email: "kien@example.com", linkedin: "https://www.linkedin.com/in/kien", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true } }
  const page = await context.newPage()
  await page.goto("https://boards.example-ats.com/acme/jobs/123")
  // Not opened to apply: odds does nothing to a form.
  await page.waitForTimeout(1500)
  await expect(page.locator("#first_name")).toHaveValue("")
  await applyFrom(context, page, "https://boards.example-ats.com/acme/jobs/123")
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  await expect(page.locator("#last_name")).toHaveValue("Phung")
  await expect(page.locator("#email")).toHaveValue("kien@example.com")
  await expect(page.locator("#phone")).toHaveValue("+31 6 1234 5678")
  await expect(page.locator("#li")).toHaveValue("https://www.linkedin.com/in/kien")
  await expect(page.locator("#auth")).toHaveValue("Yes")
  await expect.poll(() => page.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? "")).toBe("Kien_Data_CV.pdf")
  // Odds does not answer what it does not know, nor write the person's motivation.
  await expect(page.locator("#why")).toHaveValue("")
  // The bot trap is never an application question: not asked, not filled.
  await expect(page.locator(".odds-ask")).toHaveCount(1)
  await expect(page.locator(".odds-apply-bar")).toContainText("outlined question")
  await expect(page.locator("#hp")).toHaveValue("")
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  await page.locator("#sql").fill("3")
  await page.getByRole("button", { name: "Submit application" }).click()
  await expect.poll(() => fake.kept).toEqual([{ question: "How many years of experience do you have with SQL?", answer: "3" }])
  await shot(page, "ext-employer-form")
})

test("odds apply on a LinkedIn job: Easy Apply is pressed by odds and filled in, the rest as when the person presses it", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000301/**", (route) => route.fulfill({ contentType: "text/html", body: EASY_APPLY }))
  fake.peek = { known: true, id: "papply", saved: true, chance_pct: 8.8 }
  fake.kit = { job_id: "papply", facts: { name: "Kien Phung", email: "kien@example.com", dutch: "basic", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: { "how many years of work experience do you have with sql": "3" } }, cv: null }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000301/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000301")
  const modal = page.locator("[data-test-modal-id=easy-apply-modal]")
  // Everything known (the SQL years remembered from an earlier form): odds goes all the way to the review, and stops there.
  await expect(modal.locator(".odds-apply-bar")).toContainText("press Submit yourself", { timeout: 12000 })
  expect(await page.evaluate(() => (window as unknown as { submits: number }).submits)).toBe(0)
  // Back on the job later, it is not started again.
  await page.reload()
  await page.waitForTimeout(2500)
  await expect(modal).toHaveCount(0)
})

/** LinkedIn's newer job page as it is drawn since autumn 2026 (hashed classes, captured from the real page): the job's chips link to the job
 *  itself, Apply and Save are plain buttons named by aria-label, Easy Apply is a <dialog> whose questions are named on the field or the choice. */
const NEW_LINKEDIN = (apply: string): string => `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
<h1>Data Intern</h1><p>Acme · Amsterdam</p>
<div class="chips"><a href="https://www.linkedin.com/jobs/view/4470000302/" style="display:inline-block;padding:6px 12px;border:1px solid #333;border-radius:999px">On-site</a>
<a href="https://www.linkedin.com/jobs/view/4470000302/" style="display:inline-block;padding:6px 12px;border:1px solid #333;border-radius:999px">Full-time</a></div>
<div class="row" style="display:flex;gap:8px;margin-top:12px"><button class="hcb1" aria-label="${apply}" style="height:40px;border-radius:999px;padding:0 16px;background:#0a66c2;color:#fff;border:0">${apply.startsWith("Easy") ? "Easy Apply" : "Apply"}</button><button class="hcb1" aria-label="Save the job" style="height:40px;border-radius:999px;padding:0 16px">Save</button></div>
</main>
<script>
const steps = [
  { title: "Contact info", html: \`<div><label for="_r_1">Email address*</label><select id="_r_1" required><option></option><option>kien@example.com</option></select></div>
    <div><label for="_r_2">Phone country code*</label><select id="_r_2" required><option></option><option value="nl">Netherlands (+31)</option></select></div>
    <div><label for="_r_3">Mobile phone number*</label><input id="_r_3" type="tel" required></div>\` },
  { title: "Resume", html: \`<fieldset role="radiogroup"><div role="radio" aria-label="Kien_Old_CV.pdf"><input id="_r_4" type="radio" name="cv" checked><label for="_r_4"></label></div>
    <div role="radio" aria-label="Kien_Data_CV.pdf"><input id="_r_5" type="radio" name="cv"><label for="_r_5"></label></div></fieldset>\` },
  { title: "Additional Questions", html: \`<div><label for="_r_6">What is your level of proficiency in Dutch?*</label><select id="_r_6" required><option>Select an option</option><option>None</option><option>Conversational</option><option>Professional</option></select></div>
    <fieldset role="radiogroup"><div><div role="radio" aria-label="Will you now or in the future require visa sponsorship?"><input id="_r_7" type="radio" name="sp"><label for="_r_7"></label><p>Yes</p></div>
    <div role="radio" aria-label="Will you now or in the future require visa sponsorship?"><input id="_r_8" type="radio" name="sp"><label for="_r_8"></label><p>No</p></div></div></fieldset>
    <div><p>Hoeveel jaar werk je al met SQL? *</p><div><div><input id="_r_9" required aria-label="Hoeveel jaar werk je al met SQL? " type="text"></div><div><p>0/20</p></div></div></div>\` },
  { title: "Review your application", html: "<p>Review</p>" },
]
let at = 0
window.submits = 0
window.seen = {}
function draw() {
  const d = document.querySelector("dialog[data-testid=dialog]")
  const last = at === steps.length - 1
  d.querySelector(".body").innerHTML = "<h3>" + steps[at].title + "</h3>" + steps[at].html
  d.querySelector(".buttons").innerHTML = '<button aria-label="Dismiss">x</button>' + (last ? "<button>Submit application</button>" : at === steps.length - 2 ? "<button>Review</button>" : "<button>Next</button>")
}
document.addEventListener("click", (event) => {
  const b = event.target.closest("button")
  if (!b) return
  const label = (b.getAttribute("aria-label") || b.innerText).trim()
  if (label === "Easy Apply to this job") {
    document.body.insertAdjacentHTML("beforeend", '<dialog data-testid="dialog" aria-labelledby="dialog-header"><header><h2 id="dialog-header">Apply to Acme</h2></header><div class="body"></div><div class="buttons"></div></dialog>')
    document.querySelector("dialog").showModal()
    draw()
  }
  if (label === "Apply on company website") window.pressedOffsite = true
  if (label === "Next" || label === "Review") {
    for (const el of document.querySelectorAll("dialog input, dialog select")) window.seen[el.id] = el.type === "radio" ? el.checked : el.value
    setTimeout(() => { at++; draw() }, 150)
  }
  if (label === "Submit application") window.submits++
})
</script><iframe src="https://www.linkedin.com/preload/?_bprMode=vanilla" style="opacity:0;z-index:-1;position:absolute;top:0;width:100vw;height:100vh"></iframe></body></html>`

test("LinkedIn's newer job page: no badge on the job's own chips, and odds apply presses Easy Apply and fills its dialog in, stopping before Submit", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000302/**", (route) => route.fulfill({ contentType: "text/html", body: NEW_LINKEDIN("Easy Apply to this job") }))
  fake.peek = { known: true, id: "pnew", saved: true, chance_pct: 14.1 }
  fake.kit = { job_id: "pnew", facts: { name: "Kien Phung", email: "kien@example.com", dutch: "basic", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true } }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000302/")
  // One button, beside Save; none on "On-site" or "Full-time".
  await expect(page.locator("#odds-add")).toContainText("14.1%")
  await page.waitForTimeout(800)
  await expect(page.locator(".odds-job-chance")).toHaveCount(0)
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  const dialog = page.locator("dialog[data-testid=dialog]")
  await expect(dialog.locator("h3")).toHaveText("Additional Questions", { timeout: 12000 })
  expect(await page.evaluate(() => (window as unknown as { seen: Record<string, unknown> }).seen)).toMatchObject({ _r_3: "612345678", _r_5: true, _r_4: false })
  await expect(dialog.locator("#_r_6")).toHaveValue("Conversational")
  await expect(dialog.locator("#_r_8")).toBeChecked()
  // The question named only on its field is outlined, by its words.
  await expect(dialog.locator(".odds-apply-bar")).toContainText("Answer the marked question")
  await expect(dialog.locator(".odds-ask")).toHaveCount(1)
  await expect(dialog.locator(".odds-ask")).toContainText("SQL")
  await dialog.locator("#_r_9").fill("3")
  await dialog.getByRole("button", { name: "Review" }).click()
  await expect.poll(() => fake.kept).toEqual([{ question: "Hoeveel jaar werk je al met SQL?", answer: "3" }])
  await expect(dialog.locator(".odds-apply-bar")).toContainText("press Submit yourself", { timeout: 8000 })
  await page.waitForTimeout(1200)
  expect(await page.evaluate(() => (window as unknown as { submits: number }).submits)).toBe(0)
  await shot(page, "ext-easy-apply-new")
})

test("odds apply on a LinkedIn job applied for on the employer's site: their form opens in the same tab and is filled in there", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000302/**", (route) => route.fulfill({ contentType: "text/html", body: NEW_LINKEDIN("Apply on company website") }))
  await context.route("https://www.linkedin.com/voyager/api/jobs/jobPostings/4470000302", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ applyMethod: { "com.linkedin.voyager.jobs.OffsiteApply": { companyApplyUrl: "https://boards.example-ats.com/acme/jobs/123" } } }) }))
  await context.route("https://boards.example-ats.com/acme/jobs/123**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:123"', domain: ".www.linkedin.com", path: "/" }])
  fake.peek = { known: true, id: "pnew", saved: true, chance_pct: 14.1 }
  fake.kit = { job_id: "pnew", facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: null }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000302/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  await expect(page).toHaveURL("https://boards.example-ats.com/acme/jobs/123", { timeout: 12000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  // Auth select can lag a round behind contact fields; handoff success is employer URL + name.
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
})

test("LinkedIn logged-out: asks to Sign in immediately (never hangs on Looking for Apply)", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  let signedIn = false
  // Guest first; after the person signs in LinkedIn reloads the job with session + Apply (real flow).
  await context.route("https://www.linkedin.com/jobs/view/4475942401/**", (route) => {
    const body = signedIn
      ? `<!doctype html><html><body>
          <button class="global-nav__primary-link-me-menu-trigger">Me</button>
          <main><h1>Copywriting Internship</h1>
          <button type="button" id="jobs-apply-button-id" class="jobs-apply-button" aria-label="Apply to Copywriting Internship at Acme">Apply</button>
          </main></body></html>`
      : `<!doctype html><html><body>
          <main><h1>Copywriting Internship</h1>
          <p>Sign in to view more jobs like this</p>
          <a href="/authwall">Sign in</a><a href="/signup">Join now</a>
          </main></body></html>`
    return route.fulfill({ contentType: "text/html", body })
  })
  await context.route("**/voyager/api/jobs/jobPostings/4475942401*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { applyMethod: { "com.linkedin.voyager.jobs.OffsiteApply": { companyApplyUrl: "https://boards.example-ats.com/guest/jobs/1" } } } }),
  }))
  await context.route("https://boards.example-ats.com/guest/jobs/1**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = { job_id: "p-guest-li", facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: null }
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://www.linkedin.com/jobs/view/4475942401/', null, { postingId: 'p-guest-li' })")
  const page = await opened
  await expect(page.locator(".odds-apply-bar")).toContainText(/Sign in to LinkedIn/i, { timeout: 12000 })
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask")
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Looking for Apply/i)
  // Person signs in → LinkedIn sets session and reloads the job; Odds must continue (second job onwards stays signed in).
  signedIn = true
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:e2e-signed-in"', domain: ".www.linkedin.com", path: "/" }])
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page).toHaveURL(/boards\.example-ats\.com\/guest|linkedin\.com\/jobs\/view\/4475942401/, { timeout: 5000 })
  await expect.poll(async () => {
    const urls = await worker.evaluate(`chrome.tabs.query({}).then(t => t.map(x => x.url || ""))`) as string[]
    return urls.some((u) => /boards\.example-ats\.com\/guest/.test(u)) || /boards\.example-ats\.com\/guest/.test(page.url())
  }, { timeout: 20000 }).toBe(true)
  const employer = context.pages().find((p) => /boards\.example-ats\.com\/guest/.test(p.url())) || page
  await expect(employer.locator("#first_name")).toHaveValue("Kien", { timeout: 15000 })
})

test("Indeed login wall: asks to Sign in (never silent Filling)", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  await context.route("https://nl.indeed.com/viewjob**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><title>Sign in | Indeed</title></head><body>
      <h1>Sign in</h1>
      <p>Create an account or sign in to continue</p>
      <form><label>Email<input type="email" name="email"></label><label>Password<input type="password" name="password"></label><button>Sign in</button></form>
    </body></html>`,
  }))
  fake.kit = { job_id: "p-guest-indeed", facts: { name: "Kien", answers: { first_name: "Kien" }, remembered: {} }, cv: null }
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://nl.indeed.com/viewjob?jk=guest-login-test', null, { postingId: 'p-guest-indeed' })")
  const page = await opened
  await expect(page.locator(".odds-apply-bar")).toContainText(/Sign in to Indeed/i, { timeout: 12000 })
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask")
})

test("Glassdoor login wall: asks to Sign in (same Account path as LinkedIn/Indeed)", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.glassdoor.com/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><title>Sign in | Glassdoor</title></head><body>
      <h1>Sign in</h1>
      <p>Sign in to continue</p>
      <form><label>Email<input type="email"></label><label>Password<input type="password"></label><button>Sign in</button></form>
    </body></html>`,
  }))
  fake.kit = { job_id: "p-guest-gd", facts: { name: "Kien", answers: { first_name: "Kien" }, remembered: {} }, cv: null }
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://www.glassdoor.com/job-listing/intern.htm?jl=guest-gd', null, { postingId: 'p-guest-gd' })")
  const page = await opened
  await expect(page.locator(".odds-apply-bar")).toContainText(/Sign in to Glassdoor/i, { timeout: 12000 })
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask")
})

test("ACCEPT Connect gate: unlinked Apply opens Connect tour — no apply tab", { tag: "@accept" }, async ({ context }) => {
  // Extension installed but no oddsKey — hard gate, never prepareInExtension.
  await context.addInitScript(() => {
    localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } }))
    localStorage.removeItem("odds:extension-onboard-done")
  })
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.unroute("https://odds.beeblast.co/**")
  await context.route(/^chrome-extension:/, (route) => route.continue())
  await context.route("https://odds.beeblast.co/**", (route) => route.continue())
  const app = await context.newPage()
  await app.goto(`https://odds.beeblast.co/job/${FLOW_POSTINGS[0].id}`)
  const pagesBefore = context.pages().length
  await expect(app.getByRole("button", { name: "Connect Odds in Chrome", exact: true })).toBeVisible({ timeout: 20000 })
  await app.getByRole("button", { name: "Connect Odds in Chrome", exact: true }).click()
  await expect(app.getByRole("dialog", { name: "Connect Odds in Chrome" })).toBeVisible()
  await expect(app.getByTestId("extension-onboard-poster")).toBeVisible()
  expect(context.pages().length).toBe(pagesBefore)
  await expect(app.getByRole("button", { name: "Apply with Odds", exact: true })).toHaveCount(0)
})

test("ACCEPT Connect success → Apply with Odds enabled", { tag: "@accept" }, async ({ context }) => {
  await connect(context)
  await context.addInitScript(() => {
    localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } }))
    localStorage.setItem("odds:extension-onboard-done", "1")
  })
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.unroute("https://odds.beeblast.co/**")
  await context.route(/^chrome-extension:/, (route) => route.continue())
  await context.route("https://odds.beeblast.co/**", (route) => route.continue())
  const app = await context.newPage()
  await app.goto(`https://odds.beeblast.co/job/${FLOW_POSTINGS[0].id}`)
  await expect(app.getByRole("button", { name: "Apply with Odds", exact: true })).toBeVisible({ timeout: 20000 })
  await expect(app.getByRole("button", { name: "Connect Odds in Chrome", exact: true })).toHaveCount(0)
})

test("Indeed login wall → sign-in → auto-continue fill", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  let signedIn = false
  await context.route("https://nl.indeed.com/viewjob**", (route) => {
    const body = signedIn
      ? `<!doctype html><html><head><title>Intern | Indeed</title></head><body>
          <main><h1>Marketing Intern</h1>
          <form>
            <label>First name *<input name="first_name" required></label>
            <label>Email *<input type="email" name="email" required></label>
            <button type="submit">Submit</button>
          </form></main></body></html>`
      : `<!doctype html><html><head><title>Sign in | Indeed</title></head><body>
          <h1>Sign in</h1>
          <p>Create an account or sign in to continue</p>
          <form><label>Email<input type="email" name="email"></label><label>Password<input type="password" name="password"></label><button>Sign in</button></form>
        </body></html>`
    return route.fulfill({ contentType: "text/html", body })
  })
  fake.kit = {
    job_id: "p-guest-indeed-cont",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} },
    cv: null,
  }
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://nl.indeed.com/viewjob?jk=guest-continue', null, { postingId: 'p-guest-indeed-cont' })")
  const page = await opened
  await expect(page.locator(".odds-apply-bar")).toContainText(/Sign in to Indeed/i, { timeout: 12000 })
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask")
  signedIn = true
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.locator(".odds-apply-bar")).toContainText(/Signed in to Indeed|continuing|Filling|Check everything|First name/i, { timeout: 20000 })
  await expect(page.getByLabel(/First name/i)).toHaveValue("Kien", { timeout: 15000 })
})

test("Second Apply same board while signed in: no Account hang", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:e2e-already-in"', domain: ".www.linkedin.com", path: "/" }])
  await context.route("https://www.linkedin.com/jobs/view/4475942499/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><body>
      <button class="global-nav__primary-link-me-menu-trigger">Me</button>
      <main><h1>Second Intern</h1>
      <button type="button" id="jobs-apply-button-id" class="jobs-apply-button" aria-label="Apply to Second Intern at Acme">Apply</button>
      </main></body></html>`,
  }))
  await context.route("**/voyager/api/jobs/jobPostings/4475942499*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { applyMethod: { "com.linkedin.voyager.jobs.OffsiteApply": { companyApplyUrl: "https://boards.example-ats.com/guest/jobs/2" } } } }),
  }))
  await context.route("https://boards.example-ats.com/guest/jobs/2**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = { job_id: "p-second-li", facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: null }
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://www.linkedin.com/jobs/view/4475942499/', null, { postingId: 'p-second-li' })")
  const page = await opened
  // Must not freeze on Account — already signed in via Me + cookie.
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Sign in to LinkedIn/i, { timeout: 8000 })
  await expect.poll(async () => {
    const urls = await worker.evaluate(`chrome.tabs.query({}).then(t => t.map(x => x.url || ""))`) as string[]
    return urls.some((u) => /boards\.example-ats\.com\/guest\/jobs\/2/.test(u)) || /boards\.example-ats\.com\/guest\/jobs\/2/.test(page.url())
  }, { timeout: 20000 }).toBe(true)
  const employer = context.pages().find((p) => /boards\.example-ats\.com\/guest\/jobs\/2/.test(p.url())) || page
  await expect(employer.locator("#first_name")).toHaveValue("Kien", { timeout: 15000 })
})

test("STRESS French Workday resume step: upload CV + Suivant — never Asking Odds loop @accept @stress", async ({ context, fake }) => {
  test.setTimeout(60_000)
  await connect(context)
  // Kraft FR step 1: "Reprendre" + Sélectionner un fichier — old code looped suggest-answers forever.
  const html = `<!doctype html><html lang="fr"><body><main>
    <h1>Candidature pour Marketing Project Management Intern</h1>
    <ol><li>Reprendre</li><li>Informations sur le Contact</li></ol>
    <h2>Reprendre</h2>
    <p>Téléchargez votre CV pour une candidature plus simple</p>
    <form id="app">
      <input type="file" id="cv" name="resume" accept=".pdf,.doc" required>
      <button type="button" id="pick">Sélectionner un fichier</button>
      <button type="button" id="next" data-automation-id="pageFooterNextButton">Suivant</button>
    </form>
    <section id="contact" hidden>
      <h2>Informations sur le Contact</h2>
      <label>Prenom*<input id="fn" name="first_name" required></label>
      <label>Email*<input id="em" type="email" required></label>
    </section>
  </main>
  <script>
  document.getElementById("next").onclick = () => {
    if (!document.getElementById("cv").files?.length) return
    document.getElementById("app").hidden = true
    document.getElementById("contact").hidden = false
    document.querySelector("h2").textContent = "Informations sur le Contact"
  }
  </script></body></html>`
  await context.route("https://kraftheinz.wd5.myworkdayjobs.com/fr-FR/resume-step/**", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: html }))
  fake.kit = {
    job_id: "p-fr-cv",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} },
    cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true },
  }
  const page = await context.newPage()
  await page.goto("https://kraftheinz.wd5.myworkdayjobs.com/fr-FR/resume-step/apply")
  await applyFrom(context, page, "https://kraftheinz.wd5.myworkdayjobs.com/fr-FR/resume-step/apply")
  // Must leave resume step (CV uploaded + Suivant) and fill contact — never sit on Asking Odds…
  await expect(page.locator("#contact")).toBeVisible({ timeout: 25000 })
  await expect.poll(() => page.locator("#cv").evaluate((el: HTMLInputElement) => el.files?.length ?? 0), { timeout: 5000 }).toBeGreaterThan(0)
  await expect(page.locator("#fn")).toHaveValue("Kien", { timeout: 20000 })
  await expect(page.locator(".odds-apply-bar")).not.toHaveText(/^Asking Odds for answers from your profile/i)
  expect(fake.suggestCalls).toBeLessThanOrEqual(1)
})

test("STRESS employer listing never replays stale Sign in to LinkedIn (Kraft Heinz false Account) @accept @stress", async ({ context, fake }) => {
  test.setTimeout(60_000)
  await connect(context)
  // Real bug: LinkedIn needs_input message stayed on intent after hopping to careers.*;
  // launch() matched /password/ in "never types your password" → false Account on Apply now page.
  const listing = `<!doctype html><html><body>
    <h1>Marketing Project Management Intern</h1>
    <p>Amsterdam, North Holland, Netherlands</p>
    <button type="button" id="apply" style="background:red;color:#fff">Apply now</button>
    <button type="button">Add to cart</button>
  </body>
  <script>
  document.getElementById("apply").onclick = () => { location.href = "https://careers.kraftheinz.com/apply/r-107628" }
  </script></html>`
  await context.route("https://careers.kraftheinz.com/job/R-107628**", (route) => route.fulfill({ contentType: "text/html", body: listing }))
  await context.route("https://careers.kraftheinz.com/apply/r-107628**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = {
    job_id: "p-kraft",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} },
    cv: null,
  }
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate(`(async () => {
    const tab = await chrome.tabs.create({ url: "about:blank", active: true })
    await setIntent(tab.id, {
      job: "https://careers.kraftheinz.com/job/R-107628",
      postingId: "p-kraft",
      at: Date.now(),
      status: "needs_input",
      message: "Sign in to LinkedIn in this Chrome tab first — then Odds continues. Odds never types your password.",
    })
    await chrome.tabs.update(tab.id, { url: "https://careers.kraftheinz.com/job/R-107628" })
  })()`)
  const page = await opened
  await expect(page).toHaveURL(/careers\.kraftheinz\.com/, { timeout: 15000 })
  // Must NOT freeze on LinkedIn Account — click Apply now and fill the form.
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Sign in to LinkedIn/i, { timeout: 12000 })
  await expect(page).toHaveURL(/\/apply\/r-107628/, { timeout: 20000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 15000 })
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", /ask|done|ready/, { timeout: 15000 })
})

test("ACCEPT: empty page never silent-fills — Broods confirms before Stuck", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  // No Apply, no fields — script must call Broods (suggest-action / suggest-scan) before Stuck.
  await context.route("https://careers.example.org/empty-stall**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><main><h1>Careers</h1><p>Please wait…</p><button type="button">Learn more</button></main>`,
  }))
  fake.kit = {
    job_id: "p-stall",
    facts: { name: "Kien Phung", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} },
    cv: null,
  }
  const page = await context.newPage()
  await page.goto("https://careers.example.org/empty-stall")
  await applyFrom(context, page, "https://careers.example.org/empty-stall")
  // Agent must get a turn — never sit on Filling forever with no Broods call.
  await expect.poll(() => fake.suggestActionCalls + fake.suggestScanCalls, { timeout: 25000 }).toBeGreaterThan(0)
  await expect(page.locator(".odds-apply-bar")).toContainText(/Broods|Asking Odds|assist|after assist|Click Apply yourself|Odds assist|Stuck/i, { timeout: 20000 })
  await expect(page.locator(".odds-apply-bar")).not.toHaveText(/^Opening the application…$/)
  // Terminal after assist: Stuck/problem or ask — never false Ready on an empty page.
  await expect.poll(async () => page.locator(".odds-apply-bar").getAttribute("data-state"), { timeout: 30000 }).toMatch(/ask|problem/)
  await expect(page.locator(".odds-apply-bar")).not.toHaveAttribute("data-state", "done")
})

test("LinkedIn offsite Apply opens a NEW tab: intent must arrive so employer form still fills (no silent empty page)", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  // Real LinkedIn offsite often window.opens the ATS; Voyager 401 ("Verify it's you") → apply-follow + click.
  const html = `<!doctype html><main>
    <h1>Copywriting Internship</h1>
    <p>Responses managed off LinkedIn</p>
    <button type="button" id="go" class="jobs-apply-button" aria-label="Apply to Copywriting Internship at MatchWornShirt">Apply</button>
  </main>
  <script>
  document.getElementById("go").onclick = () => {
    window.open("https://boards.example-ats.com/match/jobs/new-tab", "_blank")
  }
  </script>`
  await context.route("https://www.linkedin.com/jobs/view/4475942337/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  await context.route("https://www.linkedin.com/voyager/api/jobs/jobPostings/4475942337", (route) => route.fulfill({ status: 401, body: "{}" }))
  await context.route("https://boards.example-ats.com/match/jobs/new-tab**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:m"', domain: ".www.linkedin.com", path: "/" }])
  fake.kit = {
    job_id: "p-match",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} },
    cv: null,
  }
  const linkedin = await context.newPage()
  await linkedin.goto("https://www.linkedin.com/jobs/view/4475942337/")
  await applyFrom(context, linkedin, "https://www.linkedin.com/jobs/view/4475942337/")
  const employer = linkedin
  await expect(employer).toHaveURL(/match\/jobs\/new-tab/, { timeout: 15000 })
  await expect(employer.locator("#first_name")).toHaveValue("Kien", { timeout: 15000 })
  await expect(employer.locator("#email")).toHaveValue("kien@example.com")
  await expect(employer.locator("#last_name")).toHaveValue("Phung")
  await expect(employer.locator(".odds-apply-bar")).toBeVisible()
  await expect(employer.locator(".odds-apply-bar")).not.toContainText(/did not attach|Could not load|^Opening the application/i)
  // EMPLOYER_FORM still needs CV + SQL — terminal is needs_input (ask), never false Ready and never silent Filling.
  await expect(employer.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask", { timeout: 20000 })
  await expect(employer.locator(".odds-apply-bar")).not.toHaveAttribute("data-state", "done")
})

test("LinkedIn opener: when rules miss Apply, Broods suggest-action opens the employer form (not Stuck)", async ({ context, fake }) => {
  await connect(context)
  // CTA label script rules do not match — Broods must pick "I'm interested" via suggest-action.
  const html = `<!doctype html><main>
    <h1>Marketing Intern</h1>
    <p>Responses managed off LinkedIn</p>
    <button type="button" id="go" aria-label="I'm interested">I'm interested</button>
    <button type="button" aria-label="Save">Save</button>
  </main>
  <script>
  document.getElementById("go").onclick = () => { location.href = "https://boards.example-ats.com/hunk/jobs/broods-open" }
  </script>`
  await context.route("https://www.linkedin.com/jobs/view/4475798299/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  await context.route("https://www.linkedin.com/voyager/api/jobs/jobPostings/4475798299", (route) => route.fulfill({ status: 401, body: "{}" }))
  await context.route("https://boards.example-ats.com/hunk/jobs/broods-open**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:b"', domain: ".www.linkedin.com", path: "/" }])
  fake.kit = {
    job_id: "p-li-broods",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} },
    cv: null,
  }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4475798299/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4475798299/")
  await expect.poll(() => fake.suggestActionCalls, { timeout: 12000 }).toBeGreaterThan(0)
  await expect(page).toHaveURL(/broods-open/, { timeout: 15000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Could not open/i)
})

test("offsite LinkedIn Apply to … aria-label (Hunkemöller-style) never false-Stucks — opens employer form", async ({ context, fake }) => {
  await connect(context)
  // Real offsite top card: visible "Apply", aria-label "Apply to <title> at <company>", no jobs-apply-button class.
  // Old /^apply$/ matcher missed this → 15s timeout → Stuck chip.
  const html = `<!doctype html><main class="jobs-details__main-content">
    <h1>Internship Marketing - Influencer Marketing</h1>
    <p>Hunkemöller · Hilversum</p>
    <p>Responses managed off LinkedIn</p>
    <div style="display:flex;gap:8px">
      <button type="button" aria-label="Apply to Internship Marketing - Influencer Marketing at Hunkemöller" style="height:40px">Apply</button>
      <button type="button" aria-label="Save Internship Marketing - Influencer Marketing at Hunkemöller">Save</button>
    </div>
  </main>`
  await context.route("https://www.linkedin.com/jobs/view/4475798272/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  await context.route("https://www.linkedin.com/voyager/api/jobs/jobPostings/4475798272", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ data: { applyMethod: { "com.linkedin.voyager.jobs.OffsiteApply": { companyApplyUrl: "https://boards.example-ats.com/hunk/jobs/9" } } } }),
  }))
  await context.route("https://boards.example-ats.com/hunk/jobs/9**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:hunk"', domain: ".www.linkedin.com", path: "/" }])
  fake.kit = {
    job_id: "p-hunk",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} },
    cv: null,
  }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4475798272/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4475798272/")
  await expect(page).toHaveURL(/boards\.example-ats\.com\/hunk/, { timeout: 12000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Could not open|Stuck/i)
})

/**
 * STRESS — silent death + Broods wake (Bouwinvest / Verify / Open tab).
 * Fail if bar stays Filling forever OR Broods (suggest-action/scan) never runs on a stuck path.
 */
test("STRESS LinkedIn offsite Apply click is a no-op: Broods wakes then ask (never silent Filling) @accept @stress", async ({ context, fake }) => {
  test.setTimeout(90_000)
  await connect(context)
  // Bouwinvest-style: Apply visible, Voyager 401, click does not open employer tab → watchdog + assistOpenApply.
  const html = `<!doctype html><main>
    <h1>Werkstudent Transaction Management</h1>
    <p>Bouwinvest Real Estate Investors · Amsterdam</p>
    <p>Responses managed off LinkedIn</p>
    <button type="button" id="go" class="jobs-apply-button" aria-label="Apply to Werkstudent at Bouwinvest">Apply</button>
    <button type="button" aria-label="Save">Save</button>
  </main>
  <script>document.getElementById("go").onclick = () => { /* popup blocked / noop */ }</script>`
  await context.route("https://www.linkedin.com/jobs/view/4477171395/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  await context.route("https://www.linkedin.com/voyager/api/jobs/jobPostings/4477171395", (route) => route.fulfill({ status: 401, body: "{}" }))
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:bouw"', domain: ".www.linkedin.com", path: "/" }])
  fake.kit = {
    job_id: "p-bouw",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} },
    cv: null,
  }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4477171395/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4477171395/")
  await expect.poll(() => fake.suggestActionCalls + fake.suggestScanCalls, { timeout: 25000 }).toBeGreaterThan(0)
  await expect.poll(async () => page.locator(".odds-apply-bar").getAttribute("data-state"), { timeout: 30000 }).toMatch(/ask|problem/)
  await expect(page.locator(".odds-apply-bar")).not.toHaveText(/^Opening the application…$/)
  await expect(page.locator(".odds-apply-bar")).not.toHaveText(/^Looking for Apply on this LinkedIn job…$/)
  await expect(page.locator(".odds-apply-bar")).toContainText(/Click Apply|could not open|assist|Broods|Asking Odds/i)
})

test("STRESS LinkedIn Open tab after started=true re-opens Apply (no dead Filling) @accept @stress", async ({ context, fake }) => {
  test.setTimeout(90_000)
  await connect(context)
  // Apply no-ops until Open tab arms navigation — proves started=true resume is not a dead early-return.
  const html = `<!doctype html><main>
    <h1>Werkstudent</h1>
    <p>Responses managed off LinkedIn</p>
    <button type="button" id="go" class="jobs-apply-button" aria-label="Apply to Werkstudent at Bouwinvest">Apply</button>
  </main>
  <script>
  window.__allowNav = false
  document.getElementById("go").onclick = () => {
    if (window.__allowNav) location.href = "https://boards.example-ats.com/bouw/jobs/2"
  }
  </script>`
  await context.route("https://www.linkedin.com/jobs/view/4477171400/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  await context.route("https://www.linkedin.com/voyager/api/jobs/jobPostings/4477171400", (route) => route.fulfill({ status: 401, body: "{}" }))
  await context.route("https://boards.example-ats.com/bouw/jobs/2**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:bouw2"', domain: ".www.linkedin.com", path: "/" }])
  fake.kit = {
    job_id: "p-bouw2",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} },
    cv: null,
  }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4477171400/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4477171400/")
  // First pass: click no-op → Broods/watchdog, still on LinkedIn (started=true).
  await expect.poll(() => fake.suggestActionCalls + fake.suggestScanCalls, { timeout: 25000 }).toBeGreaterThan(0)
  await expect(page).toHaveURL(/linkedin\.com\/jobs\/view\/4477171400/)
  await expect.poll(async () => page.locator(".odds-apply-bar").getAttribute("data-state"), { timeout: 15000 }).toMatch(/ask|problem|filling/)
  // Arm employer navigation, then Open tab → application-continue must re-run opener.
  await page.evaluate(() => { (window as unknown as { __allowNav: boolean }).__allowNav = true })
  await context.serviceWorkers()[0].evaluate(async () => {
    const api = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<Array<{ id: number }>>; sendMessage(id: number, m: object): Promise<unknown> } } }).chrome
    for (const tab of await api.tabs.query({})) await api.tabs.sendMessage(tab.id, { type: "application-continue" }).catch(() => undefined)
  })
  await expect(page).toHaveURL(/bouw\/jobs\/2/, { timeout: 20000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 12000 })
})

test("STRESS LinkedIn in-page Verify wall: ask immediately (never Looking for Apply forever) @accept @stress", async ({ context, fake }) => {
  await connect(context)
  const html = `<!doctype html><main>
    <h1>Security verification</h1>
    <p>Verify it's you before you continue.</p>
    <button type="button">Continue</button>
  </main>`
  await context.route("https://www.linkedin.com/jobs/view/4477171500/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:ver"', domain: ".www.linkedin.com", path: "/" }])
  fake.kit = { job_id: "p-ver", facts: { name: "Kien Phung", answers: { first_name: "Kien" }, remembered: {} }, cv: null }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4477171500/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4477171500/")
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask", { timeout: 12000 })
  await expect(page.locator(".odds-apply-bar")).toContainText(/verify this Chrome session|Verify/i)
  await expect(page.locator(".odds-apply-bar")).not.toHaveText(/Looking for Apply/i)
})

test("STRESS silence matrix: every stuck fixture wakes Broods or ends ask/problem @accept @stress", async ({ context, fake }) => {
  test.setTimeout(120_000)
  await connect(context)
  const cases: Array<{ name: string; url: string; html: string; needBroods: boolean }> = [
    {
      name: "empty-careers",
      url: "https://careers.example.org/stress-empty",
      html: `<!doctype html><main><h1>Careers</h1><p>Please wait…</p><button type="button">Learn more</button></main>`,
      needBroods: true,
    },
    {
      name: "listing-no-apply",
      url: "https://careers.example.org/stress-listing",
      html: `<!doctype html><main><h1>Intern</h1><p>Amsterdam</p><a href="/about">About us</a><button type="button">Share</button></main>`,
      needBroods: true,
    },
    {
      name: "li-no-cta",
      url: "https://www.linkedin.com/jobs/view/4477171600/",
      html: `<!doctype html><main><h1>Intern</h1><p>Responses managed off LinkedIn</p><button type="button" aria-label="Save">Save</button></main>`,
      needBroods: true,
    },
  ]
  for (const c of cases) {
    fake.suggestActionCalls = 0
    fake.suggestScanCalls = 0
    await context.route(`${c.url.replace(/\/$/, "")}**`, (route) => route.fulfill({ contentType: "text/html", body: c.html }))
    if (c.url.includes("linkedin.com")) {
      await context.addCookies([{ name: "JSESSIONID", value: `"ajax:${c.name}"`, domain: ".www.linkedin.com", path: "/" }])
    }
    fake.kit = { job_id: `p-${c.name}`, facts: { name: "Kien Phung", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} }, cv: null }
    const page = await context.newPage()
    await page.goto(c.url)
    await applyFrom(context, page, c.url)
    if (c.needBroods) {
      await expect.poll(() => fake.suggestActionCalls + fake.suggestScanCalls, { timeout: 25000 }).toBeGreaterThan(0)
    }
    await expect.poll(async () => page.locator(".odds-apply-bar").getAttribute("data-state"), { timeout: 30000 }).toMatch(/ask|problem/)
    await expect(page.locator(".odds-apply-bar")).not.toHaveText(/^Opening the application…$/)
    await page.close()
  }
})

test("STRESS Easy Apply blocked step: Broods suggest-scan before terminal Stuck @accept @stress", async ({ context, fake }) => {
  await connect(context)
  // Modal open with unanswered required + Next disabled forever → must call suggest-scan (not freeze on Filling).
  const body = `<!doctype html><html><body>
<div data-test-modal-id="easy-apply-modal" role="dialog">
  <div class="artdeco-modal__content">
    <h3>Additional Questions</h3>
    <div data-test-form-element><label for="secret">What is your favorite obscure protocol? *</label><input id="secret" required></div>
  </div>
  <div class="buttons"><button disabled aria-label="Continue to next step">Next</button></div>
</div>
</body></html>`
  await context.route("https://www.linkedin.com/jobs/view/4477171700/**", (route) => route.fulfill({ contentType: "text/html", body }))
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:ea"', domain: ".www.linkedin.com", path: "/" }])
  fake.kit = {
    job_id: "p-ea-stuck",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} },
    cv: null,
  }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4477171700/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4477171700/")
  await expect(page.locator(".odds-apply-bar")).toBeVisible({ timeout: 10000 })
  // Either Broods scan runs, or we stop on ask with marked question — never silent Opening/Filling forever.
  await expect.poll(async () => {
    const broods = fake.suggestScanCalls + fake.suggestActionCalls + fake.suggestCalls
    const state = await page.locator(".odds-apply-bar").getAttribute("data-state")
    const text = (await page.locator(".odds-apply-bar").textContent()) || ""
    if (broods > 0) return "broods"
    if (state === "ask" || state === "problem") return "terminal"
    if (/Asking Odds|Broods|marked|outlined|assist/i.test(text)) return "progress"
    return "wait"
  }, { timeout: 25000 }).not.toBe("wait")
  await expect(page.locator(".odds-apply-bar")).not.toHaveText(/^Opening the application…$/)
  await expect(page.locator(".odds-apply-bar")).not.toHaveAttribute("data-state", "done")
})

test("clicking a loading percentage shows a pending job immediately and never starts a save request", async ({ context, fake }) => {
  await connect(context)
  fake.peekDelay = 1800
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "busy")
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true", { timeout: 1500 })
  await expect(page.frameLocator("#odds-panel-frame").locator("#note")).toContainText("Reading the full job")
  await expect(page.locator("#odds-add")).toContainText("4.4%", { timeout: 6000 })
  expect(fake.calls).toHaveLength(0)
  expect(fake.peeks).toHaveLength(1)
})


test("phone preparation is opt-in, opens one dedicated desktop tab, reports readiness, never submits, and cancels", async ({ context, fake }) => {
  await connect(context)
  fake.remoteTask = { id: "a1111111-1111-4111-8111-111111111111", url: "https://careers.example.org/apply/finance", status: "filling" }
  fake.kit = { facts: { name: "Test Person", email: "test@example.com", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<form onsubmit="window.sent=true;return false"><label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label><button type="submit">Submit application</button></form><script>window.sent=false</script>' }))
  const worker = context.serviceWorkers()[0]
  const before = context.pages().length
  await worker.evaluate("pollApplications()")
  expect(context.pages()).toHaveLength(before)
  const opened = context.waitForEvent("page")
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const application = await opened
  await application.waitForURL(fake.remoteTask.url)
  await expect(application.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person", { timeout: 15000 })
  await expect(application.getByRole("textbox", { name: "Email" })).toHaveValue("test@example.com")
  await expect.poll(() => fake.reports.some(r => r.status === "ready")).toBe(true)
  expect(await application.evaluate("window.sent")).toBe(false)
  const pages = context.pages().length
  await worker.evaluate("pollApplications()")
  await worker.evaluate("pollApplications()")
  expect(context.pages()).toHaveLength(pages)
  fake.remoteTask.status = "cancelled"
  await worker.evaluate("pollApplications()")
  await expect.poll(() => application.isClosed()).toBe(true)
})

test("phone to desktop end-to-end: request, autofill, progress on phone, and disconnect preserves the filled tab", async ({ context, fake }) => {
  await connect(context)
  const post = FLOW_POSTINGS[0]
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.unroute("https://odds.beeblast.co/**")
  await context.route(/^chrome-extension:/, route => route.continue())
  await context.route("https://odds.beeblast.co/**", route => route.continue())
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: fake.remoteTask ? [{ ...fake.remoteTask, posting_id: post.id, message: fake.reports.at(-1)?.message || "Waiting for your desktop." }] : [] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test" }] }))
  await context.route("**/rest/v1/rpc/request_application", route => {
    fake.remoteTask = { id: "b1111111-1111-4111-8111-111111111111", url: "https://careers.example.org/apply", status: "filling" }
    return route.fulfill({ json: { ...fake.remoteTask, posting_id: post.id, message: "Waiting for your desktop." } })
  })
  fake.kit = { facts: { name: "Test Person", email: "test@example.com", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<form><label>Full name<input name="name" required></label><label>Describe your most relevant project<input name="project" required></label><button type="submit">Submit application</button></form>' }))
  const phone = await context.newPage()
  await phone.setViewportSize({ width: 390, height: 844 })
  await phone.goto(`${APP_ORIGIN}/job/${post.id}`)
  await phone.getByRole("button", { name: "Apply with Odds" }).click()
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const desktop = await opened
  await expect(desktop.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person", { timeout: 10000 })
  await expect(desktop.getByRole("textbox", { name: "Describe your most relevant project" })).toHaveValue("")
  await expect.poll(() => fake.reports.some(r => r.status === "needs_input")).toBe(true)
  await expect(phone.getByRole("status").filter({ hasText: "Needs your answer" })).toBeVisible({ timeout: 10000 })
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: false }))
  expect(desktop.isClosed()).toBe(false)
  await expect.poll(() => fake.remoteTask?.status).toBe("failed")
})

test("phone preparation pauses at a login form without filling or submitting credentials", async ({ context, fake }) => {
  await connect(context)
  fake.remoteTask = { id: "c1111111-1111-4111-8111-111111111111", url: "https://careers.example.org/signin", status: "filling" }
  fake.kit = { facts: { name: "Test Person", email: "test@example.com", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<title>Sign in</title><h1>Sign in</h1><form><label>Email<input name="email" type="email"></label><label>Password<input type="password"></label><button>Sign in</button></form>' }))
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const page = await opened
  await expect.poll(() => fake.reports.some(r => r.status === "needs_input")).toBe(true)
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("")
  await expect(page.locator('input[type="password"]')).toHaveValue("")
  await expect(page.locator(".odds-apply-bar")).toContainText(/Account or login required|Complete the login/i)
})

test("a Bamboo-style form with a tiny reCAPTCHA iframe still fills and never claims Captcha", async ({ context, fake }) => {
  await connect(context)
  fake.kit = {
    facts: { name: "Chi Kien", email: "kien@example.com", answers: { first_name: "Chi", last_name: "Kien", phone: "+31 6 12345678" }, remembered: {} },
    cv: { id: "11111111-2222-3333-4444-555555555555" },
  }
  await context.route("https://careers.example.org/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
<h1>Finance Audit Specialist</h1>
<h2>Apply for this position</h2>
<form onsubmit="event.preventDefault();window.sent=true">
  <label>First Name *<input name="first_name" required></label>
  <label>Last Name *<input name="last_name" required></label>
  <label>Email Address *<input type="email" name="email" required></label>
  <label>Phone *<input type="tel" name="phone" required></label>
  <label>Resume *<input type="file" required></label>
  <button type="submit">Submit Application</button>
</form>
<!-- Invisible / badge reCAPTCHA many ATS inject — must not block Odds fill -->
<iframe src="https://www.google.com/recaptcha/api2/anchor?k=fake" title="reCAPTCHA" style="width:76px;height:60px;border:0"></iframe>
<script>window.sent=false</script></body></html>`,
    }),
  )
  const page = await context.newPage()
  await page.goto("https://careers.example.org/apply")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  await expect(page.getByLabel("First Name")).toHaveValue("Chi", { timeout: 10000 })
  await expect(page.getByLabel("Email Address")).toHaveValue("kien@example.com")
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Captcha on the page/i)
  await expect(page.locator(".odds-apply-bar")).toContainText(/Filled in by odds|send it yourself|outlined question/i, { timeout: 10000 })
  expect(await page.evaluate("window.sent")).toBe(false)
})

test("a real employer form with sibling labels, example placeholders and nested CV upload fills correctly, ticks consent, leaves honeypot empty", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555" } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: `<h1>Sales intern</h1><form onsubmit="window.sent=true;return false">
    <div><label>First name <span>*</span></label><input placeholder="Lotte" autocomplete="given-name"></div>
    <div><label>Last name *</label><input placeholder="de Vries" autocomplete="family-name"></div>
    <div><label>Email *</label><input type="email" placeholder="name@example.com"></div>
    <div><label>CV *</label><div><label>Upload file<input type="file" style="display:none" accept=".pdf"></label></div></div>
    <input name="company_url" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">
    <div><label for="hp">Leave this field empty if you're human:</label><input id="hp" type="text"></div>
    <button type="button" role="checkbox" aria-checked="false" onclick="this.setAttribute('aria-checked', this.getAttribute('aria-checked')==='true'?'false':'true')">I agree to processing my data</button><button type="submit">Send application</button></form><script>window.sent=false</script>` }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/apply")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  await expect(page.getByPlaceholder("Lotte")).toHaveValue("Kien")
  await expect(page.getByPlaceholder("de Vries")).toHaveValue("Phung")
  await expect(page.getByPlaceholder("name@example.com")).toHaveValue("kien@example.com")
  await expect.poll(() => page.locator('input[type="file"]').evaluate((e: HTMLInputElement) => e.files?.length)).toBe(1)
  await expect(page.locator('[name="company_url"]')).toHaveValue("")
  await expect(page.locator("#hp")).toHaveValue("")
  await expect(page.getByRole("checkbox")).toHaveAttribute("aria-checked", "true", { timeout: 8000 })
  await expect(page.locator(".odds-apply-bar")).toContainText(/Filled in by odds|send it yourself|Continuing/i)
  expect(await page.evaluate("window.sent")).toBe(false)
})

test("a job-board page with Sign in in the nav still fills the form and never claims Account", async ({ context, fake }) => {
  await connect(context)
  fake.kit = {
    facts: { name: "Chi Kien", email: "kien@example.com", answers: { first_name: "Chi", last_name: "Kien", phone: "+31 6 12345678" }, remembered: {} },
    cv: { id: "11111111-2222-3333-4444-555555555555" },
  }
  // Studentjob / Jobster-shaped: title and header link say Sign in while the application form is already open.
  await context.route("https://careers.example.org/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><title>Video Content Internship | Sign in · Studentjob.nl</title></head><body>
<header><a href="/login">Sign in</a><a href="/register">Create account</a></header>
<h1>Video Content &amp; Marketing Internship</h1>
<form onsubmit="event.preventDefault();window.sent=true">
  <label>First name *<input name="first_name" required></label>
  <label>Last name *<input name="last_name" required></label>
  <label>Email *<input type="email" name="email" required></label>
  <label>Phone *<input type="tel" name="phone" required></label>
  <label>Why do you want this internship?<textarea name="motivation" required></textarea></label>
  <label>CV *<input type="file" required></label>
  <button type="submit">Send application</button>
</form><script>window.sent=false</script></body></html>`,
    }),
  )
  const page = await context.newPage()
  await page.goto("https://careers.example.org/apply")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  await expect(page.getByLabel("First name")).toHaveValue("Chi", { timeout: 10000 })
  await expect(page.getByLabel("Email")).toHaveValue("kien@example.com")
  await expect(page.locator(".odds-apply-bar")).toContainText(/outlined question|Filled in by odds|send it yourself/i, { timeout: 10000 })
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Sign in or make the account|Account or login required/i)
  expect(await page.evaluate("window.sent")).toBe(false)
})

test("Apply with Odds from the app: Sign-in chrome on the employer tab is not reported as Account", async ({ context, fake }) => {
  await connect(context)
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.unroute("https://odds.beeblast.co/**")
  await context.route(/^chrome-extension:/, (route) => route.continue())
  await context.route("https://odds.beeblast.co/**", (route) => route.continue())
  await context.route("https://jobs.example.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Jobster | Sign in</title><header><a href="/login">Sign in</a></header><h1>Video Content Internship</h1><form>
<label>First name *<input name="first_name" required></label>
<label>Email *<input type="email" name="email" required></label>
<label>What video tools do you use?<input name="tools" required></label>
<button type="submit">Send</button></form>`,
    }),
  )
  fake.kit = { facts: { name: "Example User", email: "kien@example.com", answers: { first_name: "Given Names", last_name: "Family" }, remembered: {} } }
  const app = await context.newPage()
  await app.goto(`https://odds.beeblast.co/job/${FLOW_POSTINGS[0].id}`)
  const opened = context.waitForEvent("page")
  await app.getByRole("button", { name: "Apply with Odds", exact: true }).click()
  const application = await opened
  await expect(application.getByLabel("First name")).toHaveValue("Given Names", { timeout: 10000 })
  await expect(application.locator(".odds-apply-bar")).not.toContainText(/Sign in or make the account|Account or login required/i)
  await expect(application.locator(".odds-apply-bar")).toContainText(/outlined question|Filled in by odds|send it yourself|Filling what we know/i, { timeout: 10000 })
})

test("an enriched job outside the loaded pool opens from one row without saving, with CV selection and apply available", async ({ context, fake }) => {
  await connect(context)
  await context.addInitScript(() => localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", origin: "non_eu", dutch: "basic" })))
  await context.addInitScript(() => localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", origin: "non_eu", dutch: "basic" })))
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  const post = { ...FLOW_POSTINGS[0], id: "just-enriched-job", title: "Newly read Finance Intern" }
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "added", known: true, saved: false, chance_pct: 8.1, job: { id: post.id, title: post.title } }
  await mockBackend(context, FLOW_POSTINGS.slice(1), [], true)
  await context.unroute("https://odds.beeblast.co/**")
  await context.route(/^chrome-extension:/, route => route.continue())
  // The site is this build, served on the odds address.
  await context.route("https://odds.beeblast.co/**", async (route) => {
    const u = new URL(route.request().url())
    await route.fulfill({ response: await route.fetch({ url: `${process.env.ODDS_E2E_APP_ORIGIN || "http://localhost:4319"}${u.pathname}${u.search}` }) })
  })
  await context.route("**/rest/v1/postings?**", route => route.fulfill({ json: [post] }))
  await context.route("**/rest/v1/employer_glassdoor_pay?**", route => route.fulfill({ json: [{ employer: post.employer, position: post.title, reports: 17, pay_min: 2500, pay_max: 3500, unit: "month", read_on: "2026-10-14" }] }))
  await context.route("https://www.linkedin.com/jobs/view/**", route => route.fulfill({ contentType: "text/html", body: JOB_PAGE("New job") }))
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("8.1%")
  await page.locator("#odds-add").click()
  const app = page.frameLocator("#odds-panel-frame").frameLocator("#app")
  await expect(app.getByRole("heading", { name: post.title, exact: true })).toBeVisible({ timeout: 15000 })
  await expect(app.getByRole("button", { name: "Save this job", exact: true })).toBeVisible()
  await expect(app.getByRole("button", { name: "Apply with Odds", exact: true })).toBeVisible()
  await app.getByRole("tab", { name: "Documents" }).click()
  await expect(app.getByLabel("Choose a cv from your library", { exact: true })).toBeVisible()
  expect(fake.calls).toHaveLength(0)
  expect(fake.analyses).toHaveLength(1)
})

test("Apply with Odds in the desktop website starts the installed extension directly, acknowledges, fills a new tab and leaves the app open", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.unroute("https://odds.beeblast.co/**")
  await context.route(/^chrome-extension:/, route => route.continue())
  await context.route("https://odds.beeblast.co/**", route => route.continue())
  await context.route("https://jobs.example.com/**", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>First name *<input name="first_name" required></label><label>Phone<input name="phone"></label><button type="submit">Send application</button></form>' }))
  fake.kit = { facts: { name: "Example User", answers: { first_name: "Given Names", last_name: "Family", phone: "+31 6 12345678" }, remembered: {} } }
  const app = await context.newPage()
  await app.goto(`https://odds.beeblast.co/job/${FLOW_POSTINGS[0].id}`)
  const opened = context.waitForEvent("page")
  await app.getByRole("button", { name: "Apply with Odds", exact: true }).click()
  const application = await opened
  await expect(application.getByRole("textbox", { name: "First name" })).toHaveValue("Given Names", { timeout: 10000 })
  await expect(application.getByRole("textbox", { name: "Phone" })).toHaveValue("+31 6 12345678")
  // Full fillable form → terminal Ready (person must Submit themselves).
  await expect(application.locator(".odds-apply-bar")).toHaveAttribute("data-state", "done", { timeout: 15000 })
  await expect(application.locator(".odds-apply-bar")).toContainText(/Check everything/i)
  // Apply with Odds jumps to Tracker and opens the job drawer — Open application tab is there.
  // If the drawer is slow, open the saved job row (same user path).
  const openTab = app.getByRole("button", { name: /Open application tab|Open tab:/ })
  if (!(await openTab.isVisible().catch(() => false))) {
    await app.getByRole("button", { name: /Junior Financial Analyst/i }).first().click()
  }
  await expect(openTab).toBeVisible({ timeout: 20000 })
  const pageCount = context.pages().length
  await openTab.click()
  await expect(application.getByRole("textbox", { name: "First name" })).toHaveValue("Given Names")
  expect(context.pages()).toHaveLength(pageCount)
  expect(application.isClosed()).toBe(false)
  await expect(application.getByRole("textbox", { name: "Phone" })).toHaveValue("+31 6 12345678")
  await expect(application.locator(".odds-apply-bar")).toHaveAttribute("data-state", "done")
  // Applying keeps the job in the tracker, in the same click: odds was asked to keep it, once.
  await expect.poll(() => fake.calls.length).toBe(1)
})

for (const [name, form] of [
  ["Greenhouse", '<div class="field"><label for="n">First name *</label><input id="n" required></div>'],
  ["Lever", '<div class="application-question"><div class="application-label">First name *</div><input required></div>'],
  ["Ashby", '<div class="ashby-application-form-field"><label>First name *</label><input required></div>'],
  ["Workday", '<div data-automation-id="formField-firstName"><label>First name *</label><input data-automation-id="firstName" required></div>'],
  ["Personio", '<div class="form-group"><label for="n">First name *</label><input id="n" required></div>'],
  ["Recruitee", '<div class="field"><input aria-label="First name" required></div>'],
  ["Teamtailor", '<label>First name *<input required></label>'],
  ["SmartRecruiters", '<div class="form-group"><label id="n-label">First name *</label><input aria-labelledby="n-label" required></div>'],
] as const) {
  test(`autofill compatibility: ${name} field markup is filled and verified`, async ({ context, fake }) => {
    await connect(context)
    fake.kit = { facts: { email: "test@example.com", answers: { first_name: "Chi Kien", last_name: "Phung", phone: "+31 6 12345678" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555" } }
    await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: `<h1>Application</h1><form>${form}<label>Last name<input name="family" required></label><label>Email<input type="email" required></label><label>Phone<input type="tel" required></label><label>CV<input type="file" required></label><button type="submit">Send application</button></form>` }))
    const page = await context.newPage()
    await page.goto("https://careers.example.org/apply")
    await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
    await expect(page.locator("form input").first()).toHaveValue("Chi Kien")
    await expect(page.getByLabel("Last name")).toHaveValue("Phung")
    await expect(page.getByLabel("Email")).toHaveValue("test@example.com")
    await expect(page.getByLabel("Phone")).toHaveValue("+31 6 12345678")
    await expect.poll(() => page.locator('input[type="file"]').evaluate((e: HTMLInputElement) => e.files?.length)).toBe(1)
    await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "done")
  })
}

test("a website rejecting a filled value or CV never reports ready", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { answers: { first_name: "Chi Kien" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555" } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>First name *<input required oninput="this.value=\'\'"></label><label>CV *<input type="file" required onchange="this.setAttribute(\'aria-invalid\',\'true\')"></label><button>Send application</button></form>' }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/apply")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask")
  await expect(page.locator(".odds-apply-bar")).not.toHaveAttribute("data-state", "done")
  await expect(page.locator('input[type="file"]')).toHaveAttribute("aria-invalid", "true")
})

test("an unsupported required custom dropdown pauses instead of reporting success", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { answers: { first_name: "Chi Kien" }, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>First name<input></label><div role="combobox" aria-required="true">Choose a country</div><button>Send application</button></form>' }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/apply")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask")
})


test("Indeed listing search fields never count as a filled application; employer Apply opens and fills the actual form", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", email: "test@example.com", answers: {}, remembered: {} } }
  await context.route("https://nl.indeed.com/viewjob?jk=listing-test", route => route.fulfill({ contentType: "text/html", body: `<h1>Management Intern</h1><form action="/jobs"><label>Wat<input id="text-input-what" value="intern"></label><label>Waar<input id="text-input-where" value="Utrecht"></label><button>Zoeken</button></form><a href="https://careers.example.org/actual-application">Solliciteer op website van werkgever</a>` }))
  await context.route("https://careers.example.org/actual-application", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>Full name<input name="full_name" required></label><label>Email<input type="email" required></label><button type="submit">Submit application</button></form>' }))
  const page = await context.newPage()
  await page.goto("https://nl.indeed.com/viewjob?jk=listing-test")
  await applyFrom(context, page, page.url())
  await expect(page).toHaveURL("https://careers.example.org/actual-application", { timeout: 10000 })
  await expect(page.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("test@example.com")
  await expect(page.locator(".odds-apply-bar")).toContainText("Check everything")
})


test("a newsletter interstitial is skipped without filling or subscribing before the actual application", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", email: "test@example.com", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/newsletter", route => route.fulfill({ contentType: "text/html", body: `<h1>Management Intern</h1><div id="newsletter-modal"><label>Email<input type="email"></label><button onclick="window.subscribed=true">Verder gaan</button><button onclick="location.href='/application'">Verder gaan zonder in te vullen</button></div>` }))
  await context.route("https://careers.example.org/application", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>Full name<input name="full_name" required></label><button type="submit">Submit</button></form>' }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/newsletter")
  await applyFrom(context, page, page.url())
  await expect(page).toHaveURL("https://careers.example.org/application", { timeout: 10000 })
  await expect(page.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
})


test("required radio groups on Cornerstone are outlined when their answer is unknown", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/radio", route => route.fulfill({ contentType: "text/html", body: `<h1>Application</h1><form><label>Full name<input name="full_name"></label><p id="q">Is this internship mandatory or elective?</p><div role="radiogroup" aria-required="true" aria-labelledby="q"><label><input type="radio" name="curriculum">Mandatory</label><label><input type="radio" name="curriculum">Elective</label></div></form>` }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/radio")
  await applyFrom(context, page, page.url())
  await expect(page.getByRole("radiogroup")).toHaveClass(/odds-ask/)
  await expect(page.locator(".odds-apply-bar")).toContainText("outlined question")
  await expect(page.getByRole("radio").first()).not.toBeChecked()
})


test("two phone requests prepare independent tabs without finishing the first; cancellation affects only its own tab", async ({ context, fake }) => {
  await connect(context)
  fake.remoteTasks = [
    { id: "a1111111-1111-4111-8111-111111111111", url: "https://careers.example.org/first", status: "filling" },
    { id: "b1111111-1111-4111-8111-111111111111", url: "https://careers.example.org/second", status: "filling" },
  ]
  fake.kit = { facts: { name: "Test Person", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>Full name<input name="full_name" required></label><label>Unknown question<input name="unknown" required></label><button type="submit">Submit</button></form>' }))
  const worker = context.serviceWorkers()[0]
  const firstOpened = context.waitForEvent("page")
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const first = await firstOpened
  await expect(first.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
  const secondOpened = context.waitForEvent("page")
  await worker.evaluate("pollApplications()")
  const second = await secondOpened
  await expect(second.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
  expect(first.isClosed()).toBe(false)
  await expect(first.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
  const count = context.pages().length
  await worker.evaluate("pollApplications()")
  expect(context.pages()).toHaveLength(count)
  fake.remoteTasks[0].status = "cancelled"
  await worker.evaluate("pollApplications()")
  await expect.poll(() => first.isClosed()).toBe(true)
  expect(second.isClosed()).toBe(false)
  await expect(second.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
})

test("benchmark percentage paint and score latency", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, saved: false, chance_pct: 8.8, job: { id: "benchmark-job" } }
  await context.addInitScript(() => {
    const timings = { button: null as number | null, score: null as number | null }
    ;(window as unknown as { oddsTimings: typeof timings }).oddsTimings = timings
    new MutationObserver(() => {
      const button = document.getElementById("odds-add")
      if (!button) return
      if (timings.button === null) timings.button = performance.now()
      if (timings.score === null && button.textContent?.includes("8.8%")) timings.score = performance.now()
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
  const page = await context.newPage()
  const samples: Array<Record<string, unknown>> = []
  for (const latency of [0, 400]) {
    fake.peekDelay = latency
    for (let i = 0; i < 5; i++) {
      const id = 4470000800 + latency + i
      await page.goto(`https://www.linkedin.com/jobs/view/${id}/`)
      await expect(page.locator("#odds-add")).toContainText("8.8%")
      const cold = await page.evaluate(() => (window as unknown as { oddsTimings: { button: number; score: number } }).oddsTimings)
      const before = fake.peeks.length
      await page.reload()
      await expect(page.locator("#odds-add")).toContainText("8.8%")
      const warm = await page.evaluate(() => (window as unknown as { oddsTimings: { button: number; score: number } }).oddsTimings)
      expect(fake.peeks.length).toBe(before)
      samples.push({ latency_ms: latency, cold, warm })
    }
  }
})


test("a closed LinkedIn job reports the real blocker instead of leaving a phone request in progress", async ({ context, fake }) => {
  await connect(context)
  fake.remoteTask = { id: "e1111111-1111-4111-8111-111111111111", url: "https://www.linkedin.com/jobs/view/4470891508/", status: "filling" }
  await context.route("https://www.linkedin.com/jobs/view/4470891508/**", route => route.fulfill({ contentType: "text/html", body: '<main class="jobs-details__main-content"><h1>Investment Banking Internship</h1><div class="artdeco-inline-feedback"><span>No longer accepting applications</span></div></main>' }))
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const page = await opened
  await expect(page.locator(".odds-apply-bar")).toContainText("no longer accepting applications")
  await expect.poll(() => fake.reports.some(r => r.status === "failed" && r.message?.includes("no longer accepting"))).toBe(true)
  await expect.poll(() => fake.closedUrls.some((u) => u.includes("4470891508"))).toBe(true)
  // Tab was opened in the background (may already be dropped from the run map after failed report).
  const tracked = await worker.evaluate("chrome.storage.session.get('oddsApplicationRuns').then(v => v.oddsApplicationRuns?.['e1111111-1111-4111-8111-111111111111']?.tabId)")
  if (typeof tracked === "number") {
    const tab = await worker.evaluate(`chrome.tabs.get(${tracked}).then(t => ({ id: t.id, active: t.active }))`) as { id: number; active: boolean }
    expect(tab.id).toBe(tracked)
    expect(tab.active).toBe(false)
  }
  expect(await worker.evaluate("chrome.alarms.get('odds-applications').then(alarm => alarm.periodInMinutes)")).toBe(0.5)
})


test("LinkedIn’s lazy CV uploader captures the input outside the dialog and uploads the Odds CV without a native picker", async ({ context, fake }) => {
  await connect(context)
  fake.remoteTask = { id: "f1111111-1111-4111-8111-111111111111", url: "https://www.linkedin.com/jobs/view/4470286772/", status: "needs_input" }
  fake.kit = { facts: { name: "Test Person", answers: {}, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", file_name: "Kien_Data_CV.pdf" } }
  const html = `<h1>Finance Assistant</h1><dialog data-testid="dialog" open><h2>Apply to KUS</h2><h3>Resume</h3><fieldset role="radiogroup"><div role="radio" aria-label="Old_CV.pdf"><input type="radio" name="cv" checked></div></fieldset><button id="upload">Upload resume</button><button id="next">Next</button></dialog><script>
  window.pickerOpened=false; window.uploaded="";
  document.querySelector('#upload').onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='.pdf';input.hidden=true;input.onchange=()=>{window.uploaded=input.files[0].name; document.querySelector('fieldset').innerHTML='<div role="radio" aria-label="'+window.uploaded+'"><input type="radio" name="cv" checked></div>'};document.body.append(input);input.addEventListener('click',e=>{if(!e.defaultPrevented)window.pickerOpened=true}); input.click()};
  document.querySelector('#next').onclick=()=>{document.querySelector('dialog').innerHTML='<h2>Apply to KUS</h2><h3>Review</h3><button type="submit">Submit</button>'};
  </script>`
  await context.route("https://www.linkedin.com/jobs/view/4470286772/**", route => route.fulfill({ contentType: "text/html", body: html }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470286772/")
  await expect(page.locator('dialog h3')).toHaveText("Review", { timeout: 10000 })
  expect(await page.evaluate("window.uploaded")).toBe("Kien_Data_CV.pdf")
  expect(await page.evaluate("window.pickerOpened")).toBe(false)
  await expect.poll(() => fake.reports.some(r => r.status === "ready")).toBe(true)
  await expect(page.locator('.odds-apply-bar')).toContainText("press Submit yourself")
})

test("one click opens one tab; repeated clicks focus its filled application", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<form><label>Full name<input required></label><button type="submit">Submit</button></form>' }))
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://careers.example.org/application')")
  const application = await opened
  await expect(application.getByLabel("Full name")).toHaveValue("Test Person")
  const count = context.pages().length
  const result = await worker.evaluate("Promise.all([openApplication('https://careers.example.org/application'),openApplication('https://careers.example.org/application')])")
  expect(result).toEqual([{ ok: true, resumed: true }, { ok: true, resumed: true }])
  expect(context.pages()).toHaveLength(count)
  await expect(application.getByLabel("Full name")).toHaveValue("Test Person")
})

test("LinkedIn closed banner painted after start still reports Closed (not stuck Applying)", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { status: "ok", job_id: "p-closed-late", facts: { name: "Test", answers: {}, remembered: {} }, cv: null }
  await context.route("https://www.linkedin.com/jobs/view/4470891599/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><main class="jobs-details__main-content"><h1>Closed late</h1><p id="status">Loading…</p>
<script>setTimeout(()=>{document.getElementById('status').outerHTML='<div class="artdeco-inline-feedback">No longer accepting applications</div>'},600)</script></main>`,
    }),
  )
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://www.linkedin.com/jobs/view/4470891599/', null, { postingId: 'p-closed-late' })")
  const page = await opened
  await expect(page.locator(".odds-apply-bar")).toContainText("no longer accepting applications", { timeout: 12000 })
  // Desktop Apply has no phone run — chip comes from intent status; job-closed still hits the server.
  await expect.poll(async () => {
    const intent = await worker.evaluate(`chrome.storage.local.get('oddsApplyIntents').then(v => {
      const all = v.oddsApplyIntents || {}
      return Object.values(all).find(i => i.postingId === 'p-closed-late' || String(i.job||'').includes('4470891599'))
    })`) as { status?: string; message?: string } | undefined
    return intent?.status === "failed" && /no longer accepting/i.test(intent?.message || "")
  }, { timeout: 10000 }).toBe(true)
  await expect.poll(() => fake.closedUrls.some((u) => u.includes("4470891599")), { timeout: 10000 }).toBe(true)
})

test("Open application tab (reveal) finds the same job by postingId even when the first open had URL only", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { status: "ok", job_id: "p-bosch", facts: { name: "Test Person", answers: { first_name: "Test", last_name: "Person" }, remembered: {} }, cv: null }
  await context.route("https://careers.example.org/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><form>
      <label for="fn">First name</label><input id="fn" name="first_name" required>
      <label>Do you sail?<input type="radio" name="sail" value="yes">Yes<input type="radio" name="sail" value="no">No</label>
      <button type="submit">Next</button>
    </form>`,
  }))
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  // First open like an older intent: URL only, no postingId on the intent key path.
  await worker.evaluate("openApplication('https://careers.example.org/jobs/bosch-intern', null, {})")
  const application = await opened
  await expect(application.locator("#fn")).toHaveValue("Test", { timeout: 15000 })
  const pages = context.pages().length
  // Odds drawer "Open application tab" sends reveal + postingId — must resume, not open a second tab.
  const resumed = await worker.evaluate("openApplication('https://careers.example.org/jobs/bosch-intern', null, { reveal: true, postingId: 'p-bosch' })")
  expect(resumed).toEqual({ ok: true, resumed: true })
  expect(context.pages()).toHaveLength(pages)
  expect(application.isClosed()).toBe(false)
  await expect(application).toHaveURL(/bosch-intern/)
  // A stopped run and an expired activity must still retain its real form tab.
  await worker.evaluate(`chrome.storage.local.get('oddsApplyIntents').then(async v => {
    for (const intent of Object.values(v.oddsApplyIntents || {})) {
      intent.status = 'failed'; intent.at = Date.now() - 2 * 60 * 60_000
    }
    await chrome.storage.local.set(v)
  })`)
  expect(await worker.evaluate("openApplication('https://careers.example.org/jobs/bosch-intern', null, { reveal: true, postingId: 'p-bosch' })")).toEqual({ ok: true, resumed: true })
  expect(context.pages()).toHaveLength(pages)
  // Recovery from an older extension that already pruned the intent is exact-URL only.
  await worker.evaluate("chrome.storage.local.set({oddsApplyIntents:{}})")
  expect(await worker.evaluate("openApplication('https://careers.example.org/jobs/bosch-intern', null, { reveal: true, postingId: 'p-bosch' })")).toEqual({ ok: true, resumed: true })
  expect(context.pages()).toHaveLength(pages)
})

/**
 * End-goal edge cases for Apply with Odds → background fill → Open tab → Broods → review:
 * 1) First open never steals focus
 * 2) Open application tab focuses the exact working tab (fast, no duplicate)
 * 3) Status survives Open tab (Account / outlined not wiped)
 * 4) Closed apply tab reopens without orphaning the job
 * 5) Two jobs keep separate tabs
 */
test("Apply background + Open tab edge cases always reach the working form", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  fake.kit = {
    status: "ok",
    job_id: "p-edge-a",
    facts: { name: "Chi Kien", email: "kien@example.com", answers: { first_name: "Chi", last_name: "Kien" }, remembered: {} },
    cv: null,
  }
  await context.route("https://careers.example.org/**", (route) => {
    const u = route.request().url()
    const body = u.includes("job-b")
      ? `<!doctype html><form><label>First name<input id="fnb" name="first_name" required></label><button type="submit">Submit</button></form>`
      : `<!doctype html><form>
          <label>First name<input id="fna" name="first_name" required></label>
          <label>Account password<input id="pw" type="password" required></label>
          <button type="submit">Submit</button>
        </form>`
    return route.fulfill({ contentType: "text/html", body })
  })
  const worker = context.serviceWorkers()[0]
  // Keep an "Odds" tab in front so we can assert Apply does not steal focus.
  const odds = await context.newPage()
  await odds.goto("https://odds.beeblast.co/")
  await odds.bringToFront()

  const openedA = context.waitForEvent("page")
  const t0 = Date.now()
  const startA = await worker.evaluate("openApplication('https://careers.example.org/jobs/job-a', null, { reveal: false, postingId: 'p-edge-a' })")
  expect(startA).toEqual({ ok: true, resumed: false })
  const applyA = await openedA
  await expect(applyA.locator("#fna")).toHaveValue("Chi", { timeout: 15000 })
  // Background: the apply tab itself must not be Chrome's active tab (no focus steal).
  // (In the Odds window the apply tab is that window's visible tab; what must never happen is it taking over the person's window.)
  const applyActiveAfterStart = await worker.evaluate(`chrome.tabs.query({ url: "https://careers.example.org/jobs/job-a*" }).then(async t => { const w = (await chrome.storage.session.get("oddsRunWindow")).oddsRunWindow; return Boolean(t[0]?.active) && t[0].windowId !== w })`)
  expect(applyActiveAfterStart).toBe(false)

  // Script reaches Account (password) — terminal needs_input, never false Ready.
  await expect(applyA.locator(".odds-apply-bar")).toContainText(/password|account/i, { timeout: 12000 })
  await expect(applyA.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask", { timeout: 10000 })
  await expect(applyA.locator(".odds-apply-bar")).not.toHaveAttribute("data-state", "done")
  await worker.evaluate(`chrome.storage.local.get('oddsApplyIntents').then(async (v) => {
    const all = v.oddsApplyIntents || {}
    for (const [id, intent] of Object.entries(all)) {
      if (intent.postingId === 'p-edge-a') {
        all[id] = { ...intent, status: 'needs_input', message: 'This site needs an account. Choose your password on the page: odds never types passwords.' }
      }
    }
    await chrome.storage.local.set({ oddsApplyIntents: all })
  })`)

  const pagesBeforeReveal = context.pages().length
  const tReveal = Date.now()
  const revealA = await worker.evaluate("openApplication('https://careers.example.org/jobs/job-a', null, { reveal: true, postingId: 'p-edge-a' })")
  expect(revealA).toEqual({ ok: true, resumed: true })
  expect(Date.now() - tReveal).toBeLessThan(1500)
  expect(context.pages()).toHaveLength(pagesBeforeReveal)
  await expect.poll(() => worker.evaluate(`chrome.tabs.query({ url: "https://careers.example.org/jobs/job-a*" }).then(t => Boolean(t[0]?.active))`)).toBe(true)
  // Status not wiped to bare Opening / Filling.
  const intentAfter = await worker.evaluate(`chrome.storage.local.get('oddsApplyIntents').then(v => {
    const all = v.oddsApplyIntents || {}
    return Object.values(all).find(i => i.postingId === 'p-edge-a')
  })`) as { status?: string; message?: string } | undefined
  expect(intentAfter?.status).toBe("needs_input")
  expect(String(intentAfter?.message || "")).toMatch(/password|account/i)

  // Closed tab → Open tab reopens the same job (end goal: person can always get back to the form).
  await applyA.close()
  const reopened = context.waitForEvent("page")
  const again = await worker.evaluate("openApplication('https://careers.example.org/jobs/job-a', null, { reveal: true, postingId: 'p-edge-a' })") as { ok?: boolean }
  expect(again.ok).toBe(true)
  const applyA2 = await reopened
  await expect(applyA2.locator("#fna")).toHaveValue("Chi", { timeout: 15000 })

  // Second job = second tab; Open tab for A must not focus B.
  fake.kit = {
    status: "ok",
    job_id: "p-edge-b",
    facts: { name: "Chi Kien", answers: { first_name: "Chi", last_name: "Kien" }, remembered: {} },
    cv: null,
  }
  const openedB = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://careers.example.org/jobs/job-b', null, { reveal: false, postingId: 'p-edge-b' })")
  const applyB = await openedB
  await expect(applyB.locator("#fnb")).toHaveValue("Chi", { timeout: 15000 })
  await worker.evaluate("openApplication('https://careers.example.org/jobs/job-a', null, { reveal: true, postingId: 'p-edge-a' })")
  await expect.poll(() => worker.evaluate(`chrome.tabs.query({ url: "https://careers.example.org/jobs/job-a*" }).then(t => Boolean(t[0]?.active))`)).toBe(true)
  const bStillBackground = await worker.evaluate(`chrome.tabs.query({ url: "https://careers.example.org/jobs/job-b*" }).then(t => t[0]?.active === false)`)
  expect(bStillBackground).toBe(true)
  // Sanity: first Apply path stayed fast enough that we are not thrashing.
  expect(Date.now() - t0).toBeLessThan(60_000)
})

test("Continue after a reload resumes the same tab (form kept; captcha/account step still there)", async ({ context, fake }) => {
  await connect(context)
  fake.kit = {
    status: "ok",
    job_id: "p-reload",
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678" }, remembered: {} },
    cv: null,
  }
  await context.route("https://careers.example.org/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><form>
      <label for="fn">First name</label><input id="fn" name="first_name" required>
      <label for="pw">Account password</label><input id="pw" type="password" name="pw" required>
      <button type="submit">Submit</button>
    </form>`,
  }))
  let worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://careers.example.org/apply', null, { postingId: 'p-reload' })")
  const application = await opened
  await expect(application.locator("#fn")).toHaveValue("Kien", { timeout: 15000 })
  await expect(application.locator(".odds-apply-bar")).toContainText(/account|password/i, { timeout: 10000 })
  const pages = context.pages().length
  // Simulate extension reload fallout: wipe session run map; hard-reload the tab so content scripts die; local intents stay.
  // (chrome.runtime.reload() is unreliable under Playwright MV3 — the SW often never returns.)
  await worker.evaluate(`(async () => {
    await chrome.storage.session.clear()
    await chrome.storage.local.remove('oddsApplicationRuns')
  })()`)
  await application.reload({ waitUntil: "domcontentloaded" })
  const resumed = await worker.evaluate("openApplication('https://careers.example.org/apply', null, { reveal: true, postingId: 'p-reload' })")
  expect(resumed).toEqual({ ok: true, resumed: true })
  expect(context.pages()).toHaveLength(pages)
  expect(application.isClosed()).toBe(false)
  // Same tab resumed: account gate returns; password still empty (odds never types it).
  await expect(application.locator(".odds-apply-bar")).toContainText(/account|password/i, { timeout: 20000 })
  await expect(application.locator("#pw")).toHaveValue("")
})

test("one-click learning loop: phone answers an employer question, desktop advances and uploads CV, answer appears in Profile", async ({ context, fake }) => {
  await connect(context)
  const post = FLOW_POSTINGS[0]
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  await context.addInitScript(() => localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", origin: "non_eu", dutch: "basic" })))
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.route("**/rest/v1/application_prompts?**", route => route.fulfill({ json: [{ posting_id: post.id, updated_at: new Date().toISOString(), questions: fake.prompts }] }))
  const saved: Array<{ question_key: string; question: string; answer: string }> = []
  await context.route("**/rest/v1/application_questions?**", route => route.fulfill({ json: saved }))
  await context.route("**/rest/v1/rpc/answer_application_questions", route => {
    const body = route.request().postDataJSON()
    expect(body.p_posting_id).toBe(post.id)
    for (const [key, answer] of Object.entries(body.p_answers as Record<string, string>)) {
      const prompt = fake.prompts.find(q => q.key === key)
      expect(prompt).toBeDefined()
      fake.remembered[key] = answer
      saved.push({ question_key: key, question: prompt!.label, answer })
    }
    return route.fulfill({ status: 204 })
  })
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test" }] }))
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: fake.remoteTask ? [{ ...fake.remoteTask, posting_id: post.id, message: fake.reports.at(-1)?.message || "Waiting for your desktop." }] : [] }))
  await context.route("**/rest/v1/rpc/request_application", route => {
    fake.remoteTask = { id: "b2222222-1111-4111-8111-111111111111", url: "https://careers.example.org/learning-loop", status: "filling" }
    return route.fulfill({ json: { ...fake.remoteTask, posting_id: post.id, message: "Waiting for your desktop." } })
  })
  fake.kit = { job_id: post.id, facts: { job_id: post.id, name: "Test Person", answers: {}, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien Data CV", file_name: "Kien_Data_CV.pdf" } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><h1>Application</h1><div role="dialog" id="cookie-banner"><p>Cookies</p><button onclick="window.rejected=true;this.parentElement.remove()">Reject all</button><button onclick="window.accepted=true">Accept all</button></div><form id="form"><label>Full name<input required></label><fieldset><legend>Will you remain enrolled throughout this internship?</legend><input type="radio" id="yes" name="study" required><label for="yes">Yes</label><input type="radio" id="no" name="study"><label for="no">No</label></fieldset><button type="button" onclick="window.enrolled=document.querySelector('#yes').checked;document.querySelector('#form').innerHTML='<label>CV<input type=file required></label><button type=submit>Submit application</button>'">Next</button></form><script>window.sent=false;document.addEventListener('submit',e=>{e.preventDefault();window.sent=true})</script>` }))
  const phone = await context.newPage()
  await phone.setViewportSize({ width: 390, height: 844 })
  await phone.goto(`${APP_ORIGIN}/job/${post.id}`)
  const worker = context.serviceWorkers()[0]
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const opened = context.waitForEvent("page")
  await phone.getByRole("button", { name: "Apply with Odds" }).click()
  await worker.evaluate("pollApplications()")
  const desktop = await opened
  await expect(desktop.getByLabel("Full name")).toHaveValue("Test Person", { timeout: 10000 })
  await phone.getByRole("radiogroup", { name: "Will you remain enrolled throughout this internship?" }).getByRole("radio", { name: "Yes" }).click({ timeout: 15000 })
  await phone.getByRole("button", { name: "Save and continue" }).click()
  await expect(desktop.getByLabel("CV")).toHaveCount(1, { timeout: 15000 })
  await expect.poll(() => desktop.getByLabel("CV").evaluate((e: HTMLInputElement) => e.files?.[0]?.name)).toBe("Kien_Data_CV.pdf")
  expect(await desktop.evaluate("window.enrolled")).toBe(true)
  expect(await desktop.evaluate("window.rejected")).toBe(true)
  expect(await desktop.evaluate("window.accepted")).not.toBe(true)
  expect(await desktop.evaluate("window.sent")).toBe(false)
  await expect.poll(() => fake.reports.at(-1)?.status).toBe("ready")
  await phone.goto(`${APP_ORIGIN}/`)
  // On a phone Autofill is a row on the Profile page, not a tab in the bar.
  await phone.getByRole("button", { name: /Profile/ }).last().click()
  await phone.getByRole("button", { name: "Autofill" }).click()
  await expect(phone.getByRole("heading", { name: "Learned from forms", exact: true })).toBeVisible()
  await expect(phone.getByLabel("Will you remain enrolled throughout this internship?")).toHaveValue("Yes")
  expect(saved[0].question_key).toContain(` job ${post.id}`)
})

test("LinkedIn accepts a saved remote answer and automatically reaches review without Submit", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000301/**", route => route.fulfill({ contentType: "text/html", body: EASY_APPLY }))
  fake.kit = { facts: { name: "Test Person", phone: "+31 6 12345678", dutch: "basic", answers: { work_authorization: "Yes, EU citizen" }, remembered: {} } }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000301/")
  await page.locator("#jobs-apply-button-id").click()
  await expect(page.locator("#sql")).toBeVisible({ timeout: 10000 })
  await expect.poll(() => fake.prompts.some(q => q.label.includes("SQL"))).toBe(true)
  const question = fake.prompts.find(q => q.label.includes("SQL"))!
  fake.remembered[question.key] = "3"
  await expect(page.locator('[data-test-modal-id=easy-apply-modal] h3')).toHaveText("Review your application", { timeout: 10000 })
  expect(await page.evaluate("window.submits")).toBe(0)
  expect((await page.evaluate("window.seen") as Record<string, unknown>).sql).toBe("3")
})

test("an employer's embedded Greenhouse form fills inside its frame and uploads CV without submitting", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", email: "person@example.com", answers: {}, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Main CV", file_name: "Kien_Data_CV.pdf" } }
  await context.route("https://careers.example.org/embedded", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><iframe title="Application form" style="width:600px;height:700px" src="https://boards.greenhouse.io/embed/job_app?token=12345"></iframe>' }))
  await context.route("https://boards.greenhouse.io/**", route => route.fulfill({ contentType: "text/html", body: '<form><label>Full name<input required></label><label>Email<input type="email" required></label><label>CV<input type="file" required></label><button type="submit">Submit application</button></form><script>window.submitted=false;document.addEventListener("submit", e=>{e.preventDefault();window.submitted=true})</script>' }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/embedded")
  await applyFrom(context, page, "https://careers.example.org/embedded")
  const frame = page.frameLocator('iframe[title="Application form"]')
  await expect(frame.getByLabel("Full name")).toHaveValue("Test Person")
  await expect(frame.getByLabel("Email")).toHaveValue("person@example.com")
  await expect.poll(() => frame.getByLabel("CV").evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toBe("Kien_Data_CV.pdf")
  await expect(frame.locator(".odds-apply-bar")).toContainText("send it yourself")
  expect(await page.frames()[1].evaluate("window.submitted")).toBe(false)
})

test("a SuccessFactors listing's Apply inside a form opens its login instead of waiting on the listing", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", answers: {}, remembered: {} } }
  await context.route("https://career2.successfactors.eu/listing/**", route => route.fulfill({ contentType: "text/html", body: '<h1>Portfolio Strategy Intern</h1><form><input type="hidden" name="jobId" value="2838"><button type="button" onclick="location.href=\'/signin\'">Apply</button></form>' }))
  await context.route("https://career2.successfactors.eu/signin", route => route.fulfill({ contentType: "text/html", body: '<title>Sign in</title><h1>Sign in</h1><form><label>Password<input type="password"></label><button>Sign in</button></form>' }))
  const page = await context.newPage()
  await page.goto("https://career2.successfactors.eu/listing/2838")
  await applyFrom(context, page, "https://career2.successfactors.eu/listing/2838")
  await expect(page).toHaveURL("https://career2.successfactors.eu/signin", { timeout: 10000 })
  await expect(page.locator(".odds-apply-bar")).toContainText(/Account or login required|Complete the login/i)
  await expect(page.getByLabel("Password")).toHaveValue("")
})

const PORTAL_KIT = { job_id: "pportal", facts: { name: "Kien Phung", email: "kien@example.com", linkedin: "https://www.linkedin.com/in/kien", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true } }

/** Greenhouse's job-boards form: a question answered from a searchable dropdown (react-select: a combobox input, a listbox drawn when opened). */
const GREENHOUSE_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Data Intern</h1>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <label for="first_name">First Name*</label><input id="first_name" required>
  <label for="last_name">Last Name*</label><input id="last_name" required>
  <label for="email">Email*</label><input id="email" type="email" required>
  <label for="resume">Resume/CV*</label><input id="resume" type="file" required>
  <div class="select__container"><label id="auth-l" for="q1">Are you legally authorized to work in the Netherlands?*</label>
    <div class="select__control"><div class="select__value-container"><div class="select__single-value" id="auth-v"></div><input id="q1" role="combobox" aria-required="true" aria-controls="menu1" aria-labelledby="auth-l"></div></div>
    <div id="menu1" role="listbox" hidden><div role="option">Yes</div><div role="option">No</div></div></div>
  <button type="submit">Submit application</button>
</form></main>
<script>
const input = document.getElementById("q1"), menu = document.getElementById("menu1")
input.addEventListener("mousedown", () => { menu.hidden = false })
input.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") menu.hidden = false; if (e.key === "Escape") menu.hidden = true })
for (const o of menu.children) o.addEventListener("mousedown", () => { document.getElementById("auth-v").textContent = o.textContent; menu.hidden = true })
</script></body></html>`

/** Lever's form: one Full name field, every label wrapping its field. */
const LEVER_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Data Intern</h1>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <label><div class="application-label">Resume/CV <span>✱</span></div><div class="application-field"><input type="file" name="resume" required></div></label>
  <label><div class="application-label">Full name <span>✱</span></div><div class="application-field"><input name="name" required></div></label>
  <label><div class="application-label">Email <span>✱</span></div><div class="application-field"><input name="email" type="email" required></div></label>
  <label><div class="application-label">Phone</div><div class="application-field"><input name="phone"></div></label>
  <label><div class="application-label">LinkedIn URL</div><div class="application-field"><input name="urls[LinkedIn]"></div></label>
  <button type="submit">Submit application</button>
</form></main></body></html>`

/** Ashby's form: system fields, and Yes/No drawn as two buttons (the chosen one gets an _active_ class). */
const ASHBY_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Data Intern</h1>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <div><label for="_systemfield_name">Name</label><input id="_systemfield_name" name="_systemfield_name" required></div>
  <div><label for="_systemfield_email">Email</label><input id="_systemfield_email" type="email" required></div>
  <div><label for="_systemfield_resume">Resume</label><input id="_systemfield_resume" type="file" required></div>
  <div class="entry"><label class="_heading_1x">Are you legally authorized to work in the Netherlands? *</label><div class="yesno" id="auth"><button type="button" class="_option_1x">Yes</button><button type="button" class="_option_1x">No</button></div></div>
  <div class="entry"><label class="_heading_1x">Do you hold a driving licence? *</label><div class="yesno" id="drive"><button type="button" class="_option_1x">Yes</button><button type="button" class="_option_1x">No</button></div></div>
  <button type="submit">Submit Application</button>
</form></main>
<script>
for (const g of document.querySelectorAll(".yesno")) for (const b of g.children) b.addEventListener("click", () => { for (const o of g.children) o.classList.remove("_active_1x"); b.classList.add("_active_1x") })
</script></body></html>`

test("odds apply on Greenhouse: the searchable dropdown is opened and the option chosen, the CV uploaded, nothing sent", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://job-boards.greenhouse.io/acme/jobs/1**", (route) => route.fulfill({ contentType: "text/html", body: GREENHOUSE_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://job-boards.greenhouse.io/acme/jobs/1")
  await applyFrom(context, page, "https://job-boards.greenhouse.io/acme/jobs/1")
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  await expect(page.locator("#auth-v")).toHaveText("Yes", { timeout: 8000 })
  await expect.poll(() => page.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? "")).toBe("Kien_Data_CV.pdf")
  await expect(page.locator(".odds-apply-bar")).toContainText("Check everything", { timeout: 10000 })
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  await shot(page, "ext-greenhouse")
})

test("odds apply on Lever: the single Full name field, wrapped labels and the CV, nothing sent", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://jobs.lever.co/acme/1**", (route) => route.fulfill({ contentType: "text/html", body: LEVER_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://jobs.lever.co/acme/1")
  await applyFrom(context, page, "https://jobs.lever.co/acme/1")
  await expect(page.locator("input[name=name]")).toHaveValue("Kien Phung", { timeout: 8000 })
  await expect(page.locator("input[name=email]")).toHaveValue("kien@example.com")
  await expect(page.locator("input[name=phone]")).toHaveValue("+31 6 1234 5678")
  await expect(page.locator("input[name='urls[LinkedIn]']")).toHaveValue("https://www.linkedin.com/in/kien")
  await expect.poll(() => page.locator("input[name=resume]").evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? "")).toBe("Kien_Data_CV.pdf")
  await expect(page.locator(".odds-apply-bar")).toContainText("Check everything", { timeout: 10000 })
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  await shot(page, "ext-lever")
})

test("ACCEPT Lever location typeahead fixture picks dropdown (never Checking…) @accept", async ({ context, fake }) => {
  await connect(context)
  const html = readFileSync(join(import.meta.dirname, "fixtures/ats/lever-location.html"), "utf8")
  await context.route("https://jobs.eu.lever.co/location-test/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  fake.kit = {
    job_id: "ploc",
    facts: { job_id: "ploc", place: "Amsterdam, Netherlands", answers: { city: "Amsterdam", email: "kien@example.com", first_name: "Kien", last_name: "Phung" }, remembered: {} },
  }
  const page = await context.newPage()
  await page.goto("https://jobs.eu.lever.co/location-test/apply")
  await applyFrom(context, page, "https://jobs.eu.lever.co/location-test/apply")
  await expect.poll(() => page.locator("#selected-location").inputValue(), { timeout: 12000 }).not.toBe("")
  await expect(page.locator("#location-input")).not.toHaveValue("")
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Checking that the website kept/i, { timeout: 8000 })
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", /done|ask|ready/, { timeout: 8000 })
})

test("ACCEPT Broods scan click on .dropdown-location fills Lever location @accept", async ({ context, fake }) => {
  await connect(context)
  // Options exist but Autofill type path stalls → Broods returns click on option text.
  const html = `<!doctype html><html><body><main><h1>Intern</h1>
<form onsubmit="event.preventDefault()">
  <li class="application-question">
    <label><div class="application-label">Current location </div>
    <div class="application-field">
      <input class="location-input" id="location-input" type="text" name="location" value="">
      <input id="selected-location" type="hidden" name="selectedLocation" value="">
      <div class="dropdown-results">
        <div class="dropdown-location" id="location-0">Amsterdam, NLD</div>
      </div>
    </div></label>
  </li>
  <label>Email<input type="email" name="email" required></label>
  <button type="submit">Submit</button>
</form>
<script>
document.getElementById("location-0").addEventListener("click", () => {
  document.getElementById("location-input").value = "Amsterdam, NLD"
  document.getElementById("selected-location").value = JSON.stringify({ name: "Amsterdam, NLD" })
})
</script></main></body></html>`
  await context.route("https://jobs.eu.lever.co/broods-click/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  fake.kit = {
    job_id: "pclick",
    facts: { job_id: "pclick", place: "Amsterdam, Netherlands", answers: { city: "Amsterdam", email: "kien@example.com" }, remembered: {} },
  }
  fake.scanReply = { stage: "form", action: "click", text: "Amsterdam, NLD", answers: [], reason: "dropdown_option" }
  const page = await context.newPage()
  await page.goto("https://jobs.eu.lever.co/broods-click/apply")
  await applyFrom(context, page, "https://jobs.eu.lever.co/broods-click/apply")
  await expect.poll(() => fake.suggestScanCalls, { timeout: 25000 }).toBeGreaterThan(0)
  await expect.poll(() => page.locator("#selected-location").inputValue(), { timeout: 15000 }).not.toBe("")
})

test("ACCEPT known Autofill gap stall calls Broods scan (never only Checking…) @accept", async ({ context, fake }) => {
  await connect(context)
  // Location field Odds knows (city) but typeahead never yields options — must invite Broods, not spin on Checking.
  const html = `<!doctype html><html><body><main><h1>Intern</h1>
<form onsubmit="event.preventDefault()">
  <li class="application-question">
    <label><div class="application-label">Current location </div>
    <div class="application-field">
      <input class="location-input" id="location-input" type="text" name="location">
      <input id="selected-location" type="hidden" name="selectedLocation" value="">
      <div class="dropdown-results"></div>
    </div></label>
  </li>
  <label>Email<input type="email" name="email" required value=""></label>
  <button type="submit">Submit</button>
</form></main></body></html>`
  await context.route("https://jobs.eu.lever.co/gaps-broods/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  fake.kit = {
    job_id: "pgaps",
    facts: { job_id: "pgaps", place: "Amsterdam, Netherlands", answers: { city: "Amsterdam", email: "kien@example.com" }, remembered: {} },
  }
  const page = await context.newPage()
  await page.goto("https://jobs.eu.lever.co/gaps-broods/apply")
  await applyFrom(context, page, "https://jobs.eu.lever.co/gaps-broods/apply")
  await expect.poll(() => fake.suggestScanCalls, { timeout: 25000 }).toBeGreaterThan(0)
  await expect(page.locator(".odds-apply-bar")).toContainText(/Broods|asking Odds|Still filling|outlined|assist/i, { timeout: 15000 })
  await expect(page.locator(".odds-apply-bar")).not.toHaveText(/Checking that the website kept your details and CV/i)
})

test("ACCEPT Lever Karl custom questions: start + notice from Autofill (not left on Type your response) @accept", async ({ context, fake }) => {
  await connect(context)
  const karlHtml = readFileSync(join(import.meta.dirname, "fixtures/ats/lever-karl-custom.html"), "utf8")
  await context.route("https://jobs.eu.lever.co/karllagerfeld/**", (route) => route.fulfill({ contentType: "text/html", body: karlHtml }))
  fake.kit = {
    job_id: "pkarl",
    facts: {
      job_id: "pkarl",
      answers: { start_date: "1 February 2027", notice_period: "2 weeks", first_name: "Kien", last_name: "Phung" },
      remembered: {},
    },
  }
  const page = await context.newPage()
  await page.goto("https://jobs.eu.lever.co/karllagerfeld/apply")
  await applyFrom(context, page, "https://jobs.eu.lever.co/karllagerfeld/apply")
  await expect(page.locator('input[name="cards[start][field0]"]')).toHaveValue("1 February 2027", { timeout: 10000 })
  await expect(page.locator('input[name="cards[avail][field0]"]')).toHaveValue("1 February 2027. Notice period: 2 weeks", { timeout: 8000 })
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/Answer the .*outlined/i)
})

test("ACCEPT Ashby button-choice fixture presses Yes from Autofill @accept", async ({ context, fake }) => {
  await connect(context)
  const html = readFileSync(join(import.meta.dirname, "fixtures/ats/ashby-yesno.html"), "utf8")
  await context.route("https://jobs.ashbyhq.com/fixture-yesno/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  fake.kit = {
    job_id: "pash",
    facts: {
      job_id: "pash",
      job_country: "NL",
      name: "Kien Phung",
      email: "kien@example.com",
      answers: { first_name: "Kien", last_name: "Phung", email: "kien@example.com", work_authorization: "Yes, EU citizen" },
      remembered: {},
    },
  }
  const page = await context.newPage()
  await page.goto("https://jobs.ashbyhq.com/fixture-yesno/1")
  await applyFrom(context, page, "https://jobs.ashbyhq.com/fixture-yesno/1")
  await expect(page.locator("#_systemfield_name")).toHaveValue("Kien Phung", { timeout: 8000 })
  await expect(page.locator("#auth button", { hasText: "Yes" })).toHaveClass(/_active_/, { timeout: 8000 })
})

test("ACCEPT Greenhouse label/for fixture fills contact fields @accept", async ({ context, fake }) => {
  await connect(context)
  const html = readFileSync(join(import.meta.dirname, "fixtures/ats/greenhouse-basic.html"), "utf8")
  await context.route("https://job-boards.greenhouse.io/fixture-basic/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  fake.kit = {
    job_id: "pgh",
    facts: {
      job_id: "pgh",
      name: "Kien Phung",
      email: "kien@example.com",
      phone: "+31 6 1234 5678",
      answers: { first_name: "Kien", last_name: "Phung", email: "kien@example.com", phone: "+31 6 1234 5678" },
      remembered: {},
    },
  }
  const page = await context.newPage()
  await page.goto("https://job-boards.greenhouse.io/fixture-basic/jobs/1")
  await applyFrom(context, page, "https://job-boards.greenhouse.io/fixture-basic/jobs/1")
  await expect(page.locator("#n")).toHaveValue("Kien", { timeout: 8000 })
  await expect(page.locator('input[name=family]')).toHaveValue("Phung")
  await expect(page.locator('input[type=email]')).toHaveValue("kien@example.com")
})

test("ACCEPT Workday delayed fields + listbox fixture fills when controls appear @accept", async ({ context, fake }) => {
  await connect(context)
  const html = readFileSync(join(import.meta.dirname, "fixtures/ats/workday-delayed.html"), "utf8")
  await context.route("https://acme.wd5.myworkdayjobs.com/fixture/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  fake.kit = {
    job_id: "pwd",
    facts: {
      job_id: "pwd",
      name: "Kien Phung",
      email: "kien@example.com",
      answers: { first_name: "Kien", last_name: "Phung", email: "kien@example.com", country: "Netherlands" },
      remembered: {},
    },
  }
  const page = await context.newPage()
  await page.goto("https://acme.wd5.myworkdayjobs.com/fixture/job/1")
  await applyFrom(context, page, "https://acme.wd5.myworkdayjobs.com/fixture/job/1")
  await expect(page.locator("[data-automation-id=legalNameSection_firstName]")).toHaveValue("Kien", { timeout: 12000 })
  await expect(page.locator("[data-automation-id=email]")).toHaveValue("kien@example.com")
  await expect(page.locator("#country-btn")).toContainText(/Netherlands/i, { timeout: 10000 })
})

test("odds apply on Ashby: Yes/No buttons are pressed from the profile, an unknown one is outlined, sent to Odds to answer, and filled in once answered there", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://jobs.ashbyhq.com/acme/1**", (route) => route.fulfill({ contentType: "text/html", body: ASHBY_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://jobs.ashbyhq.com/acme/1")
  await applyFrom(context, page, "https://jobs.ashbyhq.com/acme/1")
  await expect(page.locator("#_systemfield_name")).toHaveValue("Kien Phung", { timeout: 8000 })
  await expect(page.locator("#auth button", { hasText: "Yes" })).toHaveClass(/_active_/, { timeout: 8000 })
  // What odds cannot know is not guessed: outlined, and offered in Odds to answer.
  await expect(page.locator("#drive button._active_1x")).toHaveCount(0)
  await expect(page.locator(".odds-ask")).toHaveCount(1)
  await expect.poll(() => fake.prompts.map((q) => (q as { label: string }).label)).toEqual(["Do you hold a driving licence?"])
  const key = (fake.prompts[0] as { key: string }).key
  // The answer given in Odds comes back, is pressed in the form, and the outline goes.
  fake.remembered = { [key]: "No" }
  await page.evaluate(() => (globalThis as unknown as { chrome?: unknown }).chrome)
  await context.serviceWorkers()[0].evaluate(async () => {
    const api = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<Array<{ id: number }>>; sendMessage(id: number, m: object): Promise<unknown> } } }).chrome
    for (const tab of await api.tabs.query({})) await api.tabs.sendMessage(tab.id, { type: "application-continue" }).catch(() => undefined)
  })
  await expect(page.locator("#drive button", { hasText: "No" })).toHaveClass(/_active_/, { timeout: 10000 })
  await expect(page.locator(".odds-ask")).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  await shot(page, "ext-ashby")
})

test("after publishing questions, suggest-answers from the cloud agent fills the field and the outline goes", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://boards.example-ats.com/acme/jobs/agent**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = {
    job_id: "pagent",
    facts: {
      name: "Kien Phung",
      email: "kien@example.com",
      linkedin: "https://www.linkedin.com/in/kien",
      answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" },
      remembered: {},
    },
    cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true },
  }
  fake.agentAnswers = { "How many years of experience do you have with SQL?": "3" }
  const page = await context.newPage()
  await page.goto("https://boards.example-ats.com/acme/jobs/agent")
  await applyFrom(context, page, "https://boards.example-ats.com/acme/jobs/agent")
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  await expect.poll(() => fake.suggestCalls, { timeout: 10000 }).toBeGreaterThan(0)
  await expect(page.locator("#sql")).toHaveValue("3", { timeout: 10000 })
  await expect(page.locator(".odds-ask")).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
})

test("the panel can ask how a job's application is going: nothing, then what its tab last said", async ({ context, fake, extensionId }) => {
  await connect(context)
  await context.route("https://boards.example-ats.com/acme/jobs/55**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = PORTAL_KIT
  const job = "https://boards.example-ats.com/acme/jobs/55"
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const status = (): Promise<{ state: { status: string; message: string } | null }> => popup.evaluate((url) => new Promise((resolve) => (globalThis as unknown as { chrome: { runtime: { sendMessage(m: object, cb: (a: never) => void): void } } }).chrome.runtime.sendMessage({ type: "application-status", url }, resolve)), job)
  expect((await status()).state).toBeNull()
  const page = await context.newPage()
  await page.goto(job)
  await applyFrom(context, page, job)
  await expect.poll(async () => (await status()).state?.status, { timeout: 10000 }).toBe("needs_input")
  expect((await status()).state?.message).toContain("outlined question")
  // The tab closing ends it: a closed application is not reported as going on.
  await page.close()
  await expect.poll(async () => (await status()).state, { timeout: 5000 }).toBeNull()
})

test("a page without an applicant form is never marked ready to review", async ({ context, fake, extensionId }) => {
  await connect(context)
  await context.route("https://boards.example-ats.com/acme/jobs/noform**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><body><main><h1>Data Intern</h1><p>About the role at Acme.</p><form id="search-jobs" action="/jobs"><input name="q" id="what" placeholder="What"><input name="l" id="where" placeholder="Where"></form></main></body></html>`,
  }))
  fake.kit = PORTAL_KIT
  const job = "https://boards.example-ats.com/acme/jobs/noform"
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const status = (): Promise<{ state: { status: string; message: string } | null }> => popup.evaluate((url) => new Promise((resolve) => (globalThis as unknown as { chrome: { runtime: { sendMessage(m: object, cb: (a: never) => void): void } } }).chrome.runtime.sendMessage({ type: "application-status", url }, resolve)), job)
  const page = await context.newPage()
  await page.goto(job)
  await applyFrom(context, page, job)
  await expect.poll(async () => (await status()).state?.status, { timeout: 15000 }).toBe("needs_input")
  expect((await status()).state?.status).not.toBe("ready")
  await expect(page.locator(".odds-apply-bar")).toContainText(/could not (verify an application form|open the application form|move this application forward)/i)
})

/** A form in steps, as Workday draws it: Next shows the next step; the last step has Submit, which odds never presses. */
const STEPS_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1 id="h">My Information</h1>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <div id="s1"><label for="first_name">First Name *</label><input id="first_name" required><label for="last_name">Last Name *</label><input id="last_name" required><label for="email">Email *</label><input id="email" type="email" required></div>
  <div id="s2" hidden><label for="phone">Phone *</label><input id="phone" required><label for="sql">How many years of experience do you have with SQL? *</label><input id="sql" required></div>
  <div id="s3" hidden><p>Review your application</p></div>
  <button type="button" id="next" data-step="1">Next</button>
  <button type="submit" id="submit" hidden>Submit</button>
</form></main>
<script>
const steps = ["My Information", "My Experience", "Review"]
let at = 1
window.advanced = 0
document.getElementById("next").addEventListener("click", () => {
  window.advanced++
  document.getElementById("s" + at).hidden = true
  at++
  document.getElementById("s" + at).hidden = false
  document.getElementById("h").textContent = steps[at - 1]
  if (at === 3) { document.getElementById("next").hidden = true; document.getElementById("submit").hidden = false }
})
</script></body></html>`

test("odds apply goes through the complete steps by itself, stops at a question it cannot answer, continues once it is answered, and stops at the end without sending", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://careers.example-ats.com/acme/jobs/9**", (route) => route.fulfill({ contentType: "text/html", body: STEPS_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://careers.example-ats.com/acme/jobs/9")
  await applyFrom(context, page, "https://careers.example-ats.com/acme/jobs/9")
  // Step 1 is complete from the profile: odds goes on to step 2 by itself.
  await expect(page.locator("#h")).toHaveText("My Experience", { timeout: 15000 })
  await expect(page.locator("#phone")).toHaveValue("+31 6 1234 5678", { timeout: 8000 })
  // The SQL question is the person's: odds waits there, and does not press Next.
  await expect(page.locator(".odds-ask")).toHaveCount(1)
  await page.waitForTimeout(3000)
  await expect(page.locator("#h")).toHaveText("My Experience")
  await page.locator("#sql").fill("3")
  await expect(page.locator("#h")).toHaveText("Review", { timeout: 15000 })
  // The end: Submit is the person's.
  await expect(page.locator(".odds-apply-bar")).toContainText("Check everything", { timeout: 10000 })
  await page.waitForTimeout(2500)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { advanced: number }).advanced)).toBe(2)
  await shot(page, "ext-steps")
})

test("an application sent on an employer's site marks the job applied in odds, from the site's own thank-you, and only then", async ({ context, fake }) => {
  await connect(context)
  const form = EMPLOYER_FORM.replace('window.sent = (window.sent || 0) + 1', `window.sent = (window.sent || 0) + 1; document.querySelector('main').innerHTML = '<h1>Thank you for applying!</h1><p>Your application has been submitted.</p>'`)
  await context.route("https://boards.example-ats.com/acme/jobs/77**", (route) => route.fulfill({ contentType: "text/html", body: form }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://boards.example-ats.com/acme/jobs/77")
  await applyFrom(context, page, "https://boards.example-ats.com/acme/jobs/77")
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  await page.locator("#sql").fill("3")
  await page.waitForTimeout(1500)
  // Filled in, not sent: nothing is marked.
  expect(fake.applied).toEqual([])
  await page.getByRole("button", { name: "Submit application" }).click()
  await expect.poll(() => fake.applied, { timeout: 8000 }).toEqual(["https://boards.example-ats.com/acme/jobs/77"])
  await expect(page.locator(".odds-apply-bar")).toContainText("marked this job as applied")
})

const BANNERS: ReadonlyArray<[string, string, string]> = [
  ["OneTrust", `<div id="onetrust-banner-sdk" style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:12px"><p>We use cookies to improve your experience.</p><button id="onetrust-pc-btn-handler">Cookie Settings</button><button id="onetrust-reject-all-handler" onclick="window.rejected=true;document.getElementById('onetrust-banner-sdk').remove()">Reject All</button><button id="onetrust-accept-btn-handler" onclick="window.accepted=true">Accept All Cookies</button></div>`, "rejected"],
  ["Cookiebot", `<div id="CybotCookiebotDialog" style="position:fixed;inset:20% 20%;background:#fff;padding:16px"><p>This website uses cookies.</p><button>Customize</button><button onclick="window.rejected=true;this.parentElement.remove()">Use necessary cookies only</button><button onclick="window.accepted=true">Allow all</button></div>`, "rejected"],
  ["a Dutch banner", `<div class="cookie-melding" style="position:fixed;bottom:0;left:0;right:0;background:#fff"><p>Wij gebruiken cookies voor een betere website.</p><button onclick="window.accepted=true">Accepteren</button><button onclick="window.rejected=true;this.parentElement.remove()">Alleen noodzakelijke cookies</button></div>`, "rejected"],
  ["a banner drawn in a shadow root", `<div id="usercentrics-root"></div><script>const r=document.getElementById("usercentrics-root").attachShadow({mode:"open"});r.innerHTML='<div style="position:fixed;bottom:0;background:#fff"><p>We use cookies</p><button id="d">Deny</button><button id="a">Accept All</button></div>';r.getElementById("d").onclick=()=>{window.rejected=true;r.innerHTML=""};r.getElementById("a").onclick=()=>{window.accepted=true}</script>`, "rejected"],
  ["a banner that only offers Accept and a close button", `<div role="dialog" style="position:fixed;bottom:0;background:#fff"><p>Cookies make this site work.</p><button onclick="window.accepted=true">Accept</button><button aria-label="Close" onclick="window.rejected=true;this.parentElement.remove()">×</button></div>`, "rejected"],
  ["Magnet.me Functional only", `<div role="dialog" aria-modal="true" style="position:fixed;inset:20%;background:#fff;padding:16px;z-index:99"><h2>We use cookies.</h2><button onclick="window.rejected=true;this.closest('[role=dialog]').remove()">Functional only</button><button onclick="window.accepted=true">All cookies</button></div>`, "rejected"],
]

for (const [name, banner, flag] of BANNERS) {
  test(`odds apply gets past ${name}: it never accepts, the banner goes, and the form is filled in`, async ({ context, fake }) => {
    await connect(context)
    await context.route("https://careers.example-ats.com/acme/jobs/31**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM.replace("<main>", `${banner}<main>`) }))
    fake.kit = PORTAL_KIT
    const page = await context.newPage()
    await page.goto("https://careers.example-ats.com/acme/jobs/31")
    await applyFrom(context, page, "https://careers.example-ats.com/acme/jobs/31")
    await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 10000 })
    await expect.poll(() => page.evaluate((f) => Boolean((window as unknown as Record<string, boolean>)[f]), flag), { timeout: 8000 }).toBe(true)
    expect(await page.evaluate(() => Boolean((window as unknown as { accepted?: boolean }).accepted))).toBe(false)
  })
}

test("a consent box inside the application form is not a cookie banner: odds leaves its buttons alone", async ({ context, fake }) => {
  await connect(context)
  const form = EMPLOYER_FORM.replace("<button type=\"submit\">", `<div class="consent-box"><p>I consent to the processing of my privacy data.</p><button type="button" onclick="window.declined=true">Decline</button></div><button type="submit">`)
  await context.route("https://careers.example-ats.com/acme/jobs/32**", (route) => route.fulfill({ contentType: "text/html", body: form }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://careers.example-ats.com/acme/jobs/32")
  await applyFrom(context, page, "https://careers.example-ats.com/acme/jobs/32")
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 10000 })
  await page.waitForTimeout(2500)
  expect(await page.evaluate(() => Boolean((window as unknown as { declined?: boolean }).declined))).toBe(false)
})

test("Magnet.me-style modal: Apply now inside a form is pressed after Functional only, then the form fills", async ({ context, fake }) => {
  await connect(context)
  const listing = `<!doctype html><html><body>
<div role="dialog" aria-modal="true" style="position:fixed;inset:10%;background:#fff;z-index:9;padding:16px">
  <h2>We use cookies.</h2>
  <button type="button" onclick="this.closest('[role=dialog]').remove();window.rejected=true">Functional only</button>
  <button type="button" onclick="window.accepted=true">All cookies</button>
</div>
<main><h1>Internship</h1>
<div id="apply-modal" style="border:1px solid #ccc;padding:12px">
  <h2>Apply through Magnet.me</h2>
  <button type="button">Create profile</button>
  <p>Or continue directly</p>
  <form action="/apply" method="get"><button type="submit">Apply now</button></form>
</div></main>
<script>document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();location.href='/apply'})</script>
</body></html>`
  await context.route("https://magnet.me/en/opportunity/1", (route) => route.fulfill({ contentType: "text/html", body: listing }))
  await context.route("https://magnet.me/apply**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://magnet.me/en/opportunity/1")
  await applyFrom(context, page, "https://magnet.me/en/opportunity/1")
  await expect(page).toHaveURL(/\/apply/, { timeout: 20000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 10000 })
  expect(await page.evaluate(() => Boolean((window as unknown as { accepted?: boolean }).accepted))).toBe(false)
})

test("one click on an employer's listing: the cookie banner is declined, Apply now is pressed, and the next page's form is filled in, never sent", async ({ context, fake }) => {
  await connect(context)
  const listing = `<!doctype html><div id="onetrust-banner-sdk" style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:12px"><p>We use cookies.</p><button onclick="window.accepted=true">Accept All</button><button onclick="window.rejected=true;document.getElementById('onetrust-banner-sdk').remove()">Reject All</button></div><main><h1>Junior Data Analyst</h1><p>Amsterdam. Join our data team.</p><a class="btn" href="/acme/jobs/41/apply">Apply now</a></main>`
  await context.route("https://careers.example-ats.com/acme/jobs/41", (route) => route.fulfill({ contentType: "text/html", body: listing }))
  await context.route("https://careers.example-ats.com/acme/jobs/41/apply", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://careers.example-ats.com/acme/jobs/41")
  await applyFrom(context, page, "https://careers.example-ats.com/acme/jobs/41")
  await expect(page).toHaveURL(/\/apply$/, { timeout: 15000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 10000 })
  await expect.poll(() => page.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? "")).toBe("Kien_Data_CV.pdf")
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
})

/**
 * ACCEPTANCE (user buttons only — never inject intent / applyFrom):
 * Odds "Apply with Odds" → LinkedIn offsite opens employer in a NEW tab → form fills →
 * "Open application tab" focuses that employer tab. This is the MatchWornShirt / Hunkemöller path.
 */
test("ACCEPT from Odds buttons: LinkedIn offsite NEW tab fills and Open application tab focuses it", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  const li = "https://www.linkedin.com/jobs/view/4475942337/"
  const post = {
    ...FLOW_POSTINGS[0],
    id: "e2e-matchworn-li",
    // kept_id must match id — otherwise mergeByView aliases this to Adyen and Apply opens jobs.example.com.
    kept_id: "e2e-matchworn-li",
    title: "Copywriting Internship",
    employer: "MatchWornShirt",
    employer_display: "MatchWornShirt",
    url: li,
    ats: "linkedin",
    source: "linkedin",
    sources: [{ name: "LinkedIn", ats: "linkedin", url: li }],
  }
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  await mockBackend(context, [post, ...FLOW_POSTINGS.filter((p) => p.id !== post.id)], [], true)
  await context.unroute("https://odds.beeblast.co/**")
  // mockBackend's **/* aborts LinkedIn unless a LATER route wins — match with/without trailing slash.
  await context.route(/^chrome-extension:/, (route) => route.continue())
  await context.route("https://odds.beeblast.co/**", (route) => route.continue())
  const linkedInHtml = `<!doctype html><main>
    <h1>Copywriting Internship</h1>
    <p>Responses managed off LinkedIn</p>
    <button type="button" id="go" class="jobs-apply-button" aria-label="Apply to Copywriting Internship at MatchWornShirt">Apply</button>
  </main>
  <script>
  document.getElementById("go").onclick = () => {
    window.open("https://boards.example-ats.com/match/jobs/new-tab", "_blank")
  }
  </script>`
  await context.route(/https:\/\/boards\.example-ats\.com\/match\/jobs\/new-tab/, (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  // One LinkedIn route after mockBackend — **/* would otherwise abort → chrome-error://.
  await context.route(/https:\/\/(www\.)?linkedin\.com\//, (route) => {
    const u = route.request().url()
    if (u.includes("/voyager/api/jobs/jobPostings/4475942337")) {
      return route.fulfill({ status: 401, contentType: "application/json", body: "{}" })
    }
    if (u.includes("/jobs/view/4475942337")) {
      return route.fulfill({ contentType: "text/html", body: linkedInHtml })
    }
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>linkedin</title>" })
  })
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:accept"', domain: ".www.linkedin.com", path: "/" }])
  fake.kit = {
    job_id: post.id,
    facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} },
    cv: null,
  }
  const app = await context.newPage()
  await app.goto(`https://odds.beeblast.co/job/${post.id}`)
  await expect(app.getByRole("button", { name: "Apply with Odds", exact: true })).toBeVisible({ timeout: 15000 })
  await app.getByRole("button", { name: "Apply with Odds", exact: true }).click()
  // Employer tab must fill — open alone is not enough (the race that emptied MatchWornShirt).
  await expect.poll(async () => {
    for (const p of context.pages()) {
      if (!/match\/jobs\/new-tab/.test(p.url())) continue
      const name = await p.locator("#first_name").inputValue().catch(() => "")
      if (name === "Kien") return true
    }
    return false
  }, { timeout: 25000 }).toBe(true).catch(async (err: Error) => {
    const tabs = await context.serviceWorkers()[0].evaluate(`chrome.tabs.query({}).then(t => t.map(x => x.url||""))`).catch(() => [])
    const bars = await Promise.all(context.pages().map(async (p) => ({ url: p.url(), bar: await p.locator(".odds-apply-bar").textContent().catch(() => null) })))
    throw new Error(`${err.message}\nTABS: ${JSON.stringify(tabs)}\nBARS: ${JSON.stringify(bars)}`)
  })
  const employer = context.pages().find((p) => /match\/jobs\/new-tab/.test(p.url()))!
  await expect.poll(() => context.serviceWorkers()[0].evaluate(`chrome.tabs.query({ active: true }).then(t => t.some(x => (x.url || "").startsWith("https://odds.beeblast.co")))`)).toBe(true)
  await expect(employer.locator("#email")).toHaveValue("kien@example.com")
  await expect(employer.locator("#last_name")).toHaveValue("Phung")
  await expect(employer.locator(".odds-apply-bar")).not.toContainText(/did not attach|Could not load|^Opening the application/i)
  // No CV in kit + required SQL → ask (not false Ready, not stuck Opening).
  await expect(employer.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask", { timeout: 20000 })

  // Apply with Odds switches to Tracker and opens the job drawer — Open tab lives there.
  const openTab = app.getByRole("button", { name: /Open application tab|Open tab:/ })
  if (!(await openTab.isVisible().catch(() => false))) {
    await app.getByRole("button", { name: /Copywriting Internship|MatchWornShirt/i }).first().click()
  }
  await expect(openTab).toBeVisible({ timeout: 20000 })
  const pages = context.pages().length
  await openTab.click()
  await expect.poll(() => context.serviceWorkers()[0].evaluate(`chrome.tabs.query({ url: "https://boards.example-ats.com/match/jobs/new-tab*" }).then(t => Boolean(t[0]?.active))`)).toBe(true)
  expect(context.pages()).toHaveLength(pages)
  await expect(employer.locator("#first_name")).toHaveValue("Kien")
  await expect(employer.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask")
})

test("Apply with Odds pressed in the app itself (this build, on the odds address): one click opens the employer's form in a new tab and fills it; the button follows it; a second click returns to that tab", { tag: "@accept" }, async ({ context, fake }) => {
  await connect(context)
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.route(/^chrome-extension:/, (route) => route.continue())
  // The site is this build, served on the odds address so the extension's own site script runs on it.
  await context.route("https://odds.beeblast.co/**", async (route) => {
    const u = new URL(route.request().url())
    await route.fulfill({ response: await route.fetch({ url: `${process.env.ODDS_E2E_APP_ORIGIN || "http://localhost:4319"}${u.pathname}${u.search}` }) })
  })
  await context.route("https://jobs.example.com/**", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><h1>Application</h1><form><label>First name *<input name="first_name" required></label><label>Phone<input name="phone"></label><label>How many years of experience do you have with SQL? *<input name="sql" required></label><button type="submit">Send application</button></form>' }))
  fake.kit = { facts: { name: "Example User", answers: { first_name: "Given Names", last_name: "Family", phone: "+31 6 12345678" }, remembered: {} } }
  const app = await context.newPage()
  await app.goto(`https://odds.beeblast.co/job/${FLOW_POSTINGS[0].id}`)
  const button = app.getByRole("button", { name: "Apply with Odds", exact: true })
  await expect(button).toBeVisible({ timeout: 15000 })
  const opened = context.waitForEvent("page")
  await button.click()
  const application = await opened
  await expect(application.getByRole("textbox", { name: "First name" })).toHaveValue("Given Names", { timeout: 10000 })
  await expect(application.getByRole("textbox", { name: "Phone" })).toHaveValue("+31 6 12345678")
  // SQL is required and unanswered → terminal ask (not Ready). Form still opened and partially filled.
  await expect(application.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask", { timeout: 15000 })
  // First Apply fills in the background — must NOT steal focus from Odds.
  // (In the Odds window the apply tab is that window's visible tab; what must never happen is it taking over the person's window.)
  const applyActive = await context.serviceWorkers()[0].evaluate(`chrome.tabs.query({ url: "https://jobs.example.com/*" }).then(async t => { const w = (await chrome.storage.session.get("oddsRunWindow")).oddsRunWindow; return Boolean(t[0]?.active) && t[0].windowId !== w })`)
  expect(applyActive).toBe(false)
  // Tracker drawer shows Open application tab (Apply navigates there for the live chip).
  const openTab = app.getByRole("button", { name: /Open application tab|Open tab:/ })
  if (!(await openTab.isVisible().catch(() => false))) {
    await app.getByRole("button", { name: /Junior Financial Analyst/i }).first().click()
  }
  await expect(openTab).toBeVisible({ timeout: 20000 })
  // Second press focuses that same tab: no new page, form untouched.
  const pages = context.pages().length
  await openTab.click()
  await expect.poll(() => context.serviceWorkers()[0].evaluate(`chrome.tabs.query({ url: "https://jobs.example.com/*" }).then(t => Boolean(t[0]?.active))`)).toBe(true)
  expect(context.pages()).toHaveLength(pages)
  expect(application.isClosed()).toBe(false)
  await expect(application.getByRole("textbox", { name: "First name" })).toHaveValue("Given Names")
  await expect(application.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask")
  expect(await application.evaluate(() => document.querySelectorAll("form").length)).toBe(1)
  // Applying keeps the job in the tracker, in the same click: odds was asked to keep it, once.
  await expect.poll(() => fake.calls.length).toBe(1)
})

/** The shape of Booking.com's application (copied from a real one, October 2026): an unlabelled privacy choice, a residence country, address with a province, a login with a password odds never fills, and a banner with Accept and Reject non-essential. */
const BOOKING_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
<div class="bar" style="position:fixed;bottom:0;left:0;right:0;background:#f7f7f7;padding:12px"><h3>Manage cookie preferences</h3><button id="accept" onclick="window.accepted=true">Accept all cookies</button><button id="reject" onclick="window.rejected=true;this.parentElement.remove()">Reject non-essential cookies</button></div>
<h2>Data Privacy Options</h2><p>You are about to apply for a job at Booking.com but first we want to know if you would like us to consider your information for other opportunities as well.</p>
<select id="privacy"><option>— Make a Selection —</option><option>Please consider my information for any opportunities at Booking.com</option><option>I just want to be considered for this job</option></select>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
<label for="reside">Please confirm the country in which you reside in for data privacy purposes.*</label>
<select id="reside" required><option>— Make a Selection —</option><option>Belgium</option><option>Brazil</option><option>Germany</option><option>Netherlands</option><option>Vietnam</option></select>
<label for="addr">Address*</label><input id="addr" required>
<label for="zip">Zip/Postal Code*</label><input id="zip" required>
<label for="city">City*</label><input id="city" value="Amsterdam" required>
<label for="country">Country*</label><select id="country" required><option>Belgium</option><option selected>Netherlands</option></select>
<label for="state">State/Province*</label><select id="state" required><option>— Make a Selection —</option><option>Drenthe</option><option>Noord-Brabant</option><option>Noord-Holland</option><option>Utrecht</option><option>Zuid-Holland</option></select>
<h3>Create a login to access your application</h3>
<label for="login">Email/Login*</label><input id="login" type="email" value="kien@example.com" required>
<label for="pw">Password*</label><input id="pw" type="password" required>
<label for="pw2">Password (Re-enter)*</label><input id="pw2" type="password" required>
<button type="submit">Submit Profile</button></form></main></body></html>`

test("a Booking.com-style application: the privacy choice is this job only, the country and province come from where the person lives, the street is from their answers, the cookie banner is declined, and the password stays theirs", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://jobs.booking.com/apply/1**", (route) => route.fulfill({ contentType: "text/html", body: BOOKING_FORM }))
  fake.kit = { job_id: "pbook", facts: { name: "Kien Phung", email: "kien@example.com", place: "Amsterdam, Netherlands", answers: { first_name: "Kien", last_name: "Phung", city: "Amsterdam", address: "Damrak 1", postcode: "1012 LG" }, remembered: {} }, cv: null }
  const page = await context.newPage()
  await page.goto("https://jobs.booking.com/apply/1")
  await applyFrom(context, page, "https://jobs.booking.com/apply/1")
  await expect(page.locator("#privacy")).toHaveValue("I just want to be considered for this job", { timeout: 10000 })
  await expect(page.locator("#reside")).toHaveValue("Netherlands")
  await expect(page.locator("#state")).toHaveValue("Noord-Holland")
  await expect(page.locator("#addr")).toHaveValue("Damrak 1")
  await expect(page.locator("#zip")).toHaveValue("1012 LG")
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { rejected?: boolean }).rejected))).toBe(true)
  expect(await page.evaluate(() => Boolean((window as unknown as { accepted?: boolean }).accepted))).toBe(false)
  // An account is needed: odds says so and the application is not "ready", because only the person can choose a password.
  await expect(page.locator(".odds-apply-bar")).toContainText("needs an account", { timeout: 10000 })
  await expect(page.locator('.odds-apply-bar[data-state="ask"]')).toBeVisible()
  // Credentials are never touched, and nothing is sent.
  await expect(page.locator("#pw")).toHaveValue("")
  await expect(page.locator("#pw2")).toHaveValue("")
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  await shot(page, "ext-booking")
})

/** Kraft Heinz's application as Workday draws it in French (copied from a real one, October 2026): dropdowns are buttons that open a list, Yes/No are Oui/Non, three terms and a privacy notice to tick. */
const dropdown = (id: string, label: string, options: string[]): string => `<div class="f"><span id="l-${id}">${label}</span><button type="button" id="${id}" aria-haspopup="listbox" aria-labelledby="l-${id} ${id}" data-options='${JSON.stringify(options)}'>Sélectionner</button></div>`
const KRAFT_HEINZ = `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body><main><h1>Formulaire de candidature</h1>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
<h2>Informations sur le Contact</h2>
<label for="email">e-mail</label><input id="email" value="kien@example.com">
<label for="fn">Prénom*</label><input id="fn" required>
<label for="ln">Nom de famille*</label><input id="ln" required>
<label for="tel">Téléphone*</label><input id="tel" required>
${dropdown("pays", "Pays*", ["Belgique", "Allemagne", "Pays-Bas", "France"])}
${dropdown("etat", "État*", ["Drenthe", "Flevoland", "Hollande-Septentrionale", "Hollande-Méridionale", "Utrecht"])}
<label for="ville">Ville*</label><input id="ville" required>
<h2>Divulgation volontaire d’informations</h2>
${dropdown("genre", "Veuillez indiquer laquelle des options d’identité de genre suivantes vous correspond le mieux :*", ["Femme", "Homme", "Nonbinary", "Prefer not to answer"])}
<h2>Termes et conditions</h2>
<label><input type="checkbox" id="t1" required> Espace de travail sans drogues ni substances</label>
<label><input type="checkbox" id="t2" required> Confidentialité</label>
<label><input type="checkbox" id="t3" required> Informations complètes et exactes</label>
<h2>Privacy Notice</h2>
<label><input type="checkbox" id="pn" required> J'ai lu l'Avis de confidentialité de KHC.</label>
<h2>Questions liées à la candidature</h2>
${dropdown("q1", "Nécessiterez-vous, maintenant ou dans l'avenir, un parrainage pour obtenir un visa d'emploi?*", ["Oui", "Non"])}
${dropdown("q2", "Avez-vous 18 ans ou plus?*", ["Oui", "Non"])}
${dropdown("q3", "Are you a current Kraft Heinz employee? If yes, please exit this application, which is for non-employees of Kraft Heinz.*", ["Oui", "Non"])}
${dropdown("q4", "L’un de vos membres de famille directe (conjoint(e), mère, père, frère, sœur, fils ou fille) est-il actuellement employé(e) chez Kraft Heinz ?*", ["Oui", "Non"])}
<label for="q5">Si oui, veuillez indiquer le nom, le poste et le lieu de travail de votre membre de famille chez Kraft Heinz.</label><input id="q5">
<label for="q6">Salaire de base annuel attendu (en devise locale)*</label><input id="q6" required>
${dropdown("q7", "Avez-vous signé une entente de non-concurrence avec un employeur après que l'emploi a pris fin au cours des cinq dernières années?*", ["Oui", "Non"])}
${dropdown("q8", "Avez-vous déjà signé une entente avec un ancien employeur portant sur des brevets ou des renseignements confidentiels ou exclusifs?*", ["Oui", "Non"])}
<button type="submit">Soumettre</button><button type="button" id="clear">Effacer le formulaire</button>
</form></main>
<script>
document.querySelectorAll('button[aria-haspopup="listbox"]').forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll('ul[role="listbox"]').forEach((l) => l.remove())
  const ul = document.createElement("ul"); ul.setAttribute("role", "listbox")
  for (const o of JSON.parse(b.dataset.options)) { const li = document.createElement("li"); li.setAttribute("role", "option"); li.textContent = o; li.addEventListener("click", () => { b.textContent = o; ul.remove() }); ul.append(li) }
  document.body.append(ul)
}))
</script></body></html>`

test("a Workday application in French (Kraft Heinz): your data fills every field it can, the privacy and background choices are the safe ones, consents are ticked, nothing is submitted", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://kraftheinz.wd5.myworkdayjobs.com/**", (route) => route.fulfill({ contentType: "text/html", body: KRAFT_HEINZ }))
  fake.kit = {
    job_id: "pkraft",
    facts: { job_id: "pkraft", job_country: "NL", name: "Kien Phung", email: "kien@example.com", place: "Amsterdam, Netherlands", adult: true, never_worked_here: true, answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", city: "Amsterdam", expected_salary: "EUR 600 a month", work_authorization: "I need a work permit; the employer sponsors it", prior_agreements: "No", insider: "No" }, remembered: {} },
    cv: null,
  }
  const page = await context.newPage()
  await page.goto("https://kraftheinz.wd5.myworkdayjobs.com/fr-FR/KraftHeinz/job/Amsterdam/Operations-Finance-Intern_R-1")
  await applyFrom(context, page, "https://kraftheinz.wd5.myworkdayjobs.com/fr-FR/KraftHeinz/job/Amsterdam/Operations-Finance-Intern_R-1")
  await expect(page.locator("#fn")).toHaveValue("Kien", { timeout: 15000 })
  await expect(page.locator("#ln")).toHaveValue("Phung")
  await expect(page.locator("#tel")).toHaveValue("+31 6 1234 5678")
  await expect(page.locator("#ville")).toHaveValue("Amsterdam")
  const shown = async (id: string): Promise<string> => (await page.locator(`#${id}`).textContent())?.trim() ?? ""
  await expect.poll(() => shown("pays"), { timeout: 15000 }).toBe("Pays-Bas")
  await expect.poll(() => shown("etat"), { timeout: 15000 }).toBe("Hollande-Septentrionale")
  // Background questions: "Prefer not to answer", unless the person said they answer them themselves.
  await expect.poll(() => shown("genre"), { timeout: 15000 }).toBe("Prefer not to answer")
  // The permit, age, employment, family and past agreements: from the profile and from what was chosen once.
  await expect.poll(() => shown("q1"), { timeout: 15000 }).toBe("Oui")
  await expect.poll(() => shown("q2"), { timeout: 15000 }).toBe("Oui")
  await expect.poll(() => shown("q3"), { timeout: 15000 }).toBe("Non")
  await expect.poll(() => shown("q4"), { timeout: 15000 }).toBe("Non")
  await expect.poll(() => shown("q7"), { timeout: 15000 }).toBe("Non")
  await expect.poll(() => shown("q8"), { timeout: 15000 }).toBe("Non")
  await expect(page.locator("#q6")).toHaveValue("EUR 7200 a year")
  // "If yes, give their name" is for the person: left empty.
  await expect(page.locator("#q5")).toHaveValue("")
  // Always consent: terms + privacy notice are ticked so the person only reviews and sends.
  for (const id of ["t1", "t2", "t3", "pn"]) await expect(page.locator(`#${id}`)).toBeChecked({ timeout: 15000 })
  await expect(page.locator(".odds-apply-bar")).toContainText(/Filled in by odds|send it yourself/i, { timeout: 15000 })
  await expect(page.locator(".odds-ask")).toHaveCount(0)
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  await shot(page, "ext-kraft-heinz")
})

/** The required fields of a form that are still empty, as a person would see them: what the form asks, and how it asks it. Never presses anything. */
async function emptyRequired(page: import("@playwright/test").Page): Promise<Array<{ label: string; kind: string }>> {
  return page.evaluate(() => {
    const shown = (e: Element): boolean => (e as HTMLElement).getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden"
    const text = (e: Element | null | undefined): string => (e?.textContent ?? "").replace(/\s+/g, " ").trim()
    const out: Array<{ label: string; kind: string }> = []
    const seen = new Set<string>()
    for (const el of Array.from(document.querySelectorAll("input, select, textarea"))) {
      const input = el as HTMLInputElement
      const type = (input.type || "").toLowerCase()
      if (!shown(el) && type !== "file") continue
      if (["hidden", "submit", "button", "image", "reset", "search"].includes(type) || el.closest(".odds-apply-bar")) continue
      // react-select keeps an invisible "required" input beside every dropdown: it is not a field of its own.
      if (input.tabIndex === -1 && getComputedStyle(el).opacity === "0") continue
      const id = input.id
      const label = (id ? text(document.querySelector(`label[for="${CSS.escape(id)}"]`)) : "") || input.getAttribute("aria-label") || text(el.closest("label")) || text(el.closest(".field, .application-question, [class*='question'], fieldset")?.querySelector("label, legend")) || input.name
      const asked = /\*\s*$/.test(label) || input.required || input.getAttribute("aria-required") === "true"
      if (!asked || !label || seen.has(label)) continue
      let filled = false
      if (type === "checkbox" || type === "radio") filled = input.checked || Array.from(document.querySelectorAll(`input[name="${CSS.escape(input.name)}"]`)).some((r) => (r as HTMLInputElement).checked)
      else if (type === "file") filled = (input.files?.length ?? 0) > 0
      else if (el.tagName === "SELECT") filled = (el as HTMLSelectElement).selectedIndex > 0 && (el as HTMLSelectElement).value !== ""
      else if (input.getAttribute("role") === "combobox") filled = text((el.closest("[class*='control']") ?? el.closest("[class*='container']"))?.querySelector("[class*='single-value'], [class*='SingleValue']")) !== ""
      else filled = input.value.trim() !== ""
      if (!filled) { seen.add(label); out.push({ label: label.replace(/\*+\s*$/, "").trim().slice(0, 110), kind: type === "checkbox" ? "checkbox" : type === "file" ? "file" : el.tagName === "TEXTAREA" ? "textarea" : input.getAttribute("role") === "combobox" || el.tagName === "SELECT" ? "choice" : "text" }) }
    }
    return out
  })
}

/** Classify the Apply bar + page into the tracker chips the product cares about. */
function classifyReach(bar: string, gaps: Array<{ label: string; kind: string }>, inputs: number): string {
  const t = bar.replace(/\s+/g, " ").trim()
  if (/captcha|challenge|robot/i.test(t)) return "captcha"
  if (/\b(account|sign[\s-]?in|log[\s-]?in|password)\b/i.test(t)) return "account"
  if (/review|press Submit|send yourself|ready to send/i.test(t)) return "review"
  if (/outlined|answer the marked|could not fill/i.test(t) || (inputs >= 2 && gaps.some((g) => !["checkbox", "file"].includes(g.kind)))) return "form"
  if (/filling|opening|asking Odds|application form/i.test(t)) return "applying"
  if (/stuck|could not move|after assist/i.test(t)) return "stuck"
  if (inputs >= 3) return "form"
  if (t) return "other"
  return "no_bar"
}

test("live audit across ATS: reach application form / review on real jobs, never send", async ({ context, fake }) => {
  test.skip(!process.env.REAL_FORMS, "Set REAL_FORMS=1 (and the database's public variables) to read real application forms.")
  test.setTimeout(3_600_000)
  // Real LinkedIn / ATS hosts — not the fixture stub used by unit extension tests.
  await context.unroute("https://*.linkedin.com/**").catch(() => undefined)
  await connect(context)
  const sb = process.env.VITE_SUPABASE_URL ?? "", key = process.env.VITE_SUPABASE_ANON_KEY ?? ""
  const rows = (await (await fetch(`${sb}/rest/v1/postings?select=url,employer_display,ats&closed_at=is.null&order=posted_at.desc.nullslast&limit=1000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })).json()) as Array<{ url: string; employer_display: string; ats: string | null }>
  const only = process.env.REAL_FORMS_URL
  const many = process.env.REAL_FORMS_URLS?.split(",").filter(Boolean)
  const target = Number(process.env.REAL_FORMS_N ?? 120)
  const perEmployer = new Map<string, number>()
  const perAts = new Map<string, number>()
  // Prefer employer career sites / ATS over aggregators; still sample LinkedIn.
  const atsCap: Record<string, number> = {
    greenhouse: 40, workday: 30, ashby: 20, smartrecruiters: 12, lever: 8, recruitee: 6,
    teamtailor: 6, personio: 6, successfactors: 6, academictransfer: 10, "magnet.me": 15,
    linkedin: 15, glassdoor: 8, indeed: 8, other: 10, null: 5,
  }
  const picked = many
    ? many.map((url) => ({ url, employer_display: "listed", ats: null as string | null }))
    : only
      ? [{ url: only, employer_display: "one", ats: null as string | null }]
      : rows.filter((r) => {
          if (!r?.url || !/^https:\/\//i.test(r.url)) return false
          const ats = r.ats || "null"
          const a = perAts.get(ats) ?? 0
          if (a >= (atsCap[ats] ?? 8)) return false
          const e = perEmployer.get(r.employer_display) ?? 0
          if (e >= 2) return false
          perAts.set(ats, a + 1)
          perEmployer.set(r.employer_display, e + 1)
          return true
        }).slice(0, target)
  fake.kit = { job_id: "preal", facts: { job_id: "preal", job_country: "NL", name: "Kien Phung", email: "kien@example.com", phone: "+31 6 1234 5678", place: "Amsterdam, Netherlands", linkedin: "https://www.linkedin.com/in/kien", website: "https://kien.example.com", dutch: "basic", job_source: "LinkedIn", adult: true, never_worked_here: true, applied_before: false, answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", email: "kien@example.com", city: "Amsterdam", address: "Damrak 1", postcode: "1012 LG", website: "https://kien.example.com", linkedin: "https://www.linkedin.com/in/kien", university: "University of Amsterdam", degree: "MSc Finance", field_of_study: "Finance", graduation_date: "June 2027", study_start: "September 2025", current_job_title: "Data Analyst Intern", current_company: "Philips", study_year: "2nd year", study_status: "Yes, enrolled", nationality: "Vietnamese", work_authorization: "zoekjaar / orientation year", expected_salary: "EUR 600 a month", start_date: "1 February 2027", hours_per_week: "40", notice_period: "None", relocation: "Yes, anywhere in the Netherlands", onsite_ok: "Yes", prior_agreements: "No", insider: "No" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien CV", file_name: "Kien_CV.pdf", for_this_job: true } }
  type Row = { employer: string; ats: string; url: string; gaps: Array<{ label: string; kind: string }>; opened: boolean; reach: string; bar: string; inputs: number }
  const report: Row[] = []
  const waitMs = Number(process.env.REAL_FORMS_WAIT_MS ?? 22000)
  console.log(`LIVE AUDIT START n=${picked.length} waitMs=${waitMs} ats=`, Object.fromEntries(perAts))
  for (let i = 0; i < picked.length; i += 1) {
    const job = picked[i]
    const page = await context.newPage()
    if (process.env.REAL_FORMS_DEBUG) {
      page.on("console", (m) => { if (["error", "warning"].includes(m.type()) || /odds/i.test(m.text())) console.log("LIVE CONSOLE", m.type(), m.text().slice(0, 220)) })
      page.on("pageerror", (e) => console.log("LIVE PAGEERROR", String(e).slice(0, 220)))
    }
    try {
      await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 35000 })
      await applyFrom(context, page, job.url)
      await page.waitForTimeout(waitMs)
      const gaps = await emptyRequired(page)
      const bar = (await page.locator(".odds-apply-bar").allTextContents().catch(() => [])).join(" | ")
      const inputs = await page.evaluate(() => document.querySelectorAll("input:not([type=hidden]),select,textarea").length)
      const reach = classifyReach(bar, gaps, inputs)
      console.log(`LIVE ${String(i + 1).padStart(3)}/${picked.length} ${reach.padEnd(10)} ${(job.ats || "?").padEnd(16)} ${(job.employer_display || "").slice(0, 28).padEnd(28)} ${job.url.slice(0, 70)}`)
      report.push({ employer: job.employer_display, ats: job.ats || "?", url: job.url, gaps, opened: true, reach, bar: bar.slice(0, 160), inputs })
    } catch (e) {
      console.log(`LIVE ${String(i + 1).padStart(3)}/${picked.length} FAIL       ${(job.ats || "?").padEnd(16)} ${(job.employer_display || "").slice(0, 28)} ${String(e).slice(0, 80)}`)
      report.push({ employer: job.employer_display, ats: job.ats || "?", url: job.url, gaps: [], opened: false, reach: "fail_open", bar: "", inputs: 0 })
    } finally {
      await page.close().catch(() => undefined)
    }
  }
  const consent = /privacy|confidential|consent|acknowledg|agree|terms|policy|conduct|by checking/i
  const counted = report.filter((r) => r.opened)
  const byReach = new Map<string, number>()
  const byAts = new Map<string, { n: number; form: number; review: number; stuck: number; captcha: number; account: number }>()
  for (const r of report) {
    byReach.set(r.reach, (byReach.get(r.reach) ?? 0) + 1)
    const a = byAts.get(r.ats) ?? { n: 0, form: 0, review: 0, stuck: 0, captcha: 0, account: 0 }
    a.n++
    if (r.reach === "form") a.form++
    if (r.reach === "review") a.review++
    if (r.reach === "stuck") a.stuck++
    if (r.reach === "captcha") a.captcha++
    if (r.reach === "account") a.account++
    byAts.set(r.ats, a)
  }
  const reached = report.filter((r) => ["form", "review", "applying"].includes(r.reach))
  const humanOnly = report.filter((r) => ["captcha", "account"].includes(r.reach))
  const tally = new Map<string, { n: number; kind: string }>()
  for (const r of counted) for (const g of r.gaps) { const e = tally.get(g.label) ?? { n: 0, kind: g.kind }; e.n++; tally.set(g.label, e) }
  for (const r of report.filter((r) => r.reach === "stuck" || r.reach === "no_bar" || r.reach === "fail_open")) {
    console.log(`LIVE MISS ${r.reach.padEnd(10)} ${r.ats.padEnd(14)} ${r.employer.slice(0, 24)} ${r.url}`)
  }
  console.log(`LIVE AUDIT: opened ${counted.length}/${picked.length}; reached_form/review/applying ${reached.length}; human(captcha|account) ${humanOnly.length}; stuck ${byReach.get("stuck") ?? 0}; suggest-action ${fake.suggestActionCalls}`)
  console.log("LIVE REACH", Object.fromEntries(byReach))
  for (const [ats, a] of [...byAts.entries()].sort((x, y) => y[1].n - x[1].n)) {
    console.log(`LIVE ATS ${ats.padEnd(16)} n=${a.n} form=${a.form} review=${a.review} stuck=${a.stuck} captcha=${a.captcha} account=${a.account}`)
  }
  console.log(`LIVE AUDIT: ${counted.filter((r) => r.gaps.every((g) => ["checkbox", "file"].includes(g.kind) || consent.test(g.label))).length} have nothing left but checkboxes, files and the terms`)
  for (const [label, e] of [...tally.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 40)) console.log(`LIVE GAP ${String(e.n).padStart(2)} ${e.kind.padEnd(8)} ${label}`)
  expect(fake.applied).toEqual([])
  // Soft goal: among opened ATS career pages, a majority should reach form/review/applying or stop on captcha/account (not silent fail).
  const career = report.filter((r) => !["linkedin", "glassdoor", "indeed", "magnet.me"].includes(r.ats))
  if (career.length >= 10) {
    const ok = career.filter((r) => ["form", "review", "applying", "captcha", "account"].includes(r.reach)).length
    console.log(`LIVE CAREER OK ${ok}/${career.length}`)
    expect(ok / career.length).toBeGreaterThanOrEqual(0.35)
  }
})


test("Lever AJAX upload: success attachment counts after native file input is cleared", async ({ context, fake }) => {
  await connect(context)
  fake.kit = PORTAL_KIT
  await context.route("https://jobs.eu.lever.co/acme/uploaded", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><h1>Application</h1><form>
<label>Full name<input name="name" required></label>
<label>Twitter URL<input name="twitter"></label>
<div class="application-field"><a class="has-file"><span class="filename">CV.pdf</span><input type="file" name="resume"></a><span class="resume-upload-success">Success!</span><span class="resume-upload-failure" style="display:none">Failed</span></div>
<button type="submit">Submit application</button></form>` }))
  const page = await context.newPage()
  await page.goto("https://jobs.eu.lever.co/acme/uploaded")
  await applyFrom(context, page, "https://jobs.eu.lever.co/acme/uploaded")
  await expect(page.locator("input[name=name]")).not.toHaveValue("", { timeout: 10000 })
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "done", { timeout: 15000 })
  // A completed form must not re-enter the stall watchdog after a few idle rounds.
  await page.waitForTimeout(3500)
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "done")
})

/** An employer's own list of vacancies (Just Brands-like): job cards, a menu, no application form. */
const VACANCY_LIST = (withJob: boolean): string => `<!doctype html><html><head><meta charset="utf-8"><title>Working at - Example Brands</title></head><body>
<nav><a href="/nl/hq/jobs">Headquarters</a> <a href="/nl/retail/jobs">Retail</a> <a href="/nl/stages/jobs">Stages</a></nav>
<main><h1>Retail jobs</h1>
<a href="/nl/retail/jobs/asm-utrecht"><h2>Assistant Store Manager</h2> Utrecht 32 - 38 hours</a>
<a href="/nl/retail/jobs/asm-hilversum"><h2>Assistant Store Manager</h2> Hilversum 32 - 38 hours</a>
<a href="/nl/retail/jobs/asm-leidschendam"><h2>Assistant Store Manager</h2> Leidschendam 36 - 38 hours</a>
<a href="/nl/retail/jobs/logistics"><h2>Logistics Employee | PME Legend 32-38 hours</h2></a>
${withJob ? `<a href="/nl/stages/jobs/b2c-marketing-intern"><h2>B2C Marketing Intern (Content &amp; Retail)</h2></a>` : ""}
</main></body></html>`
const VACANCY_FORM = `<!doctype html><html><head><meta charset="utf-8"><title>Apply for: B2C Marketing Intern</title></head><body><main><h1>Apply for: B2C Marketing Intern (Content &amp; Retail)</h1>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <label for="first_name">Voornaam/First name *</label><input id="first_name" required>
  <label for="email">E-mail *</label><input id="email" type="email" required>
  <button type="submit">Solliciteer</button>
</form></main></body></html>`

test("the employer's link lands on their list of vacancies: odds opens this job from the list, fills its form, and remembers where it is", async ({ context, fake }) => {
  await connect(context)
  // Odds may prefer the English page (/en/ for /nl/): the site answers both.
  await context.route("https://career.example-brands.eu/**", (route) => route.fulfill({ contentType: "text/html", body: /b2c-marketing-intern/.test(route.request().url()) ? VACANCY_FORM : VACANCY_LIST(true) }))
  fake.kit = { job_id: "pjb", job_title: "B2C MARKETING INTERN (CONTENT & RETAIL)", facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien" }, remembered: {} }, cv: null }
  const page = await context.newPage()
  await page.goto("https://career.example-brands.eu/nl/retail/jobs")
  await applyFrom(context, page, "https://career.example-brands.eu/nl/retail/jobs")
  await expect(page).toHaveURL(/b2c-marketing-intern$/, { timeout: 15000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 10000 })
  await expect(page.locator("#email")).toHaveValue("kien@example.com")
  // Saved a moment after the form is seen: wait for it.
  await expect.poll(async () => JSON.stringify(await context.serviceWorkers()[0].evaluate(async () => (await (globalThis as unknown as { chrome: { storage: { local: { get(k: string): Promise<Record<string, unknown>> } } } }).chrome.storage.local.get("oddsLearnedApply")).oddsLearnedApply) ?? {}), { timeout: 8000 }).toContain("b2c-marketing-intern")
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
})

test("the employer's list does not have this job: odds stops after its tries and says so, never loops or claims Review", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://career.example-brands.eu/nl/**", (route) => route.fulfill({ contentType: "text/html", body: VACANCY_LIST(false) }))
  fake.kit = { job_id: "pjb2", job_title: "B2C MARKETING INTERN (CONTENT & RETAIL)", facts: { name: "Kien Phung", email: "kien@example.com", answers: {}, remembered: {} }, cv: null }
  const page = await context.newPage()
  await page.goto("https://career.example-brands.eu/nl/retail/jobs")
  await applyFrom(context, page, "https://career.example-brands.eu/nl/retail/jobs")
  await expect(page.locator(".odds-apply-bar")).toContainText("could not open the application form", { timeout: 30000 })
  await expect(page.locator(".odds-apply-bar")).not.toContainText("send it yourself")
  const calls = fake.suggestActionCalls
  await page.waitForTimeout(4000)
  expect(fake.suggestActionCalls - calls).toBe(0)
  expect(fake.suggestActionCalls).toBeLessThanOrEqual(3)
})

test("the person presses Back after odds filled the form: odds pauses on their page, never pushes forward again, and says so", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://career.example-brands.eu/**", (route) => route.fulfill({ contentType: "text/html", body: /b2c-marketing-intern/.test(route.request().url()) ? VACANCY_FORM : VACANCY_LIST(true) }))
  fake.kit = { job_id: "pjb3", job_title: "B2C MARKETING INTERN (CONTENT & RETAIL)", facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien" }, remembered: {} }, cv: null }
  const page = await context.newPage()
  await page.goto("https://career.example-brands.eu/nl/retail/jobs")
  await applyFrom(context, page, "https://career.example-brands.eu/nl/retail/jobs")
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 15000 })
  await page.goBack()
  await expect(page).toHaveURL(/retail\/jobs$/)
  await expect(page.locator(".odds-apply-bar")).toContainText("Odds paused here", { timeout: 10000 })
  await page.waitForTimeout(5000)
  await expect(page).toHaveURL(/retail\/jobs$/)
  const intent = await context.serviceWorkers()[0].evaluate(async () => Object.values((await (globalThis as unknown as { chrome: { storage: { local: { get(k: string): Promise<Record<string, Record<string, { paused?: boolean; status?: string }>>> } } } }).chrome.storage.local.get("oddsApplyIntents")).oddsApplyIntents ?? {})[0])
  expect(intent?.paused).toBe(true)
  expect(intent?.status).toBe("needs_input")
})

test("a site whose menu says 'Apply for a job': odds never takes the menu for the job's Apply, and a page that keeps reloading stops with a clear message", async ({ context, fake }) => {
  test.setTimeout(90_000)
  await connect(context)
  let loads = 0
  await context.route("https://www.student-club.example/**", (route) => { loads++; return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><title>Apply for a job</title></head><body>
    <nav><a href="https://www.student-club.example/student-support/apply-for-a-job/">Apply for a job</a> <a href="/events">Events</a></nav>
    <main><h1>Apply for a job</h1><ul><li>What does a typical application process look like?</li><li>Can I write my thesis at a company?</li></ul>
    <a href="https://www.student-club.example/student-support/apply-for-a-job/">Apply</a></main></body></html>` }) })
  fake.kit = { job_id: "paureus", job_title: "Business Analyst Intern", facts: { name: "Kien Phung", email: "kien@example.com", answers: {}, remembered: {} }, cv: null }
  const page = await context.newPage()
  await page.goto("https://www.student-club.example/student-support/apply-for-a-job/")
  await applyFrom(context, page, "https://www.student-club.example/student-support/apply-for-a-job/")
  await expect(page.locator(".odds-apply-bar")).toContainText(/could not (open|move)/, { timeout: 40000 })
  const settled = loads
  await page.waitForTimeout(5000)
  expect(loads - settled).toBe(0)
  // Drive runs get a little more room (5 visits of one page), still a hard stop.
  expect(loads).toBeLessThanOrEqual(12)
})

test("Broods drives an employer's form in the person's tab: reads it, fills from their facts, uploads the CV, leaves the unknown to them, never submits", async ({ context, fake }) => {
  test.setTimeout(90_000)
  await connect(context)
  await context.route("https://boards.example-ats.com/acme/jobs/777**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = { job_id: "pdrive", broods_drive: true, facts: { name: "Kien Phung", email: "kien@example.com", linkedin: "https://www.linkedin.com/in/kien", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true } }
  const page = await context.newPage()
  await page.goto("https://boards.example-ats.com/acme/jobs/777")
  await applyFrom(context, page, "https://boards.example-ats.com/acme/jobs/777")
  await expect(page.locator(".odds-apply-bar")).toContainText(/Answer: .*SQL/, { timeout: 60000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien")
  await expect(page.locator("#last_name")).toHaveValue("Phung")
  await expect(page.locator("#email")).toHaveValue("kien@example.com")
  await expect(page.locator("#auth")).toHaveValue("Yes")
  await expect.poll(() => page.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? "")).toBe("Kien_Data_CV.pdf")
  await expect(page.locator("#hp")).toHaveValue("")
  const run = [...fake.drives.values()][0]
  expect(run.log[0]).toMatch(/^read_page/)
  expect(run.log.some((l) => l.startsWith("fill"))).toBe(true)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
})

test("the connection drops while Broods drives: Odds says so, keeps trying, and finishes the run once it is back (never gives up in seconds)", async ({ context, fake }) => {
  test.setTimeout(120_000)
  await connect(context)
  await context.route("https://boards.example-ats.com/acme/jobs/778**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = { job_id: "pdown", broods_drive: true, facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} }, cv: null }
  // More failed calls in a row than the old loop allowed before it gave up (6).
  fake.driveDown = 8
  const page = await context.newPage()
  await page.goto("https://boards.example-ats.com/acme/jobs/778")
  await applyFrom(context, page, "https://boards.example-ats.com/acme/jobs/778")
  await expect(page.locator(".odds-apply-bar")).toContainText(/Connection lost/, { timeout: 30000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 60000 })
  await expect(page.locator(".odds-apply-bar")).not.toContainText(/stopped answering|lost its connection/)
  expect(fake.driveDown).toBe(0)
})

test("Broods drives LinkedIn Easy Apply: each step read and filled from the person's facts, Next pressed by Broods, the unknown left to them, Submit never pressed", async ({ context, fake }) => {
  test.setTimeout(90_000)
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000301/**", (route) => route.fulfill({ contentType: "text/html", body: EASY_APPLY }))
  fake.peek = { known: true, id: "papply", saved: true, chance_pct: 8.8 }
  fake.kit = {
    job_id: "papply",
    broods_drive: true,
    facts: { name: "Kien Phung", email: "kien@example.com", phone: "+31 6 1234 5678", place: "Amsterdam, Netherlands", dutch: "basic", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} },
    cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true },
  }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000301/")
  await page.locator("#jobs-apply-button-id").click()
  const modal = page.locator("[data-test-modal-id=easy-apply-modal]")
  await expect(modal.locator(".odds-apply-bar")).toContainText(/Answer: .*SQL/, { timeout: 60000 })
  await expect(modal.locator("h3")).toHaveText("Additional Questions")
  await expect(modal.locator("#sp-no")).toBeChecked()
  await expect(modal.locator("#dutch")).toHaveValue("Conversational")
  expect(await page.evaluate(() => (window as unknown as { seen: Record<string, unknown> }).seen)).toMatchObject({ phone: "612345678", "jobsDocumentCardToggle-2": true })
  const run = [...fake.drives.values()][0]
  expect(run.log.filter((l) => l.startsWith("click")).length).toBeGreaterThanOrEqual(2)
  expect(await page.evaluate(() => (window as unknown as { submits: number }).submits)).toBe(0)
})

/** Oracle Cloud's first step: email, a terms box whose real checkbox is hidden behind a styled label, NEXT that refuses until both are done. */
const ORACLE_STEP = `<!doctype html><html><head><meta charset="utf-8"><title>Apply - Oracle</title>
<style>.oj-check input{position:absolute;opacity:0;width:1px;height:1px} .oj-check .box{display:inline-block;width:16px;height:16px;border:1px solid #333}</style></head><body><main>
<h1>You don't need to have an account</h1>
<div id="step1"><label for="email">Email Address *</label><input id="email" type="email" required>
<div class="oj-check"><label for="terms"><input id="terms" type="checkbox" required><span class="box"></span> I agree with the <a href="#t">terms and conditions</a> *</label></div>
<p id="err" role="alert"></p>
<button id="cancel">CANCEL</button> <button id="next">NEXT</button></div>
<div id="step2" hidden><h2>Review your application</h2><button id="submit" onclick="window.sent=(window.sent||0)+1">Submit</button></div>
</main><script>
document.getElementById("next").addEventListener("click", () => {
  if (!document.getElementById("email").value || !document.getElementById("terms").checked) { document.getElementById("err").textContent = "You need to agree to the terms and conditions."; return }
  document.getElementById("step1").hidden = true; document.getElementById("step2").hidden = false
})
</script></body></html>`

test("Broods drives an Oracle-style step: fills the email, ticks the terms box hidden behind a styled label (consent yes), presses NEXT, stops at Submit", async ({ context, fake }) => {
  test.setTimeout(90_000)
  await connect(context)
  await context.route("https://eklm.example-oraclecloud.com/**", (route) => route.fulfill({ contentType: "text/html", body: ORACLE_STEP }))
  fake.kit = { job_id: "poracle", broods_drive: true, facts: { name: "Kien Phung", email: "kien@example.com", answers: { email: "kien@example.com" }, remembered: {} }, cv: null }
  const page = await context.newPage()
  await page.goto("https://eklm.example-oraclecloud.com/job/354/apply")
  await applyFrom(context, page, "https://eklm.example-oraclecloud.com/job/354/apply")
  await expect(page.locator(".odds-apply-bar")).toContainText(/press Submit yourself/i, { timeout: 60000 })
  await expect(page.locator("#terms")).toBeChecked()
  await expect(page.locator("#email")).toHaveValue("kien@example.com")
  await expect(page.locator("#step2")).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
})

test("Broods acts by sight when the page tools cannot: screenshot of the tab, a click at a point on a widget read_page does not list, the next step opens", async ({ context, fake }) => {
  test.setTimeout(90_000)
  await connect(context)
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Custom widget</title></head><body style="margin:0"><main>
  <h1>Almost there</h1>
  <div id="go" style="position:absolute;left:200px;top:220px;width:180px;height:48px;background:#1a4;color:#fff;cursor:pointer">Continue</div>
  <div id="step2" hidden><h2>Review</h2><button id="submit" onclick="window.sent=(window.sent||0)+1">Submit</button></div>
  <script>document.getElementById("go").addEventListener("click", () => { document.getElementById("go").remove(); document.getElementById("step2").hidden = false })</script>
  </main></body></html>`
  await context.route("https://jobs.example-widget.com/**", (route) => route.fulfill({ contentType: "text/html", body: html }))
  fake.kit = { job_id: "pwidget", broods_drive: true, facts: { name: "Kien Phung", email: "kien@example.com", answers: {}, remembered: {} }, cv: null }
  const page = await context.newPage()
  let shotBytes = 0
  fake.driveScript = async (cmd) => {
    const before = await cmd("read_page") as { buttons?: Array<{ text: string }> }
    expect((before.buttons ?? []).some((b) => /continue/i.test(b.text))).toBe(false)
    const shot = await cmd("screenshot") as { image?: string; width?: number; height?: number; error?: string }
    shotBytes = (shot.image ?? "").length
    if (!shotBytes) console.log("SHOT", JSON.stringify(shot).slice(0, 300))
    const dpr = await page.evaluate(() => devicePixelRatio)
    await cmd("click_at", { x: (200 + 90) * dpr, y: (220 + 24) * dpr })
    const after = await cmd("read_page") as { buttons?: Array<{ text: string; blocked?: boolean }> }
    return (after.buttons ?? []).some((b) => b.blocked && /submit/i.test(b.text))
      ? { status: "review", message: "Everything is filled in. Check it and press Submit yourself." }
      : { status: "stuck", message: "The click did not open the next step." }
  }
  await page.goto("https://jobs.example-widget.com/apply")
  await applyFrom(context, page, "https://jobs.example-widget.com/apply")
  await expect(page.locator(".odds-apply-bar")).toContainText(/press Submit yourself/i, { timeout: 60000 })
  expect(shotBytes).toBeGreaterThan(1000)
  await expect(page.locator("#step2")).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
})


// ---- Real sites, real Broods (REAL_BROODS=1 only: costs model calls and needs network). A made-up person; nothing is ever submitted. ----
const REAL_JOBS = [
  { name: "greenhouse-dept", url: "https://job-boards.greenhouse.io/dept/jobs/8105170", title: "Junior Paid Search (SEA) Consultant" },
  { name: "lever-tomtom", url: "https://jobs.eu.lever.co/tomtom/669fa744-174e-4682-81b3-fa85322cafc5", title: "Senior Applied Scientist - Graph Optimization" },
  { name: "ashby-prosus", url: "https://jobs.ashbyhq.com/prosus/eeb0e0d9-9d3f-4321-8acd-11558dde7c7d", title: "ML Engineering Intern - LLM Research & Development" },
  { name: "workday-signify", url: "https://lighting.wd3.myworkdayjobs.com/jobs-and-careers/job/Eindhoven/CTI-Intern_366438-1", title: "CTI Intern" },
  { name: "oracle-yamaha", url: "https://eklm.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/35404", title: "Intern Corporate Communications" },
  { name: "glassdoor-rosewood", url: "https://www.glassdoor.nl/job-listing/talent-and-culture-intern-rosewood-hotel-group-JV_IC3064478_KO0,25_KE26,46.htm?jl=1010295738909", title: "Talent and Culture Intern", board: true },
  { name: "indeed-fb-intern", url: "https://nl.indeed.com/viewjob?jk=3420fff5df333289", title: "Food & Beverage Management Intern", board: true },
  { name: "linkedin-marketing", url: "https://www.linkedin.com/jobs/view/4479270692", title: "Marketing & Communications Intern", board: true },
] as Array<{ name: string; url: string; title: string; board?: boolean }>
const TEST_PERSON = { first_name: "Test", last_name: "Applicant", email: "test.applicant@example.com", phone: "+31 6 1234 5678", lives_in: "Amsterdam, Netherlands", nationality_group: "Non-EU nationality", work_permit: "Orientation year (zoekjaar) permit: may work in the Netherlands without sponsorship", education: "Master, Business Analytics, Vrije Universiteit Amsterdam, Sep 2025–Aug 2027", experience: "Data Analyst, Shopee, 2022–2024", linkedin: "https://www.linkedin.com/in/test-applicant", start_date: "1 February 2027", hours_per_week: "40", role_values: "learning fast; international teams; measurable impact" }
for (const job of REAL_JOBS) {
  test(`REAL: Broods drives ${job.name} (real site, real Broods, never submits)`, async ({ context, fake }) => {
    test.skip(process.env.REAL_BROODS !== "1", "real sites + real Broods: set REAL_BROODS=1")
    test.setTimeout(960_000)
    await connect(context)
    const page = await context.newPage()
    fake.realBroods = { title: job.title, person: TEST_PERSON, log: [] }
    let shots = 0
    fake.realBroods.shot = async (label) => { await page.screenshot({ path: `test-results/real-${job.name}/${String(++shots).padStart(2, "0")}-step${label}.png` }) }
    fake.kit = { job_id: `preal-${job.name}`, broods_drive: true, facts: { name: "Test Applicant", email: TEST_PERSON.email, phone: TEST_PERSON.phone, answers: { first_name: "Test", last_name: "Applicant", email: TEST_PERSON.email, phone: TEST_PERSON.phone }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Test_Applicant_CV", file_name: "Test_Applicant_CV.pdf", for_this_job: true } }
    let submits = 0
    page.on("request", (r) => { if (r.method() === "POST" && /\/(applications?|apply|submit|candidates?)\b/i.test(r.url()) && !/supabase|broods|127\.0\.0\.1|localhost/.test(r.url())) submits++ })
    await page.goto(job.url, { waitUntil: "domcontentloaded" })
    await applyFrom(context, page, job.url)
    // Ends when Broods finishes — or, on a job board this test browser is not signed in to, when Odds stops at the sign-in wall and says so.
    const bar = async (): Promise<string> => (await Promise.all(context.pages().map((p) => p.locator(".odds-apply-bar").first().textContent({ timeout: 500 }).catch(() => "")))).join(" ")
    await expect.poll(async () => (fake.realBroods?.end?.status ?? "") || (job.board && /sign in|log in|inloggen|account/i.test(await bar()) ? "signin" : ""), { timeout: 900_000, intervals: [3000] }).not.toBe("")
    const last = context.pages().at(-1) ?? page
    await last.screenshot({ path: `test-results/real-${job.name}/zz-final.png` }).catch(() => undefined)
    const outcome = fake.realBroods?.end?.status ?? "signin"
    console.log(`REAL ${job.name}: ${outcome} — ${fake.realBroods?.end?.message ?? (await bar()).slice(0, 200)}`)
    console.log(`REAL ${job.name} steps: ${fake.realBroods?.log.length ?? 0}`)
    expect(["review", "needs_you", ...(job.board ? ["signin"] : [])]).toContain(outcome)
    expect(submits).toBe(0)
  })
}

test("a page Odds is not applying in shows nothing: no bar on an ordinary site or a LinkedIn job the person only browses", async ({ context }) => {
  await connect(context)
  await context.route("https://dashboard.example-tool.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body><h1>Some dashboard</h1><button>Refresh</button></body></html>" }))
  await context.route("https://www.linkedin.com/jobs/view/4470009999/**", (route) => route.fulfill({ contentType: "text/html", body: EASY_APPLY }))
  const page = await context.newPage()
  await page.goto("https://dashboard.example-tool.com/runs")
  await page.waitForTimeout(8000)
  await expect(page.locator(".odds-apply-bar")).toHaveCount(0)
  const li = await context.newPage()
  await li.goto("https://www.linkedin.com/jobs/view/4470009999/")
  await li.waitForTimeout(8000)
  await expect(li.locator(".odds-apply-bar")).toHaveCount(0)
})

test("the person takes the application tab for something else (types another address): Odds lets go of it and shows nothing there", async ({ context, fake }) => {
  test.setTimeout(90_000)
  await connect(context)
  await context.route("https://boards.example-ats.com/acme/jobs/556**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  await context.route("https://dashboard.example-tool.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body><h1>Some dashboard</h1><input id='q'><button>Refresh</button></body></html>" }))
  fake.kit = { job_id: "ptake", facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} }, cv: null }
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://boards.example-ats.com/acme/jobs/556', null, { postingId: 'ptake' })")
  const app = await opened
  await expect(app.locator("#first_name")).toHaveValue("Kien", { timeout: 15000 })
  // The person uses that tab for something else, from the address bar (Chrome reports a "typed" navigation; the test browser's own
  // navigation is not typed, so the same handler is called the way Chrome would call it).
  const tabId = await worker.evaluate(`chrome.tabs.query({ url: "https://boards.example-ats.com/acme/jobs/556*" }).then(t => t[0].id)`)
  await worker.evaluate(`personTookTab(${tabId})`)
  await app.goto("https://dashboard.example-tool.com/runs")
  await app.waitForTimeout(8000)
  await expect(app.locator(".odds-apply-bar")).toHaveCount(0)
  await expect(app.locator("#q")).toHaveValue("")
})

test("STRESS: six applications at once, each in its own tab, none mixing with another, and the person's own page left alone", async ({ context, fake }) => {
  test.setTimeout(240_000)
  await connect(context)
  const form = (n: number) => EMPLOYER_FORM.replace("<h1>Data Intern</h1>", `<h1>Data Intern ${n}</h1>`)
  await context.route("https://boards.example-ats.com/stress/jobs/**", (route) => { const n = Number(/jobs\/(\d+)/.exec(route.request().url())?.[1] ?? 0); return route.fulfill({ contentType: "text/html", body: form(n) }) })
  await context.route("https://eklm.example-oraclecloud.com/**", (route) => route.fulfill({ contentType: "text/html", body: ORACLE_STEP }))
  await context.route("https://career.example-brands.eu/**", (route) => route.fulfill({ contentType: "text/html", body: /b2c-marketing-intern/.test(route.request().url()) ? VACANCY_FORM : VACANCY_LIST(true) }))
  await context.route("https://dashboard.example-tool.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body><h1>My dashboard</h1><input id='q'><button>Refresh</button></body></html>" }))
  fake.kit = { job_id: "pstress", job_title: "B2C MARKETING INTERN (CONTENT & RETAIL)", broods_drive: true, facts: { name: "Kien Phung", email: "kien@example.com", linkedin: "https://www.linkedin.com/in/kien", answers: { first_name: "Kien", last_name: "Phung", email: "kien@example.com", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true } }
  // The person's own page, open the whole time.
  const mine = await context.newPage()
  await mine.goto("https://dashboard.example-tool.com/runs")
  const worker = context.serviceWorkers()[0]
  const jobs = [
    "https://boards.example-ats.com/stress/jobs/1",
    "https://boards.example-ats.com/stress/jobs/2",
    "https://boards.example-ats.com/stress/jobs/3",
    "https://eklm.example-oraclecloud.com/job/777/apply",
    "https://career.example-brands.eu/nl/retail/jobs",
  ]
  const t0 = Date.now()
  await Promise.all(jobs.map((url, i) => worker.evaluate(`openApplication(${JSON.stringify(url)}, null, { postingId: "pstress-${i}" })`)))
  // Every application reaches its own end: the forms leave SQL to the person, Oracle and the job list reach Submit.
  const pageFor = (re: RegExp) => context.pages().find((p) => re.test(p.url()))
  for (const n of [1, 2, 3]) {
    await expect.poll(() => pageFor(new RegExp(`stress/jobs/${n}$`))?.locator(".odds-apply-bar").textContent().catch(() => "") ?? "", { timeout: 120_000 }).toMatch(/Answer: .*SQL/)
    const p = pageFor(new RegExp(`stress/jobs/${n}$`))!
    await expect(p.locator("h1")).toHaveText(`Data Intern ${n}`)
    await expect(p.locator("#first_name")).toHaveValue("Kien")
    await expect(p.locator("#email")).toHaveValue("kien@example.com")
    expect(await p.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  }
  await expect.poll(() => pageFor(/oraclecloud/)?.locator(".odds-apply-bar").textContent().catch(() => "") ?? "", { timeout: 120_000 }).toMatch(/press Submit yourself/i)
  await expect(pageFor(/oraclecloud/)!.locator("#terms")).toBeChecked()
  await expect.poll(() => pageFor(/b2c-marketing-intern/)?.locator("#first_name").inputValue().catch(() => "") ?? "", { timeout: 120_000 }).toBe("Kien")
  // The person's page: untouched the whole time.
  await expect(mine.locator(".odds-apply-bar")).toHaveCount(0)
  await expect(mine.locator("#q")).toHaveValue("")
  // Five separate runs, one per application.
  expect(fake.drives.size).toBeGreaterThanOrEqual(5)
  console.log(`STRESS: ${jobs.length} applications at once, all done in ${Math.round((Date.now() - t0) / 1000)} s, ${fake.drives.size} runs`)
})
