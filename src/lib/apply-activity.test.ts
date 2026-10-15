import { beforeEach, describe, expect, test } from "bun:test"
import { applyActivityLabel, applyActivityOf, isLiveApply, normalizeApplyStatus, pinLiveApplies, recordApplyActivity, syncApplyActivities } from "./apply-activity"

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

describe("apply activity tracker pin", () => {
  test("record replaces stale state and pins live Apply jobs to the top", () => {
    recordApplyActivity({ postingId: "a", status: "filling", message: "Opening…" })
    recordApplyActivity({ postingId: "b", status: "ready", message: "Check and send" })
    expect(isLiveApply(applyActivityOf("a"))).toBe(true)
    expect(applyActivityLabel(applyActivityOf("b")!)).toBe("Review & send")
    const pinned = pinLiveApplies([{ id: "z" }, { id: "a" }, { id: "b" }, { id: "y" }])
    expect(pinned.map((p) => p.id).slice(0, 2).sort()).toEqual(["a", "b"])
    expect(pinned.map((p) => p.id).slice(2)).toEqual(["z", "y"])
  })

  test("failed apply is not pinned as live", () => {
    recordApplyActivity({ postingId: "a", status: "failed", message: "Stopped" })
    expect(isLiveApply(applyActivityOf("a"))).toBe(false)
    expect(pinLiveApplies([{ id: "a" }, { id: "b" }]).map((p) => p.id)).toEqual(["a", "b"])
  })

  test("going back pauses: the chip says Paused, even over an earlier Review", () => {
    const at = Date.now()
    const paused = "You went back a step, so Odds paused here. Press Next or Apply yourself and Odds carries on, or press Apply with Odds again."
    expect(normalizeApplyStatus("needs_input", paused)).toBe("needs_input")
    expect(normalizeApplyStatus("ready", paused)).toBe("needs_input")
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: paused, at, pinnedAt: at })).toBe("Paused")
    expect(applyActivityLabel({ postingId: "x", status: "ready", message: "Filled in by odds. Check everything, then send it yourself.", at, pinnedAt: at })).toBe("Review & send")
  })

  test("tracker chip: Captcha / Account / Stuck / Your answers / Review — mid-fill nags stay Applying", () => {
    const at = Date.now()
    expect(normalizeApplyStatus("filling", "LinkedIn wants something changed here. Fix it, then press Next.")).toBe("filling")
    expect(applyActivityLabel({ postingId: "x", status: "filling", message: "Captcha on the page — open the tab when you can.", at, pinnedAt: at })).toBe("Captcha")
    expect(applyActivityLabel({ postingId: "x", status: "filling", message: "Account or login required — open the tab when you can.", at, pinnedAt: at })).toBe("Account")
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "Sign in or make the account yourself; odds fills in the form after.", at, pinnedAt: at })).toBe("Account")
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "This site needs an account. Choose your password on the page: odds never types passwords.", at, pinnedAt: at })).toBe("Account")
    // Job-board guest: clear Account chip — never hang as Applying… on “Looking for Apply”.
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "Sign in to LinkedIn in this Chrome tab first — then Odds continues. Odds never types your password.", at, pinnedAt: at })).toBe("Account")
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "Sign in to Indeed in this Chrome tab first — then Odds continues. Odds never types your password.", at, pinnedAt: at })).toBe("Account")
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "Still not signed in to Glassdoor. Sign in on this tab, then press Open application tab.", at, pinnedAt: at })).toBe("Account")
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "Odds assist could not move this application forward. Open the tab to continue.", at, pinnedAt: at })).toBe("Stuck")
    // Must not say Captcha when the message is Account (email filled, password left to person).
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "Email from your Odds profile is filled in. Type your password on the tab — Odds never types passwords.", at, pinnedAt: at })).toBe("Account")
    // Ambiguous old copy that named both → Stuck (never Captcha chip + Account body).
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "Odds could not move this application forward after assist. Captcha or account may be blocking it — open the tab.", at, pinnedAt: at })).toBe("Stuck")
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "Odds assist could not finish this Easy Apply step. Fix what’s marked, then press Next — Odds will continue.", at, pinnedAt: at })).toBe("Stuck")
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "Odds assist could not open the application form. Click Apply yourself in this tab; Odds fills the form after it appears.", at, pinnedAt: at })).toBe("Stuck")
    // Bare timeout / still-loading is NOT Stuck (agent never ran) — keep as Your answers needs_input or filling.
    expect(applyActivityLabel({ postingId: "x", status: "needs_input", message: "Could not open an application here. This job may be closed, or LinkedIn is still loading — open the tab and try Apply yourself.", at, pinnedAt: at })).toBe("Your answers")
    expect(applyActivityLabel({ postingId: "x", status: "ready", message: "Filled in by odds. Check everything, then press Submit yourself.", at, pinnedAt: at })).toBe("Review & send")
    expect(applyActivityLabel({ postingId: "x", status: "failed", message: "This job is no longer accepting applications on LinkedIn. No application was submitted.", at, pinnedAt: at })).toBe("Closed")
    expect(normalizeApplyStatus("needs_input", "This job is no longer accepting applications on LinkedIn.")).toBe("failed")
    // Old opener text with "login" in it must never be Account or false Stuck.
    expect(applyActivityLabel({ postingId: "y", status: "needs_input", message: "Could not open an application here. Check whether this job is closed, or complete login/verification in Chrome.", at, pinnedAt: at })).toBe("Your answers")
    expect(applyActivityLabel({ postingId: "y", status: "needs_input", message: "Odds assist could not open Apply on LinkedIn. Click Apply on this tab yourself.", at, pinnedAt: at })).toBe("Stuck")
    // Marked / outlined questions sync as Your answers (not Applying…).
    recordApplyActivity({ postingId: "x", status: "needs_input", message: "odds filled in what it knows. Answer the 2 marked questions, then press Next." })
    expect(applyActivityOf("x")?.status).toBe("needs_input")
    expect(applyActivityLabel(applyActivityOf("x")!)).toBe("Your answers")
    // Generic needs_input (e.g. after Open application tab) must not fall back to Applying….
    expect(applyActivityLabel({ postingId: "z", status: "needs_input", message: "Opening the application tab…", at, pinnedAt: at })).toBe("Your answers")
    // Broods mid-pass stays Applying… (never false Your answers / Review).
    expect(normalizeApplyStatus("needs_input", "Asking Odds for answers from your profile…")).toBe("filling")
    expect(applyActivityLabel({ postingId: "z", status: "filling", message: "Filling what we know — asking Odds for the rest…", at, pinnedAt: at })).toBe("Applying…")
    expect(applyActivityLabel({ postingId: "z", status: "filling", message: "No progress — Broods is reading this page…", at, pinnedAt: at })).toBe("Applying…")
    expect(applyActivityLabel({ postingId: "z", status: "filling", message: "Odds confirmed answers from Broods — filling them in…", at, pinnedAt: at })).toBe("Applying…")
    expect(applyActivityLabel({ postingId: "z", status: "filling", message: "Continuing in the background…", at, pinnedAt: at })).toBe("Applying…")
    // Stuck only after Broods confirmed it cannot move.
    expect(applyActivityLabel({ postingId: "z", status: "needs_input", message: "Odds assist could not move this application forward after assist. Open the tab to continue.", at, pinnedAt: at })).toBe("Stuck")
    // Handshake timeout is reconnect — never Broods Stuck.
    expect(applyActivityLabel({ postingId: "z", status: "needs_input", message: "Could not open an application here. Odds in Chrome did not answer. Reconnect Odds on Connect, then try again.", at, pinnedAt: at })).toBe("Reconnect")
  })

  test("live pin order stays stable when status polls update timestamps", () => {
    recordApplyActivity({ postingId: "a", status: "filling", message: "Opening…" })
    recordApplyActivity({ postingId: "b", status: "filling", message: "Opening…" })
    expect(pinLiveApplies([{ id: "z" }, { id: "a" }, { id: "b" }]).map((p) => p.id).slice(0, 2)).toEqual(["a", "b"])
    // Later polls bump `at` — order must stay a then b (pinnedAt), not flip.
    recordApplyActivity({ postingId: "a", status: "needs_input", message: "Answer the 2 marked questions, then press Next." })
    recordApplyActivity({ postingId: "b", status: "filling", message: "Filling what we know…" })
    expect(pinLiveApplies([{ id: "z" }, { id: "a" }, { id: "b" }]).map((p) => p.id).slice(0, 2)).toEqual(["a", "b"])
  })

  test("syncApplyActivities updates chips for many jobs without opening detail", () => {
    syncApplyActivities([
      { postingId: "a", status: "needs_input", message: "Sign in or make the account yourself; odds fills in the form after." },
      { postingId: "b", status: "ready", message: "Filled in by odds. Check everything, then press Submit yourself." },
      { postingId: "c", status: "needs_input", message: "Odds assist could not finish this Easy Apply step. Fix what’s marked, then press Next." },
    ])
    expect(applyActivityLabel(applyActivityOf("a")!)).toBe("Account")
    expect(applyActivityLabel(applyActivityOf("b")!)).toBe("Review & send")
    expect(applyActivityLabel(applyActivityOf("c")!)).toBe("Stuck")
  })
})


test("poll sync emits once per changed batch and never for identical replay", async () => {
  const { onApplyActivity } = await import("./apply-activity")
  let changes = 0
  const stop = onApplyActivity(() => changes++)
  const runs = [{postingId:"batch-a",status:"filling",message:"Filling"},{postingId:"batch-b",status:"ready",message:"Ready"}]
  syncApplyActivities(runs)
  expect(changes).toBe(1)
  syncApplyActivities(runs)
  expect(changes).toBe(1)
  stop()
})
