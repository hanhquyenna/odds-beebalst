/**
 * Gold-set test of the v2 Jev questions on cards labelled by hand (real cards seen on LinkedIn on 3-4 Oct 2026, plus traps).
 *   TYPESAFE_API_KEY=... bun scripts/jev-gold.ts [--json] [--limit N]
 * Prints, per row, every probability against the expected label (1 = yes, 0 = no, null = not judged by hand), the token usage and the mismatches.
 * Nothing is written anywhere.
 */
import { buildQuestionsV2, DEPARTMENTS, readV2, stateJson, stateProse, type Card, type PersonFactsV2 } from "./jev-people-v2"

const KEY = process.env.TYPESAFE_API_KEY
if (!KEY) throw new Error("Set TYPESAFE_API_KEY")
const JSON_STATE = process.argv.includes("--json")
const LIMIT = Number(process.argv[process.argv.indexOf("--limit") + 1]) || 999

type E = 0 | 1 | null
interface Gold { c: Card; nl: E; works: E; former: E; notEmp: E; other: E; title: E; student: E; leader: E; dept?: string; note?: string }
const NL = "Amsterdam, North Holland, Netherlands"
const g = (company: string, headline: string, place: string, e: Partial<Omit<Gold, "c">>, postings?: string): Gold => ({ c: { company, headline, place, postings }, nl: null, works: null, former: null, notEmp: null, other: null, title: null, student: null, leader: null, ...e })

