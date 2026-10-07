/**
 * Finds more jobs on LinkedIn's public job pages (no login, no Apify) and adds the ones the table does not hold, read by the same rules as a pasted
 * link (supabase/functions/_shared/job-intake.ts): closed, outside the Netherlands and duplicate jobs are skipped.
 *
 *   set -a; . ./.env.local; . ./.env.secrets; set +a
 *   bun scripts/pull-linkedin-public.ts [--max 100] [--pages 3] [--days 7] [--queries "marketing intern,data analyst"] [--ids 4476343633,4476148585] [--dry]
 *
 * It goes slowly on purpose (a pause between pages) and stops when LinkedIn starts refusing. Afterwards run scripts/after-new-jobs.sh.
 * No company logos or facts are fetched here; scripts/fix-missing-logos.sh covers the logos.
 */
import { cityOf, inNetherlands, parseJobUrl, readVerdict, rowFromDetails, type JobDetails, type KnownEmployer } from "../supabase/functions/_shared/job-intake"

const env = await Bun.file(new URL("../.env.local", import.meta.url)).text()
const BASE = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim()
const ANON = env.match(/VITE_SUPABASE_(?:ANON|PUBLISHABLE)\w*=(.*)/)?.[1]?.trim()
const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = "ukpmpyfcnbhngkgbnkxi"
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(name)

  return i >= 0 ? process.argv[i + 1] : fallback
}
const dry = process.argv.includes("--dry")
if (!BASE || !ANON) throw new Error("Missing VITE_SUPABASE_URL or the anon key in .env.local")
if (!dry && !PAT) throw new Error("Set SUPABASE_ACCESS_TOKEN (scripts/with-secrets.sh)")
const MAX = Number(arg("--max", "100"))
const PAGES = Number(arg("--pages", "3"))
const DAYS = Number(arg("--days", "7"))

const DEFAULT_QUERIES = [
  "internship", "stage", "stagiair", "werkstudent", "graduate programme", "traineeship", "junior", "entry level",
  "marketing intern", "finance intern", "data analyst junior", "software engineer intern", "business analyst graduate", "consultant junior",
  "supply chain intern", "HR intern", "sales development", "customer success", "research assistant", "legal intern", "operations analyst",
  "product manager intern", "UX design intern", "sustainability intern", "engineering intern", "audit associate", "risk analyst", "project coordinator junior",
]
// Job ids found some other way (a logged-in search): they skip the public search and go straight to being read.
const IDS = arg("--ids", "").split(",").map((i) => i.trim()).filter((i) => /^\d{8,12}$/.test(i))
const QUERIES = IDS.length > 0 ? [] : arg("--queries", "") ? arg("--queries", "").split(",").map((q) => q.trim()).filter(Boolean) : DEFAULT_QUERIES
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.5))

let refused = 0
async function linkedin(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } })
  if (res.status === 200) {
    refused = 0

    return res.text()
  }
  if (res.status === 429 || res.status === 999 || res.status === 403) {
    refused++
    if (refused >= 3) throw new Error(`LinkedIn keeps refusing (${res.status}). Stopping so nothing is hammered; try again later.`)
    await pause(30_000)
  }

  return null
}

const decode = (s: string): string =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
const textOf = (html: string): string => decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|ul|ol|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "- ").replace(/<[^>]+>/g, "")).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
const grab = (html: string, rx: RegExp): string => decode((rx.exec(html)?.[1] ?? "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()

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

async function sql(query: string): Promise<string> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 300)}`)

  return r.text()
}

// What the table already holds: every LinkedIn job address (open or closed), and each employer's display name, sponsor flag and industry.
const held = new Set<string>()
for (const p of await rest<{ url: string | null }>("postings?select=url&url=like.*linkedin.com/jobs/view/*")) {
  const id = /(\d{8,12})/.exec(p.url ?? "")?.[1]
  if (id) held.add(id)
}
interface Opened { employer: string; employer_display: string | null; ind_sponsor: boolean | null; ind_sponsor_name: string | null; industry: string | null; title: string; region: string | null; closed_at: string | null }
const opened = await rest<Opened>("postings?select=employer,employer_display,ind_sponsor,ind_sponsor_name,industry,title,region,closed_at&closed_at=is.null")
const byEmployer = new Map<string, Opened[]>()
for (const p of opened) byEmployer.set(p.employer, [...(byEmployer.get(p.employer) ?? []), p])
console.log(`${held.size} LinkedIn jobs already held, ${opened.length} open jobs in all`)

// 1. Search pages: public listing, internship and entry level, the Netherlands.
interface Card { id: string; title: string; company: string; place: string }
const found = new Map<string, Card>()
for (const q of QUERIES) {
  for (let page = 0; page < PAGES; page++) {
    const html = await linkedin(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(q)}&location=Netherlands&f_E=1,2&f_TPR=r${DAYS * 86400}&start=${page * 10}`)
    await pause(1200)
    if (!html) break
    const cards = html.split("<li>").slice(1)
    let fresh = 0
    for (const c of cards) {
      const id = /jobPosting:(\d+)/.exec(c)?.[1]
      if (!id) continue
      const place = grab(c, /base-search-card__metadata[\s\S]*?job-search-card__location[^>]*>([\s\S]*?)<\/span>/)
      if (!held.has(id) && !found.has(id)) {
        found.set(id, { id, title: grab(c, /base-search-card__title[^>]*>([\s\S]*?)<\/h3>/), company: grab(c, /base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/), place })
        fresh++
      }
    }
    if (cards.length < 10) break
    if (fresh === 0 && page > 0) break
  }
  console.log(`  "${q}": ${found.size} new so far`)
  if (found.size >= MAX * 2) break
}
for (const id of IDS) if (!held.has(id) && !found.has(id)) found.set(id, { id, title: "", company: "", place: "" })
const todo = [...found.values()].filter((c) => !c.place || inNetherlands(c.place)).slice(0, MAX)
console.log(`${found.size} not held yet, ${todo.length} to read`)

