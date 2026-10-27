import { describe, expect, test } from "bun:test"
import { appliedBeforeAnswer, FACT_QUESTION_HINT, ownQuestions, permitWorkAnswers, studyingFrom, widgetAttemptGuard, workFactForQuestion, type FillCommand, type PageField } from "../../supabase/functions/_shared/drive-finish"

describe("ownQuestions", () => {
  test("sends worked-here and applied-before back to Broods", () => {
    const own = ownQuestions([
      "Have you worked at Acme before?",
      "Have you applied to this company before?",
      "Are you authorized to work in the Netherlands?",
      "Why do you want this internship?",
      "What is your notice period?",
      "What are your pronouns?",
    ])
    expect(own).toContain("Have you worked at Acme before?")
    expect(own).toContain("Have you applied to this company before?")
    expect(own).toContain("Are you authorized to work in the Netherlands?")
    expect(own).toContain("Why do you want this internship?")
    expect(own).toContain("What are your pronouns?")
    expect(own).not.toContain("What is your notice period?")
    expect(FACT_QUESTION_HINT).toContain("worked_at_this_employer_before")
    expect(FACT_QUESTION_HINT).toContain("applied_to_this_employer_before")
    expect(FACT_QUESTION_HINT).toContain("needs_sponsorship")
    expect(FACT_QUESTION_HINT).toContain("do not guess")
  })
})

describe("permitWorkAnswers", () => {
  test("eu and zoekjaar may work and do not need sponsorship", () => {
    expect(permitWorkAnswers("eu", null)).toEqual({ needs_sponsorship: "No", right_to_work_nl: "Yes" })
    expect(permitWorkAnswers("orientation_year", false)).toEqual({ needs_sponsorship: "No", right_to_work_nl: "Yes" })
  })

  test("other_non_eu needs sponsorship; right to work follows study status and is omitted when unknown", () => {
    expect(permitWorkAnswers("other_non_eu", true)).toEqual({ needs_sponsorship: "Yes", right_to_work_nl: "Yes" })
    expect(permitWorkAnswers("other_non_eu", false)).toEqual({ needs_sponsorship: "Yes", right_to_work_nl: "No" })
    expect(permitWorkAnswers("other_non_eu", null)).toEqual({ needs_sponsorship: "Yes" })
  })

  test("hsm may work, and sponsorship is left out because a new employer is unclear", () => {
    expect(permitWorkAnswers("hsm", true)).toEqual({ right_to_work_nl: "Yes" })
    expect(permitWorkAnswers("hsm", true).needs_sponsorship).toBeUndefined()
  })

  test("an unknown permit invents nothing", () => {
    expect(permitWorkAnswers("", null)).toEqual({})
    expect(permitWorkAnswers("something-else", true)).toEqual({})
  })

  test("study status: the profile boolean wins, else the saved answer, else unknown", () => {
    expect(studyingFrom(true, "No")).toBe(true)
    expect(studyingFrom(null, "Yes, enrolled full time")).toBe(true)
    expect(studyingFrom(undefined, "No")).toBe(false)
    expect(studyingFrom(null, "")).toBeNull()
  })

  test("a sponsorship question uses only the hard fact", () => {
    const facts = permitWorkAnswers("other_non_eu", null)
    expect(workFactForQuestion("Will you now or in the future require visa sponsorship?", facts)).toEqual({ answer: "Yes", fact: "needs_sponsorship" })
    expect(workFactForQuestion("Are you authorized to work in the Netherlands?", facts)).toBeNull()
    expect(workFactForQuestion("Will you require sponsorship?", permitWorkAnswers("hsm", true))).toBeNull()
    expect(workFactForQuestion("What is your notice period?", facts)).toBeNull()
  })
})

describe("appliedBeforeAnswer", () => {
  test("Yes only when the tracker has this employer, No when it does not, null when unknown", () => {
    expect(appliedBeforeAnswer(["Shell", "Acme Corp"], "Acme")).toBe("Yes")
    expect(appliedBeforeAnswer(["Shell"], "Acme")).toBe("No")
    expect(appliedBeforeAnswer([], "Acme")).toBe("No")
    expect(appliedBeforeAnswer(null, "Acme")).toBeNull()
    expect(appliedBeforeAnswer([], "A")).toBeNull()
  })
})

