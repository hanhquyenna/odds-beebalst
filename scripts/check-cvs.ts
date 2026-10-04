/**
 * Runs ten very different CVs through every posting in the database and checks that the interview chance and the
 * fit behave the same sensible way for each of them, not only for the example profile:
 *   bun scripts/check-cvs.ts
 * Checks, per CV and per posting: nothing throws, every figure is finite and in range, the same input gives the same
 * answer, and a change that can only help (a missing skill added, a referral, a Dutch level reached) never lowers the chance.
 * Then, across the CVs: the same job must not show the same number for everyone, and two different CVs must not rank
 * the jobs in the same order. Run it after any change to the fit, the engine or the data.
 */
import { computeShares, standing, NO_WHAT_IF, type Standing } from "../src/lib/engine"
import { fetchPostings, fetchReference } from "../src/lib/jobs"
import { DEFAULT_PROFILE, type Profile } from "../src/lib/types"

const pos = (Title: string, company: string, Location: string, from: string, to: string, Description: string) => ({ Title, "Company Name": company, Location, "Started On": from, "Finished On": to, Description })
const edu = (school: string, degree: string) => ({ "School Name": school, "Degree Name": degree })
const make = (o: Partial<Profile>): Profile => ({ ...DEFAULT_PROFILE, onboarded: true, ...o })

const CVS: Array<[string, Profile]> = [
  ["finance graduate, orientation year", make({ permit: "orientation_year", birth: 1999, abroad: 20, origin: "non_eu", dutch: "basic", cv: "Financial analyst with IFRS reporting and Excel modelling. MSc Finance, Erasmus University Rotterdam.", positions: [pos("Financial Analyst", "Vietcombank", "Hanoi, Vietnam", "Mar 2021", "Aug 2023", "Monthly reporting, Excel modelling, IFRS.")], education: [edu("Erasmus University Rotterdam", "MSc Finance")], skills: [{ Name: "Excel" }, { Name: "IFRS" }] })],
  ["EU data analyst, 3 years", make({ permit: "eu", birth: 1995, origin: "eu_non_native", dutch: "basic", cv: "Data analyst. SQL, Python, Tableau dashboards for marketing. BSc Statistics.", positions: [pos("Data Analyst", "Zalando", "Berlin, Germany", "Jan 2022", "", "SQL, Python, Tableau, A/B testing, data analysis.")], education: [edu("TU Berlin", "BSc Statistics")], skills: [{ Name: "SQL" }, { Name: "Python" }, { Name: "Tableau" }] })],
  ["senior software engineer, work permit", make({ permit: "hsm", birth: 1990, abroad: 30, origin: "non_eu", dutch: "none", cv: "Software engineer, 8 years. TypeScript, React, AWS, Docker, microservices. MSc Computer Science.", positions: [pos("Senior Software Engineer", "Grab", "Singapore", "Jan 2018", "", "TypeScript, React, AWS, Docker, microservices, ci/cd.")], education: [edu("NUS", "MSc Computer Science")], skills: [{ Name: "TypeScript" }, { Name: "React" }, { Name: "AWS" }] })],
  ["Dutch marketing manager", make({ permit: "eu", birth: 1991, origin: "dutch", dutch: "native", cv: "Marketing manager, 6 years. SEO, content marketing, Google Analytics, HubSpot. Bachelor Communication.", positions: [pos("Marketing Manager", "Bol", "Utrecht, Netherlands", "Jan 2019", "", "SEO, content marketing, Google Analytics, HubSpot, social media.")], education: [edu("Hogeschool Utrecht", "Bachelor Communication")], skills: [{ Name: "SEO" }, { Name: "HubSpot" }] })],
  ["fresh graduate, nothing written", make({ permit: "orientation_year", birth: 2000, origin: "non_eu", dutch: "none", cv: "", positions: [], education: [], skills: [] })],
  ["keyword-stuffed CV, no roles", make({ permit: "other_non_eu", birth: 1998, origin: "non_eu", dutch: "basic", cv: "excel sql python tableau power bi ifrs audit tax budgeting forecasting financial reporting data analysis stakeholder management project management agile", positions: [], education: [], skills: [] })],
  ["PhD researcher", make({ permit: "hsm", birth: 1993, origin: "non_eu", dutch: "none", cv: "PhD in machine learning. Python, PyTorch, statistics, deep learning, NLP.", positions: [pos("PhD Researcher", "TU Delft", "Delft, Netherlands", "Sep 2020", "Sep 2024", "Machine learning research, Python, PyTorch, statistics.")], education: [edu("TU Delft", "PhD Computer Science")], skills: [{ Name: "Python" }, { Name: "PyTorch" }] })],
  ["career switcher, accountant to data", make({ permit: "eu", birth: 1996, origin: "eu_non_native", dutch: "basic", cv: "Accountant moving into data. Excel, SQL course, Python basics. Bachelor Accounting.", positions: [pos("Junior Accountant", "Mazars", "Brussels, Belgium", "Jan 2021", "Dec 2024", "Audit, reconciliation, Excel, financial reporting.")], education: [edu("KU Leuven", "Bachelor Accounting")], skills: [{ Name: "Excel" }, { Name: "SQL" }] })],
  ["student with internship", make({ permit: "orientation_year", birth: 2001, origin: "non_eu", dutch: "none", cv: "Bachelor student. Marketing internship. Social media, content creation, Canva.", positions: [pos("Marketing Intern", "Unilever", "Rotterdam, Netherlands", "Jun 2025", "Sep 2025", "Social media, content creation, market research.")], education: [edu("Rotterdam School of Management", "Bachelor Business")], skills: [{ Name: "Social Media" }] })],
  ["12 years in operations, no degree", make({ permit: "other_non_eu", birth: 1986, abroad: 24, origin: "non_eu", dutch: "basic", cv: "Operations lead, 12 years. Supply chain, procurement, inventory management, SAP, vendor management.", positions: [pos("Operations Lead", "Lazada", "Manila, Philippines", "Jan 2014", "", "Supply chain, procurement, inventory management, SAP, vendor management.")], education: [], skills: [{ Name: "SAP" }] })],
]

