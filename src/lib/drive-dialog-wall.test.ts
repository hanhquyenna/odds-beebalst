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
    if (url.includes("drive_runs?id=eq.") && init?.method === "PATCH" && (typeof init.body === "string" ? init.body : "").includes("needs_you")) ended = true
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
    if (url.endsWith("drive_commands") && init?.method === "POST") { posted.push((typeof init.body === "string" ? init.body : "")); result = [{ id: 9 }] }
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
    // The click itself; the new page's look (a screenshot step and its guard row) rides beside it.
    expect(posted.filter((b) => JSON.parse(b).tool === "click").length).toBe(1)
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
      const body = JSON.parse((typeof init.body === "string" ? init.body : "")) as { tool: string }
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

test("a click that moves to another page returns what its screenshot shows as text: never the image, never base64 in the page JSON", async () => {
  const original = globalThis.fetch
  const deno = (globalThis as unknown as { Deno?: unknown }).Deno
  const bigImage = "QUJD".repeat(30_000) // ~120 KB of base64
  let sightCalls = 0
  Object.assign(globalThis, { Deno: { env: { get: (name: string) => (name === "ODDS_SERVER_VISION" ? "1" : "test-secret") } } })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    let result: unknown = []
    if (url.includes("drive_runs?") && !init?.method) result = [{ id, status: "running", steps: 3, url: "https://careers.example.org/job", expires_at: new Date(Date.now() + 60000).toISOString() }]
    if (url.includes("tool=eq.click") && !init?.method) result = []
    if (url.endsWith("drive_commands") && init?.method === "POST") result = [{ id: (typeof init.body === "string" ? init.body : "").includes("read_page") ? 22 : 21 }]
    if (url.includes("drive_commands?id=eq.21") && !init?.method) result = [{ status: "done", result: { ok: true, page_pending: true } }]
    if (url.includes("drive_commands?id=eq.22") && !init?.method) result = [{ status: "done", result: { url: "https://careers.example.org/apply", fields: [{ id: "f0", label: "Email", kind: "text", filled: true }], buttons: [], screenshot: { image: bigImage, width: 1000, height: 700 } } }]
    if (url.endsWith("/chat/completions")) { sightCalls++; result = { choices: [{ message: { content: "BUTTONS: Next at the bottom" } }] } }
    return new Response(JSON.stringify(result), { status: 200 })
  }) as typeof fetch
  try {
    const res = await handleDriveMcp(new Request("https://test.invalid/drive", { method: "POST", headers: { "x-odds-drive-key": "test-secret" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "click", arguments: { run_id: id, id: "b0" } } }) }), { url: "https://test.invalid", serviceKey: "test-key" })
    const json = await res.json() as { result: { content: Array<{ type: string; text?: string; data?: string }> } }
    const text = json.result.content.find((c) => c.type === "text")?.text ?? ""
    expect(text).not.toContain("QUJDQUJD")
    expect(text.length).toBeLessThan(3000)
    expect(json.result.content.some((c) => c.type === "image")).toBe(false)
    expect(text).toContain("BUTTONS: Next at the bottom")
    expect(sightCalls).toBe(1)
  } finally {
    globalThis.fetch = original
    Object.assign(globalThis, { Deno: deno })
  }
})