const dropdown: PageField = { id: "f1", label: "University", kind: "combobox", required: true, filled: false }
const oneTry: FillCommand[] = [{ args: { fields: [{ id: "f1", value: "Vrije" }] }, result: { results: [{ id: "f1", ok: false, tried: ["plain"] }] } }]
const twoWays: FillCommand[] = [{ args: { fields: [{ id: "f1", value: "Vrije" }] }, result: { results: [{ id: "f1", ok: false, tried: ["plain", "typeahead"] }] } }]

describe("widgetAttemptGuard", () => {
  test("captcha, account, closed and email stop at once", () => {
    for (const reason of ["captcha", "account", "closed", "email"]) {
      expect(widgetAttemptGuard({ stage: "needs_you", reason, message: "stop", fields: [dropdown], fills: [], priorRefusals: 0 }).accept).toBe(true)
    }
  })

  test("stuck on a dropdown is refused until two different fill attempts", () => {
    const early = widgetAttemptGuard({ stage: "stuck", reason: "other", message: "the dropdown did not keep the value", fields: [dropdown], fills: oneTry, priorRefusals: 0 })
    expect(early.accept).toBe(false)
    if (!early.accept) {
      expect(early.text).toContain("University")
      expect(early.text).toMatch(/another method/i)
      expect(early.text).toMatch(/call options/i) // the model cannot see screenshots through 9router: never told to look
      expect(early.text).toMatch(/do not finish/i)
    }
    expect(widgetAttemptGuard({ stage: "stuck", reason: "other", message: "the dropdown did not keep the value", fields: [dropdown], fills: twoWays, priorRefusals: 0 }).accept).toBe(true)
  })

  test("the same via and value twice is still one attempt", () => {
    const fills: FillCommand[] = [
      { args: { fields: [{ id: "f1", value: "Vrije" }] }, result: { results: [{ id: "f1", ok: false, via: "plain" }] } },
      { args: { fields: [{ id: "f1", value: "Vrije" }] }, result: { results: [{ id: "f1", ok: false, via: "plain" }] } },
    ]
    expect(widgetAttemptGuard({ stage: "stuck", reason: "other", message: "the dropdown did not keep the value", fields: [dropdown], fills, priorRefusals: 0 }).accept).toBe(false)
  })

  test("two fill calls with different values count as two attempts", () => {
    const fills: FillCommand[] = [
      { args: { fields: [{ id: "f1", value: "Vrije" }] }, result: { results: [{ id: "f1", ok: false, via: "plain" }] } },
      { args: { fields: [{ id: "f1", value: "Amsterdam" }] }, result: { results: [{ id: "f1", ok: false, via: "plain" }] } },
    ]
    expect(widgetAttemptGuard({ stage: "needs_you", reason: "other", message: "autocomplete will not take it", fields: [dropdown], fills, priorRefusals: 0 }).accept).toBe(true)
  })

  test("a real question stop is not held for widget attempts", () => {
    const essay: PageField = { id: "f2", label: "Notice period", kind: "text", required: true, filled: false }
    expect(widgetAttemptGuard({ stage: "needs_you", reason: "questions", message: "What is your notice period?", fields: [essay], fills: [], priorRefusals: 0 }).accept).toBe(true)
  })

  test("no Next is sent back once, then accepted", () => {
    const first = widgetAttemptGuard({ stage: "stuck", reason: "other", message: "there is no Next button", fields: [], fills: [], priorRefusals: 0 })
    expect(first.accept).toBe(false)
    expect(widgetAttemptGuard({ stage: "stuck", reason: "other", message: "there is no Next button", fields: [], fills: [], priorRefusals: 1 }).accept).toBe(true)
  })

  test("a third refusal is not sent, so the model cannot loop", () => {
    expect(widgetAttemptGuard({ stage: "stuck", reason: "other", message: "toggle did not register", fields: [dropdown], fills: oneTry, priorRefusals: 2 }).accept).toBe(true)
  })

  test("aria-invalid on a required field counts as failing", () => {
    const invalid: PageField = { id: "f3", label: "Start date", kind: "text", required: true, filled: true, invalid: true }
    const early = widgetAttemptGuard({ stage: "stuck", reason: "other", message: "the form reports errors", fields: [invalid], fills: [], priorRefusals: 0 })
    expect(early.accept).toBe(false)
    if (!early.accept) expect(early.text).toContain("Start date")
  })
})
