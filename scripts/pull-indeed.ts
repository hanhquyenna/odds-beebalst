/**
 * Adds jobs found on Indeed (nl.indeed.com), read in the browser pane where the owner is signed in, to the shared postings table, by the same
 * rules as a pasted LinkedIn link (supabase/functions/_shared/job-intake.ts): outside the Netherlands and duplicate jobs are skipped.
 *
 *   set -a; . ./.env.local; . ./.env.secrets; set +a
 *   bun scripts/pull-indeed.ts new   cards.json            # which of the found cards are not held yet (prints their Indeed keys)
 *   bun scripts/pull-indeed.ts add   details.json [--dry]  # reads and saves them
 *
 * cards.json:   { "<jobkey>": [title, company, place, publishedMs], ... }
 * details.json: [ { jk, title, company, place, posted: "2026-09-29T15:18:26Z", valid: "...", description } ]
 * Indeed jobs are not re-checked for being open (the checker covers LinkedIn-free employer boards and public sites only); a posting's own deadline closes it.
 * Afterwards run scripts/after-new-jobs.sh.
 */
import { cityOf, inNetherlands, readVerdict, rowFromDetails, type JobDetails, type KnownEmployer } from "../supabase/functions/_shared/job-intake"

const env = await Bun.file(new URL("../.env.local", import.meta.url)).text()
const BASE = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim()
const ANON = env.match(/VITE_SUPABASE_(?:ANON|PUBLISHABLE)\w*=(.*)/)?.[1]?.trim()
const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = "ukpmpyfcnbhngkgbnkxi"
const [mode, file] = process.argv.slice(2)
const dry = process.argv.includes("--dry")
if (!BASE || !ANON || !file || !["new", "add"].includes(mode)) throw new Error("Usage: bun scripts/pull-indeed.ts new|add <file.json> [--dry]")

async function rest<T>(path: string): Promise<T[]> {
  const out: T[] = []
  for (let o = 0; ; o += 1000) {
    const r = await fetch(`${BASE}/rest/v1/${path}${path.includes("?") ? "&" : "?"}limit=1000&offset=${o}`, { headers: { apikey: ANON!, Authorization: `Bearer ${ANON}` } })
    const j = (await r.json()) as T[]
    out.push(...j)
    if (j.length < 1000) break
  }

  return out
}

const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
/** Indeed writes a place as "Maastricht", "5121 Rijen", "Hybride werken in 1011 Amsterdam Centrum": the city is what is left without the postcode and the lead-in. */
const cityOfIndeed = (place: string): string => cityOf(place.replace(/^.*\bin\s+(?=\d{4}|\w)/i, "").replace(/\b\d{4}\s?[A-Z]{0,2}\b/g, "").replace(/^gemeente\s+/i, ""))
const PROVINCE: Record<string, string> = { NH: "North Holland", ZH: "South Holland", UT: "Utrecht", NB: "North Brabant", LI: "Limburg", GE: "Gelderland", OV: "Overijssel", DR: "Drenthe", FR: "Friesland", GR: "Groningen", ZE: "Zeeland", FL: "Flevoland" }
/** Indeed gives the province as a two-letter code; the rest of the table spells it out. */
const spellOut = (place: string): string => place.replace(/,\s*([A-Z]{2})\b/g, (m, code: string) => (PROVINCE[code] ? `, ${PROVINCE[code]}` : m))
const withCountry = (place: string): string =>
  spellOut(/netherlands|nederland/i.test(place) ? place : `${place.replace(/^.*\bin\s+(?=\d{4})/i, "").replace(/\b\d{4}\s?[A-Z]{0,2}\s*/g, "").replace(/^gemeente\s+/i, "").trim()}, Netherlands`)

interface Opened { employer: string; employer_display: string | null; ind_sponsor: boolean | null; ind_sponsor_name: string | null; industry: string | null; title: string; region: string | null }
const opened = await rest<Opened>("postings?select=employer,employer_display,ind_sponsor,ind_sponsor_name,industry,title,region&closed_at=is.null")
const byEmployer = new Map<string, Opened[]>()
for (const p of opened) byEmployer.set(norm(p.employer), [...(byEmployer.get(norm(p.employer)) ?? []), p])
const heldKeys = new Set((await rest<{ url: string }>("postings?select=url&url=like.*indeed.com*")).map((p) => /jk=([0-9a-f]{16})/.exec(p.url)?.[1]).filter(Boolean) as string[])
const duplicate = (company: string, title: string, place: string): boolean => (byEmployer.get(norm(company)) ?? []).some((h) => norm(h.title) === norm(title) && cityOf(h.region ?? "") === cityOfIndeed(place))

