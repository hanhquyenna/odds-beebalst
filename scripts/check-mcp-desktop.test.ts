/** Offline contract tests exercise the real MCP transport, connector identity, and queue payloads. */
import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import * as PDFLib from "pdf-lib"

mock.module("npm:pdf-lib@1.17.1", () => PDFLib)
const { handle } = await import("../supabase/functions/mcp/server.ts")
const originalFetch = globalThis.fetch
const owner = "a1111111-1111-4111-8111-111111111111"
const env = { url: "https://desktop-mcp.test", anonKey: "anon", serviceKey: "server-only" }
const key = `odds_${"a".repeat(48)}`
const calls: { path: string; body: Record<string, unknown> | null }[] = []
let online = true
let closed = false
let status = "queued"
let expired = false
let connected = true
beforeAll(() => {
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    expect(url.origin).toBe(env.url)
    const path = `${url.pathname}${url.search}`
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null
    calls.push({ path, body })
    const json = (value: unknown): Response => Response.json(value)
    if (path.includes("/mcp_keys?")) return json(connected ? [{ user_id: owner, last_used_at: new Date().toISOString() }] : [])
    if (path.startsWith("/auth/v1/admin/users/")) return json({ email: "test@example.test" })
    if (path.includes("/application_desktops?")) {
      expect(url.searchParams.get("user_id")).toBe(`eq.${owner}`)
      return json(online ? [{ device_id: "desktop" }] : [])
    }
    if (path.includes("/postings?")) return json([{ id: "p-test", url: "https://www.linkedin.com/jobs/view/12345/", closed_at: closed ? new Date().toISOString() : null }])
    if (path.includes("/rpc/request_application_for")) {
      expect(body).toEqual({ p_user: owner, p_posting_id: "p-test" })
      return json({ id: "run-1", posting_id: "p-test", status: "queued", message: "Waiting for your desktop." })
    }
    if (path.includes("/application_prompts?")) {
      expect(url.searchParams.get("user_id")).toBe(`eq.${owner}`)
      return json([{ questions: [{ key: "visa job p-test", label: "Need sponsorship?", kind: "radio", options: ["Yes", "No"] }] }])
    }
    if (path.includes("/rpc/answer_application_questions_for")) {
      expect(body?.p_user).toBe(owner)
      return json(null)
    }
    if (path.includes("/rpc/continue_application_for")) {
      expect(body).toEqual({ p_user: owner, p_posting_id: "p-test" })
      return json({ id: "run-1", posting_id: "p-test", status: "needs_input" })
    }
    if (path.includes("/application_runs?")) {
      expect(url.searchParams.get("user_id")).toBe(`eq.${owner}`)
      expect(url.searchParams.get("posting_id")).toBe("eq.p-test")
      return json([{ id: "run-1", posting_id: "p-test", status, message: status === "needs_input" ? "Answer the marked sponsorship question." : "Waiting for your desktop.", expires_at: new Date(Date.now() + (expired ? -60000 : 60000)).toISOString() }])
    }
    throw new Error(`Unexpected fetch: ${path}`)
  }) as typeof fetch
})
afterAll(() => { globalThis.fetch = originalFetch })
async function rpc(method: string, params: object = {}): Promise<any> {
  const response = await handle(new Request(`${env.url}/functions/v1/mcp`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), env)
  return { status: response.status, ...await response.json() }
}
const tool = (name: string, args: object = { job_id: "p-test" }): Promise<any> => rpc("tools/call", { name, arguments: args })
test("Claude discovers the preparation and read-only status tools", async () => {
  const r = await rpc("tools/list")
  expect(r.result.tools.find((t: any) => t.name === "prepare_application").annotations.readOnlyHint).toBe(false)
  expect(r.result.tools.find((t: any) => t.name === "application_status").annotations.readOnlyHint).toBe(true)
  expect(r.result.tools.find((t: any) => t.name === "prepare_application").annotations.openWorldHint).toBe(true)
})
test("Claude starts the extension queue under the verified owner, not a supplied user", async () => {
  const r = await tool("prepare_application", { job_id: "p-test", user_id: "attacker" })
  expect(r.result.structuredContent).toMatchObject({ started: true, submitted: false, run: { status: "queued" } })
})
test("offline desktop does not create a request or claim success", async () => {
  online = false
  const before = calls.filter(c => c.path.includes("rpc/request_application_for")).length
  const r = await tool("prepare_application")
  expect(r.result.structuredContent).toMatchObject({ started: false, desktop_online: false, submitted: false })
  expect(calls.filter(c => c.path.includes("rpc/request_application_for"))).toHaveLength(before)
  online = true
})
test("closed jobs and missing job IDs cannot start preparation", async () => {
  closed = true
  expect((await tool("prepare_application")).result.isError).toBe(true)
  closed = false
  expect((await tool("prepare_application", {})).result.isError).toBe(true)
})
test("status reports questions, readiness and expiry without pretending submission", async () => {
  for (const next of ["queued", "filling", "needs_input", "ready"]) {
    status = next
    const r = (await tool("application_status")).result.structuredContent
    expect(r.run.status).toBe(next)
    expect(r.submitted).toBe(false)
  }
  expired = true
  expect((await tool("application_status")).result.structuredContent.run.status).toBe("failed")
  expired = false
})
test("a revoked connector cannot start the desktop queue", async () => {
  connected = false
  const before = calls.length
  expect((await tool("prepare_application")).status).toBe(401)
  expect(calls.slice(before).some(c => c.path.includes("rpc/request_application_for"))).toBe(false)
  connected = true
})

test("Claude receives pending questions, saves supplied answers and continues the existing run", async () => {
  const result = (await tool("application_status")).result.structuredContent
  expect(result.questions[0].key).toBe("visa job p-test")
  const answer = await tool("answer_application_questions", { job_id: "p-test", answers: { "visa job p-test": "Yes" }, user_id: "attacker" })
  expect(answer.result.structuredContent).toMatchObject({ saved: true, submitted: false })
  expect((await tool("answer_application_questions", { job_id: "p-test", answers: {} })).result.isError).toBe(true)
  const continued = await tool("continue_application")
  expect(continued.result.structuredContent).toMatchObject({ run: { id: "run-1" }, submitted: false })
})
