import { BroodsClient } from "broods"
import { renderLetterPdf } from "../_shared/cv-template.ts"
import { compressRoute, routeHint, routeKey, routeStoreKey, usable } from "../_shared/site-routes.ts"
import { canAcceptDriveResult, humanStopAllowed, jobIdentityMismatch } from "../_shared/drive-ownership.ts"
import { appliedBeforeAnswer, FACT_QUESTION_HINT, isWorkAuthQuestion, ownQuestions, permitWorkAnswers, studyingFrom, widgetAttemptGuard, workFactForQuestion, type PermitWorkFacts } from "../_shared/drive-finish.ts"
import { describeShot, sightEnv } from "../_shared/drive-sight.ts"
import { pushScreenshot, troubleReasons, type VisionDeps } from "../_shared/drive-vision.ts"
import { broodsStartOutcome, broodsTurnState, driveRunExpired, MODEL_UNREACHABLE, quietAction, type BroodsStartOutcome, type BroodsTurn } from "../_shared/drive-quiet.ts"
import { fieldPattern, playbookFor, sanitizeLesson, siteIdentity, structuralField } from "../_shared/site-playbook.ts"

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
/** A fill works through every field it was given (dropdowns take seconds each): the tab gets 40 s, the server waits a little longer. */
const FILL_WAIT_MS = 45_000
const NEXT_WAIT_MS = 20_000
const MAX_STEPS = 120
/** No step from Broods for this long while the run says running (a step takes seconds): its turn ended without finish. */
const QUIET_MS = 30_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export { canAcceptDriveResult }

async function cancelOpenCommands(env: Env, runId: string, why: string): Promise<void> {
  const patch = {
    status: "cancelled",
    result: { ok: false, cancelled: true, error: why },
    done_at: new Date().toISOString(),
  }
  await svc(env, `drive_commands?run_id=eq.${runId}&status=in.(queued,taken)`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  }).catch(() => undefined)
}

async function abandonCommand(env: Env, cmdId: number, kind: "never_started" | "result_lost" | "document_changed"): Promise<void> {
  await svc(env, `drive_commands?id=eq.${cmdId}&status=in.(queued,taken)`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: kind === "never_started" ? "expired" : "cancelled",
      result: { ok: false, abandoned: true, timeout: kind, error: kind },
      done_at: new Date().toISOString(),
    }),
  }).catch(() => undefined)
}

async function svc(env: Env, path: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.serviceKey!, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`db ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function sitePlaybook(env: Env, url: string): Promise<Json> {
  const site = siteIdentity(url)
  if (!site.host) return { ...site, lessons: [], recipes: [] }
  const scopes = `and(scope.eq.host,key.eq.${site.host})${site.ats ? `,and(scope.eq.ats,key.eq.${site.ats})` : ""}`
  const rows = await svc(env, `site_playbooks?or=(${encodeURIComponent(scopes)})&select=lessons`).catch(() => [])
  const book = playbookFor(rows || [])
  // Source run IDs stay service-only: they must never become cross-user tool capabilities.
  const publicHint = ({ source_runs: _sources, ...hint }: (typeof book.lessons)[number]) => hint
  return { ...site, lessons: book.lessons.map(publicHint), recipes: book.recipes.map(publicHint) }
}
async function saveLesson(env: Env, run: Json, url: string, lesson: unknown, outcome: string): Promise<void> {
  const clean = sanitizeLesson(lesson), site = siteIdentity(url)
  if (!clean || !site.host || !["success", "failure"].includes(outcome)) return
  await svc(env, "rpc/record_site_lesson", { method: "POST", body: JSON.stringify({ p_run: run.id, p_host: site.host, p_ats: site.ats, p_lesson: clean, p_outcome: outcome }) })
}
const CHOOSING = ["select", "radio", "choice", "combobox", "listbox", "typeahead"]
/** Words a contact value shares with any site's structure (a LinkedIn link names LinkedIn): not a sign the label echoes the person. */
const STRUCTURE_WORDS = new Set(["http", "https", "www", "com", "net", "org", "linkedin", "profile"])
/** Where a field the person's own detail went sits, as structure: the field's normalized label and which of the same-labelled fields
 * it is. Null when the label is not plain structure or repeats any word of the value (a label must never carry the person). */
function placedMapping(page: Json, field: Json, key: string, value: unknown): Json | null {
  const label = fieldPattern(field?.label)
  if (!label || !key) return null
  const words = String(value ?? "").toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !STRUCTURE_WORDS.has(w))
  if (words.some((w) => label.includes(w))) return null
  const nth = (page?.fields || []).filter((f: Json) => fieldPattern(f?.label) === label).findIndex((f: Json) => f?.id === field.id)
  if (nth < 0) return null
  const method = key === "cv" ? "upload" : CHOOSING.includes(field.kind) ? "choosing" : "typing"
  return sanitizeLesson({ kind: "mapping", field: key, autofill_key: key, method, label, nth })
}
/** The guide for this page: a route that already reached review on its platform or site (from the first success), else the template. */
export async function siteRoute(env: Env, url: string): Promise<Json> {
  const key = routeStoreKey(url)
  if (!key) return null
  const rows = (await svc(env, `site_routes?platform=eq.${encodeURIComponent(key)}&successes=gte.1&order=successes.desc&limit=10&select=route,successes,failures,steps_total`).catch(() => null)) ?? []
  // The best learned route: most reached review per failure, then fewest steps.
  const best = rows.map((r: Json) => ({ route: r.route as string[], successes: Number(r.successes), failures: Number(r.failures), avgSteps: Number(r.steps_total) / Math.max(1, Number(r.successes) + Number(r.failures)) }))
    .filter(usable)
    .sort((a: Json, b: Json) => b.successes / (b.successes + b.failures + 1) - a.successes / (a.successes + a.failures + 1) || a.avgSteps - b.avgSteps)[0] ?? null
  return routeHint(key, best, routeKey(url))
}

/** A finished run's route, kept for its platform (structure only) so routes that work become the guide. */
async function recordRoute(env: Env, run: Json, stage: string): Promise<void> {
  const commands = (await svc(env, `drive_commands?run_id=eq.${run.id}&status=eq.done&order=id.asc&select=tool,args,result`).catch(() => null)) ?? []
  if (!commands.length) return
  // The platform is the one the form was on (the last page), not the board the run started from.
  let page: Json = null
  const pages: Json[] = []
  for (const c of commands) { pages.push(page); const p = c.result?.page ?? (c.tool === "read_page" ? c.result : null); if (p?.url) page = p }
  const key = routeStoreKey(String(page?.url ?? run.url))
  if (!key) return
  const route = compressRoute(commands, (id, i) => pages[i]?.buttons?.find((b: Json) => b.id === id)?.text ?? null)
  if (!route?.length) return
  const ok = stage === "review"
  const [row] = (await svc(env, `site_routes?platform=eq.${encodeURIComponent(key)}&route=eq.${encodeURIComponent(`{${route.map((s) => `"${s.replace(/"/g, "")}"`).join(",")}}`)}&select=successes,failures,steps_total`).catch(() => null)) ?? []
  await svc(env, "site_routes?on_conflict=platform,route", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ platform: key, route, successes: (row?.successes ?? 0) + (ok ? 1 : 0), failures: (row?.failures ?? 0) + (ok ? 0 : 1), steps_total: (row?.steps_total ?? 0) + Number(run.steps ?? commands.length), ...(ok ? { last_success: new Date().toISOString() } : {}), updated_at: new Date().toISOString() }) }).catch(() => undefined)
}

