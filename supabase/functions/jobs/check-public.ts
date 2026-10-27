// POST /jobs/check-public: ask the job pages of Magnet.me, AcademicTransfer and EY (SuccessFactors) whether the jobs we hold are still open.
// Called every hour by pg_cron. Each run takes the jobs checked longest ago, so every job is looked at about once a day:
//   Magnet.me 35 pages (one a second, its robots.txt allows it), AcademicTransfer 7 (one every 10.5 seconds, its robots.txt asks for 10), EY 4.
//   At today's size that is 840, 168 and 96 a day against 708, 153 and 16 jobs. If the pool grows past those, raise the numbers below.
// Secret: PUBLIC_CHECK_SECRET, sent by the schedule as the x-check-secret header. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// What it writes: last_checked on every job it could read, closed_at on a job with hard evidence of closing, valid_through where the page states a deadline
// and we had none (so the database closes it by itself on that day), and one postings_audit_log line for every closing.
import { reply } from "../_shared/http.ts"
import { judgePage } from "./public-judge.ts"

const UA = "career-sim-research/0.1"
const GROUPS = [
  { ats: "magnet.me", take: 35, gapMs: 1100 },
  { ats: "academictransfer", take: 7, gapMs: 10500 },
  { ats: "successfactors", take: 4, gapMs: 2000 },
]

interface Row { id: string; ats: string; url: string | null; valid_through: string | null }

/** Checks the longest-unchecked public pages and answers a tally; the schedule sends x-check-secret. */
export async function checkPublic(req: Request): Promise<Response> {
  const secret = Deno.env.get("PUBLIC_CHECK_SECRET")
  if (!secret || req.headers.get("x-check-secret") !== secret) return reply(401, { error: "no" })
  const base = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!base || !key) return reply(500, { error: "not configured" })
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
  const today = new Date().toISOString().slice(0, 10)
  const tally = { checked: 0, open: 0, closed: 0, unknown: 0, write_failures: 0 }
  const started = Date.now()

  const work = GROUPS.map(async (g) => {
    const res = await fetch(`${base}/rest/v1/postings?select=id,ats,url,valid_through&ats=eq.${g.ats}&closed_at=is.null&order=last_checked.asc.nullsfirst&limit=${g.take}`, { headers: headers })
    if (!res.ok) return
    const rows = (await res.json()) as Row[]
    for (const [i, r] of rows.entries()) {
      if (i > 0) await sleep(g.gapMs)
      if (!r.url) continue
      let status = 0
      let body = ""
      try {
        const page = await fetch(r.url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(25000) })
        status = page.status
        body = status === 200 ? await page.text() : ""
      } catch {
        status = 0
      }
      const j = judgePage(r.ats, status, body, today)
      tally.checked++
      tally[j.verdict]++
      if (j.verdict === "unknown") continue
      const patch: Record<string, unknown> = { last_checked: new Date().toISOString() }
      if (j.verdict === "closed") patch.closed_at = new Date().toISOString()
      else patch.miss_count = 0
      if (j.validThrough && !r.valid_through) patch.valid_through = j.validThrough
      const w = await fetch(`${base}/rest/v1/postings?id=eq.${encodeURIComponent(r.id)}`, { method: "PATCH", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(patch) })
      if (!w.ok) {
        tally.write_failures++
        continue
      }
      if (j.verdict === "closed") {
        await fetch(`${base}/rest/v1/postings_audit_log`, {
          method: "POST",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({ id: r.id, col: "closed_at", old_value: null, new_value: "closed", reason: `Page checked directly (check-public, hourly): ${j.why}.`, at: new Date().toISOString() }),
        })
      }
    }
  })
  await Promise.all(work)

  return reply(200, { ...tally, seconds: Math.round((Date.now() - started) / 100) / 10 })
}

/** Waits `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
