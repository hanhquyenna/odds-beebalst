/**
 * The answers every application form asks again, kept once (table application_answers) so Claude fills them in the same way each time and
 * never makes one up. The same fields are listed for the connector in supabase/functions/_shared/application-answers.ts; the test next to
 * this file fails when the two differ.
 */
import { supabase } from "@/lib/supabase"

export interface AnswerField {
  key: string
  label: string
  placeholder: string
  /** A longer box. */
  long?: boolean
}

export const ANSWER_FIELDS: ReadonlyArray<AnswerField> = [
  { key: "phone", label: "Phone number", placeholder: "+31 6 12345678" },
  { key: "website", label: "Website or portfolio", placeholder: "https://" },
  { key: "work_authorization", label: "Right to work in the Netherlands", placeholder: "I need a work permit; the employer sponsors it" },
  { key: "expected_salary", label: "Pay you expect", placeholder: "EUR 600 a month, or negotiable" },
  { key: "start_date", label: "When you can start", placeholder: "1 February 2027" },
  { key: "hours_per_week", label: "Hours a week", placeholder: "40" },
  { key: "notice_period", label: "Notice period", placeholder: "None" },
  { key: "relocation", label: "Willing to move", placeholder: "Yes, anywhere in the Netherlands" },
  { key: "notes", label: "Anything else forms ask", placeholder: "", long: true },
]

export type AnswerValues = Record<string, string>

export async function loadAnswers(): Promise<AnswerValues> {
  const { data, error } = await supabase.from("application_answers").select("data").maybeSingle()
  if (error || !data) return {}
  const raw = (data as { data: unknown }).data
  const out: AnswerValues = {}
  if (raw && typeof raw === "object") for (const f of ANSWER_FIELDS) if (typeof (raw as Record<string, unknown>)[f.key] === "string") out[f.key] = (raw as Record<string, string>)[f.key]

  return out
}

/** Saves all the answers (an empty one is left out). `userId` is the signed-in person: a row is theirs alone. */
export async function saveAnswers(userId: string, values: AnswerValues): Promise<void> {
  const data: AnswerValues = {}
  for (const f of ANSWER_FIELDS) {
    const v = (values[f.key] ?? "").trim().slice(0, f.key === "notes" ? 600 : 200)
    if (v !== "") data[f.key] = v
  }
  const { error } = await supabase.from("application_answers").upsert({ user_id: userId, data, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (error) throw new Error("Could not save. Try again.")
}
