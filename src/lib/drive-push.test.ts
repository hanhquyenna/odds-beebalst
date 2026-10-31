import { afterEach, expect, test } from "bun:test"
import { driveExt, handleDriveMcp } from "../../supabase/functions/mcp/drive"

const RUN = "11111111-2222-3333-4444-555555555555"
const USER = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
const ENV = { url: "https://project.test", serviceKey: "service-key", anonKey: "anon-key" }
type Call = { url: string; method: string; body: unknown }
const original = globalThis.fetch
const deno = (globalThis as unknown as { Deno?: unknown }).Deno

afterEach(() => {
  globalThis.fetch = original
  Object.assign(globalThis, { Deno: deno })
})

/** Fakes Supabase (PostgREST and the Realtime broadcast API) for one test: `answer` gives each read its rows; every call is kept. */
function fake(env: Record<string, string>, answer: (url: string, method: string) => unknown): Call[] {
  const calls: Call[] = []
  Object.assign(globalThis, { Deno: { env: { get: (name: string) => env[name] } } })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? "GET"
    calls.push({ url: url, method: method, body: typeof init?.body === "string" ? JSON.parse(init.body) : null })
    return new Response(JSON.stringify(answer(url, method) ?? []), { status: 200 })
  }) as typeof fetch
  return calls
}

const live = { id: RUN, user_id: USER, status: "running", steps: 0, doc_gen: 3, expires_at: new Date(Date.now() + 60_000).toISOString(), updated_at: new Date().toISOString() }

test("with push on, a queued step wakes the person's private channel with the run id only", async () => {
  const calls = fake({ ODDS_DRIVE_SECRET: "s", ODDS_DRIVE_PUSH: "1" }, (url, method) => {
    if (url.includes("drive_runs?id=eq.") && method === "GET") return [live]
    if (url.endsWith("/rest/v1/drive_commands") && method === "POST") return [{ id: 7 }]
    if (url.includes("drive_commands?id=eq.7") && method === "GET") return [{ status: "done", result: { url: "https://jobs.test/apply", fields: [] } }]
    return []
  })
  const res = await handleDriveMcp(new Request("https://test.invalid/browser", { method: "POST", headers: { "x-odds-drive-key": "s" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_page", arguments: { run_id: RUN } } }) }), ENV)
  expect(((await res.json()) as { result: { isError?: boolean } }).result.isError).toBeUndefined()
  const wakes = calls.filter((c) => c.url === "https://project.test/realtime/v1/api/broadcast")
  expect(wakes).toHaveLength(1)
  expect(wakes[0].body).toEqual({ messages: [{ topic: `drive:${USER}`, event: "wake", payload: { run_id: RUN }, private: true }] })
})

test("with push off, nothing is broadcast", async () => {
  const calls = fake({ ODDS_DRIVE_SECRET: "s" }, (url, method) => {
    if (url.includes("drive_runs?id=eq.") && method === "GET") return [live]
    if (url.endsWith("/rest/v1/drive_commands") && method === "POST") return [{ id: 7 }]
    if (url.includes("drive_commands?id=eq.7") && method === "GET") return [{ status: "done", result: { fields: [] } }]
    return []
  })
  await handleDriveMcp(new Request("https://test.invalid/browser", { method: "POST", headers: { "x-odds-drive-key": "s" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_page", arguments: { run_id: RUN } } }) }), ENV)
  expect(calls.some((c) => c.url.includes("/realtime/"))).toBe(false)
})

test("drive-next in push mode answers at once and names the person's own channel", async () => {
  fake({ ODDS_DRIVE_PUSH: "1" }, (url, method) => (url.includes("drive_runs?id=eq.") && method === "GET" ? [live] : []))
  const started = Date.now()
  const res = await driveExt("drive-next", new Request("https://test.invalid/ext/drive-next", { method: "POST", body: JSON.stringify({ run_id: RUN, push: true }) }), ENV, USER, { facts: async () => ({}), job: async () => null })
  expect(Date.now() - started).toBeLessThan(1000)
  expect(await res.json()).toEqual({ idle: true, steps: 0, push: { url: "wss://project.test/realtime/v1/websocket", apikey: "anon-key", topic: `drive:${USER}` } })
})

test("drive-result writes in one CAS on the taken row of the run's document, and never for a run that ended", async () => {
  const calls = fake({}, (url, method) => {
    if (url.includes("drive_runs?id=eq.") && method === "GET") return [live]
    if (url.includes("drive_commands?id=eq.9") && method === "PATCH") return [{ id: 9 }]
    return []
  })
  const result = () => driveExt("drive-result", new Request("https://test.invalid/ext/drive-result", { method: "POST", body: JSON.stringify({ run_id: RUN, id: 9, result: { ok: true } }) }), ENV, USER, { facts: async () => ({}), job: async () => null }).then((r) => r.json())
  expect(await result()).toEqual({ ok: true })
  const write = calls.find((c) => c.method === "PATCH" && c.url.includes("drive_commands?id=eq.9"))!
  expect(write.url).toContain(`run_id=eq.${RUN}&status=eq.taken&doc_gen=eq.3`)
  // The run has ended: no write at all, and the tab is told its result is stale.
  fake({}, (url, method) => {
    if (url.includes("drive_runs?id=eq.") && method === "GET") return [{ ...live, status: "review" }]
    if (url.includes("drive_commands?id=eq.9") && method === "GET") return [{ id: 9, status: "taken", doc_gen: 3 }]
    if (method === "PATCH") throw new Error("no write after the run ended")
    return []
  })
  expect(await result()).toEqual({ ok: false, stale: true, reason: "run_ended" })
})
