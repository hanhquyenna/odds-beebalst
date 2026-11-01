import { afterEach, expect, test } from "bun:test"
import { handleStep } from "../../supabase/functions/drive-step/index"

const run = "11111111-2222-3333-4444-555555555555"
const key = `oddsx_${"a".repeat(48)}`
const env = { url: "https://db.test", serviceKey: "service", anonKey: "anon" }
const original = globalThis.fetch
const deno = (globalThis as unknown as { Deno?: unknown }).Deno
afterEach(() => {
  globalThis.fetch = original
  Object.assign(globalThis, { Deno: deno })
})

/** A fake database and mcp: records every URL the step function calls. */
function fake(queued: boolean): string[] {
  const calls: string[] = []
  Object.assign(globalThis, { Deno: { env: { get: () => undefined } } })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    calls.push(`${init?.method ?? "GET"} ${url}`)
    let rows: unknown = []
    if (url.includes("extension_keys?")) rows = [{ user_id: "u1", last_used_at: null }]
    if (url.includes("drive_runs?id=eq.") && !init?.method) rows = [{ id: run, user_id: "u1", status: "running", steps: 3, doc_gen: 2, tab_id: 7, last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() }]
    if (url.includes("status=eq.queued&order=") && queued) rows = [{ id: 41, tool: "read_page", args: {}, note: null, doc_gen: 2 }]
    if (url.includes("drive_commands?id=eq.41&status=eq.queued")) rows = [{ id: 41 }]
    if (url.includes("/functions/v1/mcp/ext/")) rows = { idle: true }
    return new Response(JSON.stringify(rows), { status: 200 })
  }) as typeof fetch
  return calls
}

const ask = (body: unknown, auth = key): Request => new Request("https://fn.test/drive-step/ext/drive-next", { method: "POST", headers: { authorization: `Bearer ${auth}` }, body: JSON.stringify(body) })

test("a queued step is taken here, without a call to mcp", async () => {
  const calls = fake(true)
  const res = await handleStep(ask({ run_id: run, tab_id: 7 }), env)
  const out = await res.json() as { command: { id: number }; doc_gen: number }
  expect(out.command.id).toBe(41)
  expect(out.doc_gen).toBe(2)
  expect(calls.some((c) => c.includes("/functions/v1/mcp/"))).toBe(false)
})

test("a page that just loaded, or nothing queued, goes on to mcp", async () => {
  const fresh = fake(true)
  await handleStep(ask({ run_id: run, tab_id: 7, fresh: true }), env)
  expect(fresh.some((c) => c.startsWith("POST https://db.test/functions/v1/mcp/ext/drive-next"))).toBe(true)
  expect(fresh.some((c) => c.includes("drive_commands?run_id="))).toBe(false)
  const idle = fake(false)
  const res = await handleStep(ask({ run_id: run, tab_id: 7 }), env)
  expect(await res.json()).toEqual({ idle: true })
  expect(idle.some((c) => c.includes("/functions/v1/mcp/ext/drive-next"))).toBe(true)
})

test("a key odds does not know is turned away", async () => {
  fake(true)
  const res = await handleStep(ask({ run_id: run }, "not-a-key"), env)
  expect(res.status).toBe(401)
})
