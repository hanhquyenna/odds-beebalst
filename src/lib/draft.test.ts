import { beforeEach, describe, expect, test } from "bun:test"

const store = new Map<string, string>()
Object.assign(globalThis, {
  window: {
    localStorage: { getItem: (k: string): string | null => store.get(k) ?? null, setItem: (k: string, v: string): void => void store.set(k, v), removeItem: (k: string): void => void store.delete(k) },
  },
})
const { loadDraft, saveDraft } = await import("@/lib/draft")
const { DRAFT_KEY } = await import("@/lib/session")

const FORM = { permit: "eu", origin: "", birth: "2001", abroad: "", dutch: "basic", studying: "yes", salary: "" } as const

describe("draft", () => {
  beforeEach(() => store.clear())

  test("a saved draft loads back", () => {
    saveDraft({ step: "linkedin", form: FORM })
    expect(loadDraft()).toEqual({ version: 2, step: "linkedin", form: FORM })
  })

  test("an older version, a bad value or broken JSON is dropped", () => {
    store.set(DRAFT_KEY, JSON.stringify({ version: 1, step: "linkedin", form: FORM }))
    expect(loadDraft()).toBeNull()
    store.set(DRAFT_KEY, JSON.stringify({ version: 2, step: "linkedin", form: { ...FORM, permit: "mars" } }))
    expect(loadDraft()).toBeNull()
    store.set(DRAFT_KEY, JSON.stringify({ version: 2, step: "linkedin", form: { ...FORM, salary: 5 } }))
    expect(loadDraft()).toBeNull()
    store.set(DRAFT_KEY, "{")
    expect(loadDraft()).toBeNull()
  })
})
