/**
 * Runs the deployed Edge Function's own code (supabase/functions/profile/import.ts) on this machine, with the real
 * Apify actor and your real token, but with the Supabase sign-in check and the import counter replaced by stand-ins.
 * It tests everything except a real login: the link check, the call to Apify, the mapping, the answer the page receives.
 *   APIFY_TOKEN=... bun scripts/test-import-function.ts https://www.linkedin.com/in/your-name
 */
const token = process.env.APIFY_TOKEN
const link = process.argv[2] ?? ""
if (!token || !link) {
  console.error("Usage: APIFY_TOKEN=... bun scripts/test-import-function.ts https://www.linkedin.com/in/your-name")
  process.exit(2)
}

const env: Record<string, string> = { SUPABASE_URL: "https://stub.supabase.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", APIFY_TOKEN: token }
;(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => env[k] } }

const realFetch = globalThis.fetch
const calls: string[] = []
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.startsWith(env.SUPABASE_URL)) {
    calls.push(`${init?.method ?? "GET"} ${url.replace(env.SUPABASE_URL, "")}`)
    if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }), { status: 200 })
    if (url.includes("linkedin_imports") && (init?.method ?? "GET") === "GET") return new Response("[]", { status: 200, headers: { "content-range": "*/0" } })
    return new Response(null, { status: 201 })
  }
  return realFetch(input, init)
}) as typeof fetch

const { importProfile } = await import("../supabase/functions/profile/import.ts")
const ask = (body: unknown, auth = "Bearer test-jwt"): Promise<Response> =>
  importProfile(new Request("https://stub/functions/v1/profile/import", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) }))

console.log("1. a link that is not a LinkedIn profile ->", (await ask({ url: "https://example.com/in/x" })).status, "(expect 422)")
const res = await ask({ url: link })
const body = (await res.json()) as { profile?: Record<string, unknown>; error?: string }
console.log("2. your profile ->", res.status)
if (!body.profile) {
  console.log(body)
  process.exit(1)
}
const p = body.profile as { name: string; headline: string; place: string; positions: Array<Record<string, string>>; education: Array<Record<string, string>>; skills: Array<{ Name: string }>; languages: unknown[]; cv: string }
console.log(`   ${p.name} · ${p.headline} · ${p.place}`)
console.log(`   ${p.positions.length} roles, ${p.education.length} education, ${p.skills.length} skills, ${p.languages.length} languages, extra text ${p.cv.length} characters`)
for (const r of p.positions) console.log(`   - ${r["Started On"]} to ${r["Finished On"] || "now"}  ${r.Title} @ ${r["Company Name"]}`)
for (const e of p.education) console.log(`   - ${e["Start Date"]} to ${e["End Date"]}  ${e["School Name"]}: ${e["Degree Name"]}`)
console.log("   skills:", p.skills.map((s) => s.Name).join(", "))
console.log("   calls the function made to Supabase:", calls.join(" | "))
