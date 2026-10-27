import { describe, expect, test } from "bun:test"
import { acceptActionPick, actionButtonsFingerprint, factsFromAgentPayload, pickSuggestAction, suggestFromRules } from "../../supabase/functions/_shared/apply-agent-suggest"

describe("suggestFromRules", () => {
  test("zoekjaar facts → no sponsorship, yes right to work, matching select options", () => {
    const facts = factsFromAgentPayload({
      first_name: "Chi",
      last_name: "Kien",
      work_authorization: "zoekjaar / orientation year",
    }, "p1")
    const answers = suggestFromRules(
      [
        { key: "sponsor", label: "Will you require visa sponsorship?", kind: "select", options: ["Yes", "No"] },
        { key: "auth", label: "Are you legally authorized to work in the Netherlands?", kind: "select", options: ["Yes", "No"] },
        { key: "gender", label: "What is your gender?", kind: "select", options: ["Male", "Female", "Prefer not to answer"] },
      ],
      facts,
    )
    expect(answers.find((a) => a.key === "sponsor")?.answer).toBe("No")
    expect(answers.find((a) => a.key === "auth")?.answer).toBe("Yes")
    expect(answers.find((a) => a.key === "sponsor")?.evidence).toBe("work_authorization:zoekjaar")
    expect(answers.find((a) => a.key === "gender")).toBeUndefined()
  })

  test("salary_expectation alias and numeric 3000 fill a salary question", () => {
    const facts = factsFromAgentPayload({ salary_expectation: 3000 }, "p1")
    const answers = suggestFromRules(
      [{ key: "pay", label: "What are your salary expectations?", kind: "text" }],
      facts,
    )
    expect(answers.find((a) => a.key === "pay")?.answer).toBe("3000")
    expect(answers.find((a) => a.key === "pay")?.evidence).toBe("expected_salary")
  })

  test("Karl-style internship Autofill facts fill before Broods needs the LLM", () => {
    const facts = factsFromAgentPayload({
      study_status: "Yes, enrolled in a Bachelor's degree program",
      internship_agreement: "Yes, compulsory internship",
      start_date: "As soon as possible",
      work_authorization: "EU passport / free movement",
      relocation: "Amsterdam; yes I can relocate",
    }, "karl1")
    const answers = suggestFromRules(
      [
        { key: "enrolled", label: "Are you currently enrolled in a Bachelor's or Master's degree program for the internship?", kind: "text" },
        { key: "compulsory", label: "Is this a compulsory internship as part of your studies?", kind: "text" },
        { key: "start", label: "When would you be able to start?", kind: "text" },
        { key: "based", label: "Where are you based? Are you able to relocate?", kind: "text" },
      ],
      facts,
    )
    expect(answers.find((a) => a.key === "enrolled")?.answer).toMatch(/enrolled|Bachelor/i)
    expect(answers.find((a) => a.key === "compulsory")?.answer).toMatch(/compulsory|Yes/i)
    expect(answers.find((a) => a.key === "start")?.answer).toMatch(/soon|possible|ASAP/i)
    expect(answers.find((a) => a.key === "based")?.answer).toMatch(/Amsterdam|relocate/i)
  })
})

describe("pickSuggestAction", () => {
  test("picks Apply/Next from live button labels; never Submit", () => {
    expect(pickSuggestAction(["Share", "Apply now", "Submit application"]).text).toBe("Apply now")
    expect(pickSuggestAction(["Cancel", "Submit application"]).action).toBe("none")
    expect(pickSuggestAction(["Save and continue", "Submit"]).text).toBe("Save and continue")
  })

  test("exclude dead click so stuck retry can take over with another control", () => {
    const buttons = ["Apply now", "Continue to employer", "Share"]
    const exclude = new Set(["apply now"])
    const usable = buttons.filter((t) => !exclude.has(t.toLowerCase()))
    expect(pickSuggestAction(usable).text).toBe("Continue to employer")
    expect(pickSuggestAction(usable.filter((t) => t !== "Continue to employer")).action).toBe("none")
  })

  test("cookie banner before Apply (Magnet.me Functional only)", () => {
    expect(pickSuggestAction(["Functional only", "All cookies", "Apply now"]).text).toBe("Functional only")
    expect(pickSuggestAction(["Functional only", "All cookies", "Apply now"]).reason).toBe("cookie_dismiss")
  })

  test("never Create profile — direct Apply now under Or continue directly", () => {
    expect(pickSuggestAction(["Create profile", "Apply now"]).text).toBe("Apply now")
    expect(pickSuggestAction(["Create profile", "Sign up"]).action).toBe("none")
  })

  test("locale-proof: unknown label still clicked when href/automation says apply", () => {
    expect(pickSuggestAction([
      { text: "Ứng tuyển ngay", href: "https://jobs.example.com/apply/123", hint: "" },
      { text: "Thêm vào giỏ hàng", href: "/cart", hint: "cart" },
    ]).text).toBe("Ứng tuyển ngay")
    expect(pickSuggestAction([
      { text: "Weird CTA", href: "", hint: "data-automation-id=jobApplicationButton" },
    ]).reason).toBe("apply_signal")
  })
})

describe("acceptActionPick (LLM drive-by-hands)", () => {
  test("accepts exact visible label; rejects invent / deny-list", () => {
    expect(acceptActionPick(["Share", "Open role", "Next"], "Open role").action).toBe("click")
    expect(acceptActionPick(["Share", "Open role", "Next"], "Open role").reason).toBe("llm_hands")
    expect(acceptActionPick(["Share", "Submit"], "Submit").action).toBe("none")
    expect(acceptActionPick(["Share", "Next"], "Made up").reason).toBe("llm_not_on_page")
  })
})

describe("actionButtonsFingerprint", () => {
  test("order-independent so users share the same ATS pattern", () => {
    expect(actionButtonsFingerprint(["Next", "Share"])).toBe(actionButtonsFingerprint(["Share", "Next"]))
  })
})
