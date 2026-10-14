// The answers every application form asks again, kept once per person (table application_answers) so Claude fills them in the same way
// each time and never makes one up. The app's Profile page edits the same fields (src/lib/application-answers.ts lists them again for
// the screen; src/lib/application-answers.test.ts fails when the two lists differ).

export const ANSWER_KEYS = ["first_name", "last_name", "email", "phone", "linkedin", "address", "city", "postcode", "country", "website", "work_authorization", "expected_salary", "start_date", "hours_per_week", "notice_period", "relocation", "university", "degree", "field_of_study", "graduation_date", "study_status", "internship_agreement", "nationality", "notes"] as const
export type AnswerKey = (typeof ANSWER_KEYS)[number]
export type Answers = Partial<Record<AnswerKey, string>>

/** Only the known fields, each a short single-spaced text; an empty one removes the field. */
export function cleanAnswers(raw: unknown): Answers {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out: Answers = {}
  for (const key of ANSWER_KEYS) {
    const v = r[key]
    if (typeof v !== "string") continue
    const t = v.replace(/[\r\t]+/g, " ").replace(/[ ]{2,}/g, " ").trim().slice(0, key === "notes" ? 600 : 200)
    if (t !== "") out[key] = t
  }

  return out
}

/** The fields still empty, the ones a form is most likely to ask first. */
export function missingAnswers(answers: Answers): AnswerKey[] {
  return ANSWER_KEYS.filter((k) => k !== "notes" && !answers[k])
}
