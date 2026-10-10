import { afterEach, describe, expect, test } from "bun:test"

// supabase.ts throws at import without these, and CI has no .env.local.
process.env.VITE_SUPABASE_URL ??= "http://supabase.test"
process.env.VITE_SUPABASE_ANON_KEY ??= "anon"
const memory = new Map<string, string>()
const g = globalThis as unknown as { window?: unknown; document?: unknown; fetch: typeof fetch }
g.window ??= { localStorage: { getItem: (k: string): string | null => memory.get(k) ?? null, setItem: (k: string, v: string): void => void memory.set(k, v), removeItem: (k: string): void => void memory.delete(k) }, setInterval: (): number => 1, clearInterval: (): void => undefined }
g.document ??= { visibilityState: "visible", addEventListener: (): void => undefined, removeEventListener: (): void => undefined }
const realFetch = g.fetch
const { claimDevicePair } = await import("@/lib/auth")

const answer = (status: number, body: unknown = {}): void => {
  g.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
}

afterEach(() => {
  g.fetch = realFetch
})

describe("a Home Screen app collecting its session after the browser approved", () => {
  test("keeps waiting while the browser has not approved", async () => {
    answer(202, { waiting: true })
    expect(await claimDevicePair("id", "secret")).toBe("waiting")
  })

  test("a network failure, or the server being busy, is not the end of the sign-in: it keeps waiting and asks again", async () => {
    g.fetch = (async () => {
      throw new TypeError("Load failed")
    }) as typeof fetch
    expect(await claimDevicePair("id", "secret")).toBe("waiting")
    answer(503, { error: "Could not sign you in yet." })
    expect(await claimDevicePair("id", "secret")).toBe("waiting")
    answer(500, { error: "boom" })
    expect(await claimDevicePair("id", "secret")).toBe("waiting")
  })

  test("a sign-in that is expired, spent or wrong is over", async () => {
    answer(410, { error: "This sign-in has expired. Start again." })
    expect(await claimDevicePair("id", "secret")).toBeNull()
    answer(403, { error: "Not allowed." })
    expect(await claimDevicePair("id", "secret")).toBeNull()
  })

  test("an answer with no session in it is waited on again, not taken for a sign-in", async () => {
    answer(200, {})
    expect(await claimDevicePair("id", "secret")).toBe("waiting")
  })

  test("the session comes back once approved", async () => {
    answer(200, { access_token: "a", refresh_token: "r", expires_in: 3600, user: { id: "u1", email: "me@x.test" } })
    const got = await claimDevicePair("id", "secret")
    expect(got).not.toBe("waiting")
    expect(got && got !== "waiting" ? got.user.email : null).toBe("me@x.test")
  })
})
