import { beforeEach, describe, expect, test } from "bun:test"
import type { Session } from "@/lib/auth"

const STORE = "careersim.session"
const nowSec = (): number => Math.floor(Date.now() / 1000)

let calls = 0
let release: () => void = () => undefined
const store = new Map<string, string>()

// supabase.ts throws at import without these, and CI has no .env.local.
process.env.VITE_SUPABASE_URL ??= "http://supabase.test"
process.env.VITE_SUPABASE_ANON_KEY ??= "anon"
Object.assign(globalThis, {
  window: {
    localStorage: { getItem: (k: string): string | null => store.get(k) ?? null, setItem: (k: string, v: string): void => void store.set(k, v), removeItem: (k: string): void => void store.delete(k) },
    setInterval: (): number => 1,
    clearInterval: (): void => undefined,
  },
  document: { visibilityState: "visible", addEventListener: (): void => undefined, removeEventListener: (): void => undefined },
  fetch: async (): Promise<Response> => {
    calls += 1
    await new Promise<void>((resolve) => {
      release = resolve
    })

    return new Response(JSON.stringify({ access_token: "new", refresh_token: "r2", expires_in: 3600, user: { id: "u1", email: "a@b.c" } }))
  },
})
const { keepSessionFresh, signOut } = await import("@/lib/auth")

/** Stores a session expiring `inSec` seconds from now, the way auth.ts persists it. */
function storeSession(inSec: number): void {
  const session: Session = { access_token: "old", refresh_token: "r1", expires_at: nowSec() + inSec, user: { id: "u1", email: "a@b.c" } }
  store.set(STORE, JSON.stringify(session))
}

/** Lets the pending fetch answer, then waits for the refresh chain to settle. */
async function settle(): Promise<void> {
  release()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("keepSessionFresh", () => {
  beforeEach(() => {
    calls = 0
    store.clear()
  })

  test("leaves a token with time left alone", () => {
    storeSession(3000)
    keepSessionFresh(() => undefined)()
    expect(calls).toBe(0)
  })

  test("takes a token another tab already refreshed", () => {
    store.set(STORE, JSON.stringify({ access_token: "from-other-tab", refresh_token: "r9", expires_at: nowSec() + 3000, user: { id: "u1", email: "a@b.c" } }))
    const seen: Session[] = []
    keepSessionFresh((s) => seen.push(s))()
    expect(calls).toBe(0)
    expect(seen[0]?.access_token).toBe("from-other-tab")
  })

  test("refreshes a token about to expire and hands the new session over", async () => {
    storeSession(30)
    const seen: Session[] = []
    const stop = keepSessionFresh((s) => seen.push(s))
    await settle()
    stop()
    expect(calls).toBe(1)
    expect(seen[0]?.access_token).toBe("new")
    expect((JSON.parse(store.get(STORE) ?? "{}") as Session).refresh_token).toBe("r2")
  })

  test("a sign-out during the refresh stays signed out", async () => {
    storeSession(30)
    const seen: Session[] = []
    const stop = keepSessionFresh((s) => seen.push(s))
    signOut()
    await settle()
    stop()
    expect(seen).toHaveLength(0)
    expect(store.has(STORE)).toBe(false)
  })
})