async function learnRun(env: Env, run: Json, stage: string): Promise<void> {
  const commands = await svc(env, `drive_commands?run_id=eq.${run.id}&status=eq.done&order=id.asc&select=tool,args,result`).catch(() => [])
  let page: Json = null
  // Field placements are judged over the whole run: one wrong placement (Broods had to redo it) outweighs its successes in the same run.
  const placements = new Map<string, { lesson: Json; url: string; outcome: string }>()
  const place = (lesson: Json | null, url: string, outcome: string) => {
    if (!lesson) return
    const k = JSON.stringify(lesson)
    if (!placements.has(k) || outcome === "failure") placements.set(k, { lesson, url, outcome })
  }
  for (const cmd of commands || []) {
    const result = cmd.result || {}, url = page?.url || run.url
    if (cmd.tool === "click" && page) {
      const button = page.buttons?.find((b: Json) => b.id === cmd.args?.id)
      const kind = /^(skip|not now|close|reject all|necessary only|functional only)$/i.test(button?.text || "") ? "skip_dialog" : "opener"
      const clean = sanitizeLesson({ kind, button: button?.text })
      // A claimed click alone is not success: require a fresh changed page and real form fields.
      const after = result.page
      const moved = after && (after.url !== page.url || JSON.stringify(after.headings) !== JSON.stringify(page.headings) || Boolean(page.dialog) !== Boolean(after.dialog))
      if (clean && (result.ok === false || moved)) await saveLesson(env, run, url, clean, result.ok !== false && after.fields?.length && ["review", "needs_you"].includes(stage) ? "success" : "failure")
    }
    const reached = ["review", "needs_you"].includes(stage)
    if (cmd.tool === "fill" && page) {
      for (const item of result.results || []) {
        const field = page.fields?.find((f: Json) => f.id === item.id)
        // Broods redid a field Odds had filled (from a recipe or its own contact rules): that placement was wrong for this page.
        if (field?.by === "odds" && item.ok && field.key) {
          place(placedMapping(page, field, field.key, field.value), url, "failure")
        }
        // The extension names which of the person's own contact details the filled value is (key); the value itself never leaves this loop.
        if (item.ok && reached && typeof item.key === "string") place(placedMapping(page, field, item.key, cmd.args?.fields?.find((f: Json) => f?.id === item.id)?.value), url, "success")
        const key = structuralField(field?.label)
        if (!key) continue
        const method = ["select", "radio", "choice", "combobox", "listbox", "typeahead"].includes(field.kind) ? "choosing" : "typing"
        const lesson = { kind: "widget", field: key, method, autofill_key: key }
        await saveLesson(env, run, url, lesson, item.ok && ["review", "needs_you"].includes(stage) ? "success" : "failure")
        await saveLesson(env, run, url, { ...lesson, kind: "mapping" }, item.ok && ["review", "needs_you"].includes(stage) ? "success" : "failure")
      }
    }
    if (cmd.tool === "upload_cv" && page && result.ok && reached) {
      const field = page.fields?.find((f: Json) => f.id === cmd.args?.id)
      if (field?.kind === "file") place(placedMapping(page, field, "cv", result.file_name), url, "success")
    }
    // Notes are hints; only a failure is stored directly. Successful notes need browser evidence above.
    if (cmd.tool === "note_site" && cmd.args?.outcome === "failure") await saveLesson(env, run, url, cmd.args.lesson, "failure")
    if (cmd.tool === "recipe" && result.lesson?.kind === "mapping") { if (!result.ok || reached) place(sanitizeLesson(result.lesson), url, result.ok ? "success" : "failure") }
    else if (cmd.tool === "recipe" && result.lesson) await saveLesson(env, run, url, result.lesson, result.ok ? "success" : "failure")
    for (const attempt of (Array.isArray(result.recipe_attempts) ? result.recipe_attempts : []).slice(0, 12)) {
      const lesson = sanitizeLesson(attempt?.lesson)
      if (lesson?.kind === "mapping" && (attempt.ok !== true || reached)) place(lesson, url, attempt.ok === true ? "success" : "failure")
    }
    const snapshot = cmd.tool === "read_page" ? result : result.page
    if (snapshot && ["review", "needs_you"].includes(stage)) {
      for (const field of snapshot.fields || []) {
        const key = structuralField(field.label)
        if (field.by !== "odds" || !field.filled || !key) continue
        const method = field.kind === "file" ? "upload" : ["select", "radio", "combobox", "listbox", "typeahead"].includes(field.kind) ? "choosing" : "typing"
        for (const kind of ["widget", "mapping"]) await saveLesson(env, run, snapshot.url || url, { kind, field: key, autofill_key: key, method }, "success")
      }
      // Fields Odds filled before or between Broods' steps, with the contact detail it used: their placement is evidence too.
      for (const field of snapshot.fields || []) {
        if (field.by !== "odds" || !field.filled || typeof field.key !== "string") continue
        place(placedMapping(snapshot, field, field.key, field.value), snapshot.url || url, "success")
      }
    }
    if (snapshot) page = snapshot
  }
  for (const p of placements.values()) await saveLesson(env, run, p.url, p.lesson, p.outcome)
}
/** Navigation survives document unload: obtain the resulting page internally, without another model turn. */
async function afterNavigation(env: Env, runId: string, result: Json, budgetMs = TOOL_WAIT_MS): Promise<Json> {
  if (budgetMs < 800) return { ...result, page_pending: false, page: null, error: "document_changed", timeout: "document_changed" }
  await sleep(Math.min(500, budgetMs / 4))
  const run = await runOf(env, runId)
  const docGen = typeof run?.doc_gen === "number" ? run.doc_gen + 1 : 1
  // Ownership moves to the new document; cancel any other taken work from the old gen.
  await svc(env, `drive_runs?id=eq.${runId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ doc_gen: docGen, updated_at: new Date().toISOString() }) }).catch(() => undefined)
  const [read] = await svc(env, "drive_commands", {
    method: "POST",
    body: JSON.stringify({ run_id: runId, tool: "read_page", args: { after_action: true }, note: "Checking the next page", doc_gen: docGen }),
  })
  const until = Date.now() + Math.max(0, budgetMs - 500)
  while (Date.now() < until) {
    await sleep(400)
    const row = (await svc(env, `drive_commands?id=eq.${read.id}&select=status,result`))?.[0]
    if (row?.status === "done") {
      // The picture that rides with a page read goes to the model as an image, never as text inside the page (it was ~100 KB of base64 in the
      // text: tens of thousands of tokens on every call after a click), and the stored row keeps no image.
      let page = row.result
      let shot: string | undefined
      if (typeof page?.screenshot?.image === "string") {
        shot = page.screenshot.image
        page = { ...page, screenshot: undefined }
        void svc(env, `drive_commands?id=eq.${read.id}`, { method: "PATCH", body: JSON.stringify({ result: page }) }).catch(() => undefined)
      }
      return { ...result, page_pending: false, page, ...(shot ? { shot_image: shot } : {}) }
    }
    if (row?.status === "cancelled" || row?.status === "expired") break
  }
  await abandonCommand(env, read.id, "document_changed")
  return { ...result, page_pending: false, page: null, error: "The next page has not answered yet. Read the page again.", timeout: "document_changed" }
}

/** The page right now, read for the server's own checks (no model turn): its fields, or null if it cannot tell. */
async function freshFields(env: Env, run: Json): Promise<Json[] | null> {
  const page = await freshPage(env, run)
  return page ? (Array.isArray(page.fields) ? page.fields : []) : null
}
/** The page right now, read for the server's own check (no model turn), or null if the tab did not answer. */
async function freshPage(env: Env, run: Json): Promise<Json | null> {
  const docGen = typeof run?.doc_gen === "number" ? run.doc_gen : 0
  const [read] = await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "read_page", args: { review_check: true }, note: "Checking the page before stopping", doc_gen: docGen }) }).catch(() => [null])
  if (!read) return null
  for (const until = Date.now() + 12_000; Date.now() < until;) {
    await sleep(400)
    const row = (await svc(env, `drive_commands?id=eq.${read.id}&select=status,result`).catch(() => null))?.[0]
    if (row?.status === "done") return row.result && typeof row.result === "object" ? row.result : {}
    if (row?.status === "cancelled" || row?.status === "expired") break
  }
  await abandonCommand(env, read.id, "result_lost").catch(() => undefined)
  return null
}
const LETTER_FIELD = /cover\s*letter|motivation(al)?\s*letter|letter of motivation|motivatiebrief|sollicitatiebrief|lettre de motivation|anschreiben|begeleidende brief/i

/** The page right now, read for the server's own check (no model turn): its required fields that are still empty. [] if it cannot tell. */
/** What keeps a page from being "filled in": required boxes still empty, a search box with its suggestions open (typed, not chosen), and a CV box nothing was put in. */
const emptyOf = (page: Json): string[] => {
  const fields: Json[] = Array.isArray(page?.fields) ? page.fields : []
  const out = fields
    .filter((f) => (f?.required && !f?.filled) || f?.needs_choice)
    .map((f) => `${String(f.label ?? f.id).slice(0, 80)}${f?.needs_choice ? " (suggestions are open: choose one of them)" : ""}`)
  if (page?.cv_missing === true) out.push("Resume / CV box (attach the CV with upload_cv, required or not)")
  return out
}
/** The run tried to attach the CV and it never went in: a CV box the page does not call one ("Attach" on Greenhouse) is still empty. */
export function cvNeverAttached(uploads: Json[]): boolean {
  const done = uploads.filter((u) => u && typeof u.result === "object" && u.result !== null)
  return done.some((u) => u.result.ok === false && u.result.cv_attached !== true) && !done.some((u) => u.result.ok === true || u.result.cv_attached === true)
}
async function requiredEmpty(env: Env, run: Json): Promise<string[]> {
  const uploads = (await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.upload_cv&status=eq.done&select=result`).catch(() => null)) ?? []
  const cv = cvNeverAttached(uploads) ? ["Resume / CV (Odds could not attach it: finish needs_you, saying why)"] : []
  return [...await pageEmpty(env, run), ...cv]
}
async function pageEmpty(env: Env, run: Json): Promise<string[]> {
  const docGen = typeof run?.doc_gen === "number" ? run.doc_gen : 0
  const [read] = await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "read_page", args: { review_check: true }, note: "Checking everything is filled before Submit", doc_gen: docGen }) }).catch(() => [null])
  if (!read) return []
  for (const until = Date.now() + 12_000; Date.now() < until;) {
    await sleep(400)
    const row = (await svc(env, `drive_commands?id=eq.${read.id}&select=status,result`).catch(() => null))?.[0]
    if (row?.status === "done") {
      return emptyOf(row.result ?? {})
    }
    if (row?.status === "cancelled" || row?.status === "expired") break
  }
  await abandonCommand(env, read.id, "result_lost").catch(() => undefined)
  // The fresh read did not come back (a slow tab): the last page Broods saw decides instead of "nothing empty" (IMC's unticked consent
  // went to review this way).
  const last = (await svc(env, `drive_commands?run_id=eq.${run.id}&status=eq.done&tool=in.(read_page,fill,upload_cv,click)&order=created_at.desc&limit=5&select=result`).catch(() => null)) ?? []
  for (const row of last) {
    const page = Array.isArray(row?.result?.fields) ? row.result : Array.isArray(row?.result?.page?.fields) ? row.result.page : null
    if (page) return emptyOf(page)
  }
  return []
}

const runOf = async (env: Env, id: string): Promise<Json | null> => (UUID.test(id) ? (await svc(env, `drive_runs?id=eq.${id}&select=*`))?.[0] ?? null : null)
/** The person typed or clicked in the form in the last 20 s. */
const personBusy = (run: Json): boolean => Boolean(run?.person_active_at) && Date.now() - Date.parse(run.person_active_at) < 20_000
const live = (run: Json): boolean => run?.status === "running" && Date.parse(run.expires_at) > Date.now()

// ---------------------------------------------------------------- MCP for Broods

