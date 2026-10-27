// POST /profile/import: import a LinkedIn profile into the odds profile.
// The browser sends { url } with the signed-in user's JWT. The Apify token lives only here, as a secret.
// Secrets: supabase secrets set APIFY_TOKEN=... --project-ref ukpmpyfcnbhngkgbnkxi   (never commit the value)

import { imageDataUrl, ipHash, reply, userFromRequest } from "../_shared/http.ts"
import { isUsable, normaliseProfile, type Json } from "../_shared/linkedin-profile.ts"
import { toLinkedInUrl } from "../_shared/linkedin-url.ts"

const APIFY_ACTOR = "harvestapi~linkedin-profile-scraper"
// Cost guard for the paid scraper ($4 per 1,000 profiles, so $0.004 each). The limits can be changed without a deploy, by setting the
// secrets DAILY_LIMIT (signed in), ANON_LIMIT (not signed in) and GLOBAL_LIMIT (everyone together), each per 24 hours.
const DAILY_LIMIT = limit("DAILY_LIMIT", 20)
const ANON_LIMIT = limit("ANON_LIMIT", 10)
const GLOBAL_LIMIT = limit("GLOBAL_LIMIT", 300)

/** Reads one LinkedIn profile through the paid scraper, within the daily limits, and answers { profile }. */
export async function importProfile(req: Request): Promise<Response> {
  if (req.method !== "POST") return reply(405, { error: "Use POST." })

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const apify = Deno.env.get("APIFY_TOKEN")
  if (!apify) return reply(503, { error: "LinkedIn import is not switched on yet." })

  // Anyone may import, signed in or not. A signed-in person is counted as themselves, anyone else by a hashed network address.
  const userId = (await userFromRequest(req))?.id ?? null
  const ip = await ipHash(req)

  let sent = ""
  try {
    const body = ((await req.json()) as Json).url
    sent = typeof body === "string" ? body : ""
  } catch {
    return reply(400, { error: "Send { url }." })
  }
  // Whatever was pasted (no https, a country site, tracking, a page inside the profile, words around it) is made into the one form the scraper takes.
  const url = toLinkedInUrl(sent)
  if (!url) return reply(422, { error: "Paste the link to your LinkedIn profile, like https://www.linkedin.com/in/your-name" })

  // Paid scraper: a few imports per person a day, and a ceiling for everyone together.
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const rest = { apikey: service, Authorization: `Bearer ${service}` }
  const countOf = async (filter: string): Promise<number> => {
    const r = await fetch(`${supabaseUrl}/rest/v1/linkedin_imports?kind=eq.profile&created_at=gte.${since}&${filter}&select=id`, { headers: { ...rest, Prefer: "count=exact", Range: "0-0" } })

    return Number((r.headers.get("content-range") ?? "*/0").split("/")[1] ?? 0)
  }
  const mine = await countOf(userId ? `user_id=eq.${userId}` : `ip_hash=eq.${ip}`)
  if (mine >= (userId ? DAILY_LIMIT : ANON_LIMIT)) return reply(429, { error: `Up to ${userId ? DAILY_LIMIT : ANON_LIMIT} imports a day. Try again tomorrow, or sign in for more.` })
  // Counted before the shared check, so parallel requests see each other; every paid read counts, failed or not.
  await fetch(`${supabaseUrl}/rest/v1/linkedin_imports`, { method: "POST", headers: { ...rest, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, ip_hash: ip, kind: "profile", url: url }) })
  const all = await countOf("id=gt.0")
  if (all > GLOBAL_LIMIT) return reply(429, { error: "Imports are paused for today. Try again tomorrow." })

  const run = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${apify}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profileScraperMode: "Profile details no email ($4 per 1k)", queries: [url] }),
  })
  if (!run.ok) {
    // The reason is for the function log (Dashboard → Edge Functions → profile → Logs), never for the visitor: 401 token refused, 402 out of credit or over the usage limit, 403 not allowed to run this scraper, 429 too many runs, 400 the input format changed.
    console.error(`apify ${APIFY_ACTOR}: ${run.status} ${(await run.text().catch(() => "")).slice(0, 300)}`)
    // A paid-account problem is ours to fix, not a reason for the person to retry.
    if (run.status === 401 || run.status === 402 || run.status === 403) return reply(503, { error: "LinkedIn import is paused for now. Please try again later." })

    return reply(502, { error: "LinkedIn did not answer. Try again in a minute." })
  }
  const items = (await run.json()) as unknown[]
  const item = Array.isArray(items) ? items.find(isUsable) : undefined
  if (!item) {
    return reply(404, { error: "That profile could not be read. Is it public?" })
  }

  const { photoUrl, ...profile } = normaliseProfile(item)
  const photo = await imageDataUrl(photoUrl, 1_500_000, 6000)

  return reply(200, { profile: { ...profile, ...(photo ? { photo: photo } : {}) } })
}

/** A positive number from a secret, or the fallback. */
function limit(name: string, fallback: number): number {
  const n = Number(Deno.env.get(name))

  return Number.isFinite(n) && n > 0 ? n : fallback
}
