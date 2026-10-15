import { describe, expect, test } from "bun:test"
import { SETUP_QUESTIONS } from "@/lib/setup-questions"
import { ANSWER_KEYS } from "../../supabase/functions/_shared/application-answers"
import { answerText, chooseOption } from "../../supabase/functions/_shared/apply-form"

const choice = (key: string, label: string): string => SETUP_QUESTIONS.find((q) => q.key === key)?.choices?.find((c) => c.label === label)?.value ?? ""

describe("the setup questions", () => {
  test("every question is a field of the answers, so what is kept is what forms read", () => {
    for (const q of SETUP_QUESTIONS) expect((ANSWER_KEYS as readonly string[]).includes(q.key)).toBe(true)
  })
  test("each permit choice answers 'need sponsorship?' and 'allowed to work?' the right way round", () => {
    const free = { answers: { work_authorization: choice("work_authorization", "No, I can work freely") } }
    const sponsored = { answers: { work_authorization: choice("work_authorization", "Yes, the employer sponsors it") } }
    const permit = { answers: { work_authorization: choice("work_authorization", "I already have a permit") } }
    expect(answerText("Will you now or in the future require visa sponsorship?", free)).toBe("No")
    expect(answerText("Are you legally authorized to work in the Netherlands?", free)).toBe("Yes")
    expect(answerText("Will you now or in the future require visa sponsorship?", sponsored)).toBe("Yes")
    expect(answerText("Are you legally authorized to work in the Netherlands?", sponsored)).toBe("No")
    expect(answerText("Will you now or in the future require visa sponsorship?", permit)).toBe("No")
    expect(answerText("Are you legally authorized to work in the Netherlands?", permit)).toBe("Yes")
  })
  test("the student choices pick the right option in a yes/no form question", () => {
    const enrolled = { answers: { study_status: choice("study_status", "Yes, full time") } }
    const agreement = { answers: { internship_agreement: choice("internship_agreement", "No, not needed") } }
    expect(chooseOption(["Yes", "No"], answerText("Are you currently enrolled at a university?", enrolled) ?? "")).toBe(0)
    expect(chooseOption(["Yes", "No"], answerText("Does your university provide an internship agreement?", agreement) ?? "")).toBe(1)
  })
})