const GOLD: Gold[] = [
  g("Tesla", "Data Analyst @ Tesla", NL, { nl: 1, works: 1, former: 0, notEmp: 0, other: 0, title: 1, student: 0, leader: 0, dept: "data_ai" }),
  g("Nike", "Supply Chain Performance Analyst @adidas / ex Nike", "Rotterdam, South Holland, Netherlands", { nl: 1, works: 0, former: 1, title: 1 }, "Sales roles, Hilversum"),
  g("Tangent", "Enterprise Account Executive @ VergeSense / Mentor at Tangent", NL, { nl: 1, works: 0, other: 1 }, "Sales role"),
  g("Korn Ferry", "Recruiting for AMGEN / Korn Ferry / Talent Acquisition", NL, { nl: 1, other: 1, dept: "hr_recruiting" }, "HR role"),
  g("Robeco", "Cloud Engineer via Team Rockstars IT bij Robeco", "Schiedam, South Holland, Netherlands", { nl: 1, other: 1, title: 1 }, "IT role"),
  g("ChannelEngine", "Sell Smarter on 1300+ Marketplaces with ChannelEngine", "The Randstad, Netherlands", { nl: 1, title: 0, dept: "unclear" }),
  g("Fleet Cleaner", "Fleet Cleaner", "Delft, South Holland, Netherlands", { nl: 1, title: 0 }),
  g("Aquablu", "Shaping the Future of Hydration / Aquablu", NL, { nl: 1, title: 0 }),
  g("Jefferies", "Investment Banking Off-Cycle Intern at Jefferies / MSc Finance student at Tilburg University", NL, { nl: 1, works: 1, student: 1, dept: "finance" }),
  g("Karl Lagerfeld", "Retail Brand Marketing Intern at Karl Lagerfeld", NL, { nl: 1, works: 1, student: 1, dept: "marketing_comms" }),
  g("Xsens Entertainment", "Sr. Account Executive EMEA at Xsens", "Greater Enschede Area", { nl: 1, works: 1, title: 1, dept: "sales_account" }),
  g("Inalfa Roof Systems Group", "Engineer Cad advanced Engineering at Inalfa Roof Systems Group", "Brabantine City Row", { nl: 1, works: 1, title: 1, dept: "hardware_engineering" }),
  g("Andaz", "Chef de Partie at Andaz Amsterdam Prinsengracht", NL, { nl: 1, works: 1, title: 1 }),
  g("AB InBev", "Category Manager Retail at AB InBev", "Amsterdam, New York, United States", { nl: 0, works: 1, title: 1 }),
  g("Adyen", "Data Scientist at Adyen", "Greater London, United Kingdom", { nl: 0, works: 1 }),
  g("Mollie", "Software Engineer at Mollie", "", { nl: 0, works: 1 }),
  g("Mollie", "Brussels-based Product Manager at Mollie", "Brussels, Brussels Region, Belgium", { nl: 0, works: 1 }),
  g("McCain Foods", "Productiemanager McCain Lelystad", "Amersfoort, Utrecht, Netherlands", { nl: 1, works: 1, title: 1, dept: "operations_supply_chain" }),
  g("AIT Worldwide Logistics", "Manager Gateway bij AIT Worldwide Logistics", "Waddinxveen, South Holland, Netherlands", { nl: 1, works: 1, title: 1, dept: "operations_supply_chain" }),
  g("bol.com", "Oud-medewerker bol.com | Marketing Manager", NL, { nl: 1, works: 0, former: 1 }),
  g("Mollie", "Gerente de Marketing en Mollie", NL, { nl: 1, works: 1, former: 0, title: 1, dept: "marketing_comms" }),
  g("Exact", "Softwareentwickler bei Exact", "Utrecht, Utrecht, Netherlands", { nl: 1, works: 1, title: 1, dept: "software_engineering" }),
  g("ING Nederland", "Open to work | Data Analyst | ex-ING", NL, { nl: 1, works: 0, former: 1, notEmp: 1 }),
  g("Shell", "Retired Managing Director, formerly at Shell", NL, { nl: 1, works: 0, notEmp: 1 }),
  g("Picnic", "Angel investor in Picnic and other food startups", NL, { nl: 1, works: 0, other: 1, title: 0 }),
  g("The Sharing Group", "Chief Financial Officer at The Sharing Group", NL, { nl: 1, works: 1, leader: 1, title: 1, dept: "finance" }),
  g("DLA Piper", "Head of Finance at DLA Piper", NL, { nl: 1, works: 1, leader: 1, dept: "finance" }),
  g("Optiver", "Financial Accountant @ Optiver", NL, { nl: 1, works: 1, leader: 0, student: 0, dept: "finance" }),
  g("Mollie", "AI in CX | Squad Lead @ ML6", NL, { nl: 1, works: 0, title: 1 }, "Sales and software roles"),
  g("Eurofins", "Process Manager bij Eurofins Agro Testing", "Nijmegen, Gelderland, Netherlands", { nl: 1, works: 1, title: 1 }),
  g("Brunswick Corporation", "Applications Architect at Navico Group (a division of Brunswick Corporation)", "Bergen op Zoom, North Brabant, Netherlands", { nl: 1, works: 1, title: 1, dept: "it_cloud_security" }),
  g("Cloetta", "Plantmanager bij Cloetta", "Eindhoven Area", { nl: 1, works: 1, title: 1, dept: "operations_supply_chain" }),
  g("Nike", "Talent Acquisition Specialist @ Nike, Inc.", "Netherlands", { nl: 1, works: 1, dept: "hr_recruiting", other: 0 }),
  g("Snowflake", "Account Executive at Snowflake", NL, { nl: 1, works: 1, dept: "sales_account" }),
  g("Refresco", "Senior Legal Counsel at Refresco", "The Randstad, Netherlands", { nl: 1, works: 1, dept: "risk_legal" }),
  g("Sherpa Digital", "Founder @ Sherpa Digital", NL, { nl: 1, works: 1, leader: 1 }),
  g("Heijmans", "Projectleider bij Heijmans", "Zuid-Holland, Nederland", { nl: 1, works: 1, title: 1, dept: "product_project" }),
  g("Heijmans", "Site manager at Heijmans", "Brussels, Belgium", { nl: 0, works: 1 }),
  g("Heijmans", "Engineer at Heijmans", "Netherlands", { nl: 1, works: 1 }),
  g("Artefact", "Data & AI Consultant at Artefact", "Netherlands", { nl: 1, works: 1, title: 1 }),
  g("Bluebird", "Managing Director @ BlueBird Power", "Delft, South Holland, Netherlands", { nl: 1, title: 1 }, "A sales role, Amsterdam"),
  g("Redcare Pharmacy", "Working student in HR / Recruiting at Redcare Pharmacy / Business Administration", "Horst, Limburg, Netherlands", { nl: 1, works: 1, student: 1 }),
  g("Reckitt", "Vice President of Regulatory Affairs and Safety Assurance at Reckitt", "Amsterdam Area", { nl: 1, works: 1, leader: 1, dept: "risk_legal" }),
  g("Philips", "Marketing Manager at Philips, ex-Unilever", NL, { nl: 1, works: 1, former: 0, title: 1 }),
  g("Optiver", "Quant Trader at Optiver / formerly Google", NL, { nl: 1, works: 1, former: 0, title: 1 }),
  g("Mollie", "Customer Success Manager @ Mollie (previously Adyen)", NL, { nl: 1, works: 1, former: 0, title: 1, dept: "customer_support" }),
  g("Shell", "Ex-Shell Strategy Consultant, now at Accenture", NL, { nl: 1, works: 0, former: 1 }),
  g("Heineken", "Former Heineken brand manager, freelance consultant", NL, { nl: 1, works: 0, former: 1, other: 1 }),
  g("Booking.com", "Product Manager at Booking.com | Open to speaking", NL, { nl: 1, works: 1, notEmp: 0, title: 1 }),
  g("ASML", "Senior Engineer at ASML Veldhoven", "Eindhoven, North Brabant, Netherlands", { nl: 1, works: 1, title: 1 }),
  g("ASML", "Software Engineer bij Philips", NL, { nl: 1, works: 0 }),
  g("Adyen", "Client Success at a bank that uses Adyen", NL, { nl: 1, works: 0, other: 1 }),
  g("Nike", "Stagiair Marketing bij Nike", NL, { nl: 1, works: 1, student: 1 }),
  g("Nike", "Werkstudent HR @ Nike", NL, { nl: 1, works: 1, student: 1 }),
  g("KPMG", "Senior Manager Audit, KPMG Netherlands", "Amstelveen, North Holland, Netherlands", { nl: 1, works: 1, title: 1, dept: "finance" }),
  g("Picnic", "Marketing @ Picnic, previously Albert Heijn", NL, { nl: 1, works: 1, former: 0, title: 1, dept: "marketing_comms" }),
]