const BASE_TOOLS = [
  {
    name: "read_page",
    description: "Read the application tab now: url, title, headings, errors, captcha/password flags, every question (id, label, kind, required, filled, value, known options, consent) and every button (id, text, href, blocked). Call once at the start or when a result has no page; actions already return a fresh page.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
  },
  {
    name: "fill",
    description: "Answer questions on the page: fields [{id, value}] from the last read_page. Text is typed; for select/radio/choice/combobox/listbox the value must be one of its options (call options first when none are listed; a long list shows only its start with options_total — just give the choice you want, e.g. Netherlands, and Odds finds it); a non-consent checkbox takes 'yes' or 'no'. Returns per-field ok/value/error and the fresh page snapshot.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, fields: { type: "array", items: { type: "object", properties: { id: { type: "string" }, value: { type: "string" } }, required: ["id", "value"] } } }, required: ["run_id", "fields"] },
  },
  {
    name: "options",
    description: "Open a dropdown (by field id) and list its choices, for dropdowns read_page shows without options.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, id: { type: "string" } }, required: ["run_id", "id"] },
  },
  {
    name: "upload_cv",
    description: "Attach the person's CV from Odds to a CV/resume file field (field id), or through a CV upload button that has no file field (button id).",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, id: { type: "string" } }, required: ["run_id", "id"] },
  },
  {
    name: "upload_letter",
    description: "Attach the person's cover letter / motivation letter for this job from Odds to a file field (by field id). Only when the task says has_cover_letter; otherwise finish needs_you with reason 'letter'.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, id: { type: "string" } }, required: ["run_id", "id"] },
  },
  {
    name: "write_letter",
    description: "Only when the form REQUIRES a cover/motivation letter file and has_cover_letter is false: write the letter (3-5 short first-person paragraphs, English, from the person's facts, naming the employer and job; no placeholders, nothing the facts do not support). Odds saves it as a PDF on this job in the person's Documents; then call upload_letter with the file field id.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, text: { type: "string" } }, required: ["run_id", "text"] },
  },
  {
    name: "click",
    description: "Press a button or link (by button id): Apply, Next, Continue, Review, a cookie 'reject/necessary only', a job link. Never Submit/Send (refused). Returns the fresh resulting page, including across navigation; use that page directly.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, id: { type: "string" } }, required: ["run_id", "id"] },
  },
  {
    name: "screenshot",
    description: "See the tab as an image (when read_page cannot show or move what you need: custom widgets, overlays, canvas). Returns the image and its pixel size.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
  },
  {
    name: "click_at",
    description: "Click at a point (x, y in pixels of the last screenshot). Submit/Send and password fields are refused. Returns the fresh page snapshot.",
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
    description: "Go back one page in the tab (when a click landed somewhere unrelated, e.g. a search page). Returns the fresh page snapshot.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
  },
  {
    name: "check_email",
    description: "Look in the person's Gmail (their own Chrome is signed in) for a mail from the last hour, such as a site's verification code or confirmation link: the tool opens Gmail in the tab next to the application tab (in the background, the person stays where they are), waits up to about 20 seconds for a new message, and returns the recent messages (sender, subject, snippet) and the text and links of the best match. Mail can take one to two minutes: if nothing has come, call it again (up to six times), and do something else useful in between. from / subject narrow the match (e.g. the site's name). Then type a code with fill, or open a link with open_link.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, from: { type: "string" }, subject: { type: "string" } }, required: ["run_id"] },
  },
  {
    name: "open_link",
    description: "Open an https link (a verification link from check_email) in the application tab. Returns when the page has loaded; then read_page.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, url: { type: "string" } }, required: ["run_id", "url"] },
  },
  {
    name: "open_job",
    description: "Open this job's own link again in the tab (when the tab ended up somewhere unrelated — a search page, a blank or warmup page, another job — and back does not help). Returns the fresh page snapshot.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" } }, required: ["run_id"] },
  },
  {
    name: "wait",
    description: "Wait a few seconds (1-8) for a slow page, then read_page.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, seconds: { type: "number" } }, required: ["run_id"] },
  },
  {
    name: "note_site",
    description: "Record structure only: kind opener/skip_dialog with a canonical button, or widget/mapping with a canonical contact field, method typing/choosing/upload and autofill_key. Never include personal values, answers or free text. A note is not trusted success without browser evidence.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, lesson: { type: "object" }, outcome: { type: "string", enum: ["success", "failure"] } }, required: ["run_id", "lesson", "outcome"] },
  },
  {
    name: "finish",
    description: "End the run. stage: 'review' (everything filled, only Submit left for the person), 'needs_you' (something only the person can do), 'stuck' (cannot move on). reason (for needs_you/stuck): 'captcha', 'account' (sign in / make an account), 'questions' (only the person can answer — list them in questions), 'letter' (a cover/motivation letter is asked and none is in Odds), 'closed' (the job no longer takes applications), 'other'. message: one plain sentence for the person.",
    inputSchema: { type: "object", properties: { run_id: { type: "string" }, stage: { type: "string", enum: ["review", "needs_you", "stuck"] }, reason: { type: "string", enum: ["captcha", "account", "questions", "letter", "closed", "email", "other"] }, message: { type: "string" }, questions: { type: "array", items: { type: "string" } } }, required: ["run_id", "stage", "message"] },
  },
]
const questionSlug = (q: string): string => `broods_${q.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60)}`
const words = (t: string): Set<string> => new Set(t.toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, " ").split(/\s+/).filter((w) => w.length > 2))
/** Broods' questions matched to the page's own fields (exact label and options), plus every required field still empty on the page. */
async function personQuestions(env: Env, run: Json, questions: string[]): Promise<Json[]> {
  const fields = ((await freshFields(env, run)) ?? []).filter((f: Json) => f?.kind !== "file" && !f?.consent && f?.kind !== "checkbox")
  const clean = (l: string): string => String(l ?? "").replace(/\s*[*✱]\s*$/, "").trim()
  const out = new Map<string, Json>()
  const add = (label: string, f: Json | null): void => {
    const exact = clean(f?.label ?? label).slice(0, 300)
    const options = Array.isArray(f?.options) ? f.options.filter((o: unknown) => typeof o === "string" && o.trim() && !/^(select|choose|kies)\b/i.test(o as string)).slice(0, 40) : []
    out.set(questionSlug(exact), { key: questionSlug(exact), label: exact, kind: options.length ? "radio" : "text", ...(options.length ? { options } : {}) })
  }
  for (const q of questions) {
    const qw = words(q)
    let best: Json | null = null, score = 0
    for (const f of fields) {
      const fw = words(clean(f.label))
      const hit = [...qw].filter((w) => fw.has(w)).length / Math.max(1, Math.min(qw.size, fw.size))
      if (hit > score) { score = hit; best = f }
    }
    add(q, score >= 0.6 ? best : null)
  }
  for (const f of fields) if (f.required && !f.filled && !out.has(questionSlug(clean(f.label)))) add(f.label, f)
  return [...out.values()].slice(0, 30)
}
/** The platform a page belongs to for learning: the ATS (greenhouse, workday…) when known, else its host. */
function tacticPlatform(url: string): string {
  const id = siteIdentity(url)
  return id.ats || id.host.replace(/^www\./, "")
}
/** Every fill result teaches its platform which way each kind of field takes a value (structure only: kind + tactic + ok). */
async function learnTactics(env: Env, run: Json, result: Json): Promise<void> {
  const results = Array.isArray(result?.results) ? result.results : []
  const fields = Array.isArray(result?.page?.fields) ? result.page.fields : []
  if (!results.length || !fields.length) return
  const kindOf = new Map(fields.map((f: Json) => [f?.id, String(f?.kind ?? "")]))
  const platform = tacticPlatform(String(result?.page?.url || run.url || ""))
  if (!platform) return
  for (const r of results.slice(0, 40)) {
    const kind = kindOf.get(r?.id)
    if (!kind || kind === "file") continue
    const ladder = ["plain", "own_format", "typed", "typeahead", "choice", "keyboard", "listbox", "real_input"]
    const fromTried = Array.isArray(r?.tried) ? [...r.tried].reverse().find((step: string) => ladder.includes(step)) : ""
    const tactic = ladder.includes(r?.via) ? r.via : ladder.includes(fromTried) ? fromTried : "plain"
    await svc(env, "rpc/record_site_tactic", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ p_platform: platform, p_kind: kind, p_tactic: tactic, p_ok: r?.ok === true }) }).catch(() => undefined)
  }
}
/** A platform's winning tactic per field kind: real_input first where it has worked twice or more and plain has failed more than worked. */
async function siteTactics(env: Env, url: string): Promise<Record<string, string>> {
  const platform = tacticPlatform(url)
  if (!platform) return {}
  const rows = (await svc(env, `site_tactics?platform=eq.${encodeURIComponent(platform)}&select=field_kind,tactic,successes,failures`).catch(() => null)) ?? []
  const out: Record<string, string> = {}
  const byKind = new Map<string, Json[]>()
  for (const r of rows) byKind.set(r.field_kind, [...(byKind.get(r.field_kind) ?? []), r])
  for (const [kind, list] of byKind) {
    const plain = list.find((r: Json) => r.tactic === "plain")
    const best = list.filter((r: Json) => r.tactic !== "plain" && r.successes >= 2).sort((a: Json, b: Json) => b.successes - a.successes)[0]
    if (best && (!plain || plain.failures > plain.successes)) out[kind] = best.tactic
  }
  return out
}
/** The page is a sign-in wall: it says so ("log in to apply"), or it is a sign-in form with no application questions on it. */
function signInWall(page: Json): boolean {
  const texts = [...(page.headings ?? []), ...(page.buttons ?? []).map((b: Json) => b?.text ?? "")].map((t: unknown) => (typeof t === "string" ? t : ""))
  if (texts.some((t) => /save (your )?(progress|application)|save for later|continue as (a )?guest|apply without (an )?account/i.test(t))) return false
  // A page that offers to create the account (Create account / Register / Sign up) is not a wall: making the account is the agent's job.
  if (texts.some((t) => /\b(create (an |your )?account|register( now)?|sign ?up|new user|registreren|account aanmaken|nieuw account)\b/i.test(t))) return false
  const asks = (page.fields ?? []).filter((f: Json) => f?.kind !== "checkbox" && !/e-?mail|user ?name|password|wachtwoord|login|log in|sign in/i.test(String(f?.label ?? "")))
  if (asks.length >= 2) return false
  const says = texts.some((t) => /(please )?(log ?in|sign ?in|inloggen)( first)? to (apply|continue|solliciteren)|login required|sign in with your|log in with your|create an account to (apply|continue)|eu login/i.test(t))
  // A dialog open over the form shows only itself (no fields), so a password box behind it says nothing about the page: not a wall.
  return says || (!page.dialog && page.password_field === true && asks.length === 0)
}
/** Every tool takes the line Broods writes for the person about this step: the tracker shows it live. */
const SAY = { type: "string", description: "One short line for the person, in plain words: what you are doing now and why (shown live in their tracker), e.g. 'Filling your details from Autofill'." }
const TOOLS = BASE_TOOLS.map((t) => (t.name === "finish" ? t : { ...t, inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, say: SAY } } }))
const REASONS = ["captcha", "account", "questions", "letter", "closed", "email", "other"]