// 2. Read each job's public page the way the paid reader would, then apply the intake rules.
const rows: Array<Record<string, unknown>> = []
const tally: Record<string, number> = {}
const bump = (k: string): void => void (tally[k] = (tally[k] ?? 0) + 1)
const today = new Date().toISOString().slice(0, 10)
for (const card of todo) {
  const html = await linkedin(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${card.id}`)
  await pause(1500)
  if (!html) {
    bump("no answer")
    continue
  }
  const description = textOf(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "")
  const applicantsText = grab(html, /num-applicants__caption[^>]*>([\s\S]*?)<\/(?:span|figcaption)>/)
  const item: JobDetails = {
    status: "success",
    job_status: /No longer accepting applications/i.test(html) ? "closed" : null,
    id: card.id,
    title: grab(html, /topcard__title[^>]*>([\s\S]*?)<\//) || card.title,
    location: grab(html, /topcard__flavor topcard__flavor--bullet[^>]*>([\s\S]*?)<\//) || card.place,
    description,
    applicants: /\d[\d,.]*/.exec(applicantsText)?.[0].replace(/[,.]/g, "") ?? null,
    applicants_text: applicantsText || null,
    seniority_level: grab(html, /description__job-criteria-subheader[^>]*>\s*Seniority level\s*<\/h3>\s*<span[^>]*>([\s\S]*?)<\/span>/) || null,
    valid_through: /"validThrough"\s*:\s*"([^"]+)"/.exec(html)?.[1] ?? null,
    "company.name": grab(html, /topcard__org-name-link[^>]*>([\s\S]*?)<\/a>/) || card.company,
  }
  const verdict = readVerdict(item)
  if (verdict !== "open") {
    bump(verdict)
    continue
  }
  const employer = (item["company.name"] ?? "").trim()
  const place = (item.location ?? "").trim()
  if (!inNetherlands(place)) {
    bump("not in the Netherlands")
    continue
  }
  const same = byEmployer.get(employer) ?? []
  const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  if (same.some((h) => norm(h.title) === norm(item.title ?? "") && cityOf(h.region ?? "") === cityOf(place)) || rows.some((r) => r.employer === employer && norm(String(r.title)) === norm(item.title ?? "") && cityOf(String(r.region)) === cityOf(place))) {
    bump("duplicate")
    continue
  }
  const parsed = parseJobUrl(`https://www.linkedin.com/jobs/view/${card.id}`)!
  const known: KnownEmployer | null = same[0] ? { employer_display: same[0].employer_display, ind_sponsor: same[0].ind_sponsor, ind_sponsor_name: same[0].ind_sponsor_name, industry: same.find((h) => h.industry)?.industry ?? null } : null
  const row = await rowFromDetails(item, parsed, known, today, new Date().toISOString())
  rows.push(row)
  bump("to add")
  console.log(`  + ${String(row.title)} | ${String(row.employer)} | ${String(row.region)}`)
}
console.log("result:", tally)

// 3. Save. Only the columns the row carries are written, so every other column keeps its default.
if (dry || rows.length === 0) {
  console.log(dry ? "dry run: nothing saved" : "nothing new to save")
  process.exit(0)
}
const cols = Object.keys(rows[0])
for (let i = 0; i < rows.length; i += 20) {
  const chunk = JSON.stringify(rows.slice(i, i + 20)).replace(/\$j\$/g, "")
  const select = cols.map((c) => `r."${c}"`).join(",")
  const out = await sql(`insert into postings (${cols.map((c) => `"${c}"`).join(",")}) select ${select} from json_populate_recordset(null::postings, $j$${chunk}$j$::json) r on conflict (id) do nothing returning id`)
  console.log(`saved ${(out.match(/"id"/g) ?? []).length} of ${Math.min(20, rows.length - i)}`)
}