async function ask(c: Card): Promise<{ f: PersonFactsV2 | null; tokens: number; raw?: unknown }> {
  const body = { state: JSON_STATE ? stateJson(c) : stateProse(c), model: "jev-latest", questions: buildQuestionsV2() }
  for (let i = 0; i < 4; i++) {
    const r = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    if (r.status === 429 || r.status >= 500) { await new Promise((x) => setTimeout(x, 1000 * 2 ** i)); continue }
    if (!r.ok) throw new Error(`jev ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = (await r.json()) as { usage?: { input_tokens?: number; output_tokens?: number } }
    return { f: readV2(j as Parameters<typeof readV2>[0]), tokens: j.usage?.input_tokens ?? 0, raw: j }
  }
  throw new Error("jev kept failing")
}

const rows = GOLD.slice(0, LIMIT)
let inTok = 0, bad = 0, cells = 0
const results: Array<{ g: Gold; f: PersonFactsV2 | null }> = []
for (let i = 0; i < rows.length; i += 6) {
  const batch = rows.slice(i, i + 6)
  const out = await Promise.all(batch.map((x) => ask(x.c)))
  batch.forEach((x, k) => { inTok += out[k].tokens; results.push({ g: x, f: out[k].f }) })
}
const chk = (name: string, exp: E, got: number, _thr: (v: number) => boolean | null): string => {
  if (exp === null) return ""
  cells++
  const ok = exp === 1 ? got >= 0.7 : got <= 0.3
  if (!ok) bad++
  return ok ? "" : ` ${name}(exp ${exp}, got ${got.toFixed(2)})`
}
for (const { g: x, f } of results) {
  if (!f) { console.log(`NO ANSWER  ${x.c.headline}`); bad++; continue }
  const miss = [chk("nl", x.nl, f.inNetherlands, () => null), chk("works", x.works, f.worksAtNow, () => null), chk("former", x.former, f.former, () => null), chk("notEmp", x.notEmp, f.notEmployed, () => null), chk("other", x.other, f.forSomeoneElse, () => null), chk("title", x.title, f.isTitle, () => null), chk("student", x.student, f.student, () => null), chk("leader", x.leader, f.leader, () => null)].join("")
  const depMiss = x.dept && x.dept !== f.department ? ` dept(exp ${x.dept}, got ${f.department} ${f.departmentConfidence.toFixed(2)})` : ""
  console.log(`${miss || depMiss ? "XX" : "ok"}  ${x.c.headline.slice(0, 62).padEnd(62)} | nl ${f.inNetherlands.toFixed(2)} wk ${f.worksAtNow.toFixed(2)} fm ${f.former.toFixed(2)} ne ${f.notEmployed.toFixed(2)} ot ${f.forSomeoneElse.toFixed(2)} ti ${f.isTitle.toFixed(2)} st ${f.student.toFixed(2)} ld ${f.leader.toFixed(2)} ${f.department}${miss}${depMiss}`)
}
void DEPARTMENTS
console.log(`\nrows ${rows.length}, labelled cells ${cells}, wrong ${bad}; input tokens ${inTok} (${Math.round(inTok / rows.length)} per person); format ${JSON_STATE ? "json" : "prose"}`)
