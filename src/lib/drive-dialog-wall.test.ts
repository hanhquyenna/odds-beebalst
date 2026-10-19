import { expect, test } from "bun:test"
import { handleDriveMcp } from "../../supabase/functions/mcp/drive"

const id = "11111111-2222-3333-4444-555555555555"

/** Runs one read_page through the drive MCP and says whether the server ended the run (a PATCH to needs_you / account). */
async function readPage(page: Record<string, unknown>, wallTriedBefore = false): Promise<{ ended: boolean; text: string }> {
  const original = globalThis.fetch
  const deno = (globalThis as unknown as { Deno?: unknown }).Deno
  let ended = false
  Object.assign(globalThis, { Deno: { env: { get: () => "test-secret" } } })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    let result: unknown = []
    if (url.includes("drive_runs?") && !init?.method) result = [{ id, status: "running", steps: 5, url: "https://careers.example.org/job", expires_at: new Date(Date.now() + 60000).toISOString() }]
    if (url.endsWith("drive_commands") && init?.method === "POST") result = [{ id: 7 }]
    if (url.includes("drive_commands?id=eq.7") && !init?.method) result = [{ status: "done", result: page }]
    if (url.includes("returned=eq.sign_in_wall") && !init?.method) result = wallTriedBefore ? [{ id: 3 }] : []
    if (url.includes("drive_runs?id=eq.") && init?.method === "PATCH" && String(init.body).includes("needs_you")) ended = true
    return new Response(JSON.stringify(result), { status: 200 })
  }) as typeof fetch
  try {
    const res = await handleDriveMcp(new Request("https://test.invalid/drive", { method: "POST", headers: { "x-odds-drive-key": "test-secret" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_page", arguments: { run_id: id } } }) }), { url: "https://test.invalid", serviceKey: "test-key" })
    const json = await res.json() as { result: { content: Array<{ text: string }> } }
    return { ended, text: json.result.content[0].text }
  } finally {
    globalThis.fetch = original
    Object.assign(globalThis, { Deno: deno })
  }
}

const base = { url: "https://careers.example.org/job", title: "Career Opportunities", headings: ["Questions", "Data Privacy Consent Statement"], errors: [], captcha: false, password_field: true, fields: [], buttons: [{ id: "b0", text: "Accept" }, { id: "b1", text: "Decline" }] }

test("a dialog open over a form with a password box is not a sign-in wall: the run goes on and the model is told about the dialog", async () => {
  const out = await readPage({ ...base, dialog: { title: "Data Privacy Consent Statement", text: "Yamaha Motor Privacy Statement" } })
  expect(out.ended).toBe(false)
  expect(out.text).toContain("Data Privacy Consent Statement")
})

test("the first sign-in wall in a run is Broods' to try: the run goes on and the result says how", async () => {
  const out = await readPage(base)
  expect(out.ended).toBe(false)
  expect(out.text).toContain("sign_in_wall")
  expect(out.text).toContain("Create account")
})

test("a second sign-in wall in the same run (a password box and nothing to fill) is the person's", async () => {
  const out = await readPage(base, true)
  expect(out.ended).toBe(true)
})

test("the same button pressed three times with the page unchanged is refused with a plain reason, a different button is not", async () => {
  const original = globalThis.fetch
  const deno = (globalThis as unknown as { Deno?: unknown }).Deno
  const posted: string[] = []
  Object.assign(globalThis, { Deno: { env: { get: () => "test-secret" } } })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    let result: unknown = []
    if (url.includes("drive_runs?") && !init?.method) result = [{ id, status: "running", steps: 5, url: "https://careers.example.org/job", expires_at: new Date(Date.now() + 60000).toISOString() }]
    if (url.includes("tool=eq.click") && !init?.method) result = [{ args: { id: "b3" }, status: "done" }, { args: { id: "b3" }, status: "done" }, { args: { id: "b3" }, status: "done" }]
    if (url.endsWith("drive_commands") && init?.method === "POST") { posted.push(String(init.body)); result = [{ id: 9 }] }
    if (url.includes("drive_commands?id=eq.9") && !init?.method) result = [{ status: "done", result: { ok: true, page: { url: "https://careers.example.org/job", fields: [{ id: "f0" }], buttons: [] } } }]
    return new Response(JSON.stringify(result), { status: 200 })
  }) as typeof fetch
  const click = async (button: string): Promise<string> => {
    const res = await handleDriveMcp(new Request("https://test.invalid/drive", { method: "POST", headers: { "x-odds-drive-key": "test-secret" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "click", arguments: { run_id: id, id: button } } }) }), { url: "https://test.invalid", serviceKey: "test-key" })
    return ((await res.json()) as { result: { content: Array<{ text: string }> } }).result.content[0].text
  }
  try {
    expect(await click("b3")).toContain("3 times")
    expect(posted.length).toBe(0)
    expect(await click("b4")).not.toContain("3 times")
    expect(posted.length).toBe(1)
  } finally {
    globalThis.fetch = original
    Object.assign(globalThis, { Deno: deno })
  }
})