if (mode === "new") {
  const cards = JSON.parse(await Bun.file(file).text()) as Record<string, [string, string, string, number]>
  const fresh = Object.entries(cards).filter(([jk, [title, company, place]]) => !heldKeys.has(jk) && !duplicate(company, title, place))
  console.error(`${Object.keys(cards).length} cards, ${fresh.length} not held yet`)
  console.log(JSON.stringify(fresh.map(([jk]) => jk)))
  process.exit(0)
}

type Detail = { jk: string; title: string; company: string; place: string; posted?: string | null; valid?: string | null; description: string }
const details = JSON.parse(await Bun.file(file).text()) as Detail[]
const today = new Date().toISOString().slice(0, 10)
const rows: Array<Record<string, unknown>> = []
const tally: Record<string, number> = {}
const bump = (k: string): void => void (tally[k] = (tally[k] ?? 0) + 1)
for (const d of details) {
  const place = withCountry(d.place)
  const item: JobDetails = { status: "success", job_status: null, id: d.jk, title: d.title, location: place, description: d.description, "company.name": d.company, valid_through: d.valid ?? null }
  if (readVerdict(item) !== "open") { bump("unreadable"); continue }
  if (!inNetherlands(place)) { bump("not in the Netherlands"); continue }
  if (heldKeys.has(d.jk) || duplicate(d.company, d.title, d.place) || rows.some((r) => norm(String(r.employer)) === norm(d.company) && norm(String(r.title)) === norm(d.title) && cityOf(String(r.region)) === cityOfIndeed(d.place))) { bump("duplicate"); continue }
  const same = byEmployer.get(norm(d.company)) ?? []
  const known: KnownEmployer | null = same[0] ? { employer_display: same[0].employer_display, ind_sponsor: same[0].ind_sponsor, ind_sponsor_name: same[0].ind_sponsor_name, industry: same.find((h) => h.industry)?.industry ?? null } : null
  const url = `https://nl.indeed.com/viewjob?jk=${d.jk}`
  const row = await rowFromDetails(item, { id: d.jk, url }, known, today, new Date().toISOString())
  const postedOn = d.posted ? d.posted.slice(0, 10) : null
  const days = postedOn ? Math.max(0, Math.round((Date.parse(today) - Date.parse(postedOn)) / 86_400_000)) : null
  Object.assign(row, {
    ats: "indeed",
    source: "indeed_user",
    employer: same[0]?.employer ?? d.company,
    posted_at: postedOn,
    posted_on: postedOn,
    days_open: days,
    freshness_state: days === null ? "unknown" : days <= 6 ? "fresh" : days <= 45 ? "active" : "aging",
  })
  rows.push(row)
  bump("to add")
  console.log(`  + ${String(row.title)} | ${String(row.employer)} | ${String(row.region)}`)
}
console.log("result:", tally)
if (dry || rows.length === 0) {
  console.log(dry ? "dry run: nothing saved" : "nothing new to save")
  process.exit(0)
}
if (!PAT) throw new Error("Set SUPABASE_ACCESS_TOKEN (scripts/with-secrets.sh)")
const cols = Object.keys(rows[0])
for (let i = 0; i < rows.length; i += 20) {
  const chunk = JSON.stringify(rows.slice(i, i + 20)).replace(/\$j\$/g, "")
  const query = `insert into postings (${cols.map((c) => `"${c}"`).join(",")}) select ${cols.map((c) => `r."${c}"`).join(",")} from json_populate_recordset(null::postings, $j$${chunk}$j$::json) r on conflict (id) do nothing returning id`
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 300)}`)
  console.log(`saved ${((await r.text()).match(/"id"/g) ?? []).length} of ${Math.min(20, rows.length - i)}`)
}
