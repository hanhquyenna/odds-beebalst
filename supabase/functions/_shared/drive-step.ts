// The two calls the Odds extension makes on every browser step, shared by `mcp` (which owns the whole drive flow) and `drive-step`
// (a function small enough to start fast: Supabase starts a fresh worker for almost every request, and a fresh `mcp` takes ~0.7 s).
// Light on purpose: nothing here may import the model, PDF or Broods code.
import { canAcceptDriveResult } from "./drive-ownership.ts"

// deno-lint-ignore no-explicit-any
type Json = any
export type StepEnv = { url: string; serviceKey?: string; anonKey?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXT_KEY_RE = /^oddsx_[0-9a-f]{48}$/

/** The person's extension key row (who it is and when it was last used), or null for a key odds does not know. */
export async function keyRow(env: StepEnv, key: string): Promise<{ user_id: string; last_used_at: string | null } | null> {
  if (!EXT_KEY_RE.test(key) || !env.serviceKey) return null
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")

  return (await svc(env, `extension_keys?key_hash=eq.${hash}&select=user_id,last_used_at`))?.[0] ?? null
}

/** A run that Broods is still driving and that has not expired. */
export const live = (run: Json): boolean => run?.status === "running" && Date.parse(run.expires_at) > Date.now()

/** Writes the result of the step the tab took: only the taken row of the run's current document becomes done, only while the run is live,
 * so duplicate posts and late results cannot overwrite. A refused result reads the row to say why. */
export async function postResult(env: StepEnv, run: Json, body: Json): Promise<{ status: number; body: Json }> {
  const id = Number(body?.id)
  if (!Number.isInteger(id)) return { status: 400, body: { error: "Bad command." } }
  const runDocGen = typeof run.doc_gen === "number" ? run.doc_gen : 0
  const written = run.status === "running"
    ? await svc(env, `drive_commands?id=eq.${id}&run_id=eq.${run.id}&status=eq.taken&doc_gen=eq.${runDocGen}&select=id`, {
      method: "PATCH",
      body: JSON.stringify({ status: "done", result: body?.result ?? {}, done_at: new Date().toISOString() }),
    })
    : []
  if (!Array.isArray(written) || !written.length) {
    const cmd = (await svc(env, `drive_commands?id=eq.${id}&run_id=eq.${run.id}&select=id,status,doc_gen`))?.[0]
    if (!cmd) return { status: 404, body: { error: "No such command.", stale: true } }
    const gate = canAcceptDriveResult({ runStatus: run.status, cmdStatus: String(cmd.status), runDocGen, cmdDocGen: typeof cmd.doc_gen === "number" ? cmd.doc_gen : 0 })
    return { status: 200, body: { ok: false, stale: true, reason: gate.ok ? "not_taken" : gate.reason } }
  }
  touchRun(env, run, {})

  return { status: 200, body: { ok: true } }
}

/** Push mode: ODDS_DRIVE_PUSH=1 on the function. */
export const pushOn = (): boolean => (Deno.env.get("ODDS_DRIVE_PUSH") ?? "").trim() === "1"

/** Where the person's extension listens for wakes (their own private channel), or null when push is off. */
export function pushFor(env: StepEnv, userId: string): Json {
  if (!pushOn() || !env.anonKey) return null

  return { url: `${env.url.replace(/^http/, "ws")}/realtime/v1/websocket`, apikey: env.anonKey, topic: `drive:${userId}` }
}

/** The run by id, or null for an id that is not one. */
export const runOf = async (env: StepEnv, id: string): Promise<Json> => (UUID.test(id) ? (await svc(env, `drive_runs?id=eq.${id}&select=*`))?.[0] ?? null : null)

/** A database call with the service key; returns the rows (Prefer: return=representation unless the caller says otherwise). */
export async function svc(env: StepEnv, path: string, init: RequestInit = {}): Promise<Json> {
  const headers = new Headers({ apikey: env.serviceKey!, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" })
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  const res = await fetch(`${env.url}/rest/v1/${path}`, { ...init, headers: headers })
  if (!res.ok) throw new Error(`db ${res.status}`)
  const text = await res.text()

  return text ? JSON.parse(text) : null
}

/** Hands the run's oldest queued step to its tab (one write claims it, so two looks never both get it), or null when none is queued. */
export async function takeStep(env: StepEnv, run: Json, body: Json): Promise<Json> {
  const queued = (await svc(env, `drive_commands?run_id=eq.${run.id}&status=eq.queued&order=id.asc&limit=1&select=id,tool,args,note,doc_gen`))?.[0]
  if (!queued) return null
  const now = new Date().toISOString()
  const taken = await svc(env, `drive_commands?id=eq.${queued.id}&status=eq.queued&select=id`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "taken",
      taken_at: now,
      accepted_at: now,
      doc_gen: typeof run.doc_gen === "number" ? run.doc_gen : queued.doc_gen ?? 0,
      tab_id: Number.isInteger(Number(body?.tab_id)) ? Number(body.tab_id) : run.tab_id ?? null,
    }),
  })

  return Array.isArray(taken) && taken.length ? { command: queued, steps: run.steps, doc_gen: run.doc_gen ?? 0 } : null
}

/** Notes that the tab is there (the tracker tells a live run from one whose tab is gone) and which tab drives the run. Never waits. */
export function touchRun(env: StepEnv, run: Json, body: Json): void {
  const patch: Json = {}
  if (!run.last_seen_at || Date.now() - Date.parse(run.last_seen_at) > 15_000) patch.last_seen_at = new Date().toISOString()
  if (body?.fresh !== true && Number.isInteger(Number(body?.tab_id)) && body.tab_id !== run.tab_id) {
    patch.tab_id = Number(body.tab_id)
    patch.updated_at = new Date().toISOString()
  }
  if (Object.keys(patch).length) void svc(env, `drive_runs?id=eq.${run.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch) }).catch(() => undefined)
}
