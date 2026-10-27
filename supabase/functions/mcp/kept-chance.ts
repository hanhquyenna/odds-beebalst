/**
 * The interview chance for the signed-in person, per job, as the app shows it (src/lib/job-chance.ts): the badge beside a posting, the
 * jobs Claude lists, the panel. Worked out from the same inputs as the app (the CV put on the job, a referral to that job, what was read
 * from the profile), then the figure kept for this person and job (table job_chances) in its place; a job seen for the first time keeps
 * the figure worked out here, so the app shows that one too.
 */

// deno-lint-ignore no-explicit-any
type Json = any

export interface KeptCore {
  hasProfile(profile: Json): boolean
  keptChance(post: Json, profile: Json, ref: Json, shares: Json, extras: Json): { chance: Json; keep: Json }
  itemsOf(profile: Json): Json[]
  hashItem(item: Json): Promise<string>
  parseItemFacts(raw: unknown): Json
  strengthFromItems(items: Json[], family: string | null | undefined): Json
  parseCv(text: string): Json
  profileFromRows(profile: Json, body: string, rows: Json): Json
}

/** A read or write as the server; every path here is filtered by the person's own user id. */
export type Svc = (path: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<Json>

const quoted = (ids: string[]): string => ids.map((id) => `"${String(id).replace(/"/g, "")}"`).join(",")

/** What was read from the person's saved profile (profile_facts), matched to the profile as it is now, as the app does. */
async function readItems(core: KeptCore, svc: Svc, userId: string, profile: Json): Promise<Json[]> {
  const items = core.itemsOf(profile)
  if (!items.length) return []
  const hashes = await Promise.all(items.map((it) => core.hashItem(it)))
  const rows: Json[] = (await svc(`profile_facts?user_id=eq.${userId}&item_hash=in.(${quoted(hashes)})&select=item_hash,facts`).catch(() => [])) ?? []
  const byHash = new Map<string, Json>()
  for (const r of rows) {
    const facts = core.parseItemFacts(r.facts)
    if (facts) byHash.set(r.item_hash, facts)
  }

  return items.flatMap((it, i) => (byHash.has(hashes[i]) ? [{ text: it.text, facts: byHash.get(hashes[i]) }] : []))
}

/**
 * The chance per job id for `posts` (null where there is no estimate). `userId` is the signed-in person whose `profile` this is; for a
 * person Claude describes (no user id) nothing is kept and the plain figure is given.
 */
export async function keptChances(core: KeptCore, svc: Svc, userId: string | null, profile: Json, posts: Json[], ref: Json, shares: Json): Promise<Map<string, Json>> {
  const out = new Map<string, Json>()
  if (!posts.length || !core.hasProfile(profile)) return out
  if (!userId) {
    for (const post of posts) out.set(String(post.id), core.keptChance(post, profile, ref, shares, {}).chance)

    return out
  }
  const ids = [...new Set(posts.map((p) => String(p.id)))]
  const [pins, links, items] = await Promise.all([
    svc(`job_chances?user_id=eq.${userId}&posting_id=in.(${quoted(ids)})&select=posting_id,mid,low,high,inputs`).catch(() => []),
    svc(`job_documents?user_id=eq.${userId}&kind=eq.cv&posting_id=in.(${quoted(ids)})&select=posting_id,document_id`).catch(() => []),
    readItems(core, svc, userId, profile),
  ])
  const docIds = [...new Set(((links ?? []) as Json[]).map((l) => String(l.document_id)))]
  const docs: Json[] = docIds.length ? ((await svc(`documents?user_id=eq.${userId}&id=in.(${quoted(docIds)})&select=id,body`).catch(() => [])) ?? []) : []
  const bodyOf = new Map(docs.map((d) => [String(d.id), String(d.body ?? "")]))
  const cvOf = new Map(((links ?? []) as Json[]).map((l) => [String(l.posting_id), bodyOf.get(String(l.document_id))]))
  const pinOf = new Map(((pins ?? []) as Json[]).map((p) => [String(p.posting_id), { mid: p.mid, low: p.low, high: p.high, inputs: p.inputs }]))
  const referred = new Set(((profile.people ?? []) as Json[]).filter((p) => p?.status === "Referred" && p?.jobId).map((p) => String(p.jobId)))
  const keep: Json[] = []
  for (const post of posts) {
    const id = String(post.id)
    // The CV put on this job decides alone when it can be read (job-cv-profile.ts); one the rules cannot read keeps the profile's figure.
    const body = cvOf.get(id)
    const own = body ? core.profileFromRows(profile, body, core.parseCv(body)) : null
    const used = own ?? (body ? { ...profile, cv: body } : profile)
    const strength = own ? null : core.strengthFromItems(items, post.family)
    const r = core.keptChance(post, used, ref, shares, { referral: referred.has(id), strength, pin: pinOf.get(id), trustPin: true })
    out.set(id, r.chance)
    if (r.keep) keep.push({ user_id: userId, posting_id: id, ...r.keep, updated_at: new Date().toISOString() })
  }
  if (keep.length) await svc("job_chances", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(keep) }).catch(() => undefined)

  return out
}
