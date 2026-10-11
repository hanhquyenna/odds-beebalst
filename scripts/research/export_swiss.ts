// The Swiss correspondence test (Zschirnt-style, Zenodo 6675500, 2,366 applications, never used to train anything) run through odds-v2,
// parts written out by key like research-data/backtest/export_parts.ts. Run from the repo root: bun research-data/more-data/export_swiss.ts
// Mapping (assumptions, written down so they can be argued with): Swiss -> native; German, French -> EU non-native; Turkish, Kosovo,
// Cameroun -> non-EU. "Fit of vacancy" Good -> 3 years of fitting experience, Okay -> 1.5 (a bit under the 2 asked), Overqualified -> 9.
import { readFileSync, writeFileSync } from "node:fs"
import { standing, type CategoryShare } from "@/lib/engine"
import type { Reference } from "@/lib/jobs"
import { strengthParts } from "@/lib/odds-v2"
import { BANDS, TAX, TRANSITIONS } from "../../e2e/fixtures/reference"
import { DEFAULT_PROFILE, type Posting, type Profile } from "@/lib/types"

const ref: Reference = { bands: Object.fromEntries(BANDS.map((b) => [b.code, b])), ageFactors: {}, tax: TAX, transitions: Object.fromEntries(TRANSITIONS.map((t) => [t.title, t])) }
const share: CategoryShare = { n: 500, dutchRequired: 0, visaMention: 0, asking5plus: 0, junior: 0, skills: {} }
const shares = { finance_business: share, tech: share, other: share }
const post = (o: Partial<Posting> & { title: string }): Posting =>
  ({ id: "x", employer: "x", employer_display: "x", ats: "x", source: "x", region: "x", cat: "other", cbs_group: null, url: null, ind_sponsor: false, ind_sponsor_name: null, years_min: null, dutch_required: false, visa_mention: false, junior_title: false, degree_asked: null, skills: [], pay_posted: null, applicants: null, applicants_text: null, valid_through: null, seniority: null, posted_at: null, days_open: null, freshness_state: "fresh", fetched_at: null, ...o }) as Posting
const role = (Title: string, company: string, from: number, to: number) => ({ Title, "Company Name": company, "Started On": `Jan ${from}`, "Finished On": `Jan ${to}`, Location: "Amsterdam, Netherlands" })
const JOB: Record<string, { title: string; family: string | null; cat: Posting["cat"] }> = {
  "Sales Assistant": { title: "Store Sales Assistant", family: "Sales & account management", cat: "other" },
  Electrician: { title: "Electrician", family: "Hardware & engineering", cat: "other" },
  Nurse: { title: "Nurse", family: "Healthcare & life sciences", cat: "other" },
  "HR clerk": { title: "HR Administrator", family: "HR & recruiting", cat: "finance_business" },
}
const ORIGIN: Record<string, Profile["origin"]> = { Swiss: "dutch", German: "eu_non_native", French: "eu_non_native", Turkish: "non_eu", Kosovo: "non_eu", Cameroun: "non_eu" }
const YEARS: Record<string, number> = { Good: 3, Okay: 1.5, Overqualified: 9 }
const out: string[] = []
for (const r of JSON.parse(readFileSync("research-data/more-data/swiss_rows.json", "utf8"))) {
  const j = JOB[r.Group]
  const years = YEARS[r.fit] ?? 3
  const p = post({ title: j.title, family: j.family, cat: j.cat, years_min: 2 })
  const prof: Profile = { ...DEFAULT_PROFILE, origin: ORIGIN[r.Ethnicity] ?? "non_eu", dutch: "native", positions: [role(j.title, "Firma AG", 2018 - years, 2018)], education: [{ "School Name": "Berufsschule", "Degree Name": j.title, "Start Date": "2010", "End Date": "2013" }] }
  const z: Record<string, number> = {}
  const study: Record<string, number> = {}
  for (const x of strengthParts(p, prof)) {
    z[x.key] = (z[x.key] ?? 0) + x.z
    study[x.key] = (study[x.key] ?? 0) + x.study
  }
  // A pair is never split between train and test: a quarter of the pairs are held out.
  const split = (r.Id * 2654435761) % 4 === 0 ? "test" : "train"
  out.push(JSON.stringify({ ds: "swiss", group: `CH|${r.Group}`, job: null, split, y: r.y, f_eth: r.Ethnicity, f_mm: r.mm, f_fit: r.fit, Id: r.Id, parts: study, z, old: standing(p, prof, ref, shares).rate?.mid ?? null }))
}
writeFileSync("research-data/more-data/swiss_parts.jsonl", out.join("\n") + "\n")
console.log("rows", out.length)
