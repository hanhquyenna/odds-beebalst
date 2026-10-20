import { describe, expect, test } from "bun:test"
import { cleanSight, describeShot, sightEnv } from "../../supabase/functions/_shared/drive-sight"

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