const problems = new Map<string, string[]>()
const flag = (kind: string, detail: string): void => {
  const list = problems.get(kind) ?? []
  if (list.length < 4) {
    list.push(detail)
  } else if (list.length === 4) {
    list.push("…")
  }
  problems.set(kind, list)
}
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x)
const quantile = (xs: number[], q: number): number => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] : NaN)
const pct = (x: number): string => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "–")

function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(xs.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) {
      j++
    }
    for (let k = i; k <= j; k++) {
      out[order[k][1]] = (i + j) / 2
    }
    i = j + 1
  }

  return out
}
function spearman(a: number[], b: number[]): number {
  const ra = ranks(a)
  const rb = ranks(b)
  const mean = (x: number[]): number => x.reduce((s, v) => s + v, 0) / x.length
  const ma = mean(ra)
  const mb = mean(rb)
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb)
    da += (ra[i] - ma) ** 2
    db += (rb[i] - mb) ** 2
  }

  return da && db ? num / Math.sqrt(da * db) : NaN
}

const [posts, ref] = await Promise.all([fetchPostings(), fetchReference()])
const shares = computeShares(posts)
console.log(`${posts.length} postings x ${CVS.length} CVs\n`)

const mids: Array<Map<string, number>> = CVS.map(() => new Map())
for (const [ci, [name, profile]] of CVS.entries()) {
  let passing = 0
  let fits = 0
  const values: number[] = []
  for (const post of posts) {
    let st: Standing
    try {
      st = standing(post, profile, ref, shares, NO_WHAT_IF, false)
      const again = standing(post, profile, ref, shares, NO_WHAT_IF, false)
      if (JSON.stringify(again.rate) !== JSON.stringify(st.rate)) {
        flag("the same input gave two answers", `${name}: ${post.id}`)
      }
    } catch (e) {
      flag("a calculation throws", `${name}: ${post.id}: ${(e as Error).message}`)
      continue
    }
    if (st.fit) {
      fits++
      if (!finite(st.fit.score) || st.fit.score < 0 || st.fit.score > 1) {
        flag("fit outside 0 to 1", `${name}: ${post.id}: ${st.fit.score}`)
      }
    }
    if (!st.rate) {
      continue
    }
    passing++
    const { low, mid, high } = st.rate
    if (![low, mid, high].every(finite) || low <= 0 || low > high || high > 0.54 + 1e-9 || mid < low - 1e-12 || mid > high + 1e-12) {
      flag("chance out of range", `${name}: ${post.id}: ${low}..${high}`)
    }
    values.push(mid)
    mids[ci].set(post.id, mid)

    // Changes that can only help must never lower the chance.
    const missing = st.checklist.filter((c) => !c.have).map((c) => c.skill)
    const helps: Array<[string, () => Standing]> = [
      ["adding every missing skill", () => standing(post, profile, ref, shares, { ...NO_WHAT_IF, skills: missing }, false)],
      ["a referral", () => standing(post, profile, ref, shares, NO_WHAT_IF, true)],
      ["a tailored CV", () => standing(post, profile, ref, shares, { ...NO_WHAT_IF, tailor: true }, false)],
    ]
    for (const [label, run] of helps) {
      const alt = run()
      if (alt.rate && alt.rate.mid < st.rate.mid - 1e-12) {
        flag(`${label} lowered the chance`, `${name}: ${post.id}: ${pct(st.rate.mid)} to ${pct(alt.rate.mid)}`)
      }
    }
  }
  console.log(`${name.padEnd(40)} passes the gates on ${String(passing).padStart(4)} of ${posts.length} · fit judged on ${String(fits).padStart(4)} · chance P10 ${pct(quantile(values, 0.1))}  median ${pct(quantile(values, 0.5))}  P90 ${pct(quantile(values, 0.9))}`)
}

