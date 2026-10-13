import { describe, expect, test } from "bun:test"
// supabase.ts throws at import without these, and CI has no .env.local.
process.env.VITE_SUPABASE_URL ??= "http://supabase.test"
process.env.VITE_SUPABASE_ANON_KEY ??= "anon"
const { ANSWER_FIELDS } = await import("@/lib/application-answers")
import { ANSWER_KEYS, cleanAnswers, missingAnswers } from "../../supabase/functions/_shared/application-answers"

describe("application answers", () => {
  test("the screen and the connector list the same fields in the same order", () => {
    expect(ANSWER_FIELDS.map((f) => f.key)).toEqual([...ANSWER_KEYS])
  })
  test("only known fields are kept, trimmed and short; empty ones are dropped", () => {
    expect(cleanAnswers({ phone: "  +31   6 1 ", website: "", nope: "x", notes: "a".repeat(900), start_date: 5 })).toEqual({ phone: "+31 6 1", notes: "a".repeat(600) })
    expect(cleanAnswers(null)).toEqual({})
    expect(cleanAnswers([1])).toEqual({})
  })
  test("names what is still missing, notes aside", () => {
    expect(missingAnswers({ phone: "1" })).toEqual(ANSWER_KEYS.filter((k) => k !== "phone" && k !== "notes"))
    expect(missingAnswers(Object.fromEntries(ANSWER_KEYS.map((k) => [k, "x"])))).toEqual([])
  })
})
