import { beforeEach, describe, expect, test } from "bun:test"
import { applyActivityLabel, recordApplyActivity } from "./apply-activity"
import { mergeApplyView } from "./apply-view"

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
    },
  })
})

describe("mergeApplyView — row chip and drawer stay in sync", () => {
  test("live activity alone drives the drawer when the tab poll is empty", () => {
    recordApplyActivity({ postingId: "bosch", status: "filling", message: "Filling what we know…" })
    const { view, phase } = mergeApplyView({ postingId: "bosch", tab: null })
    expect(phase).toBe("filling")
    expect(view?.message).toMatch(/Filling what we know/)
  })

  test("marked questions stay needs_input inside and out", () => {
    recordApplyActivity({
      postingId: "north",
      status: "needs_input",
      message: "odds filled in what it knows. Answer the 2 marked questions, then press Next.",
    })
    const { phase, view } = mergeApplyView({ postingId: "north", tab: null })
    expect(phase).toBe("needs_input")
    expect(view?.status).toBe("needs_input")
  })

  test("newer activity message wins over a stale tab poll", () => {
    const tab = { status: "filling" as const, message: "Opening the application…", at: Date.now() - 10_000 }
    recordApplyActivity({
      postingId: "x",
      status: "needs_input",
      message: "Answer the 2 marked questions, then press Next.",
    })
    const { phase, view } = mergeApplyView({ postingId: "x", tab })
    expect(phase).toBe("needs_input")
    expect(view?.message).toMatch(/marked questions/)
  })

  test("Broods busy message stays filling phase (end goal: agent finishes before Your answers)", () => {
    recordApplyActivity({
      postingId: "busy",
      status: "filling",
      message: "Asking Odds for answers from your profile…",
    })
    const { phase } = mergeApplyView({ postingId: "busy", tab: null })
    expect(phase).toBe("filling")
  })

  test("Open-tab handshake timeout is Reconnect — never Stuck chip", () => {
    recordApplyActivity({
      postingId: "zeb",
      status: "needs_input",
      message: "Could not open an application here. Odds in Chrome did not answer. Reconnect Odds on Connect, then try again.",
    })
    const a = { postingId: "zeb", status: "needs_input" as const, message: "Could not open an application here. Odds in Chrome did not answer. Reconnect Odds on Connect, then try again.", at: Date.now(), pinnedAt: Date.now() }
    expect(applyActivityLabel(a)).toBe("Reconnect")
    const { phase } = mergeApplyView({ postingId: "zeb", tab: null })
    expect(phase).toBe("needs_input")
  })
})
