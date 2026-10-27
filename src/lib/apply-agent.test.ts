import { describe, expect, test } from "bun:test"
import {
  applyAgentEnabled,
  factsForAgent,
  hostOf,
  isDeniedQuestion,
  validateSuggestedAnswers,
  type ApplyQuestion,
} from "../../supabase/functions/_shared/apply-agent"

const questions: ApplyQuestion[] = [
  { key: "sql-years", label: "How many years of experience do you have with SQL?", kind: "text" },
  { key: "auth", label: "Are you authorized to work in the Netherlands?", kind: "select", options: ["Yes", "No"] },
  { key: "gender", label: "What is your gender?", kind: "select", options: ["Male", "Female", "Prefer not to answer"] },
  { key: "salary", label: "Expected monthly salary", kind: "number" },
]

describe("isDeniedQuestion", () => {
  test("blocks demographics, family, legal, consent and secrets", () => {
    expect(isDeniedQuestion("What is your gender?")).toBe(true)
    expect(isDeniedQuestion("Do you have a relative working here?")).toBe(true)
    expect(isDeniedQuestion("I agree to the privacy statement")).toBe(true)
    expect(isDeniedQuestion("Enter password")).toBe(true)
    expect(isDeniedQuestion("How many years with SQL?")).toBe(false)
  })
  test("never false-censors contact/org labels Broods must fill (Family name, LinkedIn, Website)", () => {
    expect(isDeniedQuestion("Family name")).toBe(false)
    expect(isDeniedQuestion("Last name / Family name")).toBe(false)
    expect(isDeniedQuestion("Parent company")).toBe(false)
    expect(isDeniedQuestion("LinkedIn")).toBe(false)
    expect(isDeniedQuestion("Website")).toBe(false)
    expect(isDeniedQuestion("Terms of the internship")).toBe(false)
  })
})

describe("validateSuggestedAnswers", () => {
  test("accepts matching options and drops deny-list, unknown keys, bad options and low confidence", () => {
    const { accepted, rejected } = validateSuggestedAnswers(questions, [
      { key: "sql-years", answer: "2", confidence: 0.9 },
      { key: "auth", answer: "Maybe", confidence: 1 },
      { key: "auth", answer: "Yes", confidence: 0.8 },
      { key: "gender", answer: "Prefer not to answer", confidence: 1 },
      { key: "missing", answer: "x", confidence: 1 },
      { key: "salary", answer: "1500", confidence: 0.2 },
    ])
    expect(accepted.map((a) => a.key)).toEqual(["sql-years"])
    expect(rejected.map((r) => r.reason)).toEqual([
      "not_an_option",
      "duplicate_or_missing_key",
      "deny_list",
      "unknown_key",
      "low_confidence",
    ])
  })

  test("select/radio must match an option exactly", () => {
    const { accepted, rejected } = validateSuggestedAnswers(
      [{ key: "auth", label: "Authorized?", kind: "radio", options: ["Yes", "No"] }],
      [{ key: "auth", answer: "yes", confidence: 1 }],
    )
    expect(accepted).toEqual([])
    expect(rejected[0]?.reason).toBe("not_an_option")
  })
})

describe("factsForAgent", () => {
  test("keeps allow-listed Autofill fields and drops the rest", () => {
    expect(factsForAgent({
      first_name: "Kien",
      notes: "Available four days a week",
      expected_salary: "EUR 1500",
      gender: "Man",
      demographics: "y",
      religion: "z",
    } as Record<string, string>)).toEqual({ first_name: "Kien", notes: "Available four days a week", expected_salary: "EUR 1500", gender: "Man" })
  })

  test("internship Autofill keys reach Broods / rules (study + agreement + start)", () => {
    const out = factsForAgent({
      study_status: "Yes, enrolled",
      internship_agreement: "Yes, compulsory",
      start_date: "ASAP",
      onsite_ok: "Yes",
      cover_letter: "long essay must drop",
    } as Record<string, string>)
    expect(out).toEqual({
      study_status: "Yes, enrolled",
      internship_agreement: "Yes, compulsory",
      start_date: "ASAP",
      onsite_ok: "Yes",
    })
  })
})

describe("applyAgentEnabled / hostOf", () => {
  test("webhook only when https URL set and backend is not none", () => {
    expect(applyAgentEnabled({})).toBe(false)
    expect(applyAgentEnabled({ applyAgentWebhookUrl: "https://agent.example/hook" })).toBe(true)
    expect(applyAgentEnabled({ applyAgentWebhookUrl: "https://agent.example/hook", applyAgentBackend: "none" })).toBe(false)
    expect(applyAgentEnabled({ applyAgentWebhookUrl: "http://insecure.example" })).toBe(false)
  })

  test("hostOf returns hostname only", () => {
    expect(hostOf("https://boards.greenhouse.io/acme/jobs/1")).toBe("boards.greenhouse.io")
    expect(hostOf("not a url")).toBe(null)
  })
})
