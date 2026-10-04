/**
 * Pulls, from the postings we hold, what an employer says about its culture and what its teams do, in its own words, and prints SQL for employer_culture and employer_teams.
 *   set -a; . ./.env.local; set +a; bun scripts/extract_culture_teams.ts > culture.sql     then run culture.sql with the Management API.
 * Culture: a section headed "Our values", "Life at X", "Culture", "Why join us" and the like, the first words of it.
 * Teams: for each job field (department) at the employer, the "About the team" text from one of its postings, and up to four lines from the "What you'll do" lists of that field's postings.
 * Nothing is written by us: every line is the employer's, with the posting it came from. An employer with none of this gets no row.
 */
import { stripMarkup } from "../src/lib/format"
import { parsePosting, type Section } from "../src/lib/job-sections"

const SB = process.env.VITE_SUPABASE_URL!
const KEY = process.env.VITE_SUPABASE_ANON_KEY!
const head = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const rows: Array<{ id: string; employer: string; employer_display: string; family: string | null; body: string | null }> = []
for (let o = 0; ; o += 500) {
  const r = (await (await fetch(`${SB}/rest/v1/postings?select=id,employer,employer_display,family,body&closed_at=is.null&order=id&offset=${o}&limit=500`, { headers: head })).json()) as typeof rows
  rows.push(...r)
  if (r.length < 500) break
}

const CULTURE = /\b(values|culture|life at|working at|why (you'll love|you will love|join|work|us)|our people|how we work|what drives us|our mission|who we are|diversity|team spirit|our story)\b/i
const DUTCH = /\b(wij|jij|je|voor|een|het|van|met|bij|ons|onze|als|zijn|dat|deze|worden)\b/gi
const q = (s: string): string => `$q$${s}$q$`
const text = (s: Section): string => s.blocks.map((b) => (b.kind === "p" ? b.text : b.items.join("; "))).join(" ").replace(/\s+/g, " ").trim()
const cut = (t: string, n: number): string => {
  if (t.length <= n) return t
  const at = Math.max(t.lastIndexOf(". ", n), t.lastIndexOf("! ", n))

  return at > n * 0.5 ? t.slice(0, at + 1) : `${t.slice(0, t.lastIndexOf(" ", n))}…`
}
const good = (t: string): boolean => t.length >= 120 && (t.match(DUTCH)?.length ?? 0) < 4

const culture = new Map<string, { heading: string; text: string; id: string; score: number }>()
const teams = new Map<string, { family: string; heading: string; text: string; id: string; tasks: Set<string> }>()

for (const p of rows) {
  const parsed = parsePosting(stripMarkup(p.body ?? ""), p.employer_display)
  for (const s of parsed.sections) {
    const t = text(s)
    if (s.title && CULTURE.test(s.title) && s.key !== "legal" && good(t)) {
      const mine = cut(t, 480)
      const score = -Math.abs(mine.length - 380)
      const cur = culture.get(p.employer)
      if (!cur || score > cur.score) culture.set(p.employer, { heading: s.title, text: mine, id: p.id, score })
    }
  }
  if (!p.family) continue
  const k = `${p.employer}|${p.family}`
  const team = parsed.sections.find((s) => s.key === "team" && s.title !== "" && good(text(s)))
  const duties = parsed.sections.filter((s) => s.key === "duties").flatMap((s) => s.blocks.flatMap((b) => (b.kind === "ul" ? b.items : [])))
  const cur = teams.get(k) ?? { family: p.family, heading: "", text: "", id: p.id, tasks: new Set<string>() }
  if (team && !cur.text) {
    cur.heading = team.title
    cur.text = cut(text(team), 420)
    cur.id = p.id
  }
  for (const d of duties) if (cur.tasks.size < 4 && d.length >= 30 && d.length <= 200 && (d.match(DUTCH)?.length ?? 0) < 2) cur.tasks.add(d)
  teams.set(k, cur)
}

const out: string[] = ["create table if not exists employer_culture (employer text primary key, heading text not null, about text not null, posting_id text);", "create table if not exists employer_teams (employer text not null, family text not null, heading text, about text, tasks text[], posting_id text, primary key (employer, family));"]
out.push("alter table employer_culture enable row level security; alter table employer_teams enable row level security;", "drop policy if exists employer_culture_read on employer_culture; create policy employer_culture_read on employer_culture for select using (true);", "drop policy if exists employer_teams_read on employer_teams; create policy employer_teams_read on employer_teams for select using (true);", "grant select on employer_culture, employer_teams to anon, authenticated;")
const cv = [...culture].map(([e, c]) => `(${q(e)},${q(c.heading)},${q(c.text)},${q(c.id)})`)
if (cv.length) out.push(`insert into employer_culture (employer, heading, about, posting_id) values ${cv.join(",")} on conflict (employer) do update set heading=excluded.heading, about=excluded.about, posting_id=excluded.posting_id;`)
const tv = [...teams].filter(([, t]) => t.text || t.tasks.size >= 2).map(([k, t]) => `(${q(k.split("|")[0])},${q(t.family)},${t.text ? q(t.heading) : "null"},${t.text ? q(t.text) : "null"},${t.tasks.size ? `array[${[...t.tasks].map(q).join(",")}]::text[]` : "null"},${q(t.id)})`)
if (tv.length) out.push(`insert into employer_teams (employer, family, heading, about, tasks, posting_id) values ${tv.join(",")} on conflict (employer, family) do update set heading=excluded.heading, about=excluded.about, tasks=excluded.tasks, posting_id=excluded.posting_id;`)
out.push("notify pgrst, 'reload schema';")
console.error(`${culture.size} employers with a culture text; ${tv.length} employer-and-field teams with text or tasks`)
console.log(out.join("\n"))
