import { describe, expect, test } from "bun:test"
import * as PDFLib from "pdf-lib"
import { SKILLS } from "@/lib/skills"
import { cvText, renderCvOnePage } from "../../supabase/functions/_shared/cv-template"
import { analyse, assemble, checkLetter, leaks, letterChanges, type Ctx, type Wanted } from "../../supabase/functions/_shared/tailor-cv"

const CV = `KIEN PHUNG
kien@example.com | Amsterdam

EDUCATION
University of Amsterdam
BSc Communication Science Sep 2024 – Jun 2027

SKILLS
Excel, SQL, Python

EXPERIENCE
FLC Group Mar 2026 – Aug 2026
Corporate Finance Specialist
Hanoi, Vietnam
• Built DCF models for $100M+ real estate deals
• Ran feasibility studies in Excel and SQL
BIDV May 2024 – Aug 2024
Business Strategy Intern
• Produced 10+ market reports for the strategy team`

const want = (name: string, tier: Wanted["tier"]): Wanted => ({ name, label: name === "sql" ? "SQL" : name[0].toUpperCase() + name.slice(1), tier, pattern: SKILLS[name].source })
const ctx = (extra = ""): Ctx => ({
  cv: CV,
  facts: { extra, name: "Kien Phung", email: "kien@example.com", place: "Amsterdam" },
  wanted: [want("sql", "must"), want("tableau", "must"), want("forecasting", "strong"), want("python", "nice")],
  job: { title: "Finance Analyst", employer: "Acme" },
})

/** What a model might send back: rewords honestly, but also tries to slip in what the CV lacks. */
const greedy = {
  name: "Kien Phung",
  contact: { email: "kien@example.com", place: "Amsterdam" },
  summary: { was: null, now: "Finance student who builds DCF models in Excel and SQL, with Tableau dashboards and forecasting." },
  skills: [{ label: "Tools", items: ["Excel", "SQL", "Python", "Tableau", "Forecasting"] }],
  experience: [
    {
      title: "Corporate Finance Specialist", company: "FLC Group", location: "Hanoi, Vietnam", start: "Mar 2026", end: "Aug 2026",
      bullets: [
        { was: "Built DCF models for $100M+ real estate deals", now: "Built DCF models for $100M+ real estate deals using SQL" },
        { was: "Ran feasibility studies in Excel and SQL", now: "Ran feasibility studies in Tableau and SQL, cutting reporting time by 40%" },
        { was: null, now: "Led a team of 12 analysts at Goldman Sachs" },
      ],
    },
    { title: "Business Strategy Intern", company: "BIDV", start: "May 2024", end: "Aug 2024", bullets: [{ was: "Produced 10+ market reports for the strategy team", now: "Wrote 10+ market reports for the strategy team, with forecasting" }] },
  ],
  education: [{ school: "University of Amsterdam", degree: "BSc", field: "Communication Science", start: "Sep 2024", end: "Jun 2027" }],
}

describe("analyse", () => {
  test("a keyword the CV lacks is missing; one it has is backed", () => {
    const { supported, missing } = analyse(CV, ctx().facts, ctx().wanted)
    expect(supported.map((w) => w.name).sort()).toEqual(["python", "sql"])
    expect(missing.map((w) => w.name).sort()).toEqual(["forecasting", "tableau"])
  })
  test("the profile backs a keyword the CV text does not say", () => {
    const { supported } = analyse(CV, ctx("Tableau, Looker").facts, ctx().wanted)
    expect(supported.map((w) => w.name)).toContain("tableau")
  })
})

