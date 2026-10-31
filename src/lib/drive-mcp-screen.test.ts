import { afterEach, beforeEach, expect, test } from "bun:test"
import { handleDriveMcp } from "../../supabase/functions/mcp/drive"

const RUN = "11111111-2222-3333-4444-555555555555"
const IMAGE = "A".repeat(4000)
const MARKS = [{ id: "b2", label: "Next", x: 600, y: 700, box: [560, 684, 640, 716] }]
const PAGE = { url: "https://jobs.example.org/apply", fields: [{ id: "f0", label: "Country", kind: "combobox", filled: false }], buttons: [{ id: "b2", text: "Next" }] }

type Content = Array<{ type: string; text?: string; data?: string }>
type Command = { tool: string; args?: Record<string, unknown> }

let original: typeof fetch
let deno: unknown
let queued: Command[]
let patched: string[]
/** What the tab answers to each step the server queues, by tool. */
let answers: Record<string, unknown>

beforeEach(() => {
  original = globalThis.fetch
  deno = (globalThis as unknown as { Deno?: unknown }).Deno
  queued = []
  patched = []
  answers = {}
  // Only the drive secret: no sight model.
  Object.assign(globalThis, { Deno: { env: { get: (name: string): string | undefined => (name === "ODDS_DRIVE_SECRET" ? "s" : undefined) } } })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const sent = typeof init?.body === "string" ? init.body : ""
    let body: unknown = []
    if (url.includes("drive_runs?id=eq.") && !init?.method) body = [{ id: RUN, status: "running", steps: 0, expires_at: new Date(Date.now() + 60_000).toISOString() }]
    if (url.endsWith("drive_commands") && init?.method === "POST") {
      const row = JSON.parse(sent) as Command
      if (row.tool !== "guard") queued.push(row)
      body = [{ id: queued.length }]
    }
    const asked = /drive_commands\?id=eq\.(\d+)&select=status,result/.exec(url)
    if (asked) body = [{ status: "done", result: answers[queued[Number(asked[1]) - 1]!.tool] ?? {} }]
    if (url.includes("drive_commands?id=eq.") && init?.method === "PATCH") patched.push(sent)
    return new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = original
  Object.assign(globalThis, { Deno: deno })
})

test("the wait tool is gone: not listed, and refused if called", async () => {
  const tools = ((await mcp("tools/list")) as { tools: Array<{ name: string; inputSchema: { properties: Record<string, unknown> } }> }).tools
  expect(tools.map((t) => t.name)).not.toContain("wait")
  expect(tools.find((t) => t.name === "screenshot")!.inputSchema.properties.region).toBeDefined()
  const res = (await call("wait", { seconds: 3 })) as { isError?: boolean; content: Content }
  expect(res.isError).toBe(true)
  expect(res.content[0]!.text).toBe("Unknown tool wait.")
})

test("a screenshot comes as an image, with its coordinate space and the read_page ids boxed on it as text; the stored row keeps no image", async () => {
  answers.screenshot = { image: IMAGE, mime: "image/jpeg", width: 1280, height: 800, viewportWidth: 1440, viewportHeight: 900, frameX: 0, frameY: 0, frame: "top", marks: MARKS }
  const res = (await call("screenshot", {})) as { content: Content }
  expect(res.content[0]).toEqual({ type: "image", data: IMAGE, mimeType: "image/jpeg" } as never)
  const text = JSON.parse(res.content[1]!.text!) as { width: number; coordinates: string; marks: unknown[] }
  expect(text.width).toBe(1280)
  expect(text.coordinates).toContain("click_at takes these")
  expect(text.marks).toEqual([{ id: "b2", label: "Next", x: 600, y: 700 }])
  expect(patched.some((p) => p.includes(IMAGE))).toBe(false)
})

test("a screen step Broods asks for comes back with the fresh picture; the step was queued asking for it", async () => {
  answers.click_at = { ok: true, clicked: "Country", page: PAGE, screenshot: { image: IMAGE, mime: "image/jpeg", width: 1280, height: 800, marks: MARKS } }
  const res = (await call("click_at", { x: 300, y: 200 })) as { content: Content }
  expect(queued[0]).toMatchObject({ tool: "click_at", args: { x: 300, y: 200, look: true } })
  expect(res.content.map((c) => c.type)).toEqual(["image", "text"])
  const text = res.content[1]!.text!
  expect(text).not.toContain(IMAGE)
  expect((JSON.parse(text) as { screenshot: { marks: unknown[] }; page: unknown }).screenshot.marks).toHaveLength(1)
})

test("read_page and fill never ask for a picture, and a picture riding with read_page (older extensions) is not sent to Broods", async () => {
  answers.read_page = { ...PAGE, screenshot: { image: IMAGE, width: 1280, height: 800 } }
  const res = (await call("read_page", {})) as { content: Content }
  expect(queued[0]!.args).toEqual({})
  expect(res.content.map((c) => c.type)).toEqual(["text"])
  expect(res.content[0]!.text).not.toContain(IMAGE)
})

test("a step that went wrong comes back with the picture the server took to look at it", async () => {
  answers.fill = { results: [{ id: "f0", ok: false, error: "not kept" }], page: PAGE }
  answers.scroll = { ok: true, scrollY: 0 }
  answers.screenshot = { image: IMAGE, mime: "image/jpeg", width: 1280, height: 800, marks: MARKS }
  const res = (await call("fill", { fields: [{ id: "f0", value: "Netherlands" }] })) as { content: Content }
  expect(queued.map((c) => c.tool)).toContain("screenshot")
  expect(queued.find((c) => c.tool === "scroll")?.args).not.toHaveProperty("look")
  expect(res.content[0]).toMatchObject({ type: "image", data: IMAGE })
  expect((JSON.parse(res.content[1]!.text!) as { vision: string }).vision).toContain("a fill did not take")
})

/** One tools/call to the browser MCP, answered as Broods gets it. */
async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  return mcp("tools/call", { name: name, arguments: { run_id: RUN, ...args } })
}

async function mcp(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const req = new Request("https://test.invalid/browser", { method: "POST", headers: { "x-odds-drive-key": "s" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params }) })
  const json = (await (await handleDriveMcp(req, { url: "https://test.invalid", serviceKey: "k" })).json()) as { result: unknown }

  return json.result
}
