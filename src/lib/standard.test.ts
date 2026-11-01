import { describe, expect, test } from "bun:test"
import { fromJev } from "@/lib/requirements"
import { standardNames, standardise, standardTiers, written } from "@/lib/standard"

const std = (...lines: Array<[string, "must" | "strong" | "optional" | "nice"]>) => standardise(fromJev(lines.map(([text, tier]) => ({ text, tier }))))

describe("standardise", () => {
  test("a tool or skill is shown by its one name, in dictionary order", () => {
    expect(std(["Experience with Python, MATLAB and project management", "must"]).skills).toEqual(["Python", "MATLAB", "Project management"])
  })
  test("experience is years, the largest the lines ask for", () => {
    expect(std(["3+ years of experience in finance", "must"], ["5 years of experience", "must"]).experience).toEqual(["5+ years"])
    expect(std(["Experience in an FSP environment", "must"]).experience).toEqual(["Relevant experience"])
    expect(std(["0-2 years of work experience", "must"]).experience).toEqual(["0–2 years"])
    expect(std(["Must be 18 years of age", "must"]).experience).toEqual([])
  })
  test("education is a degree level, the lowest one asked", () => {
    expect(std(["Bachelor's degree in a relevant field", "must"], ["Master's degree preferred", "must"]).education).toEqual(["Bachelor's degree"])
    expect(std(["A degree in a relevant field", "must"]).education).toEqual(["A degree in a relevant field"])
  })
  test("a degree is read as the lowest level named, and master is not Scrum master or master data", () => {
    expect(std(["Master/Bachelor student in Applied Physics", "must"]).education).toEqual(["Bachelor's degree"])
    expect(std(["Completed Bachelor or Masters education", "must"]).education).toEqual(["Bachelor's degree"])
    expect(std(["Interest in data governance, master data management or BI", "must"]).education).toEqual([])
    expect(std(["Certified Scrum master", "must"]).education).toEqual([])
    expect(std(["You have completed an academic university education (i.e. WO).", "must"]).education).toEqual(["A degree in a relevant field"])
  })
  test("a language is named, with no level: the tier already says how much it is asked", () => {
    expect(std(["Good command of the Dutch and English language both written and spoken", "must"]).language).toEqual(["Dutch", "English"])
    expect(std(["Fluent in English", "must"]).language).toEqual(["English"])
    expect(std(["Dutch is a plus", "must"]).language).toEqual(["Dutch"])
    expect(std(["Native-level English and fluent Dutch", "must"]).language).toEqual(["Dutch", "English"])
  })
  test("conditions: right to work, where you must be, travel, on-call", () => {
    const s = std(["Please note: for this role you need to be eligible to live and work in the Netherlands without sponsorship.", "must"], ["You need to be located in the Netherlands to perform your internship.", "must"], ["Willingness to travel up to 20%", "must"], ["Willingness to take part in on-call duties", "must"])
    expect(s.conditions).toEqual(["Right to work in the Netherlands", "Based in the Netherlands", "Travel", "On-call duties"])
  })
  test("age and enrolment are conditions", () => {
    expect(std(["Must be 18 years of age", "must"]).conditions).toEqual(["At least 18 years old"])
    expect(std(["You are enrolled at an educational institute for the entire duration of the internship, and you are at least 18 years old at the start", "must"]).conditions).toEqual(["At least 18 years old", "Currently enrolled as a student"])
  })
  test("internship length and hours", () => {
    expect(std(["Ability to commit to a minimum of 6 months for the internship", "must"], ["Minimum availability: 32 hours per week", "must"]).conditions).toEqual(["6 months", "32 hours a week"])
  })
  test("Dutch as a subject is not a language", () => {
    expect(std(["Knowledge of Dutch GAAP and Dutch tax law", "must"]).language).toEqual([])
  })
  test("qualities come from a short list, and the posting's sentence is never shown", () => {
    const s = std(["Capable of identifying and communicating with multiple stakeholders.", "must"], ["Attention to detail and the ability to manage multiple projects and deadlines.", "must"])
    expect(s.qualities).toEqual(["Attention to detail", "Time management", "Communication"])
    expect(JSON.stringify(s)).not.toContain("Capable")
  })
  test("a line outside the vocabulary is counted, not rewritten", () => {
    expect(std(["Solid knowledge of P&L, balance sheet, and cash flow relationship", "must"]).unread).toBe(1)
  })
})

describe("one vocabulary everywhere", () => {
  test("names are written the same way each time", () => {
    expect(["sql", "power bi", "ifrs", "financial reporting", "ci/cd", "ios"].map(written)).toEqual(["SQL", "Power BI", "IFRS", "Financial reporting", "CI/CD", "iOS"])
  })
  test("skills named without a tier are written the same way", () => {
    expect(standardNames(["python", "machine learning", "data science", "communication skills"])).toEqual(["Python", "Machine learning", "Data science", "Communication"])
  })
  test("communication is one quality, not a skill and a quality", () => {
    const s = std(["Excellent communication skills", "must"])
    expect(s.skills).toEqual([])
    expect(s.qualities).toEqual(["Communication"])
  })
  test("a thing asked at two levels is shown once, under the strongest", () => {
    const lines = fromJev([
      { text: "Experience with SQL", tier: "must" },
      { text: "SQL is a plus", tier: "optional" },
      { text: "Tableau is a plus", tier: "optional" },
    ])
    const tiers = standardTiers(lines, ["must", "strong", "optional", "nice"])
    expect(tiers.map((t) => [t.tier, t.std.skills])).toEqual([["must", ["SQL"]], ["optional", ["Tableau"]]])
  })
})

describe("Dutch as a language, not as an adjective for something else", () => {
  const { standardise } = require("@/lib/standard") as typeof import("@/lib/standard")
  const req = (text: string) => [{ tier: "must" as const, text, tools: [], skills: [], years: null, degree: null }]
  test("a Dutch university, bank or citizen is not a language requirement", () => {
    for (const t of ["Is enrolled at a Dutch university or school and can provide proof of enrolment", "Dutch citizen or residence permit holder", "You work at a Dutch bank", "Dutch nationality is required", "Dutch bank account"]) {
      expect(JSON.stringify(standardise(req(t)))).not.toContain('"Dutch"')
    }
  })
  test("Dutch as a language still counts", () => {
    for (const t of ["Fluent in Dutch and English", "Dutch speaking", "Excellent command of Dutch"]) expect(JSON.stringify(standardise(req(t)))).toContain('"Dutch"')
  })
})