describe("assemble: never invent", () => {
  const out = assemble(greedy, ctx())
  if (!out.ok) throw new Error(out.errors.join("; "))
  const text = cvText(out.result.cv)

  test("a keyword the CV lacks stays out of the finished CV and is reported as missing", () => {
    expect(text.toLowerCase()).not.toContain("tableau")
    expect(text.toLowerCase()).not.toContain("forecasting")
    expect(leaks(text, ctx().wanted.filter((w) => ["tableau", "forecasting"].includes(w.name)))).toEqual([])
    expect(out.result.missing.map((m) => m.name).sort()).toEqual(["forecasting", "tableau"])
  })
  test("a line that brings in a number or an employer the CV does not have is replaced by the person's own words", () => {
    expect(text).not.toContain("40%")
    expect(text).not.toContain("Goldman")
    expect(text).not.toContain("12 analysts")
    expect(text).toContain("Ran feasibility studies in Excel and SQL")
  })
  test("a keyword the CV backs may be worked in, and is counted as a change", () => {
    expect(text).toContain("Built DCF models for $100M+ real estate deals using SQL")
    expect(out.result.counts.reworded).toBeGreaterThan(0)
    expect(out.result.kept_original.length).toBeGreaterThan(0)
  })
  test("employers, titles, schools and dates are the CV's", () => {
    const jobs = out.result.cv.experience
    expect(jobs.map((j) => j.company)).toEqual(["FLC Group", "BIDV"])
    expect(jobs[0].start).toBe("Mar 2026")
    expect(out.result.cv.education[0].school).toBe("University of Amsterdam")
  })
  test("a skill nothing backs is dropped from the skills row", () => {
    expect(out.result.cv.skills[0].items).toEqual(["Excel", "SQL", "Python"])
  })
  test("a skill the profile backs may be added", () => {
    const withProfile = assemble(greedy, ctx("Tableau"))
    if (!withProfile.ok) throw new Error(withProfile.errors.join("; "))
    expect(withProfile.result.cv.skills[0].items).toContain("Tableau")
    expect(withProfile.result.added_keywords).toContain("Tableau")
    expect(withProfile.result.missing.map((m) => m.name)).toEqual(["forecasting"])
  })
})

describe("assemble: facts must match the CV", () => {
  test("a made-up employer or date builds nothing", () => {
    const bad = { ...greedy, experience: [{ ...greedy.experience[0], company: "Google" }, greedy.experience[1]] }
    const r = assemble(bad, ctx())
    expect(r.ok).toBe(false)
    const dates = assemble({ ...greedy, experience: [{ ...greedy.experience[0], start: "Jan 2019" }, greedy.experience[1]] }, ctx())
    expect(dates.ok).toBe(false)
    const degree = assemble({ ...greedy, education: [{ ...greedy.education[0], degree: "MSc" }] }, ctx())
    expect(degree.ok).toBe(false)
  })
})

describe("cover letter", () => {
  const good = "Dear hiring team,\n\nI am applying for the Finance Analyst role at Acme. At FLC Group I built DCF models for $100M+ real estate deals and ran feasibility studies in Excel and SQL.\n\nAt BIDV I produced 10+ market reports for the strategy team. I would like to bring the same care to Acme.\n\nKind regards,\nKien Phung"
  test("a true letter passes", () => expect(checkLetter(good, ctx())).toEqual([]))
  test("a letter that names a keyword the CV lacks, or a made-up number, is refused", () => {
    expect(checkLetter(good.replace("Excel and SQL", "Tableau and SQL"), ctx()).join(" ")).toContain("Tableau")
    expect(checkLetter(good.replace("10+", "300"), ctx()).join(" ")).toContain("300")
  })
  test("paragraphs are told apart as unchanged, reworded or added", () => {
    const changes = letterChanges(good, "Dear hiring team,\n\nI am applying for a finance role.\n\nAt BIDV I produced 10+ market reports for the strategy team. I would like to bring the same care to Acme.\n\nKind regards,\nKien Phung")
    expect(changes.map((c) => c.kind)).toEqual(["unchanged", "reworded", "unchanged", "unchanged"])
  })
})

describe("one page", () => {
  test("a CV that runs a little over fits one page at a slightly smaller size", async () => {
    const out = assemble(greedy, ctx())
    if (!out.ok) throw new Error("no")
    const cv = { ...out.result.cv, experience: [...out.result.cv.experience, ...out.result.cv.experience, ...out.result.cv.experience].map((j) => ({ ...j, bullets: [...j.bullets, ...j.bullets, ...j.bullets, ...j.bullets, ...j.bullets, ...j.bullets] })) }
    const made = await renderCvOnePage(PDFLib as never, cv)
    expect(made.bytes.length).toBeGreaterThan(500)
    const short = await renderCvOnePage(PDFLib as never, out.result.cv)
    expect(short.pages).toBe(1)
  })
})
