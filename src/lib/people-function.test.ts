/** The real /jobs/people handler against a fake Supabase: only Google accounts see people, never a free guest account. */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"

let caller: Record<string, unknown> | null
let people: (req: Request) => Promise<Response>
const realFetch = globalThis.fetch

beforeEach(async () => {
  caller = null
  ;(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" })[k] } }
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status: status, headers: { "Content-Type": "application/json" } })
    if (url.includes("/auth/v1/user")) return caller ? json(caller) : json({}, 401)
    if (url.includes("/rest/v1/job_people?")) return json([{ name: "Ann", profile_url: "https://www.linkedin.com/in/ann" }])
    if (url.includes("/rest/v1/job_people_runs?")) return json([{ found: 1 }])
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch
  people = (await import("../../supabase/functions/jobs/people.ts")).people
})
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Asks for the people at one employer as the current `caller`. */
async function ask(): Promise<Response> {
  return people(new Request("https://x/functions/v1/jobs/people", { method: "POST", headers: { Authorization: "Bearer jwt" }, body: JSON.stringify({ employer: "acme" }) }))
}

describe("jobs/people", () => {
  test("a Google account sees the stored people", async () => {
    caller = { id: "u1", email: "ann@gmail.com", user_metadata: {} }
    const res = await ask()
    expect(res.status).toBe(200)
    expect(((await res.json()) as { people: unknown[] }).people).toHaveLength(1)
  })
  test("a guest account is refused, by its address or by its flag", async () => {
    caller = { id: "u2", email: "guest-1@guest.odds.invalid" }
    expect((await ask()).status).toBe(403)
    caller = { id: "u3", email: "x@example.com", user_metadata: { guest: true } }
    expect((await ask()).status).toBe(403)
  })
  test("no sign-in is refused", async () => {
    expect((await ask()).status).toBe(401)
  })
})