async function callTool(env: Env, name: string, args: Json): Promise<{ text: string; error?: boolean; image?: string }> {
  const run = await runOf(env, String(args?.run_id ?? ""))
  if (!run) return { text: "Unknown run_id.", error: true }
  if (name === "finish") {
    let stage = ["review", "needs_you", "stuck"].includes(args.stage) ? args.stage : "stuck"
    const questions = Array.isArray(args.questions) ? args.questions.filter((q: unknown) => typeof q === "string").slice(0, 20) : []
    let message = `${String(args.message ?? "").slice(0, 600)}${questions.length ? ` Questions for you: ${questions.join("; ").slice(0, 380)}` : ""}`.trim()
    let reason = stage === "review" ? null : REASONS.includes(args.reason) ? args.reason : questions.length ? "questions" : "other"
    // Cookie / empty “needs_you” without evidence → stuck (automation must not green-light as human stop).
    if (stage === "needs_you") {
      const gate = humanStopAllowed({
        reason,
        captcha: reason === "captcha" || /captcha|robot|challenge|verify you are human|human verification|security check|cloudflare/i.test(message),
        passwordField: /password|sign in|log in|account/i.test(message),
        signInWall: /sign in|log in|account/i.test(message),
        consentUnanswered: /consent|privacy statement|terms/i.test(message),
        unansweredQuestions: questions.length ? questions : /cookie/i.test(message) ? [message] : [],
      })
      if (!gate.ok) {
        stage = "stuck"
        reason = "other"
        message = message || `Cannot stop for the person without clear evidence (${gate.reason}).`
      }
    }
    // "This application requires signing in": on a page that is a register form AND the application (password boxes beside many other fields),
    // the password boxes are Odds' own to fill (create account), never a reason to stop. Sent back once, with the page read fresh.
    if (stage !== "review" && ["account", "other"].includes(String(reason)) && /\b(sign(ing)? in|log ?in|account|password)\b/i.test(message)) {
      const sentForm = (await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.guard&result->>returned=eq.register_form&select=id&limit=1`).catch(() => null))?.[0]
      if (!sentForm) {
        const page = await freshPage(env, run)
        const others = Array.isArray(page?.fields) ? page.fields.filter((f: Json) => f?.kind !== "checkbox").length : 0
        if (page && page.dialog == null && page.password_field === true && others >= 3 && !signInWall({ ...page, password_field: false })) {
          await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "guard", args: {}, status: "done", result: { returned: "register_form" }, done_at: new Date().toISOString() }) }).catch(() => undefined)
          return { text: "Not a sign-in wall: this page is a register form AND the application. Odds fills the email and password boxes itself (they are not in the field list). Fill every other empty field, check the page for errors, and finish review when only the final Apply / Submit is left. Stop for an account only if the form cannot be reached at all.", error: true }
        }
      }
    }
    // Closed only when the page itself says so (read_page.closed). A Workday page read before it finished drawing looks empty, and a model
    // calls that "page not found": the page is read again, and a page with a form or an Apply button is never closed. Sent back once.
    if (reason === "closed") {
      const page = await freshPage(env, run)
      const live = page && page.closed !== true && ((Array.isArray(page.fields) && page.fields.length > 0) || (Array.isArray(page.buttons) && page.buttons.some((b: Json) => /\b(apply|solliciteer|next|continue|volgende|create account|sign in)\b/i.test(String(b?.text ?? "")))))
      const sentClosed = page && page.closed !== true ? (await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.guard&result->>returned=eq.closed&select=id&limit=1`).catch(() => null))?.[0] : true
      if (live || !sentClosed) {
        await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "guard", args: {}, status: "done", result: { returned: "closed" }, done_at: new Date().toISOString() }) }).catch(() => undefined)
        return { text: live ? "Not closed: the page has a form or an Apply button now (it was still loading). Carry on from read_page." : "The page does not say the job is closed; it may still be loading. read_page again in a few seconds; finish closed only when the page says the job is gone.", error: true }
      }
    }
    // "Log in to save your progress" is optional: carry on as a guest; never stop the person for it.
    if (reason === "account" && /save (your )?(progress|application)|save for later|to save/i.test(message)) {
      return { text: "Logging in only to save progress is optional: carry on as a guest (fill the form) and finish review when only Submit is left. Stop for an account only when the form itself cannot be reached without one.", error: true }
    }
    // A cover letter is only asked for when the page has a field for one: never invented (Oracle's Personal Info page has none).
    if (reason === "letter" || /cover letter|motivation letter/i.test(message)) {
      const fields = await freshFields(env, run)
      if (fields && !fields.some((f: Json) => LETTER_FIELD.test(String(f?.label ?? "")))) {
        return { text: "There is no cover or motivation letter field on this page: do not ask the person for one. Finish again with only what the page really needs (reason 'questions' for missing details like an address), or carry on filling.", error: true }
      }
      // A letter field the page does not require (no *, not required): leave it empty; never stop the person for it.
      if (fields && reason === "letter" && !fields.some((f: Json) => LETTER_FIELD.test(String(f?.label ?? "")) && f?.required === true && !f?.filled)) {
        return { text: "The cover/motivation letter on this page is optional (not required): leave it empty and do not ask for it. Fill everything else you can, then finish with only what the person must do (reason 'questions' for their own answers), or finish review when only Submit is left.", error: true }
      }
    }
    // "Stuck" only because no Next / Continue / Submit is visible (SmartRecruiters draws its own): with nothing required left and the CV
    // in, that is the end of the form, so review (the person checks and submits). The fresh read below decides.
    if (stage === "stuck" && /\bno\b[^.]{0,40}\b(next|continue|review|submit|send)\b[^.]{0,30}\b(control|button)s?\b|\b(exposes|shows|offers|has) no\b[^.]{0,30}\b(next|continue|review|submit)\b/i.test(message) && (await requiredEmpty(env, run)).length === 0) {
      stage = "review"; reason = null
      message = "Everything is filled in. Check it and press Submit yourself (the Submit button is the site's own)."
    }
    // About to give up: once per run, Broods first looks at the real tab (a screenshot steered into its conversation) and tries again.
    if ((stage === "stuck" || (stage === "needs_you" && reason === "other")) && live(run)) {
      const looked = (await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.guard&result->>returned=eq.vision_stuck&select=id&limit=1`).catch(() => null))?.[0]
      if (!looked) {
        const image = await captureShot(env, run)
        if (image && await pushScreenshot(visionDeps(env, run), run.id, image, ["you were about to stop"])) {
          await svc(env, "drive_commands", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ run_id: run.id, tool: "guard", args: {}, status: "done", result: { returned: "vision_stuck" }, done_at: new Date().toISOString() }) }).catch(() => undefined)
          return { text: "Not yet: a screenshot of the tab is now in your conversation as an image. Look at it (what is open, what the error says, where the button is, what each box really shows), then try another way, or finish again if it really is blocked.", error: true }
        }
      }
    }
    // Review is only true when the page says so: read it fresh, and refuse while a required field is still empty (a site that cleared
    // name/email after reading the CV, a field Broods never saw). Broods is told exactly what is left and carries on.
    if (stage === "review") {
      const empty = await requiredEmpty(env, run)
      if (empty.length) return { text: `Not done yet: these required fields are still empty on the page: ${empty.slice(0, 10).join("; ")}. Fill them (read_page shows them), or finish needs_you if only the person can answer them.`, error: true }
    }
    // "Apply by email to jobs@…": no online form. That is a correct stop of its own (reason email), whatever reason the model gave.
    if (stage !== "review" && /\b(apply|applications?|send (your )?(cv|resume|application))\b[^.]{0,60}\be-?mail\b|[\w.+-]+@[\w-]+\.[\w.]+/i.test(message) && /no (online )?(application )?form|(did not|could not|couldn.t|cannot|can.t) (open|find)|by e-?mail|email (your|to)|lists? [^.]{0,40}@/i.test(message)) { stage = "needs_you"; reason = "email" }
    // Questions the rules say Broods answers itself (its own experience yes/no, how it heard, located/authorised, consent, availability):
    // sent back once, so a small model that stops for them carries on instead.
    const ownableAll = ownQuestions(questions.map(String))
    const permitFacts = ownableAll.some(isWorkAuthQuestion) ? await permitFactsForRun(env, run) : {}
    const knownWork = ownableAll.flatMap((q) => {
      const hit = workFactForQuestion(q, permitFacts)
      return hit ? [`${q} → ${hit.answer} (${hit.fact}; from the permit, not a guess)`] : []
    })
    const unknownWork = new Set(ownableAll.filter((q) => isWorkAuthQuestion(q) && workFactForQuestion(q, permitFacts) === null))
    const ownable = ownableAll.filter((q) => !unknownWork.has(q))
    if (stage === "needs_you" && reason === "questions" && ownable.length) {
      // Sent back twice: a small model that holds on to "needs your input" for a market-news essay writes it the second time.
      const sent = ((await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.guard&result->>returned=eq.own_questions&select=id&limit=2`).catch(() => null)) ?? []).length >= 2
      if (!sent) {
        await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "guard", args: {}, status: "done", result: { returned: "own_questions", n: ownable.length }, done_at: new Date().toISOString() }) }).catch(() => undefined)
        return { text: `Not done: these are yours to answer, not the person's: ${ownable.slice(0, 8).join(" | ")}. Experience/skill yes-no and years → in the person's favour: Yes, and years that fit the role (at least 1–2); how did you hear → job_source (or the closest option: Website / Company website / LinkedIn / Other); located → lives_in; consent/availability → Yes; open questions → 2–4 first-person sentences from the facts and general knowledge, within max_chars; pronouns / gender → the person's own saved answer, else the option 'Prefer not to say' (or 'Decline to answer'), never invent one; 'is this internship part of / integrated in your programme or a mandatory curriculum' → Yes for a person enrolled in a study (the internship counts toward the study), 'mandatory' over 'elective'. ${knownWork.length ? `${knownWork.join(" | ")}. ` : ""}${FACT_QUESTION_HINT} Fill them, then finish with only what is left for the person (or review).`, error: true }
      }
    }
    // "The role requires fluent Dutch, but the profile says basic": not meeting a requirement is never a stop. The truthful answer goes in,
    // the form is finished, and whether to send it is the person's own call at review. Sent back once.
    if (stage === "needs_you" && ["questions", "other"].includes(String(reason)) && /\b(requires?|required|asks? for|must)\b[^.]{0,80}\b(but|while|whereas|however)\b[^.]{0,60}\b(profile|you have|your (level|dutch|experience))\b/i.test(message)) {
      const sentReq = (await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.guard&result->>returned=eq.requirement&select=id&limit=1`).catch(() => null))?.[0]
      if (!sentReq) {
        await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "guard", args: {}, status: "done", result: { returned: "requirement" }, done_at: new Date().toISOString() }) }).catch(() => undefined)
        return { text: "Not done: a requirement the person does not fully meet is not a reason to stop. Answer truthfully from the facts (e.g. 'Not fluently: my Dutch is basic.'), finish the form, and finish review: whether to send it is the person's decision.", error: true }
      }
    }
    // A verification check is a captcha, whatever the model called it (Indeed's "additional verification", Cloudflare, DataDome).
    if (stage !== "review" && reason !== "captcha" && /\b(captcha|cloudflare|datadome|verify (that )?you are (a )?human|human verification|additional verification|security check|are you a robot|ik ben geen robot)\b/i.test(message)) { stage = "needs_you"; reason = "captcha" }
    // A panel that offers only a social / board sign-in ("Sign in with Indeed") and no application fields is the account wall, not "other".
    if (stage !== "review" && !["account", "captcha", "closed"].includes(String(reason)) && /\b(only|just)\b[^.]{0,60}\b(sign[- ]?in|log ?in|login)\b[^.]{0,30}\b(indeed|linkedin|google|apple|facebook)\b|\b(indeed|linkedin|google|apple|facebook)\b[^.]{0,6}\s(sign[- ]?in|log ?in|login)\b[^.]{0,60}\b(only|no (application )?fields)\b|\b(sign[- ]?in|log ?in|login)\b[^.]{0,20}\b(with|to|via|using) (indeed|linkedin|google|apple|facebook)\b[^.]{0,80}\b(no (application )?fields|only|nothing else)/i.test(message)) { stage = "needs_you"; reason = "account" }
    // A widget that did not keep its value is not the person's problem. stuck / needs_you other wait until each failing field
    // had two different fill attempts (drive_commands). Captcha, account, closed and email already returned above, or were retagged.
    if (stage === "stuck" || (stage === "needs_you" && ["other", "questions"].includes(String(reason)))) {
      const fills = (await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.fill&status=eq.done&select=args,result&order=id.asc&limit=40`).catch(() => null)) ?? []
      const seen = (await svc(env, `drive_commands?run_id=eq.${run.id}&status=eq.done&tool=in.(read_page,fill)&select=tool,result&order=id.desc&limit=6`).catch(() => null)) ?? []
      let fields: Json[] = []
      for (const row of seen) {
        const pageFields = row?.tool === "read_page" ? row?.result?.fields : row?.result?.page?.fields
        if (Array.isArray(pageFields)) { fields = pageFields; break }
      }
      const prior = ((await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.guard&result->>returned=eq.widget_attempts&select=id`).catch(() => null)) ?? []).length
      const guard = widgetAttemptGuard({ stage, reason: reason ? String(reason) : null, message, fields, fills, priorRefusals: prior })
      if (!guard.accept) {
        await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "guard", args: {}, status: "done", result: { returned: "widget_attempts" }, done_at: new Date().toISOString() }) }).catch(() => undefined)
        return { text: guard.text, error: true }
      }
    }
    // Review with empty required fields is refused — Broods must leave needs_you/stuck instead.
    if (stage === "review" && Array.isArray(args.unfilled) && args.unfilled.length) {
      stage = "needs_you"
      reason = "questions"
      message = `Required fields still empty: ${args.unfilled.slice(0, 8).join("; ")}`.slice(0, 600)
    }
    const now = new Date().toISOString()
    await svc(env, `drive_runs?id=eq.${run.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: stage,
        reason,
        message,
        last_note: String(args.message ?? "").slice(0, 300) || null,
        fill_ended_at: now,
        agent_finished_at: now,
        updated_at: now,
      }),
    })
    // Stop late fills: queued/taken work must not POST drive-result after Stuck/review.
    await cancelOpenCommands(env, run.id, `finished:${stage}`)
    // Questions only the person can answer: they appear in Odds (the job's page) to answer there; saving them carries Broods on.
    if ((questions.length || reason === "questions") && run.posting_id) {
      // Asked with the page's own words and choices, so an answer is kept under the same question every time (and reused on the next job
      // that asks it), and a choice is a choice in Odds, not free text. Every required question still empty on the page is asked at once.
      const asked = await personQuestions(env, run, questions)
      if (asked.length) await svc(env, "application_prompts?on_conflict=user_id,posting_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: run.user_id, posting_id: run.posting_id, questions: asked, updated_at: new Date().toISOString() }) }).catch(() => undefined)
    }
    await learnRun(env, run, stage).catch(() => console.warn("Site playbook learning unavailable"))
    // Only runs that ended on the form itself teach a route (a captcha or a closed job says nothing about the platform's route).
    if (stage === "review" || reason === "questions") await recordRoute(env, { ...run, steps: run.steps }, stage).catch(() => undefined)
    return { text: "Finished." }
  }
  if (!live(run)) return { text: `This run is over (${run.status}). Stop.`, error: true }
  if (name === "note_site") {
    const lesson = sanitizeLesson(args.lesson)
    if (!lesson || !["success", "failure"].includes(args.outcome)) return { text: "Rejected: use canonical structure only, never personal values.", error: true }
    await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "note_site", args: { lesson, outcome: args.outcome }, status: "done", result: { recorded: true }, done_at: new Date().toISOString() }) })
    return { text: "Observation recorded. Promotion requires independent verified successes." }
  }
  if (run.steps >= MAX_STEPS) return { text: "Step limit reached: call finish now.", error: true }
  if (name === "wait") {
    await sleep(Math.min(8, Math.max(1, Number(args.seconds) || 2)) * 1000)
    return { text: "Waited. Read the page if it may have changed." }
  }
  // The person is filling in the form themselves: Broods waits for them to stop (20 s of quiet), then carries on around what they entered.
  for (let waited = 0; personBusy(run) && waited < 20_000; waited += 1000) {
    await sleep(1000)
    Object.assign(run, (await runOf(env, run.id)) ?? {})
  }
  if (personBusy(run)) return { text: "The person is filling in the form themselves right now. Call wait, then read_page, and keep everything they entered.", error: true }
  if (name === "write_letter") {
    const body = String(args.text ?? "").trim()
    if (body.length < 200 || body.length > 4000) return { text: "Write 3-5 paragraphs (200-4000 characters).", error: true }
    if (/\[[^\]]*\]|\{[^}]*\}/.test(body)) return { text: "No placeholders like [Company]: write the real words.", error: true }
    if (!run.posting_id) return { text: "This run has no Odds job to keep the letter on: finish needs_you with reason 'letter'.", error: true }
    const prof = (await svc(env, `profiles?user_id=eq.${run.user_id}&select=data`).catch(() => null))?.[0]?.data ?? {}
    const who = String(prof.name || [prof.firstName, prof.lastName].filter(Boolean).join(" ") || "")
    // Lazy: bun unit tests import this module; Deno's npm: specifier is only resolved when the tool runs.
    const PDFLib = await import("npm:pdf-lib@1.17.1")
    const bytes = await renderLetterPdf(PDFLib as never, who, body)
    const id = crypto.randomUUID()
    const path = `${run.user_id}/${id}`
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("")
    const title = `Cover letter ${String(run.posting_id)}`
    try {
      await svc(env, "documents", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id, user_id: run.user_id, kind: "cover_letter", name: title, file_name: "Cover letter.pdf", mime: "application/pdf", size_bytes: bytes.length, content_hash: hash, body, path, is_main: false }) })
    } catch { return { text: "Odds could not keep the letter (their Documents may be full): finish needs_you with reason 'letter'.", error: true } }
    const up = await fetch(`${env.url}/storage/v1/object/documents/${path}`, { method: "POST", headers: { apikey: env.serviceKey!, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/pdf" }, body: bytes })
    if (!up.ok) {
      await svc(env, `documents?id=eq.${id}`, { method: "DELETE" }).catch(() => undefined)
      return { text: "Odds could not keep the letter: finish needs_you with reason 'letter'.", error: true }
    }
    await svc(env, "job_documents?on_conflict=user_id,posting_id,kind", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ user_id: run.user_id, posting_id: run.posting_id, kind: "cover_letter", document_id: id }) }).catch(() => undefined)
    return { text: JSON.stringify({ ok: true, saved: "Cover letter.pdf", next: "call upload_letter with the letter's file field id" }) }
  }
  // The job's letter (written by Broods or made by the person) goes with the command, so the tab does not depend on what it loaded at the start.
  if (name === "upload_letter" && run.posting_id) {
    const link = (await svc(env, `job_documents?user_id=eq.${run.user_id}&posting_id=eq.${encodeURIComponent(run.posting_id)}&kind=eq.cover_letter&select=document_id&limit=1`).catch(() => null))?.[0]
    if (link?.document_id) args = { ...args, doc: link.document_id }
  }
  if (!["read_page", "fill", "options", "upload_cv", "upload_letter", "click", "back", "open_job", "check_email", "open_link", "screenshot", "click_at", "type_text", "press_key", "scroll"].includes(name)) return { text: `Unknown tool ${name}.`, error: true }
  // The same button three times in the last few steps and the page never changed: pressing it again is not an answer. Said once, plainly.
  if (name === "click" && typeof args?.id === "string") {
    const recentClicks = (await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.click&order=id.desc&limit=6&select=args,status`).catch(() => null)) ?? []
    if (recentClicks.filter((c: Json) => c?.args?.id === args.id && c.status === "done").length >= 3) {
      return { text: "You pressed this button 3 times and the page did not move on. Do not press it again. Read what the page says (errors, a dialog, empty required fields), try something else, or finish with the exact thing that blocks it.", error: true }
    }
  }
  const { run_id: _r, say, ...rest } = args ?? {}
  const note = typeof say === "string" && say.trim() ? say.trim().slice(0, 300) : null
  const docGen = typeof run.doc_gen === "number" ? run.doc_gen : 0
  const [cmd] = await svc(env, "drive_commands", {
    method: "POST",
    body: JSON.stringify({ run_id: run.id, tool: name, args: rest, note, doc_gen: docGen, tab_id: run.tab_id ?? null }),
  })
  await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ steps: run.steps + 1, ...(note ? { last_note: note } : {}), updated_at: new Date().toISOString() }) })
  const deadline = Date.now() + (name === "fill" ? FILL_WAIT_MS : TOOL_WAIT_MS)
  while (Date.now() < deadline) {
    await sleep(400)
    const row = (await svc(env, `drive_commands?id=eq.${cmd.id}&select=status,result,taken_at`))?.[0]
    if (row?.status === "done") {
      let res = row.result ?? {}
      // A picture of the page rides with read_page: kept out of the stored row (the database holds no images) and handed to the model as an image.
      let shotImage: string | undefined
      if (typeof res.screenshot?.image === "string") {
        shotImage = res.screenshot.image
        res = { ...res, screenshot: undefined }
        void svc(env, `drive_commands?id=eq.${cmd.id}`, { method: "PATCH", body: JSON.stringify({ result: res }) }).catch(() => undefined)
      }
      if (res.page_pending === true) {
        // Same wall clock — do not stack another full TOOL_WAIT_MS after timeout.
        const left = Math.max(0, deadline - Date.now())
        res = await afterNavigation(env, run.id, res, left)
        if (typeof res.shot_image === "string") { shotImage = res.shot_image; const { shot_image: _s, ...rest } = res; res = rest }
        await svc(env, `drive_commands?id=eq.${cmd.id}`, { method: "PATCH", body: JSON.stringify({ result: res }) })
      }
      // Sight: Broods cannot see the picture, so what it shows comes with the page as text (open pop-ups and lists, errors, the
      // buttons and where they are, a captcha). Kept on the step for the trace.
      const picture = shotImage || (name === "screenshot" && typeof res.image === "string" ? res.image : "")
      if (picture) {
        const sight = await describeShot(sightEnv((n) => Deno.env.get(n)), picture)
        if (sight) {
          if (res.page && typeof res.page === "object") res = { ...res, page: { ...res.page, sight } }
          else res = { ...res, sight }
          void svc(env, `drive_commands?id=eq.${cmd.id}`, { method: "PATCH", body: JSON.stringify({ result: name === "screenshot" ? { ...res, image: "(sent)" } : res }) }).catch(() => undefined)
        }
      }
      if (name === "screenshot" && typeof res.image === "string") {
        void svc(env, `drive_commands?id=eq.${cmd.id}`, { method: "PATCH", body: JSON.stringify({ result: { ...res, image: "(sent)" } }) }).catch(() => undefined)
        return { text: JSON.stringify({ width: res.width, height: res.height, note: res.note, ...(res.sight ? { sight: res.sight } : {}) }), image: res.image }
      }
      // A fill that ran out of its time window (a slow dropdown) leaves the rest "not tried": Odds sends those fields again itself, once more, so Broods gets one answer for the whole fill and never gives up on fields nobody tried.
      if (name === "fill" && Array.isArray(res.results) && Array.isArray(rest.fields)) {
        // One more round at most: two 45 s rounds stay well inside the function's wall clock.
        for (let round = 0; round < 1; round++) {
          const untried = new Set(res.results.filter((r: Json) => /^not tried: out of time/.test(String(r?.error ?? ""))).map((r: Json) => r.id))
          if (!untried.size) break
          const fields = rest.fields.filter((f: Json) => untried.has(f?.id))
          if (!fields.length) break
          const [again] = await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "fill", args: { ...rest, fields }, note: "Filling the rest", doc_gen: docGen, tab_id: run.tab_id ?? null }) }).catch(() => [null])
          if (!again) break
          let more: Json | null = null
          for (const until = Date.now() + FILL_WAIT_MS; Date.now() < until;) {
            await sleep(400)
            const r2 = (await svc(env, `drive_commands?id=eq.${again.id}&select=status,result`).catch(() => null))?.[0]
            if (r2?.status === "done") { more = r2.result ?? {}; break }
            if (r2?.status === "cancelled" || r2?.status === "expired") break
          }
          if (!more || !Array.isArray(more.results)) break
          res = { ...more, results: [...res.results.filter((r: Json) => !untried.has(r?.id)), ...more.results] }
        }
      }
      // Every fill teaches the platform which way each kind of field takes a value (here, where every result passes, test or real).
      if (name === "fill") void learnTactics(env, run, res).catch(() => undefined)
      // Wrong-job / redirect to another employer: stop before further personal fills.
      const page = res.page || (name === "read_page" ? res : null)
      // A captcha wall and nothing to fill: that is the person's, and it is clear at once. The run ends here without more model turns.
      if (page?.captcha === true && Array.isArray(page.fields) && page.fields.filter((f: Json) => f?.kind !== "checkbox").length === 0) {
        const now = new Date().toISOString()
        const message = "A check is in the way. Tick it in the tab and Odds carries on."
        await svc(env, `drive_runs?id=eq.${run.id}&status=eq.running`, { method: "PATCH", body: JSON.stringify({ status: "needs_you", reason: "captcha", message, last_note: message, fill_ended_at: now, agent_finished_at: now, updated_at: now }) }).catch(() => undefined)
        await cancelOpenCommands(env, run.id, "captcha")
        return { text: JSON.stringify({ ok: false, run_ended: true, captcha: true, error: "Captcha: Odds told the person. The run is over: stop now (no finish needed)." }), error: true }
      }
      // A job page that says it is over (read_page.closed: a 404, "no longer available", a taken-down Workday job): closed, at once.
      if (page?.closed === true && name === "read_page") {
        const now = new Date().toISOString()
        const message = "This job is no longer open for applications."
        await svc(env, `drive_runs?id=eq.${run.id}&status=eq.running`, { method: "PATCH", body: JSON.stringify({ status: "needs_you", reason: "closed", message, last_note: message, fill_ended_at: now, agent_finished_at: now, updated_at: now }) }).catch(() => undefined)
        await cancelOpenCommands(env, run.id, "closed")
        return { text: JSON.stringify({ ok: false, run_ended: true, closed: true, error: "The job is closed: Odds told the person. The run is over: stop now (no finish needed)." }), error: true }
      }
      // A sign-in wall with nothing to apply to: the page says "log in to apply" (EU JRC), or it is a sign-in form and nothing else
      // (EU Login, Workday's account page). "Log in to save your progress" (Cornerstone) is optional: no wall.
      // Broods gets one go at it first: Odds fills a saved login on a sign-in page and a new account on a register page itself, so pressing
      // Sign in, or a Create account / Register link, often gets through. Only the second wall in a run is the person's.
      if (page && Array.isArray(page.fields) && signInWall(page)) {
        const tried = (await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.guard&result->>returned=eq.sign_in_wall&select=id&limit=1`).catch(() => null))?.[0]
        if (!tried) {
          await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "guard", args: {}, status: "done", result: { returned: "sign_in_wall" }, done_at: new Date().toISOString() }) }).catch(() => undefined)
          res = { ...res, sign_in_wall: true, next: "This page asks to sign in. Try to get past it yourself, once: press Create account / Register / Sign up / Continue as guest if the page (or a link on it) offers one, and Odds fills the e-mail and password; otherwise press Sign in / Log in, and Odds fills the login it saved for this site. Then read_page. If it is still a sign-in page after that, finish needs_you reason account." }
        } else {
          const now = new Date().toISOString()
          const message = "This site wants you to sign in. Do it in the tab, then press Auto apply again."
          await svc(env, `drive_runs?id=eq.${run.id}&status=eq.running`, { method: "PATCH", body: JSON.stringify({ status: "needs_you", reason: "account", message, last_note: message, fill_ended_at: now, agent_finished_at: now, updated_at: now }) }).catch(() => undefined)
          await cancelOpenCommands(env, run.id, "account")
          return { text: JSON.stringify({ ok: false, run_ended: true, account: true, error: "Sign-in wall: Odds told the person. The run is over: stop now (no finish needed)." }), error: true }
        }
      }
      // Through a job board to the employer's own form: remembered for this job, so the next run opens the form directly.
      if (run.posting_id && typeof page?.url === "string" && Array.isArray(page.fields) && page.fields.length >= 2) void learnApplyLink(env, run.posting_id, page.url)
      if (page?.url && typeof page.url === "string") {
        const idCheck = jobIdentityMismatch({ intendedUrl: run.url, pageUrl: page.url, pageTitle: page.title })
        if (!idCheck.ok) {
          const now = new Date().toISOString()
          await svc(env, `drive_runs?id=eq.${run.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "needs_you",
              reason: "other",
              message: idCheck.message,
              fill_ended_at: now,
              agent_finished_at: now,
              updated_at: now,
            }),
          }).catch(() => undefined)
          await cancelOpenCommands(env, run.id, "wrong_job")
          return { text: JSON.stringify({ ok: false, wrong_job: true, error: idCheck.message, page }), error: true }
        }
      }
      // Real vision when the step went wrong: the screenshot goes into the conversation as an image (drive-vision.ts).
      if (["fill", "click", "click_at", "read_page"].includes(name) && live(run)) {
        const prev = (await svc(env, `drive_commands?run_id=eq.${run.id}&status=eq.done&id=lt.${cmd.id}&tool=in.(read_page,fill,click,click_at,scroll,upload_cv,back,open_job)&order=id.desc&limit=1&select=result`).catch(() => null))?.[0]?.result
        const before = prev?.page ?? (Array.isArray(prev?.fields) ? prev : null)
        const reasons = troubleReasons(name, res, page, before)
        if (reasons.length) {
          const image = shotImage || await captureShot(env, run)
          if (image && await pushScreenshot(visionDeps(env, run), run.id, image, reasons)) res = { ...res, vision: "A screenshot of the tab is now in your conversation as an image: look at it before your next step." }
        }
      }
      // Recipe replays are the server's evidence, not Broods' business.
      const { recipe_attempts: _replayed, ...shown } = res
      if (shown.page?.recipe_attempts) { const { recipe_attempts: _inPage, ...rest } = shown.page; shown.page = rest }
      // Whatever else is a very long string (a stray image, a page dump) never goes into the text the model reads.
      return { text: JSON.stringify(shown, (_k, v) => (typeof v === "string" && v.length > 20_000 ? "(omitted: too long)" : v)).slice(0, 30_000), ...(shotImage ? { image: shotImage } : {}) }
    }
    if (row?.status === "cancelled" || row?.status === "expired") {
      const kind = row.result?.timeout || row.status
      return { text: JSON.stringify({ ok: false, abandoned: true, timeout: kind, error: `Command ${kind}. Call read_page.` }), error: true }
    }
  }
  const row = (await svc(env, `drive_commands?id=eq.${cmd.id}&select=status,taken_at`))?.[0]
  const kind = row?.status === "queued" || !row?.taken_at ? "never_started" : "result_lost"
  await abandonCommand(env, cmd.id, kind)
  // Twice in a row no tab took a step: the application is on a page Odds cannot run on (another window, a security check, Chrome's own
  // error page) or the tab is gone. Retrying only burns minutes; say so to the person now, with what to do.
  if (kind === "never_started") {
    const prev = (await svc(env, `drive_commands?run_id=eq.${run.id}&id=lt.${cmd.id}&order=id.desc&limit=1&select=status,result`).catch(() => null))?.[0]
    if (prev?.status === "expired" && prev?.result?.timeout === "never_started") {
      const now = new Date().toISOString()
      const message = "Odds lost the application tab. Open it again and press Auto apply to carry on."
      await svc(env, `drive_runs?id=eq.${run.id}&status=eq.running`, {
        method: "PATCH",
        body: JSON.stringify({ status: "needs_you", reason: "other", message, last_note: message, fill_ended_at: now, agent_finished_at: now, updated_at: now }),
      }).catch(() => undefined)
      await cancelOpenCommands(env, run.id, "tab_silent")
      return { text: JSON.stringify({ ok: false, abandoned: true, timeout: kind, run_ended: true, error: "The tab stopped answering twice; Odds told the person. The run is over: stop now (no finish needed)." }), error: true }
    }
  }
  return { text: JSON.stringify({ ok: false, abandoned: true, timeout: kind, error: `The browser did not answer (${kind}). Call read_page again.` }), error: true }
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

const BOARD = /(^|\.)(linkedin|indeed|glassdoor)\.|(^|\.)magnet\.me$/i
/** The employer's form reached from a board listing: kept as the job's apply link (only for a listing that is on a board). */
async function learnApplyLink(env: Env, postingId: string, pageUrl: string): Promise<void> {
  let host = ""
  try { host = new URL(pageUrl).hostname } catch { return }
  if (!host || BOARD.test(host) || /(^|\.)(broods\.app|beeblast\.co|google\.com)$/i.test(host)) return
  const listing = (await svc(env, `postings?id=eq.${encodeURIComponent(postingId)}&select=url`).catch(() => null))?.[0]?.url
  try { if (!listing || !BOARD.test(new URL(String(listing)).hostname)) return } catch { return }
  await svc(env, "posting_apply_links?on_conflict=posting_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ posting_id: postingId, apply_url: pageUrl.split("#")[0]!.slice(0, 2000), source: "run", updated_at: new Date().toISOString() }) }).catch(() => undefined)
}

const SOURCE: Array<[RegExp, string]> = [[/linkedin\./, "LinkedIn"], [/indeed\./, "Indeed"], [/glassdoor\./, "Glassdoor"], [/magnet\.me/, "Magnet.me"], [/academictransfer\./, "AcademicTransfer"]]

/** needs_sponsorship and right_to_work_nl from the saved permit and study status. Empty when the permit does not decide. */
async function permitFactsForRun(env: Env, run: Json): Promise<PermitWorkFacts> {
  const prof = (await svc(env, `profiles?user_id=eq.${run.user_id}&select=data`).catch(() => null))?.[0]?.data ?? {}
  let studyStatus: unknown = null
  if (studyingFrom(prof.studying, null) === null) {
    studyStatus = (await svc(env, `application_answers?user_id=eq.${run.user_id}&select=data`).catch(() => null))?.[0]?.data?.study_status
  }
  return permitWorkAnswers(typeof prof.permit === "string" ? prof.permit : "", studyingFrom(prof.studying, studyStatus))
}

/** Earlier tracker rows at this employer. null when the lookup failed (unknown, so the fact is left out). */
async function appliedToThisEmployer(env: Env, run: Json, job: Json): Promise<Record<string, string>> {
  const employer = String(job?.employer_display ?? job?.employer ?? "").trim()
  if (!employer || !run?.user_id) return {}
  const rows = await svc(env, `applications?user_id=eq.${run.user_id}&select=posting_id,postings(employer,employer_display)&limit=200`).catch(() => null)
  if (!Array.isArray(rows)) return {}
  const names: string[] = []
  for (const row of rows) {
    if (run.posting_id && row?.posting_id === run.posting_id) continue
    const post = row?.postings
    const linked = Array.isArray(post) ? post[0] : post
    const name = linked?.employer_display || linked?.employer
    if (name) names.push(String(name))
  }
  const answer = appliedBeforeAnswer(names, employer)
  return answer ? { applied_to_this_employer_before: answer } : {}
}
/** What Odds knows about this person and this job, so Broods never asks it: where the job was found, and whether they worked at or applied to this employer. */
function jobFacts(job: Json, url: string, facts: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  const posted = String(job?.url ?? url ?? "")
  out.job_source = SOURCE.find(([re]) => re.test(posted))?.[1] ?? "Company website"
  const employer = String(job?.employer_display ?? job?.employer ?? "").trim().toLowerCase()
  if (employer) {
    const history = `${facts.experience ?? ""} ${facts.current_company ?? ""} ${facts.cv_excerpt ?? ""}`.toLowerCase()
    out.worked_at_this_employer_before = history.includes(employer.split(/\s+/)[0]!) ? "maybe (check experience)" : "No"
  }
  // Year of study from the person's own education dates ("Master, …, Sep 2025–Aug 2027"): asked often, never worth a stop.
  const study = String(facts.education ?? "").match(/\b(bachelor|master|msc|bsc|ba|ma|phd|mba)\b[^]*?\b([A-Z][a-z]{2,8})?\s*(20\d\d)\s*[–-]\s*(?:[A-Z][a-z]{2,8}\s*)?(20\d\d)/i)
  if (study) {
    const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    const startMonth = Math.max(0, MONTHS.indexOf(String(study[2] ?? "sep").slice(0, 3).toLowerCase()))
    const start = new Date(Number(study[3]), startMonth, 1), end = Number(study[4])
    const now = new Date()
    if (now >= start && now.getFullYear() <= end) {
      const year = Math.floor((now.getTime() - start.getTime()) / (365.25 * 86_400_000)) + 1
      const level = /master|msc|ma\b|mba/i.test(study[1]!) ? "Master's" : /phd/i.test(study[1]!) ? "PhD" : "Bachelor's"
      out.current_study_year = `${year === 1 ? "1st" : year === 2 ? "2nd" : year === 3 ? "3rd" : `${year}th`} year (${level}), graduating ${end}`
    }
  }
  return out
}

/** The storage, memory and Broods steering the screenshot push needs, for one run (drive-vision.ts). */
function visionDeps(env: Env, run: Json): VisionDeps {
  // Broods downloads every image link again on every step, and the storage CDN would keep serving an overwritten screenshot: no cache,
  // so greying out an old one takes effect at once (tested: 4,744 input tokens with the cache, 3,365 without).
  const storage = (path: string) => `${env.url}/storage/v1/object/sight/${path.split("/").map(encodeURIComponent).join("/")}`
  const auth = { apikey: env.serviceKey!, Authorization: `Bearer ${env.serviceKey}` }
  return {
    put: async (path, base64) => (await fetch(storage(path), { method: "POST", headers: { ...auth, "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "max-age=0" }, body: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) })).ok,
    sign: async (path, seconds) => {
      const res = await fetch(`${env.url}/storage/v1/object/sign/sight/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: seconds }) })
      const body = res.ok ? await res.json().catch(() => null) : null
      return typeof body?.signedURL === "string" ? `${env.url}/storage/v1${body.signedURL}` : null
    },
    pushed: async () => ((await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.vision&order=id.asc&select=result`).catch(() => null)) ?? []).map((r: Json) => String(r?.result?.path ?? "")).filter(Boolean),
    remember: async (path, reason) => { await svc(env, "drive_commands", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ run_id: run.id, tool: "vision", args: {}, status: "done", result: { path, reason }, done_at: new Date().toISOString() }) }) },
    steer: async (text, imageUrl) => {
      const agentId = (Deno.env.get("ODDS_DRIVE_AGENT_ID") ?? "").trim()
      const client = agentId ? await broodsClient(run) : null
      if (!client) return false
      await client.runAsync({ agentId, eventId: crypto.randomUUID(), conversationKey: `odds-drive-${run.id}`, mode: "steer", events: [{ role: "user", content: [{ type: "text", text }, { type: "image", image: imageUrl, mediaType: "image/jpeg" }] }] } as never)
      return true
    },
  }
}

/** A fresh screenshot of the run's tab (a screenshot step the extension answers), or "" when it does not come in time. */
async function captureShot(env: Env, run: Json): Promise<string> {
  const docGen = typeof run.doc_gen === "number" ? run.doc_gen : 0
  const [cmd] = await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "screenshot", args: {}, note: "Taking a picture of the tab", doc_gen: docGen, tab_id: run.tab_id ?? null }) }).catch(() => [null])
  if (!cmd) return ""
  for (const until = Date.now() + 10_000; Date.now() < until;) {
    await sleep(400)
    const row = (await svc(env, `drive_commands?id=eq.${cmd.id}&select=status,result`).catch(() => null))?.[0]
    if (row?.status === "done") {
      const image = typeof row.result?.image === "string" ? row.result.image : ""
      void svc(env, `drive_commands?id=eq.${cmd.id}`, { method: "PATCH", body: JSON.stringify({ result: { ...row.result, image: image ? "(sent)" : row.result?.image } }) }).catch(() => undefined)
      return image
    }
    if (row?.status === "cancelled" || row?.status === "expired") break
  }
  await abandonCommand(env, cmd.id, "result_lost").catch(() => undefined)
  return ""
}

/** A Broods client acting for the run's person, or null when Broods is not set up on the server. */
async function broodsClient(run: Json): Promise<BroodsClient | null> {
  const key = (Deno.env.get("APPLY_AGENT_BROODS_API_KEY") ?? "").trim()
  const secret = (Deno.env.get("APPLY_AGENT_BROODS_USER_TOKEN_SECRET") ?? "").trim()
  if (!key || !secret) return null
  const base = ((Deno.env.get("APPLY_AGENT_BROODS_BASE_URL") ?? "https://gateway.broods.app").trim() || "https://gateway.broods.app").replace(/\/$/, "")
  return new BroodsClient({ apiKey: key, baseUrl: base, userToken: await signUserToken(run.user_id, secret) })
}

/** Asked at most every 10 s per run while it is quiet (drive-next loops every 400 ms). */
const turnChecks = new Map<string, { at: number; turn: BroodsTurn }>()
/** Whether the run's latest Broods turn is still working. Unknown when Odds cannot tell (no turn id kept, Broods not answering). */
async function broodsTurn(env: Env, run: Json): Promise<BroodsTurn> {
  const held = turnChecks.get(run.id)
  if (held && Date.now() - held.at < 10_000) return held.turn
  let turn: BroodsTurn = "unknown"
  try {
    const row = (await svc(env, `drive_commands?run_id=eq.${run.id}&tool=eq.broods&order=id.desc&limit=1&select=result`))?.[0]
    const id = row?.result?.broods_run_id
    const client = typeof id === "string" ? await broodsClient(run) : null
    if (client && typeof id === "string") turn = broodsTurnState(await client.getAsyncStatus(id))
  } catch { /* unknown */ }
  turnChecks.set(run.id, { at: Date.now(), turn })
  return turn
}

/** Start the Broods agent on a run with the person's own context; it then drives through the tools. Reads the stream in the background. */
async function startBroods(env: Env, run: Json, job: Json, facts: Record<string, string>, resume?: string, oddsFilled?: Json): Promise<string | null> {
  const key = (Deno.env.get("APPLY_AGENT_BROODS_API_KEY") ?? "").trim()
  const agentId = (Deno.env.get("ODDS_DRIVE_AGENT_ID") ?? "").trim()
  const secret = (Deno.env.get("APPLY_AGENT_BROODS_USER_TOKEN_SECRET") ?? "").trim()
  if (!key || !agentId || !secret) return "Broods is not set up on the server."
  // Whether Odds holds this job's own cover / motivation letter (upload_letter), else the person is asked for one.
  const letter = run.posting_id ? (await svc(env, `job_documents?user_id=eq.${run.user_id}&posting_id=eq.${encodeURIComponent(run.posting_id)}&kind=eq.cover_letter&select=document_id&limit=1`).catch(() => null))?.[0] : null
  // What the person answered in Odds since (Broods' own questions included): Broods fills those in when it carries on.
  // Everything the person ever answered in Odds (their own words, question by question): Broods fills those in on every run, any job.
  const answered = ((await svc(env, `application_questions?user_id=eq.${run.user_id}&answer=neq.&select=question,answer&order=updated_at.desc&limit=150`).catch(() => null)) ?? [])
    .filter((a: Json) => typeof a?.question === "string" && a.question.trim())
  const task = resume
    ? { run_id: run.id, resume, ...(run.mode === "copilot" ? { mode: "copilot" } : {}), has_cover_letter: Boolean(letter), person_answers: answered, goal: run.mode === "copilot" ? COPILOT_GOAL : "Carry on with the same application in the same tab: read_page first, then go on until only Submit is left (finish review), or something only the person can do (finish needs_you)." }
    : {
        run_id: run.id,
        job: { title: job?.title ?? null, employer: job?.employer_display ?? job?.employer ?? null, url: run.url },
        person: { ...facts, ...jobFacts(job, run.url, facts), ...(await appliedToThisEmployer(env, run, job)), ...(await permitFactsForRun(env, run)) },
        person_answers: answered,
        has_cover_letter: Boolean(letter),
        ...(run.mode === "copilot" ? { mode: "copilot" } : {}),
        goal: run.mode === "copilot" ? COPILOT_GOAL : "Apply to this job in the person's browser tab with the odds-browser tools until only Submit is left (finish review), or something only the person can do (finish needs_you).",
      }
  // A background run: Broods accepts it (202) and keeps working on its side for as long as the form takes. Holding the stream open
  // here capped every run at this function's ~150 s wall clock ("Caller stopped reading the stream" cancelled real applications).
  // The agent reports its end through the finish tool; the extension says so when Broods goes quiet.
  const [playbook, route] = await Promise.all([sitePlaybook(env, run.url), siteRoute(env, run.url)])
  Object.assign(task, { site_playbook: playbook, ...(route ? { route } : {}), ...(oddsFilled && typeof oddsFilled === "object" ? { odds_filled: { filled: Number(oddsFilled.filled) || 0, left: Number(oddsFilled.left) || 0, only_submit_left: oddsFilled.only_submit_left === true } } : {}) })
  try {
    const client = await broodsClient(run)
    if (!client) return "Broods is not set up on the server."
    // One conversation per run, always: a second conversation is a second agent driving the same tab. A pick-up joins the same
    // conversation (Broods steers it into a live turn, or runs it next), and keeps everything the agent already did and saw.
    // The quiet check below only picks a run up once its turn has ended; a hung turn ends the run instead.
    if (resume && (Number(run.retries) || 0) > 0) Object.assign(task, { nudge: "You ended your last turn without calling a tool, so the run went quiet. Carry on from where you are: call read_page, then the next action; every turn ends with a tool call or finish." })
    const accepted = await client.runAsync({ agentId, eventId: crypto.randomUUID(), conversationKey: `odds-drive-${run.id}`, input: JSON.stringify(task) })
    // The turn's Broods id, so the quiet check can ask whether it is still working before picking the run up again.
    const broodsRunId = (accepted as { runId?: unknown })?.runId
    if (typeof broodsRunId === "string") await svc(env, "drive_commands", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ run_id: run.id, tool: "broods", args: {}, status: "done", result: { broods_run_id: broodsRunId }, done_at: new Date().toISOString() }) }).catch(() => undefined)
    // 202 only means Broods queued the run. A dead tunnel fails the model in well under a second and leaves the run "running".
    const started = await broodsInvocationState(client, accepted)
    if (started === "unreachable") return MODEL_UNREACHABLE
    if (started === "ended") {
      const [fresh, commands] = await Promise.all([
        runOf(env, run.id),
        svc(env, `drive_commands?run_id=eq.${run.id}&tool=not.in.(recipe,broods,guard,ext,vision)&select=id&limit=1`).catch(() => []),
      ])
      if (fresh?.status === "running" && (!Array.isArray(commands) || commands.length === 0)) {
        return "Broods ended before it reached the application tab. Press Apply with Odds to try again."
      }
    }
  } catch { return "Broods did not start. Try again from Odds." }
  return null
}

/** Poll the async session for a few seconds. A failed, expired, or unresolvable model is a start failure; a live status is not. */
async function broodsInvocationState(client: { getAsyncStatus?: (status: unknown) => Promise<{ status?: string; error?: string | null }> }, accepted: unknown): Promise<BroodsStartOutcome> {
  if (typeof client.getAsyncStatus !== "function") return "wait"
  const deadline = Date.now() + 2500
  while (Date.now() < deadline) {
    try {
      const status = await client.getAsyncStatus(accepted)
      const outcome = broodsStartOutcome(status)
      if (outcome !== "wait") return outcome
    } catch (err) {
      const outcome = broodsStartOutcome({ status: "failed", error: String((err as Error)?.message || err) })
      if (outcome !== "wait") return outcome
    }
    await sleep(400)
  }
  return "wait"
}

// ---------------------------------------------------------------- extension routes

const MAX_RESUMES = 6
/** "Fill with Odds": the person is on a form they opened; Broods fills the whole application from there (Next included), up to Submit. */
const COPILOT_GOAL = "The person pressed Fill with Odds on this application (mode copilot): fill the WHOLE application for them, page after page. On each page: read_page, fill every field the facts answer (optional ones too when the facts have them), upload the CV, write the open questions; then press Next / Continue / Save and continue yourself and do the next page. Stop only when Submit / Send is all that is left (finish review — never press it), or at a sign-in / captcha (finish needs_you; Odds carries on by itself once the person has done it)."
/** A run that waits for the person (or got stuck) and may pick up again by itself: recent, and not resumed too often. */
// "Fill with Odds" (copilot): every page the person moves to resumes the same run, also after a page ended at review (up to 15 pages).
const resumeRun = (run: Json): boolean => run?.mode === "copilot"
  ? ["needs_you", "stuck", "review"].includes(run?.status) && Date.now() - Date.parse(run.updated_at) < 3 * 3_600_000 && (run.resumes ?? 0) < 15
  : ["needs_you", "stuck"].includes(run?.status) && Date.now() - Date.parse(run.updated_at) < 30 * 60_000 && (run.resumes ?? 0) < (run?.status === "stuck" ? 2 : MAX_RESUMES)
const resumePatch = (run: Json): Json => ({ status: "running", reason: null, message: null, resume_pending: true, resumes: (run.resumes ?? 0) + 1, last_note: "Carrying on where it stopped…", expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), updated_at: new Date().toISOString() })

/** /ext/drive-start | drive-next | drive-result for the person's own extension. */
export async function driveExt(route: string, req: Request, env: Env, userId: string, ctx: { facts: () => Promise<Record<string, string>>; job: (url: string) => Promise<Json | null> }): Promise<Response> {
  const json = (status: number, body: Json) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } })
  const body = await req.json().catch(() => null)
  if (route === "drive-playbook") return json(200, { playbook: await sitePlaybook(env, String(body?.page || body?.url || "")) })
  if (route === "drive-start") {
    // What the extension replayed from the playbook on this page (structure only, re-checked here): judged when the run ends.
    const recordAttempts = async (run: Json) => {
      // Which extension build ran this page: a tab still on an old build explains a trace that does not match the code.
      const version = typeof body?.ext_version === "string" ? body.ext_version.slice(0, 20) : "unknown"
      await svc(env, "drive_commands", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ run_id: run.id, tool: "ext", args: {}, status: "done", result: { version }, done_at: new Date().toISOString() }) }).catch(() => undefined)
      for (const attempt of (Array.isArray(body?.recipe_attempts) ? body.recipe_attempts : []).slice(0, 12)) {
        const lesson = sanitizeLesson(attempt?.lesson)
        if (lesson) await svc(env, "drive_commands", { method: "POST", body: JSON.stringify({ run_id: run.id, tool: "recipe", args: {}, status: "done", result: { lesson, ok: attempt.ok === true }, done_at: new Date().toISOString() }) }).catch(() => undefined)
      }
    }
    // A page load in the same application resumes its run (Broods is still driving), never a second agent.
    if (typeof body?.run_id === "string") {
      const run = await runOf(env, body.run_id)
      if (run && run.user_id === userId && live(run)) { await recordAttempts(run); return json(200, { run_id: run.id, resumed: true, tactics: await siteTactics(env, String(body?.page || run.url)).catch(() => ({})) }) }
      // The page moved on while Broods waited for the person (they signed in, solved the captcha): the same run carries on.
      if (run && run.user_id === userId && resumeRun(run)) {
        await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify(resumePatch(run)) })
        return json(200, { run_id: run.id, resumed: true })
      }
    }
    const url = String(body?.url || body?.page || "").slice(0, 2000)
    if (!/^https:\/\//.test(url)) return json(400, { error: "No application address." })
    if (/^https:\/\/([^/]+\.)?(broods\.app|beeblast\.co|claude\.ai)(\/|$)/i.test(url)) return json(400, { error: "That tab is not a job application." })
    // A run whose tab has not checked in for 10 minutes is over (Chrome closed, the tab gone without a word): never left "running".
    const gone = encodeURIComponent(new Date(Date.now() - 600_000).toISOString())
    void svc(env, `drive_runs?user_id=eq.${userId}&status=eq.running&or=(last_seen_at.lt.${gone},and(last_seen_at.is.null,created_at.lt.${gone}))`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "stopped", resume_pending: false, message: "The application tab went away.", updated_at: new Date().toISOString() }),
    }).catch(() => undefined)
    // The same application asked to start twice (two frames, a quick reload): join the live run started moments ago — one agent per form.
    const page = String(body?.page || url).slice(0, 2000)
    const recent = (await svc(env, `drive_runs?user_id=eq.${userId}&status=eq.running&url=eq.${encodeURIComponent(page)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 120_000).toISOString())}&order=created_at.desc&limit=1&select=id`).catch(() => null))?.[0]
    if (recent?.id) return json(200, { run_id: recent.id, resumed: true })
    const job = await ctx.job(url).catch(() => null)
    // Time from the page being ready to the first field Odds filled (from the local copies): how fast known sites feel.
    const firstFill = Number(body?.odds_filled?.first_fill_ms)
    const fillMs = Number.isFinite(firstFill) && firstFill >= 0 && firstFill < 600_000 ? { first_fill_ms: Math.round(firstFill) } : {}
    // The column arrives with its migration: a database that does not have it yet gets the same row without the number, never a failed start.
    const insertRun = async (row: Json): Promise<Json> => {
      if (!Object.keys(fillMs).length) return svc(env, "drive_runs", { method: "POST", body: JSON.stringify(row) })
      try { return await svc(env, "drive_runs", { method: "POST", body: JSON.stringify({ ...row, ...fillMs }) }) } catch { return svc(env, "drive_runs", { method: "POST", body: JSON.stringify(row) }) }
    }
    // Odds' own fill already finished the form (every required field filled, only Submit left): the run is at review with no model call.
    if (body?.ready === true) {
      const now = new Date().toISOString()
      const message = "Everything is filled in. Check it and press Submit yourself."
      const [done] = await insertRun({ user_id: userId, posting_id: job?.id ?? null, url: String(body?.page || url).slice(0, 2000), status: "review", steps: 0, message, last_note: "Filled by Odds from your profile (no AI needed).", fill_ended_at: now, agent_finished_at: now, ...(body?.copilot === true ? { mode: "copilot" } : {}) })
      await recordAttempts(done)
      return json(200, { run_id: done.id, resumed: false, ready: true })
    }
    const [run] = await insertRun({ user_id: userId, posting_id: job?.id ?? null, url: String(body?.page || url).slice(0, 2000), ...(body?.copilot === true ? { mode: "copilot" } : {}) })
    await recordAttempts(run)
    const problem = await startBroods(env, run, job, await ctx.facts().catch(() => ({})), undefined, body?.odds_filled)
    if (problem) {
      const now = new Date().toISOString()
      await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ status: "stuck", reason: "other", message: problem, fill_ended_at: now, agent_finished_at: now, updated_at: now }) }).catch(() => undefined)
      return json(200, { error: problem })
    }
    return json(200, { run_id: run.id, resumed: false, tactics: await siteTactics(env, run.url).catch(() => ({})) })
  }
  const run = await runOf(env, String(body?.run_id ?? ""))
  if (!run || run.user_id !== userId) return json(404, { error: "No such run." })
  if (route === "drive-stop") {
    // The person took the tab back (or stopped the run): Broods' next tool call sees the run is over and ends.
    // The tab is gone either way.
    const gone = new Date(0).toISOString()
    const now = new Date().toISOString()
    // Only a run still working is stopped. One that already ended (review, needs you, stuck) keeps its outcome: a reload of the
    // extension stops every run it remembers, and rewrote finished ones as "stopped" (the tracker and the metrics lost them).
    if (run.status !== "running") await svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", body: JSON.stringify({ last_seen_at: gone, resume_pending: false }) })
    else {
      await svc(env, `drive_runs?id=eq.${run.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "stopped",
          resume_pending: false,
          last_seen_at: gone,
          message: String(body?.message ?? "Stopped by the person.").slice(0, 300),
          agent_finished_at: now,
          fill_ended_at: now,
          updated_at: now,
        }),
      })
      await cancelOpenCommands(env, run.id, "stopped")
    }
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
    const cmd = (await svc(env, `drive_commands?id=eq.${id}&run_id=eq.${run.id}&select=id,status,doc_gen`))?.[0]
    if (!cmd) return json(404, { error: "No such command.", stale: true })
    const gate = canAcceptDriveResult({
      runStatus: run.status,
      cmdStatus: String(cmd.status),
      runDocGen: typeof run.doc_gen === "number" ? run.doc_gen : 0,
      cmdDocGen: typeof cmd.doc_gen === "number" ? cmd.doc_gen : 0,
    })
    if (!gate.ok) return json(200, { ok: false, stale: true, reason: gate.reason })
    // CAS: only the taken row may become done (duplicate polls cannot overwrite).
    const written = await svc(env, `drive_commands?id=eq.${id}&run_id=eq.${run.id}&status=eq.taken`, {
      method: "PATCH",
      body: JSON.stringify({ status: "done", result: body?.result ?? {}, done_at: new Date().toISOString() }),
    })
    if (!Array.isArray(written) || !written.length) return json(200, { ok: false, stale: true, reason: "not_taken" })
    if (!run.last_seen_at || Date.now() - Date.parse(run.last_seen_at) > 15_000) {
      void svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_seen_at: new Date().toISOString() }) }).catch(() => undefined)
    }
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
    // A page that just loaded (body.fresh): bump document generation and only requeue abandoned taken rows that never completed.
    // Never re-run a done/cancelled mutation.
    if (body?.fresh === true) {
      const nextGen = (typeof run.doc_gen === "number" ? run.doc_gen : 0) + 1
      const tabId = Number.isInteger(Number(body.tab_id)) ? Number(body.tab_id) : run.tab_id ?? null
      await svc(env, `drive_runs?id=eq.${run.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ doc_gen: nextGen, ...(tabId != null ? { tab_id: tabId } : {}), updated_at: new Date().toISOString() }),
      }).catch(() => undefined)
      run.doc_gen = nextGen
      // Steps queued for this run but not started yet (the read of the new page that a click/back/open_job asked for) belong to this
      // new page: carry them over, or they wait out their timeout and Broods stalls ~25 s after every page change.
      await svc(
        env,
        `drive_commands?run_id=eq.${run.id}&status=eq.queued&doc_gen=lt.${nextGen}`,
        { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ doc_gen: nextGen }) },
      ).catch(() => undefined)
      // Requeue only taken commands still on the previous gen that look abandoned (no result for >2s).
      await svc(
        env,
        `drive_commands?run_id=eq.${run.id}&status=eq.taken&doc_gen=eq.${nextGen - 1}&taken_at=lt.${encodeURIComponent(new Date(Date.now() - 2000).toISOString())}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "queued", taken_at: null, doc_gen: nextGen, accepted_at: null }),
        },
      ).catch(() => undefined)
    } else if (Number.isInteger(Number(body?.tab_id)) && body.tab_id !== run.tab_id) {
      void svc(env, `drive_runs?id=eq.${run.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ tab_id: Number(body.tab_id), updated_at: new Date().toISOString() }),
      }).catch(() => undefined)
    }
    for (let waited = 0; waited < NEXT_WAIT_MS; waited += 400) {
      const queued = (await svc(env, `drive_commands?run_id=eq.${run.id}&status=eq.queued&order=id.asc&limit=1&select=id,tool,args,note,doc_gen`))?.[0]
      if (queued) {
        const taken = await svc(env, `drive_commands?id=eq.${queued.id}&status=eq.queued`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "taken",
            taken_at: new Date().toISOString(),
            accepted_at: new Date().toISOString(),
            doc_gen: typeof run.doc_gen === "number" ? run.doc_gen : queued.doc_gen ?? 0,
            tab_id: Number.isInteger(Number(body?.tab_id)) ? Number(body.tab_id) : run.tab_id ?? null,
          }),
        })
        if (Array.isArray(taken) && taken.length) return json(200, { command: queued, steps: run.steps, doc_gen: run.doc_gen ?? 0 })
      }
      const fresh = await runOf(env, run.id)
      if (!fresh || !live(fresh)) {
        if (fresh && driveRunExpired(fresh.status, fresh.expires_at)) {
          const now = new Date().toISOString()
          const message = "The application run expired before Broods finished. Press Apply with Odds to carry on."
          await svc(env, `drive_runs?id=eq.${run.id}&status=eq.running`, {
            method: "PATCH",
            body: JSON.stringify({ status: "stuck", reason: "other", message, resume_pending: false, fill_ended_at: now, agent_finished_at: now, updated_at: now }),
          }).catch(() => undefined)
          await cancelOpenCommands(env, run.id, "expired")
          return json(200, { done: true, status: "stuck", reason: "other", message })
        }
        return json(200, { done: true, status: fresh?.status ?? "failed", reason: fresh?.reason ?? null, message: fresh?.message ?? "The run ended." })
      }
      // Broods has sent nothing for 30 s (not waiting on the person). Still thinking: leave it alone (a pick-up would only queue behind
      // it). Ended without a tool call: pick it up again in the same conversation. Hung: end the run.
      const quietMs = Date.now() - Date.parse(fresh.updated_at)
      if (quietMs > QUIET_MS && !personBusy(fresh)) {
        const commands = await svc(env, `drive_commands?run_id=eq.${run.id}&tool=not.in.(recipe,broods,guard,ext,vision)&select=id&limit=1`).catch(() => [])
        const decision = quietAction({ turn: await broodsTurn(env, fresh), quietMs, retries: fresh.retries ?? 0, commandCount: Array.isArray(commands) ? commands.length : 0 })
        if (decision === "wait") { await sleep(400); continue }
        if (decision === "retry") {
          await svc(env, `drive_runs?id=eq.${run.id}&status=eq.running`, {
            method: "PATCH",
            body: JSON.stringify({ retries: (fresh.retries ?? 0) + 1, resume_pending: true, last_note: "Picking up again…", updated_at: new Date().toISOString() }),
          }).catch(() => undefined)
          return json(200, { idle: true, steps: run.steps })
        }
        const now = new Date().toISOString()
        const message = decision === "stuck_unreachable"
          ? MODEL_UNREACHABLE
          : decision === "stuck_hung"
          ? "Broods stopped answering on this application. Finish it in the tab, or press Apply with Odds to start again."
          : "Broods could not carry on with this application. Finish it in the tab, or press Apply with Odds to start again."
        await svc(env, `drive_runs?id=eq.${run.id}&status=eq.running`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "stuck",
            reason: "other",
            message,
            fill_ended_at: now,
            agent_finished_at: now,
            updated_at: now,
          }),
        }).catch(() => undefined)
        await cancelOpenCommands(env, run.id, `quiet:${decision === "stuck_unreachable" ? "unreachable" : decision === "stuck_hung" ? "hung" : "stuck"}`)
        return json(200, { done: true, status: "stuck", reason: "other", message, steps: run.steps })
      }
      await sleep(400)
    }
    return json(200, { idle: true, steps: run.steps })
  }
  return json(404, { error: "Unknown route." })
}
