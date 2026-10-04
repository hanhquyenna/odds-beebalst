import { describe, expect, test } from "bun:test"
import { guessFamily as app } from "@/lib/field"
import { guessFamily as server } from "../../supabase/functions/_shared/job-family"

const CASES: Array<[string, string[]]> = [
  ["Software Engineer Intern", ["python", "docker"]],
  ["Marketing Intern", []],
  ["Climate Growth Equity Intern", ["excel"]],
  ["Financial Analyst", ["excel", "financial modelling"]],
  ["Data Scientist", ["python", "sql", "machine learning"]],
  ["HR Business Partner", []],
  ["Supply Chain Planner", ["sap"]],
  ["Customer Support Specialist", []],
  ["UX Designer", []],
  ["Management Consultant", ["stakeholder management"]],
  ["Compliance Officer", ["kyc/aml", "compliance"]],
  ["Maintenance Engineer", []],
  ["Account Executive", []],
  ["Junior Accountant", ["excel", "audit"]],
  ["Zzzz Qqqq", []],
]

describe("the server's line of work is the app's", () => {
  test.each(CASES)("%s", (title, skills) => {
    expect(server(title, skills)).toBe(app(title, skills))
  })
})
