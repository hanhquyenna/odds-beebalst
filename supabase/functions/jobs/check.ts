// POST /jobs/check?slice=0&of=4: ask each employer's own job board whether the postings we hold are still open.
// Called every hour by pg_cron (see scripts/setup-check.sh), four slices a few minutes apart so one run stays short.
// Secret: CHECK_SECRET, sent by the schedule as the x-check-secret header. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { applyVerdict, CHECKED, checkRows, type Row } from "../_shared/ats-check.ts"
import { reply } from "../_shared/http.ts"

/** Checks this run's slice of the postings and answers a tally; the schedule sends x-check-secret. */
export async function check(req: Request): Promise<Response> {
  const secret = Deno.env.get("CHECK_SECRET")
  if (!secret || req.headers.get("x-check-secret") !== secret) {
    return reply(401, { error: "no" })
  }
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) {
    return reply(500, { error: "not configured" })
  }
  const q = new URL(req.url).searchParams
  const of = Math.max(1, Number(q.get("of") ?? 1))
  const slice = Number(q.get("slice") ?? 0)
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }

  const rows: Array<Row & { miss_count: number; closed_at: string | null; last_checked: string | null }> = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/postings?select=id,ats,employer,title,url,miss_count,closed_at,last_checked&ats=in.(${CHECKED.join(",")})&order=id`, { headers: { ...headers, "Range-Unit": "items", Range: `${from}-${from + 999}` } })
    if (!res.ok) {
      return reply(502, { error: `read failed ${res.status}` })
    }
    const page = (await res.json()) as typeof rows
    rows.push(...page)
    if (page.length < 1000) {
      break
    }
  }
  const started = Date.now()
  const mine = rows.filter((r) => sliceOf(r.id, of) === slice)
  const verdicts = await checkRows(mine)

  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const tally = { open: 0, closed: 0, unknown: 0, newlyClosed: 0, reopened: 0 }
  const writes: Promise<unknown>[] = []
  for (const r of mine) {
    const verdict = verdicts.get(r.id) ?? "unknown"
    tally[verdict]++
    if (verdict === "unknown") {
      continue
    }
    const { state, seen } = applyVerdict({ miss_count: r.miss_count, closed_at: r.closed_at }, verdict, now)
    if (state.closed_at && !r.closed_at) {
      tally.newlyClosed++
    }
    if (!state.closed_at && r.closed_at) {
      tally.reopened++
    }
    // Write only when something changed, or once a day to say "still checked": about a thousand writes a day, not a day's worth of hourly ones.
    const changed = state.miss_count !== r.miss_count || state.closed_at !== r.closed_at
    const stale = !r.last_checked || r.last_checked.slice(0, 10) !== today
    if (!changed && !stale) {
      continue
    }
    const patch: Record<string, unknown> = { last_checked: now, miss_count: state.miss_count, closed_at: state.closed_at }
    if (seen) {
      patch.last_seen = today
    }
    writes.push(fetch(`${url}/rest/v1/postings?id=eq.${r.id}`, { method: "PATCH", headers, body: JSON.stringify(patch) }))
  }
  const results = await Promise.all(writes)
  const failed = results.filter((r) => !(r as Response).ok).length

  const summary = { slice: slice, of: of, checked: mine.length, ...tally, writeFailures: failed }
  // The run log is a convenience: if the table is not there yet, the run still counts.
  await fetch(`${url}/rest/v1/check_runs`, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({ slice: slice, of: of, checked: mine.length, open: tally.open, closed: tally.closed, unknown: tally.unknown, newly_closed: tally.newlyClosed, reopened: tally.reopened, write_failures: failed, seconds: (Date.now() - started) / 1000 }),
  }).catch(() => null)

  return reply(200, summary)
}

/** Which of `of` slices an id belongs to, stable across runs. */
function sliceOf(id: string, of: number): number {
  return [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % of
}
