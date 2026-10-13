import { describe, expect, test } from "bun:test"
import type { Draft } from "@/lib/outreach"
import type { Person } from "@/lib/types"

// supabase.ts throws at import without these, and CI has no .env.local.
process.env.VITE_SUPABASE_URL ??= "http://supabase.test"
process.env.VITE_SUPABASE_ANON_KEY ??= "anon"
const { personAfterSent, toApply } = await import("@/lib/outreach")

const person = (over: Partial<Person> = {}): Person => ({ id: "p1", name: "Ada", company: "Acme", jobId: "j1", status: "To contact", contact: "", notes: "", ...over })
const draft = (over: Partial<Draft> = {}): Draft => ({ id: "d1", personId: "p1", postingId: "j1", toName: "Ada", toUrl: null, channel: "linkedin_message", subject: null, body: "Hello Ada", status: "sent", createdAt: "2026-10-12T10:00:00Z", sentAt: "2026-10-12T11:00:00Z", applied: false, ...over })

describe("a message that went out", () => {
  test("moves a person from To contact to Contacted and keeps the message on them", () => {
    const patch = personAfterSent(person(), draft())!
    expect(patch.status).toBe("Contacted")
    expect(patch.statusAt).toBeTruthy()
    expect(patch.messages).toEqual([{ id: "d1", date: "2026-10-12T11:00:00Z", kind: "Introduction", direction: "sent", body: "Hello Ada" }])
  })
  test("leaves a person who is further on where they are, and puts an email's subject first", () => {
    const patch = personAfterSent(person({ status: "Replied" }), draft({ subject: "Hi", body: "Body" }))!
    expect(patch.status).toBeUndefined()
    expect(patch.messages?.[0].body).toBe("Hi\n\nBody")
  })
  test("is applied once: a message already kept changes nothing", () => {
    expect(personAfterSent(person({ messages: [{ id: "d1", date: "x", kind: "Other", direction: "sent", body: "x" }] }), draft())).toBeNull()
  })
  test("only sent, not yet applied drafts of people on the list are applied", () => {
    const list = [person(), person({ id: "p2", name: "Bo" })]
    const found = toApply([draft(), draft({ id: "d2", status: "draft" }), draft({ id: "d3", applied: true }), draft({ id: "d4", personId: null }), draft({ id: "d5", personId: "gone" }), draft({ id: "d6", personId: "p2" })], list)
    expect(found.map((x) => x.draft.id)).toEqual(["d1", "d6"])
  })
})
