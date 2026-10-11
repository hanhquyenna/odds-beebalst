/** Shared by find-people.ts and find-past-hires.ts: the database call and the fixed rules for "same company" and "in the Netherlands". */

const PAT = process.env.SUPABASE_ACCESS_TOKEN
const REF = "ukpmpyfcnbhngkgbnkxi"

export async function sql<T = Record<string, any>>(query: string): Promise<T[]> {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json", "User-Agent": "odds" }, body: JSON.stringify({ query }) })
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 2000 * 2 ** i)); continue }
    if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 300)}`)
    return (await r.json()) as T[]
  }
  throw new Error("sql kept failing")
}
export const lit = (s: string): string => `$q$${String(s).replace(/\$q\$/g, "")}$q$`
export const norm = (s: string): string => String(s ?? "").toLowerCase().replace(/&amp;/g, "&").replace(/\b(b\.?v\.?|n\.?v\.?|gmbh|ltd|inc|plc|ag|sa|group|holding|nederland|netherlands|the)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim()

/** Each employer's LinkedIn company page, as employer_facts read it from LinkedIn (keyed by employer and by company name, lower case). */
const PAGES: Record<string, string> = {}
let ENTRIES: Array<{ words: string[]; url: string }> = []
export async function loadPages(): Promise<number> {
  for (const r of await sql<{ employer: string; name: string | null; linkedin_url: string | null }>("select employer, name, linkedin_url from employer_facts where linkedin_url is not null")) {
    PAGES[r.employer.toLowerCase()] ??= r.linkedin_url!
    if (r.name) PAGES[r.name.toLowerCase()] ??= r.linkedin_url!
  }
  ENTRIES = Object.entries(PAGES).map(([k, url]) => ({ words: norm(k).split(" ").filter(Boolean), url }))
  return Object.keys(PAGES).length
}
const startsWith = (a: string[], b: string[]): boolean => b.length > 0 && b.length <= a.length && b.every((w, i) => a[i] === w)
export function pageOf(employer: string, display: string): string | null {
  const exact = PAGES[employer.toLowerCase()] ?? PAGES[display.trim().toLowerCase()]
  if (exact) return exact
  const mine = norm(display).split(" ").filter(Boolean)
  if (mine.join("").length < 3) return null
  const hits = ENTRIES.filter((x) => startsWith(x.words, mine) || (x.words.join("").length >= 3 && startsWith(mine, x.words))).sort((a, b) => a.words.length - b.words.length)
  return hits[0]?.url ?? null
}
const slug = (url: string | null | undefined): string => (url ?? "").toLowerCase().replace(/\/+$/, "").split("/").pop() ?? ""

/** True when a company line names this employer: same LinkedIn page, or the names agree word for word from the start. */
export function sameCompany(line: { name?: string; url?: string }, employer: string, display: string, page: string | null): boolean {
  if (page && line.url && slug(line.url) === slug(page)) return true
  const a = norm(line.name ?? "").split(" ").filter(Boolean), b = norm(display).split(" ").filter(Boolean), c = norm(employer).split(" ").filter(Boolean)
  if (a.join("").length < 3) return false
  return startsWith(a, b) || startsWith(b, a) || startsWith(a, c) || startsWith(c, a)
}
const NL = /netherlands|nederland|amsterdam|rotterdam|utrecht|the hague|den haag|eindhoven|groningen|leiden|delft|haarlem|amstelveen|almere|tilburg|breda|nijmegen|arnhem|maastricht|zwolle|enschede|hoofddorp|schiphol|apeldoorn|amersfoort|hilversum|veldhoven|'s-hertogenbosch|den bosch|zaandam|diemen|wageningen|\bnl\b/i
export const inNL = (place: string): boolean => NL.test(place)
