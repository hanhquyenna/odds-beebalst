/**
 * Judges the job_people rows that were stored by hand without Jev (jev.judged = false) with the v2 questions, twice (prose state, then JSON state).
 *   TYPESAFE_API_KEY=... SUPABASE_ACCESS_TOKEN=... bun scripts/judge-li-people.ts --out results.json [--limit N] [--apply]
 * Without --apply nothing is written to the database. With --apply each judged row gets jev.judged = true, both passes' raw probabilities and a decision
 * (keep / reject / review); NOTHING IS DELETED. Decision: keep when both passes pass the rule and no deciding probability is in the review band;
 * reject when both fail it clearly; everything else is review (a hand read).
 */
import { writeFileSync } from "node:fs"
import { buildQuestionsV2, keepV2, readV2, REVIEW, stateJson, stateProse, type Card, type PersonFactsV2 } from "./jev-people-v2"

const KEY = process.env.TYPESAFE_API_KEY
const PAT = process.env.SUPABASE_ACCESS_TOKEN
if (!KEY || !PAT) throw new Error("Set TYPESAFE_API_KEY and SUPABASE_ACCESS_TOKEN")
const arg = (n: string, d = ""): string => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const OUT = arg("--out", "judge-results.json")
const LIMIT = Number(arg("--limit", "100000"))
const APPLY = process.argv.includes("--apply")
const lit = (s: string): string => `$q$${s.replace(/\$q\$/g, "")}$q$`

async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const r = await fetch("https://api.supabase.com/v1/projects/ukpmpyfcnbhngkgbnkxi/database/query", { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return (await r.json()) as T[]
}

interface Row { employer: string; profile_url: string; name: string; headline: string; place: string }
const rows = (await sql<Row>(`select employer, profile_url, name, headline, place from job_people where jev->>'judged' = 'false' order by employer, profile_url limit ${LIMIT}`))
const ctx = await sql<{ employer: string; display: string; postings: string }>(`select employer, max(employer_display) display, string_agg(distinct title || ' (' || coalesce(region, '?') || ')', '; ') postings from active_internship_entry group by employer`)
const byEmp = new Map(ctx.map((c) => [c.employer, c]))
const cardOf = (r: Row): Card => { const c = byEmp.get(r.employer); return { company: c?.display || r.employer, headline: r.headline, place: r.place, postings: c?.postings?.slice(0, 260) } }

async function ask(state: unknown): Promise<{ f: PersonFactsV2 | null; tokens: number }> {
  const body = { state, model: "jev-latest", questions: buildQuestionsV2() }
  for (let i = 0; i < 5; i++) {
    const r = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 1000 * 2 ** i)); continue }
    if (!r.ok) throw new Error(`jev ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = (await r.json()) as { usage?: { input_tokens?: number } }
    return { f: readV2(j as Parameters<typeof readV2>[0]), tokens: j.usage?.input_tokens ?? 0 }
  }
  return { f: null, tokens: 0 }
}

const inBand = (v: number, b: readonly [number, number]): boolean => v >= b[0] && v <= b[1]
const uncertain = (f: PersonFactsV2): boolean => inBand(f.worksAtNow, REVIEW.works) || inBand(f.inNetherlands, REVIEW.inNetherlands) || inBand(f.forSomeoneElse, REVIEW.other) || inBand(f.former, REVIEW.former) || inBand(f.isTitle, REVIEW.title)
type Decision = "keep" | "reject" | "review"
const avg = (a: PersonFactsV2, b: PersonFactsV2): PersonFactsV2 => ({ inNetherlands: (a.inNetherlands + b.inNetherlands) / 2, worksAtNow: (a.worksAtNow + b.worksAtNow) / 2, former: (a.former + b.former) / 2, notEmployed: (a.notEmployed + b.notEmployed) / 2, forSomeoneElse: (a.forSomeoneElse + b.forSomeoneElse) / 2, isTitle: (a.isTitle + b.isTitle) / 2, student: (a.student + b.student) / 2, leader: (a.leader + b.leader) / 2, department: a.department, departmentConfidence: a.departmentConfidence })
const apart = (a: PersonFactsV2, b: PersonFactsV2): boolean => (["inNetherlands", "worksAtNow", "former", "notEmployed", "forSomeoneElse", "isTitle", "student"] as const).some((k) => Math.abs(a[k] - b[k]) >= 0.25)
/** Decided on the average of the two passes; a hand read when they disagree by 0.25 or more on any answer, or when an answer that decides is near its line. */
function decide(a: PersonFactsV2 | null, b: PersonFactsV2 | null): Decision {
  if (!a || !b) return "review"
  const m = avg(a, b)
  if (apart(a, b) || uncertain(m)) return "review"
  return keepV2(m) ? "keep" : "reject"
}

interface Result { employer: string; profile_url: string; name: string; headline: string; place: string; p1: PersonFactsV2 | null; p2: PersonFactsV2 | null; decision: Decision }
const results: Result[] = []
let tokens = 0
for (let i = 0; i < rows.length; i += 6) {
  const batch = rows.slice(i, i + 6)
  const out = await Promise.all(batch.map(async (r) => { const c = cardOf(r); const [a, b] = await Promise.all([ask(stateProse(c)), ask(stateJson(c))]); tokens += a.tokens + b.tokens; return { r, a: a.f, b: b.f } }))
  for (const { r, a, b } of out) results.push({ employer: r.employer, profile_url: r.profile_url, name: r.name, headline: r.headline, place: r.place, p1: a, p2: b, decision: decide(a, b) })
  if ((i / 6) % 20 === 0) console.error(`${results.length}/${rows.length}`)
}
writeFileSync(OUT, JSON.stringify(results))
const count = (d: Decision): number => results.filter((x) => x.decision === d).length
console.log(`rows ${results.length}; keep ${count("keep")}, reject ${count("reject")}, review ${count("review")}; input tokens ${tokens} (${Math.round(tokens / Math.max(1, results.length))} per row, two passes)`)

if (APPLY) {
  for (let i = 0; i < results.length; i += 40) {
    const part = results.slice(i, i + 40)
    const vals = part.map((x) => `(${lit(x.employer)}, ${lit(x.profile_url)}, ${lit(JSON.stringify({ judged: true, judge: "jev-v2", decision: x.decision, p1: x.p1, p2: x.p2 }))}::jsonb)`).join(",")
    await sql(`update job_people p set jev = p.jev || v.j from (values ${vals}) as v(employer, profile_url, j) where p.employer = v.employer and p.profile_url = v.profile_url`)
  }
  console.log("applied (nothing deleted)")
}