// Tailoring across CVs: the same job must not give everyone the same number.
let allSame = 0
let judged = 0
for (const post of posts) {
  const got = CVS.map((_, i) => mids[i].get(post.id)).filter((v): v is number => v !== undefined)
  if (got.length >= 3) {
    judged++
    if (new Set(got.map((v) => v.toFixed(6))).size === 1) {
      allSame++
    }
  }
}
console.log(`\njobs that at least 3 CVs pass: ${judged}; of these, ${allSame} give every one of those CVs exactly the same number`)
if (judged > 0 && allSame / judged > 0.25) {
  flag("too many jobs show one number for everyone", `${allSame} of ${judged}`)
}

// Two different CVs must not order the jobs the same way.
const pairs: Array<[number, number]> = [[0, 1], [0, 3], [1, 3], [1, 7], [2, 6]]
for (const [a, b] of pairs) {
  const both = posts.filter((p) => mids[a].has(p.id) && mids[b].has(p.id))
  if (both.length > 30) {
    const rho = spearman(both.map((p) => mids[a].get(p.id) as number), both.map((p) => mids[b].get(p.id) as number))
    console.log(`ranking agreement (Spearman) "${CVS[a][0]}" vs "${CVS[b][0]}": ${rho.toFixed(2)} over ${both.length} jobs`)
    if (rho > 0.97) {
      flag("two different CVs rank the jobs almost identically", `${CVS[a][0]} vs ${CVS[b][0]}: ${rho.toFixed(2)}`)
    }
  }
}

if (problems.size === 0) {
  console.log("\nOK: every CV behaves, and the jobs differ between CVs.")
} else {
  for (const [kind, list] of problems) {
    console.log(`\n✗ ${kind}`)
    for (const l of list) {
      console.log(`    ${l}`)
    }
  }
  process.exit(1)
}
