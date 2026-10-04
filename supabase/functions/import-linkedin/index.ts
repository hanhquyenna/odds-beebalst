// Supabase Edge Function: import a LinkedIn profile into the odds profile.
// The browser sends { url } with the signed-in user's JWT. The Apify token lives only here, as a secret.
// Deploy:  supabase functions deploy import-linkedin --project-ref ukpmpyfcnbhngkgbnkxi
// Secrets: supabase secrets set APIFY_TOKEN=... --project-ref ukpmpyfcnbhngkgbnkxi   (never commit the value)

import { isUsable, normaliseProfile, type Json } from "../_shared/linkedin-profile.ts"

const APIFY_ACTOR = "harvestapi~linkedin-profile-scraper"
// Cost guard for the paid scraper ($4 per 1,000 profiles, so $0.004 each). The limits can be changed without a deploy, by setting the
// secrets DAILY_LIMIT (signed in), ANON_LIMIT (not signed in) and GLOBAL_LIMIT (everyone together), each per 24 hours.
const limit = (name: string, fallback: number): number => {
  const n = Number(Deno.env.get(name))
  return Number.isFinite(n) && n > 0 ? n : fallback
}
const DAILY_LIMIT = limit("DAILY_LIMIT", 20)
const ANON_LIMIT = limit("ANON_LIMIT", 10)
const GLOBAL_LIMIT = limit("GLOBAL_LIMIT", 300)
const URL_RE = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9%_-]{3,100}\/?(\?.*)?$/

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}
const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

/** The profile picture as a data URL. Only LinkedIn's own image servers, only a picture, and not a large one. */
async function fetchPhoto(address: string): Promise<string | null> {
  try {
    const u = new URL(address)
    if (u.protocol !== "https:" || !/(^|\.)licdn\.com$/.test(u.hostname)) return null
    const res = await fetch(u, { signal: AbortSignal.timeout(6000) })
    const type = res.headers.get("content-type") ?? ""
    if (!res.ok || !type.startsWith("image/")) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > 1_500_000) return null
    let binary = ""
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))

    return `data:${type};base64,${btoa(binary)}`
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return reply(405, { error: "Use POST." })

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const apify = Deno.env.get("APIFY_TOKEN")
  if (!apify) return reply(503, { error: "LinkedIn import is not switched on yet." })

  // Anyone may import, signed in or not. A signed-in person is counted as themselves, anyone else by a hashed network address.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  let userId: string | null = null
  if (jwt && jwt !== anon) {
    const who = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } })
    if (who.ok) userId = ((await who.json()) as { id?: string }).id ?? null
  }
  const address = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim()
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${address}|${service.slice(-12)}`))
  const ipHash = [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32)

  let url = ""
  try {
    url = String(((await req.json()) as Json).url ?? "").trim()
  } catch {
    return reply(400, { error: "Send { url }." })
  }
  if (!URL_RE.test(url)) return reply(422, { error: "Paste the link to your LinkedIn profile, like https://www.linkedin.com/in/your-name" })

  // Paid scraper: a few imports per person a day, and a ceiling for everyone together.
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const rest = { apikey: service, Authorization: `Bearer ${service}` }
  const countOf = async (filter: string): Promise<number> => {
    const r = await fetch(`${supabaseUrl}/rest/v1/linkedin_imports?kind=eq.profile&created_at=gte.${since}&${filter}&select=id`, { headers: { ...rest, Prefer: "count=exact", Range: "0-0" } })
    return Number((r.headers.get("content-range") ?? "*/0").split("/")[1] ?? 0)
  }
  const mine = userId ? await countOf(`user_id=eq.${userId}`) : await countOf(`ip_hash=eq.${ipHash}`)
  if (mine >= (userId ? DAILY_LIMIT : ANON_LIMIT)) return reply(429, { error: `Up to ${userId ? DAILY_LIMIT : ANON_LIMIT} imports a day. Try again tomorrow, or sign in for more.` })
  if ((await countOf("id=gt.0")) >= GLOBAL_LIMIT) return reply(429, { error: "Imports are paused for today. Try again tomorrow." })
  const logged = await fetch(`${supabaseUrl}/rest/v1/linkedin_imports`, { method: "POST", headers: { ...rest, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ user_id: userId, ip_hash: ipHash, kind: "profile", url }) })
  const loggedRows = (await logged.json().catch(() => [])) as Array<{ id?: number }>
  const usedId = Array.isArray(loggedRows) ? loggedRows[0]?.id : undefined
  // A read that fails is not an import: give the use back, so a broken scraper or a private profile never eats someone's quota.
  const giveBack = async (): Promise<void> => {
    if (usedId !== undefined) await fetch(`${supabaseUrl}/rest/v1/linkedin_imports?id=eq.${usedId}`, { method: "DELETE", headers: rest })
  }

  const run = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${apify}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileScraperMode: "Profile details no email ($4 per 1k)", queries: [url] }),
  })
  if (!run.ok) {
    await giveBack()
    return reply(502, { error: "LinkedIn did not answer. Try again in a minute." })
  }
  const items = (await run.json()) as unknown[]
  const item = Array.isArray(items) ? items.find(isUsable) : undefined
  if (!item) {
    await giveBack()
    return reply(404, { error: "That profile could not be read. Is it public?" })
  }

  const profile = normaliseProfile(item)
  const photo = await fetchPhoto(profile.photoUrl)
  const { photoUrl: _address, ...rest2 } = profile
  void _address

  return reply(200, { profile: { ...rest2, ...(photo ? { photo } : {}) } })
})