test("a new page without a picture gets one look: the server takes the screenshot itself, and the same page is not looked at again", async () => {
  const original = globalThis.fetch
  const deno = (globalThis as unknown as { Deno?: unknown }).Deno
  const shot = "QUJD".repeat(30_000)
  let sightCalls = 0, shots = 0
  const guards: Array<Record<string, unknown>> = []
  let nextId = 30
  const tools = new Map<number, string>()
  Object.assign(globalThis, { Deno: { env: { get: (name: string) => (name === "ODDS_SERVER_VISION" ? "1" : "test-secret") } } })
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    let result: unknown = []
    if (url.includes("drive_runs?") && !init?.method) result = [{ id, status: "running", steps: 2, url: "https://job-boards.greenhouse.io/acme/jobs/1", expires_at: new Date(Date.now() + 60000).toISOString() }]
    if (url.includes("tool=eq.guard") && !init?.method) result = guards.map((g) => ({ result: g }))
    if (url.endsWith("drive_commands") && init?.method === "POST") {
      const body = JSON.parse(init.body as string) as { tool: string; result?: Record<string, unknown> }
      if (body.tool === "guard") { if (body.result?.returned === "sight") guards.push(body.result) }
      else { const cid = nextId++; tools.set(cid, body.tool); if (body.tool === "screenshot") shots++; result = [{ id: cid }] }
    }
    const m = /drive_commands\?id=eq\.(\d+)&select/.exec(url)
    if (m && !init?.method) {
      const tool = tools.get(Number(m[1]))
      result = tool === "screenshot" ? [{ status: "done", result: { image: shot } }]
        : [{ status: "done", result: { url: "https://job-boards.greenhouse.io/acme/jobs/1", title: "Job Application for Analyst at Acme", fields: [{ id: "f0", label: "First Name", kind: "text", filled: false }], buttons: [] } }]
    }
    if (url.endsWith("/chat/completions")) { sightCalls++; result = { choices: [{ message: { content: "FORM: First Name, empty" } }] } }
    return new Response(JSON.stringify(result), { status: 200 })
  }) as typeof fetch
  const read = async (): Promise<string> => {
    const res = await handleDriveMcp(new Request("https://test.invalid/drive", { method: "POST", headers: { "x-odds-drive-key": "test-secret" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read_page", arguments: { run_id: id } } }) }), { url: "https://test.invalid", serviceKey: "test-key" })
    return ((await res.json()) as { result: { content: Array<{ text: string }> } }).result.content[0].text
  }
  try {
    expect(await read()).toContain("FORM: First Name, empty")
    expect(shots).toBe(1)
    expect(sightCalls).toBe(1)
    expect(await read()).not.toContain("FORM: First Name, empty")
    expect(shots).toBe(1)
    expect(sightCalls).toBe(1)
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

test("stopping a run (an extension reload stops every run it remembers) keeps the outcome of one that already ended", async () => {
  const { driveExt } = await import("../../supabase/functions/mcp/drive")
  const stop = async (status: string): Promise<string[]> => {
    const original = globalThis.fetch
    const deno = (globalThis as unknown as { Deno?: unknown }).Deno
    const patches: string[] = []
    Object.assign(globalThis, { Deno: { env: { get: () => "" } } })
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      let result: unknown = []
      if (url.includes("drive_runs?") && !init?.method) result = [{ id, user_id: "u1", status, steps: 4, url: "https://careers.example.org/job", expires_at: new Date(Date.now() + 60000).toISOString() }]
      if (url.includes("drive_runs?") && init?.method === "PATCH") patches.push(typeof init.body === "string" ? init.body : "")
      return new Response(JSON.stringify(result), { status: 200 })
    }) as typeof fetch
    try {
      const req = new Request("https://test.invalid/ext/drive-stop", { method: "POST", body: JSON.stringify({ run_id: id, message: "The Odds extension was updated while applying." }) })
      await driveExt("drive-stop", req, { url: "https://test.invalid", serviceKey: "k" }, "u1", { facts: async () => ({}), job: async () => null })
    } finally {
      globalThis.fetch = original
      Object.assign(globalThis, { Deno: deno })
    }
    return patches
  }
  for (const ended of ["needs_you", "stuck", "review"]) {
    const patches = await stop(ended)
    expect(patches.length).toBe(1)
    expect(patches[0]).not.toContain("\"status\"")
  }
  const running = await stop("running")
  expect(running.some((p) => p.includes("\"status\":\"stopped\""))).toBe(true)
})

test("'stuck' only because no Next / Submit is visible becomes review when nothing required is empty (SmartRecruiters)", async () => {
  const finish = async (page: Record<string, unknown>): Promise<string[]> => {
    const original = globalThis.fetch
    const deno = (globalThis as unknown as { Deno?: unknown }).Deno
    const patches: string[] = []
    Object.assign(globalThis, { Deno: { env: { get: () => "test-secret" } } })
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      let result: unknown = []
      if (url.includes("drive_runs?") && !init?.method) result = [{ id, user_id: "u1", status: "running", steps: 13, url: "https://jobs.smartrecruiters.com/Boskalis/1", expires_at: new Date(Date.now() + 60000).toISOString() }]
      if (url.endsWith("drive_commands") && init?.method === "POST") result = [{ id: 7 }]
      if (url.includes("drive_commands?id=eq.7") && !init?.method) result = [{ status: "done", result: page }]
      if (url.includes("drive_runs?id=eq.") && init?.method === "PATCH") patches.push(typeof init.body === "string" ? init.body : "")
      return new Response(JSON.stringify(result), { status: 200 })
    }) as typeof fetch
    try {
      await handleDriveMcp(new Request("https://test.invalid/drive", { method: "POST", headers: { "x-odds-drive-key": "test-secret" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "finish", arguments: { run_id: id, stage: "stuck", reason: "other", message: "Your details, CV and motivation are filled, but the browser exposes no Next, Review or Submit control, so I cannot advance." } } }) }), { url: "https://test.invalid", serviceKey: "test-key" })
    } finally {
      globalThis.fetch = original
      Object.assign(globalThis, { Deno: deno })
    }
    return patches
  }
  const done = await finish({ url: "https://jobs.smartrecruiters.com/Boskalis/1", fields: [{ id: "f2", label: "First name", kind: "text", required: true, filled: true }, { id: "f6", label: "City", kind: "combobox", required: true, filled: true }], buttons: [] })
  expect(done.some((p) => p.includes("\"status\":\"review\""))).toBe(true)
  const empty = await finish({ url: "https://jobs.smartrecruiters.com/Boskalis/1", fields: [{ id: "f6", label: "City", kind: "combobox", required: true, filled: false }], buttons: [] })
  expect(empty.some((p) => p.includes("\"status\":\"review\""))).toBe(false)
})
