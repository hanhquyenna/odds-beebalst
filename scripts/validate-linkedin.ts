/**
 * Checks every open LinkedIn job we hold against LinkedIn itself, through the Apify actor scrapingmonkey/linkedin-job-details-scraper
 * (about $1 per 1,000 pages). Writes nothing to the database: it writes a JSON report and a .sql file you can review and apply.
 *   set -a; . ./.env.local; set +a; APIFY_TOKEN=... bun scripts/validate-linkedin.ts [--limit N]
 * Rules: a job counts as closed as soon as the actor says job_status "closed". A read that fails is retried once; if it still fails there is
 * nothing to go on, so that job is left as it is (unknown).
 */
const TOKEN = process.env.APIFY_TOKEN
const SB = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
if (!TOKEN || !SB || !ANON) {
  console.error("Set APIFY_TOKEN, VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY")
  process.exit(1)
}
const limitArg = process.argv.indexOf("--limit")
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity
const BATCH = 50

interface Row { id: string; url: string | null; title: string }
type Verdict = "open" | "closed" | "failed"

const rows: Row[] = []
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${SB}/rest/v1/postings?select=id,url,title&ats=eq.linkedin&closed_at=is.null&order=id`, { headers: { apikey: ANON!, Authorization: `Bearer ${ANON}`, Range: `${from}-${from + 999}` } })
  const part = (await r.json()) as Row[]
  rows.push(...part)
  if (part.length < 1000) break
}
const todo = rows.filter((r) => r.url).slice(0, LIMIT)
console.log(`${todo.length} open LinkedIn jobs to check`)

async function run(batch: Row[]): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>()
  const res = await fetch(`https://api.apify.com/v2/acts/scrapingmonkey~linkedin-job-details-scraper/run-sync-get-dataset-items?token=${TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inputList: batch.map((b) => b.url) }),
  })
  if (!res.ok) {
    const detail = (await res.text()).replace(/token=[^&\s"]+/g, "token=…").slice(0, 200)
    throw new Error(`Apify ${res.status}: ${detail}`)
  }
  const items = (await res.json()) as Array<{ input?: string; status?: string; job_status?: string | null }>
  const byUrl = new Map(batch.map((b) => [b.url as string, b.id]))
  for (const it of items) {
    const id = it.input ? byUrl.get(it.input) : undefined
    if (!id) continue
    out.set(id, it.status === "success" ? (it.job_status === "closed" ? "closed" : it.job_status === "open" ? "open" : "failed") : "failed")
  }
  for (const b of batch) if (!out.has(b.id)) out.set(b.id, "failed")
  return out
}

async function pass(list: Row[], label: string): Promise<Map<string, Verdict>> {
  const all = new Map<string, Verdict>()
  for (let i = 0; i < list.length; i += BATCH) {
    const part = await run(list.slice(i, i + BATCH))
    for (const [k, v] of part) all.set(k, v)
    console.log(`  ${label}: ${Math.min(i + BATCH, list.length)}/${list.length}`)
  }
  return all
}

const first = await pass(todo, "pass 1")
const count = (m: Map<string, Verdict>): Record<string, number> => { const c: Record<string, number> = { open: 0, closed: 0, failed: 0 }; for (const v of m.values()) c[v]++; return c }
console.log("pass 1:", count(first))

// A failed read is retried once.
const again = todo.filter((r) => first.get(r.id) === "failed")
const second = again.length ? await pass(again, "pass 2 (failed reads)") : new Map<string, Verdict>()
console.log("pass 2:", count(second))

const final = new Map<string, Verdict | "unknown">()
for (const r of todo) {
  const a = first.get(r.id)
  const b = second.get(r.id)
  if (a === "open" || b === "open") final.set(r.id, "open")
  else if (a === "closed" || b === "closed") final.set(r.id, "closed")
  else final.set(r.id, "unknown")
}
const closed = todo.filter((r) => final.get(r.id) === "closed")
const open = todo.filter((r) => final.get(r.id) === "open")
const unknown = todo.filter((r) => final.get(r.id) === "unknown")
console.log(`\nresult: ${open.length} open, ${closed.length} closed, ${unknown.length} unknown (could not be read, left alone)`)
for (const r of closed.slice(0, 12)) console.log("  closed:", r.title.slice(0, 70))

const q = (ids: string[]): string => ids.map((i) => `'${i.replace(/'/g, "''")}'`).join(", ")
const today = new Date().toISOString().slice(0, 10)
let sql = `-- LinkedIn jobs checked on LinkedIn through Apify, ${today}: ${open.length} open, ${closed.length} closed, ${unknown.length} unknown (could not be read, not touched).\n`
if (closed.length) sql += `update public.postings set closed_at = now(), last_checked = now() where id in (${q(closed.map((r) => r.id))}) and closed_at is null;\n`
if (open.length) sql += `update public.postings set last_checked = now(), miss_count = 0 where id in (${q(open.map((r) => r.id))}) and closed_at is null;\n`
await Bun.write(new URL("../CLOSE_LINKEDIN_" + today + ".sql", import.meta.url), sql)
await Bun.write(new URL("./audit/out/linkedin_validate_" + today + ".json", import.meta.url), JSON.stringify({ today, open: open.map((r) => r.id), closed: closed.map((r) => ({ id: r.id, title: r.title, url: r.url })), unknown: unknown.map((r) => ({ id: r.id, url: r.url })) }, null, 1))
console.log(`wrote CLOSE_LINKEDIN_${today}.sql`)
