import { describe, expect, test } from "bun:test"
import type { Posting } from "@/lib/types"

// supabase.ts throws at import without these, and CI has no .env.local.
process.env.VITE_SUPABASE_URL ??= "http://supabase.test"
process.env.VITE_SUPABASE_ANON_KEY ??= "anon"
const { signalsOf } = await import("@/lib/jobs")

describe("signalsOf", () => {
  test("reads the database's work_signals per posting and skips postings without any", () => {
    const posts = [
      { id: "a", work_signals: ["hybrid", "fullTime"] },
      { id: "b", work_signals: [] },
      { id: "c", work_signals: null },
      { id: "d" },
    ] as Posting[]

    expect(signalsOf(posts)).toEqual({ a: { hybrid: true, remote: false, partTime: false, fullTime: true, contract: false } })
  })
})