test("finishing 'requires signing in' on a register form that also holds the application is sent back once, with the reason", async () => {
  const original = globalThis.fetch
  const deno = (globalThis as unknown as { Deno?: unknown }).Deno
  let guardSeen = false
  Object.assign(globalThis, { Deno: { env: { get: () => "test-secret" } } })
  const page = { url: "https://career5.successfactors.eu/careers", title: "Career Opportunities", headings: ["Questions"], errors: [], captcha: false, password_field: true, buttons: [{ id: "b0", text: "Apply" }],
    fields: ["Email", "First Name", "Last Name", "Cell Phone", "Country"].map((label, i) => ({ id: `f${i}`, label, kind: "text", filled: true })) }
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    let result: unknown = []
    if (url.includes("drive_runs?") && !init?.method) result = [{ id, status: "running", steps: 6, url: page.url, expires_at: new Date(Date.now() + 60000).toISOString() }]
    if (url.includes("tool=eq.guard") && !init?.method) result = guardSeen ? [{ id: 1 }] : []
    if (url.endsWith("drive_commands") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { tool: string }
      if (body.tool === "guard") guardSeen = true
      result = [{ id: 11 }]
    }
    if (url.includes("drive_commands?id=eq.11") && !init?.method) result = [{ status: "done", result: page }]
    return new Response(JSON.stringify(result), { status: 200 })
  }) as typeof fetch
  const finish = async (): Promise<string> => {
    const res = await handleDriveMcp(new Request("https://test.invalid/drive", { method: "POST", headers: { "x-odds-drive-key": "test-secret" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "finish", arguments: { run_id: id, stage: "stuck", reason: "other", message: "This application requires signing in before I can continue." } } }) }), { url: "https://test.invalid", serviceKey: "test-key" })
    return ((await res.json()) as { result: { content: Array<{ text: string }> } }).result.content[0].text
  }
  try {
    expect(await finish()).toContain("register form")
    // Sent back once: the second time the finish stands.
    expect(await finish()).not.toContain("register form")
  } finally {
    globalThis.fetch = original
    Object.assign(globalThis, { Deno: deno })
  }
})

test("a click that moves to another page returns that page's screenshot as an image, never as base64 text in the page JSON", async () => {
  const original = globalThis.fetch
  const deno = (globalThis as unknown as { Deno?: unknown }).Deno
  const bigImage = "QUJD".repeat(30_000) // ~120 KB of base64
  Object.assign(globalThis, { Deno: { env: { get: () => "test-secret" } } })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    let result: unknown = []
    if (url.includes("drive_runs?") && !init?.method) result = [{ id, status: "running", steps: 3, url: "https://careers.example.org/job", expires_at: new Date(Date.now() + 60000).toISOString() }]
    if (url.includes("tool=eq.click") && !init?.method) result = []
    if (url.endsWith("drive_commands") && init?.method === "POST") result = [{ id: String(init.body).includes("read_page") ? 22 : 21 }]
    if (url.includes("drive_commands?id=eq.21") && !init?.method) result = [{ status: "done", result: { ok: true, page_pending: true } }]
    if (url.includes("drive_commands?id=eq.22") && !init?.method) result = [{ status: "done", result: { url: "https://careers.example.org/apply", fields: [{ id: "f0", label: "Email", kind: "text", filled: true }], buttons: [], screenshot: { image: bigImage, width: 1000, height: 700 } } }]
    return new Response(JSON.stringify(result), { status: 200 })
  }) as typeof fetch
  try {
    const res = await handleDriveMcp(new Request("https://test.invalid/drive", { method: "POST", headers: { "x-odds-drive-key": "test-secret" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "click", arguments: { run_id: id, id: "b0" } } }) }), { url: "https://test.invalid", serviceKey: "test-key" })
    const json = await res.json() as { result: { content: Array<{ type: string; text?: string; data?: string }> } }
    const text = json.result.content.find((c) => c.type === "text")?.text ?? ""
    expect(text).not.toContain("QUJDQUJD")
    expect(text.length).toBeLessThan(3000)
    expect(json.result.content.some((c) => c.type === "image" && (c.data ?? "").length > 100_000)).toBe(true)
  } finally {
    globalThis.fetch = original
    Object.assign(globalThis, { Deno: deno })
  }
})

test("review is refused when the run tried to attach the CV and it never went in, whatever the page calls the box", async () => {
  const { cvNeverAttached } = await import("../../supabase/functions/mcp/drive")
  expect(cvNeverAttached([{ result: { ok: false, value: "", file_name: "" } }])).toBe(true)
  expect(cvNeverAttached([{ result: { ok: false } }, { result: { ok: true, file_name: "CV.pdf" } }])).toBe(false)
  expect(cvNeverAttached([{ result: { ok: false, cv_attached: true } }])).toBe(false)
  expect(cvNeverAttached([])).toBe(false)
})
