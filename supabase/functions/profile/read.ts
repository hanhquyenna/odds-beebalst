// POST /profile/read: reads the signed-in person's SAVED profile into structured facts with TypeSafe Jev, against fixed
// categories, and keeps them as the source of truth (table profile_facts). The profile is read from the database here, never
// taken from the browser. Each part (a role, a degree, a line of the CV) is read once and stored under its fingerprint, so
// an unchanged part is never read again and an edited or new part is read the next time this runs. Matching to jobs is plain
// arithmetic in the app (src/lib/strength.ts); no model call happens per job.
// Secret: TYPESAFE_API_KEY (Edge Function secret, never in a file)
import { reply, userFromRequest } from "../_shared/http.ts"
import { hashItem, itemsOf, type Item, type ProfileLike } from "./items.ts"
import { PREFACE, buildQuestions, readItemAnswers, type ItemFacts, type JevReply } from "./judge.ts"

const DAILY_NEW_ITEMS = 150
const PARALLEL = 5

/** Reads the caller's saved profile into facts and answers { items, pending, total }. */
export async function readProfile(req: Request): Promise<Response> {
  if (req.method !== "POST") return reply(405, { error: "Use POST." })
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const key = Deno.env.get("TYPESAFE_API_KEY")
  if (!key) return reply(503, { error: "Reading your profile is not switched on yet." })

  const user = await userFromRequest(req)
  if (!user) return reply(401, { error: "Sign in first." })
  const userId = user.id
  const rest = { apikey: service, Authorization: `Bearer ${service}` }

  // The saved profile is the source of truth.
  const row = await fetch(`${supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}&select=data`, { headers: rest })
  const saved = row.ok ? ((await row.json()) as Array<{ data: ProfileLike }>)[0]?.data : undefined
  if (!saved) return reply(200, { items: [], pending: 0, total: 0 })

  const items = itemsOf(saved)
  const hashes = await Promise.all(items.map(hashItem))
  const have = new Map<string, ItemFacts>()
  if (hashes.length > 0) {
    const r = await fetch(`${supabaseUrl}/rest/v1/profile_facts?user_id=eq.${userId}&item_hash=in.(${hashes.join(",")})&select=item_hash,facts`, { headers: rest })
    if (r.ok) for (const x of (await r.json()) as Array<{ item_hash: string; facts: ItemFacts }>) have.set(x.item_hash, x.facts)
  }

  // Read only what has not been read, within the daily allowance.
  const missing = items.map((item, i) => ({ item: item, hash: hashes[i] })).filter((m) => !have.has(m.hash))
  let budget = DAILY_NEW_ITEMS
  if (missing.length > 0) {
    const since = new Date(Date.now() - 86_400_000).toISOString()
    const used = await fetch(`${supabaseUrl}/rest/v1/profile_facts?user_id=eq.${userId}&created_at=gte.${since}&select=item_hash`, { headers: { ...rest, Prefer: "count=exact", Range: "0-0" } })
    budget = Math.max(0, DAILY_NEW_ITEMS - Number((used.headers.get("content-range") ?? "*/0").split("/")[1] ?? 0))
  }
  const todo = missing.slice(0, budget)
  const fresh: Array<{ user_id: string; item_hash: string; kind: string; facts: ItemFacts; model: string | null }> = []

  const judge = async (m: { item: Item; hash: string }): Promise<void> => {
    const state = `${PREFACE}\n\nEntry (${m.item.kind}):\n${m.item.text}`
    for (let i = 0; i < 3; i++) {
      const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ state: state, model: "jev-latest", questions: buildQuestions() }) })
      if (res.ok) {
        const out = (await res.json()) as JevReply & { model?: string }
        const facts = readItemAnswers(out)
        if (facts) fresh.push({ user_id: userId, item_hash: m.hash, kind: m.item.kind, facts, model: out.model ?? null })
        return
      }
      if (res.status !== 429 && res.status < 500) return
      if (i < 2) await new Promise((r) => setTimeout(r, 800 * 2 ** i))
    }
  }
  const queue = [...todo]
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let m; (m = queue.shift()); ) await judge(m)
  }))

  if (fresh.length > 0) {
    await fetch(`${supabaseUrl}/rest/v1/profile_facts`, { method: "POST", headers: { ...rest, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(fresh) })
    for (const f of fresh) have.set(f.item_hash, f.facts)
  }
  const out = hashes.flatMap((h) => (have.has(h) ? [{ hash: h, facts: have.get(h) }] : []))

  return reply(200, { items: out, pending: items.length - out.length, total: items.length })
}
