/**
 * Asks TypeSafe Jev how much each line of a posting insists on it, and (with --write) stores the answer in postings.requirements.
 * Reads the full stored text, cuts it into candidate lines with their
 * headings (src/lib/req-lines.ts), and tiers each line against the definitions in src/lib/req-prompt.ts.
 *
 *   set -a; . ./.env.local; set +a
 *   TYPESAFE_API_KEY=... bun scripts/jev-requirements.ts --ids sample.json --out result.json        read only the postings in a file
 *   TYPESAFE_API_KEY=... SUPABASE_ACCESS_TOKEN=... bun scripts/jev-requirements.ts --all --write    read the postings with no readings yet and store them (add --rescan to read every posting again)
 * Before --write the old readings are copied to public.postings_requirements_backup.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { candidateLines } from "../src/lib/req-lines"
import { PREFACE, questionFor, readTiers, toStored, type TieredLine } from "../src/lib/req-prompt"

const KEY = process.env.TYPESAFE_API_KEY
const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = "ukpmpyfcnbhngkgbnkxi"
const SB = `https://${REF}.supabase.co`
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const arg = (n: string): string | undefined => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined }
const flag = (n: string): boolean => process.argv.includes(n)
if (!KEY || !ANON) throw new Error("Set TYPESAFE_API_KEY and VITE_SUPABASE_ANON_KEY")
if (flag("--write") && !PAT) throw new Error("--write needs SUPABASE_ACCESS_TOKEN")
// Only postings with no readings yet (requirements empty), so a re-run does not pay for the same postings twice. --rescan reads every posting again.
const RESCAN = flag("--rescan")
const STATE_CHARS = 14000
const PARALLEL = 6

interface P { id: string; employer: string; title: string; text: string }

async function load(): Promise<P[]> {
  const file = arg("--ids")
  if (file) return (JSON.parse(readFileSync(file, "utf8")) as Array<{ id: string; employer: string; title: string; text: string }>).map((p) => ({ id: p.id, employer: p.employer, title: p.title, text: p.text }))
  const out: P[] = []
  for (let from = 0; ; from += 200) {
    const r = await fetch(`${SB}/rest/v1/postings?select=id,employer_display,title,body,closed_at&order=id${RESCAN ? "" : "&requirements=is.null"}`, { headers: { apikey: ANON!, Authorization: `Bearer ${ANON}`, Range: `${from}-${from + 199}` } })
    const part = (await r.json()) as Array<{ id: string; employer_display: string; title: string; body: string | null; closed_at: string | null }>
    out.push(...part.filter((x) => x.body).map((x) => ({ id: x.id, employer: x.employer_display, title: x.title, text: x.body as string })))
    if (part.length < 200) break
  }
  return out
}

type Answers = { answers?: Record<string, { choice?: string; confidence?: number }> }
const CHUNK = 40

/** Every line of a posting, asked in batches: each question carries the full tier definitions, so a long posting in one request is too large for Jev. */
async function askAll(p: P, lines: Array<{ text: string; section: string | null }>): Promise<Answers> {
  const merged: Answers = { answers: {} }
  for (let from = 0; from < lines.length; from += CHUNK) {
    const part = await ask(p, lines.slice(from, from + CHUNK))
    for (const [k, v] of Object.entries(part.answers ?? {})) merged.answers![`l${from + Number(k.slice(1))}`] = v
  }
  return merged
}

async function ask(p: P, lines: Array<{ text: string; section: string | null }>): Promise<Answers> {
  const questions: Record<string, unknown> = {}
  lines.forEach((l, i) => (questions[`l${i}`] = questionFor(l.text, l.section)))
  // A very long posting can exceed what Jev accepts; the text it sees is then cut shorter and the question asked again.
  for (const chars of [STATE_CHARS, 9000, 6000]) {
    const state = `${PREFACE}\n\nJob title: ${p.title}\nEmployer: ${p.employer}\nPosting:\n${p.text.slice(0, chars)}`
    for (let i = 0; i < 4; i++) {
      const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ state, model: "jev-latest", questions }) })
      if (res.ok) return (await res.json()) as { answers?: Record<string, { choice?: string; confidence?: number }> }
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); continue }
      const body = await res.text()
      if (res.status === 400 && body.includes("max_tokens_exceeded")) break
      throw new Error(`Jev ${res.status}: ${body.slice(0, 200)}`)
    }
  }
  throw new Error("Jev kept failing")
}

async function sql(query: string): Promise<void> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })
  if (!r.ok) throw new Error(`write ${r.status} ${(await r.text()).slice(0, 300)}`)
}

const all = await load()
console.log(`${all.length} postings`)
const results: Array<{ id: string; lines: TieredLine[]; unreadable: number }> = []
let failed = 0
const queue = [...all]
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  for (let p; (p = queue.shift()); ) {
    try {
      const lines = candidateLines(p.text)
      const reply = lines.length ? await askAll(p, lines) : null
      const { tiered, unreadable } = readTiers(lines, reply)
      results.push({ id: p.id, lines: tiered, unreadable })
    } catch (e) { failed++; if (failed <= 3) console.error(p.id, (e as Error).message) }
    if (results.length % 100 === 0) console.log(`${results.length}/${all.length}`)
  }
}))
const out = arg("--out")
if (out) writeFileSync(out, JSON.stringify(results))
const tally: Record<string, number> = {}
for (const r of results) for (const l of r.lines) tally[l.tier] = (tally[l.tier] ?? 0) + 1
console.log(`read ${results.length}, failed ${failed}, unreadable lines ${results.reduce((n, r) => n + r.unreadable, 0)}; tiers`, tally)

if (flag("--write")) {
  await sql("create table if not exists public.postings_requirements_backup (id text, requirements jsonb, saved_at timestamptz default now())")
  await sql("insert into public.postings_requirements_backup (id, requirements) select id, requirements from public.postings where not exists (select 1 from public.postings_requirements_backup)")
  for (let i = 0; i < results.length; i += 25) {
    const batch = results.slice(i, i + 25)
    await sql(batch.map((r) => `update public.postings set requirements = $j$${JSON.stringify(toStored(r.lines)).replace(/\$j\$/g, "")}$j$::jsonb where id = '${r.id.replace(/'/g, "''")}'`).join(";\n"))
  }
  console.log("written; the previous readings are in public.postings_requirements_backup")
}
