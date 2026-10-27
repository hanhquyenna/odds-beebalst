// Eriksson & Rooth 2014 (Sweden, 8,466 callbacks) and Bertrand & Mullainathan 2004 (US, white-named resumes only, 2,435) run through odds-v2,
// parts written out by key like scripts/research/export_swiss.ts. Needs research-data/more-data/er_rows.json and bm_rows.json (see
// docs/ENGINE_DATA_PLAN.md C4). Run from the repo root: bun scripts/research/export_more.ts
// Assumptions: the experience of each applicant is in the line of work of the ad (both studies made it so); the ad asks 2 years; an ethnic-minority
// male name is a non-EU origin; unemployment and "more education than required" have no part in the engine and are left out; Black-named B&M
// resumes are left out because a US race signal is not an origin signal.
import { readFileSync, writeFileSync } from "node:fs"
import { standing, type CategoryShare } from "@/lib/engine"
import type { Reference } from "@/lib/jobs"
import { strengthParts } from "@/lib/odds-v2"
import { DEFAULT_PROFILE } from "@/lib/types"
import { BANDS, TAX, TRANSITIONS } from "../../e2e/fixtures/reference"

type Posting = Parameters<typeof strengthParts>[0]
type Profile = Parameters<typeof strengthParts>[1]

const ref: Reference = { bands: Object.fromEntries(BANDS.map((b) => [b.code, b])), ageFactors: {}, tax: TAX, transitions: Object.fromEntries(TRANSITIONS.map((t) => [t.title, t])) }
const share: CategoryShare = { n: 500, dutchRequired: 0, visaMention: 0, asking5plus: 0, junior: 0, skills: {} }
const shares = { finance_business: share, tech: share, other: share }
// oxlint-disable-next-line typescript/no-redundant-type-constituents
const post = (o: Partial<Posting> & { title: string }): Posting =>
  ({ id: "x", employer: "x", employer_display: "x", ats: "x", source: "x", region: "x", cat: "other", cbs_group: null, url: null, ind_sponsor: false, ind_sponsor_name: null, years_min: null, dutch_required: false, visa_mention: false, junior_title: false, degree_asked: null, skills: [], pay_posted: null, applicants: null, applicants_text: null, valid_through: null, seniority: null, posted_at: null, days_open: null, freshness_state: "fresh", fetched_at: null, ...o }) as Posting
const role = (Title: string, from: number, to: number) => ({ Title, "Company Name": "Firma", "Started On": `Jan ${from}`, "Finished On": `Jan ${to}`, Location: "Amsterdam, Netherlands" })

const out: string[] = []
const emit = (meta: Record<string, unknown>, p: Posting, prof: Profile) => {
  const parts: Record<string, number> = {}
  for (const x of strengthParts(p, prof)) parts[x.key] = (parts[x.key] ?? 0) + x.study
  out.push(JSON.stringify({ ...meta, job: null, parts, old: standing(p, prof, ref, shares).rate?.mid ?? null }))
}
const split = (id: number): "test" | "train" => ((id * 2654435761) % 4 === 0 ? "test" : "train")

const ER: Record<string, { title: string; family: string | null; cat: Posting["cat"] }> = {
  Computer: { title: "Software Developer", family: "Software engineering", cat: "tech" }, Accountant: { title: "Accountant", family: "Finance & accounting", cat: "finance_business" },
  Nurse: { title: "Nurse", family: "Healthcare & life sciences", cat: "other" }, "Teacher language": { title: "Teacher", family: null, cat: "other" }, "Teacher science": { title: "Teacher", family: null, cat: "other" },
  "Teacher secondary": { title: "Teacher", family: null, cat: "other" }, "Sales representative": { title: "Sales Representative", family: "Sales & account management", cat: "finance_business" },
  "Retail sales": { title: "Store Sales Assistant", family: "Sales & account management", cat: "other" }, "Maintenance technician": { title: "Maintenance Technician", family: "Hardware & engineering", cat: "other" },
  "Construction worker": { title: "Construction Worker", family: "Hardware & engineering", cat: "other" }, Driver: { title: "Driver", family: null, cat: "other" }, Cleaner: { title: "Cleaner", family: null, cat: "other" }, Restaurant: { title: "Restaurant Assistant", family: null, cat: "other" },
}
for (const r of JSON.parse(readFileSync("research-data/more-data/er_rows.json", "utf8")) as Array<{ id: number; callback: number; min: number; erfar: number; occ: string }>) {
  const j = ER[r.occ] ?? { title: r.occ, family: null, cat: "other" as const }
  const prof: Profile = { ...DEFAULT_PROFILE, origin: r.min === 1 ? "non_eu" : "dutch", dutch: "native", positions: [role(j.title, 2018 - r.erfar, 2018)], education: [{ "School Name": "Gymnasium", "Degree Name": j.title, "Start Date": "2010", "End Date": "2013" }] }
  emit({ ds: "eriksson_rooth", group: `SE|${r.occ}`, split: split(r.id), y: r.callback, f_min: r.min, f_exp: r.erfar }, post({ title: j.title, family: j.family, cat: j.cat, years_min: 2 }), prof)
}

const BM: Record<number, { title: string; family: string | null }> = { 1: { title: "Manager", family: "Operations & supply chain" }, 3: { title: "Sales Representative", family: "Sales & account management" }, 4: { title: "Clerical Worker", family: "Operations & supply chain" }, 5: { title: "Customer Service Representative", family: "Customer support & service" }, 6: { title: "Administrative Assistant", family: "Operations & supply chain" } }
let n = 0
for (const r of JSON.parse(readFileSync("research-data/more-data/bm_rows.json", "utf8")) as Array<{ id: number; adid: number; call: number; yearsexp: number; occupbroad: number }>) {
  const j = BM[r.occupbroad] ?? { title: "Clerical Worker", family: "Operations & supply chain" }
  const prof: Profile = { ...DEFAULT_PROFILE, origin: "dutch", dutch: "native", positions: [role(j.title, 2003 - Math.round(r.yearsexp), 2003)], education: [{ "School Name": "College", "Degree Name": j.title, "Start Date": "1995", "End Date": "1999" }] }
  emit({ ds: "bm_white", group: `US|${r.occupbroad}`, split: split(r.adid ?? ++n), y: r.call, f_exp: r.yearsexp }, post({ title: j.title, family: j.family, cat: "other", years_min: 2 }), prof)
}
writeFileSync("research-data/more-data/more_parts.jsonl", out.join("\n") + "\n")
console.log("rows", out.length)
