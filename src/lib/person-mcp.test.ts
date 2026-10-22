import { expect, test } from "bun:test"
import { handlePersonMcp } from "../../supabase/functions/mcp/person"

const RUN = "11111111-2222-3333-4444-555555555555"
const TOOLS = [{ name: "my_profile", inputSchema: { type: "object", properties: {} }, write: false }, { name: "my_jobs", inputSchema: { type: "object", properties: {} }, write: false }]

/** Calls one odds-person tool with the drive secret, the run row the fake database holds, and a recorder for whose data was read. */
async function callPerson(run: Record<string, unknown> | null, name: string, args: Record<string, unknown>): Promise<{ result: { content: Array<{ text: string }>; isError?: boolean }; readFor: string[] }> {
  const original = globalThis.fetch
  const deno = (globalThis as unknown as { Deno?: unknown }).Deno
  const readFor: string[] = []
  Object.assign(globalThis, { Deno: { env: { get: () => "test-secret" } } })
  globalThis.fetch = (async () => new Response(JSON.stringify(run ? [run] : []), { status: 200 })) as unknown as typeof fetch
  try {
    const req = new Request("https://test.invalid/person", { method: "POST", headers: { "x-odds-drive-key": "test-secret" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) })
    const res = await handlePersonMcp(req, { url: "https://test.invalid", serviceKey: "k" }, TOOLS, async (userId) => {
      readFor.push(userId)
      return { content: [{ type: "text", text: `profile of ${userId}` }] }
    })
    const json = (await res.json()) as { result: { content: Array<{ text: string }>; isError?: boolean } }

    return { result: json.result, readFor: readFor }
  } finally {
    globalThis.fetch = original
    Object.assign(globalThis, { Deno: deno })
  }
}

const running = { id: RUN, user_id: "user-a", status: "running", expires_at: new Date(Date.now() + 60_000).toISOString() }

test("odds-person reads only the person who owns the run, whatever user the model names", async () => {
  const { result, readFor } = await callPerson(running, "my_profile", { run_id: RUN, user_id: "user-b" })
  expect(readFor).toEqual(["user-a"])
  expect(result.content[0].text).toBe("profile of user-a")
})

test("odds-person reads nothing for a run that is not running", async () => {
  for (const run of [{ ...running, status: "review" }, { ...running, expires_at: new Date(Date.now() - 1000).toISOString() }, null]) {
    const { result, readFor } = await callPerson(run, "my_profile", { run_id: RUN })
    expect(result.isError).toBe(true)
    expect(readFor).toEqual([])
  }
})

test("odds-person serves only its own tools", async () => {
  const { result, readFor } = await callPerson(running, "my_jobs", { run_id: RUN })
  expect(result.isError).toBe(true)
  expect(readFor).toEqual([])
})
