import { describe, expect, test } from "bun:test"
import { cleanSight, describeShot, fewerFields, sightEnv, sightKey } from "../../supabase/functions/_shared/drive-sight"

describe("sight: the server describes the screenshot Broods cannot see", () => {
  const env = { baseUrl: "https://router.test/v1", apiKey: "k", model: "cx/gpt-6-luna" }

  test("the description never carries an e-mail or phone number, and stays short", () => {
    const out = cleanSight("OPEN: none\nERRORS: Email kien@example.com is invalid\nODD: phone +31 6 1234 5678 shown\n4\n5\n6\n7\n8\n9")
    expect(out).not.toContain("kien@example.com")
    expect(out).not.toContain("1234 5678")
    expect(out.split("\n").length).toBe(8)
  })

  test("the screenshot goes to the model as an ordinary image message and its answer comes back", async () => {
    let sent: { messages?: Array<{ role: string; content: unknown }> } = {}
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(typeof init?.body === "string" ? init.body : "{}")
      return new Response(JSON.stringify({ choices: [{ message: { content: "BUTTONS: Submit application at the bottom (blocked for you)" } }] }), { status: 200 })
    }) as typeof fetch
    const out = await describeShot(env, "A".repeat(20_000), 5000, fetcher)
    expect(out).toBe("BUTTONS: Submit application at the bottom (blocked for you)")
    const user = sent.messages?.find((m) => m.role === "user")?.content as Array<{ type: string; image_url?: { url: string } }>
    expect(user.find((p) => p.type === "image_url")?.image_url?.url).toBe(`data:image/jpeg;base64,${"A".repeat(20_000)}`)
  })

  test("off, failing or slow sight returns nothing and never holds a run up", async () => {
    expect(await describeShot(null, "QUJD")).toBe("")
    expect(await describeShot(env, "A".repeat(20_000), 5000, (async () => new Response("no", { status: 500 })) as typeof fetch)).toBe("")
    expect(await describeShot(env, "A".repeat(5_300), 5000, (async () => new Response(JSON.stringify({ choices: [{ message: { content: "blank page" } }] }))) as typeof fetch)).toBe("")
    expect(await describeShot(env, "A".repeat(20_000), 50, ((_u: unknown, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("timeout"))))) as typeof fetch)).toBe("")
    expect(sightEnv(() => undefined)).toBeNull()
  })
})

describe("one look per page", () => {
  test("a page is the address without its fragment, plus the title", () => {
    expect(sightKey({ url: "https://a.example/apply#step2", title: "Apply" })).toBe(sightKey({ url: "https://a.example/apply", title: "Apply" }))
    expect(sightKey({ url: "https://a.example/apply", title: "Step 2" })).not.toBe(sightKey({ url: "https://a.example/apply", title: "Step 1" }))
    expect(sightKey(null)).toBe("")
  })
  test("far fewer fields on the same page is trouble; a page that never had fields is not", () => {
    const f = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i}` }))
    expect(fewerFields({ url: "https://a.example/x", fields: f(1) }, { url: "https://a.example/x", fields: f(6) })).toBe(true)
    expect(fewerFields({ url: "https://a.example/x", fields: f(4) }, { url: "https://a.example/x", fields: f(6) })).toBe(false)
    expect(fewerFields({ url: "https://a.example/y", fields: f(0) }, { url: "https://a.example/x", fields: f(6) })).toBe(false)
    expect(fewerFields({ url: "https://a.example/x", fields: f(0) }, { url: "https://a.example/x", fields: f(2) })).toBe(false)
  })
  test("a look taken because something went wrong asks the sight model to explain it first", async () => {
    let sent = ""
    const fetcher = (async (_u: unknown, init?: RequestInit) => { sent = typeof init?.body === "string" ? init.body : ""; return new Response(JSON.stringify({ choices: [{ message: { content: "ERRORS: Phone is required" } }] })) }) as typeof fetch
    const out = await describeShot({ baseUrl: "https://r.example/v1", apiKey: "k", model: "m" }, "A".repeat(20_000), 5000, fetcher, ["a fill did not take (1 field)"])
    expect(out).toBe("ERRORS: Phone is required")
    expect(sent).toContain("taken because a fill did not take (1 field)")
  })
})

test("sight asks 9router for one JSON answer (a cc/ Claude model streams unless told not to) and defaults to Sonnet 5", async () => {
  let body: Record<string, unknown> = {}
  const fetcher = (async (_u: unknown, init?: RequestInit) => { body = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<string, unknown>; return new Response(JSON.stringify({ choices: [{ message: { content: "OPEN: none" } }] })) }) as typeof fetch
  expect(await describeShot({ baseUrl: "https://r.example/v1", apiKey: "k", model: "cc/claude-sonnet-5" }, "A".repeat(20_000), 5000, fetcher)).toBe("OPEN: none")
  expect(body.stream).toBe(false)
  const vars: Record<string, string> = { NINE_ROUTER_BASE_URL: "https://r.example/v1", NINE_ROUTER_API_KEY: "k" }
  expect(sightEnv((n) => vars[n])?.model).toBe("cc/claude-sonnet-5")
  expect(sightEnv((n) => ({ ...vars, ODDS_SIGHT_MODEL: "cx/gpt-6-luna" } as Record<string, string>)[n])?.model).toBe("cx/gpt-6-luna")
})
