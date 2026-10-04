/**
 * Stores people read by hand from LinkedIn people search WITHOUT Jev (no key yet): a card is kept only if its headline names the employer and its
 * place is in the Netherlands. Marked jev.judged = false so Jev can re-judge later. One employer per call; cards on stdin: slug|name|headline|place.
 *   SUPABASE_ACCESS_TOKEN=... bun scripts/store-li-people-nojev.ts --employer nike [--match "nike,converse"] [--store] < rows.txt
 */
import { rankForJob, type Suggestion } from "../src/lib/suggest"
const PAT = process.env.SUPABASE_ACCESS_TOKEN
if (!PAT) throw new Error("Set SUPABASE_ACCESS_TOKEN")
const arg = (n: string, d = ""): string => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const employer = arg("--employer")
if (!employer) throw new Error("--employer")
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
const match = (arg("--match") || norm(employer).split(" ").slice(0, 2).join(" ")).split(",").map(norm).filter(Boolean)
const NL = /brabantine|netherlands|nederland|amsterdam|rotterdam|utrecht|eindhoven|the hague|den haag|delft|groningen|leiden|breda|tilburg|amstelveen|almere|haarlem|nijmegen|arnhem|maastricht|zwolle|enschede|hilversum|veldhoven|schiphol/i
const lit = (s: string): string => `$q$${s.replace(/\$q\$/g, "")}$q$`
async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const r = await fetch("https://api.supabase.com/v1/projects/ukpmpyfcnbhngkgbnkxi/database/query", { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()) as T[]
}
const cards = (await Bun.stdin.text()).split("\n").filter(Boolean).map((l) => { const [slug, name, headline, place] = l.split("|"); return { slug, name, headline: headline ?? "", place: place ?? "" } })
const kept = cards.filter((c) => c.slug && match.some((m) => norm(c.headline).includes(m)) && NL.test(c.place))
const fams = await sql<{ family: string | null; n: number }>(`select family, count(*)::int n from active_internship_entry where employer = ${lit(employer)} group by family order by n desc`)
const sugg = kept.map((c): Suggestion => ({ name: c.name, headline: c.headline, place: c.place, url: `https://www.linkedin.com/in/${c.slug}` }))
const CAP = Math.min(5, Math.max(3, fams.length))
const chosen: Suggestion[] = []
const lists = (fams.length ? fams : [{ family: null, n: 0 }]).map((f) => rankForJob(sugg, f.family, CAP))
for (let k = 0; k < CAP; k++) for (const l of lists) if (l[k] && !chosen.some((s) => s.url === l[k].url) && chosen.length < CAP) chosen.push(l[k])
for (const x of sugg) if (chosen.length < CAP && !chosen.some((c) => c.url === x.url)) chosen.push(x) // fallback: not eligible for any job today; the app re-ranks at display time
console.log(`${employer}: read ${cards.length}, kept ${kept.length}, store ${chosen.length} | families ${fams.map((f) => `${f.family}x${f.n}`).join(", ")}`)
for (const s of chosen) console.log(`   ${s.name} - ${s.headline} - ${s.place}`)
if (process.argv.includes("--store")) {
  if (chosen.length) await sql(`insert into job_people (employer, profile_url, name, headline, place, positions, jev) values ${chosen.map((s) => `(${lit(employer)}, ${lit(s.url)}, ${lit(s.name)}, ${lit(s.headline)}, ${lit(s.place)}, '[]'::jsonb, ${lit(JSON.stringify({ source: "linkedin-by-hand", judged: false }))}::jsonb)`).join(",")} on conflict (employer, profile_url) do update set headline = excluded.headline, place = excluded.place, fetched_at = now()`)
  await sql(`insert into job_people_runs (employer, found, kept, cost_usd) values (${lit(employer)}, ${cards.length}, ${chosen.length}, 0) on conflict (employer) do update set searched_at = now(), found = excluded.found, kept = excluded.kept, cost_usd = 0`)
  console.log("stored")
}
