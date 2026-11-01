import { beforeEach, describe, expect, test } from "bun:test"
import { applyActivityOf, clearApplyActivity, pinLiveApplies, recordApplyActivity } from "./apply-activity"
import { isJobClosedMessage, resetClosedJobToasts, settleClosedJob } from "./job-closed"

const store = new Map<string, string>()
const toasts: Array<{ title: string; description?: string }> = []

beforeEach(() => {
  store.clear()
  toasts.length = 0
  resetClosedJobToasts()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
    },
  })
  // settleClosedJob uses sonner — stub via dynamic import mock by replacing toast on module
})

describe("job closed settle", () => {
  test("isJobClosedMessage matches LinkedIn copy", () => {
    expect(isJobClosedMessage("Not currently accepting applications")).toBe(true)
    expect(isJobClosedMessage("This job is no longer accepting applications on LinkedIn.")).toBe(true)
    expect(isJobClosedMessage("Filling what we know…")).toBe(false)
  })

  test("pinLiveApplies sinks closed_at to the bottom and never pins them live", () => {
    recordApplyActivity({ postingId: "closed", status: "filling", message: "Filling…" })
    const ordered = pinLiveApplies([
      { id: "closed", closed_at: "2026-10-15T00:00:00Z" },
      { id: "open", closed_at: null },
      { id: "live", closed_at: null },
    ])
    recordApplyActivity({ postingId: "live", status: "filling", message: "Filling…" })
    const again = pinLiveApplies([
      { id: "closed", closed_at: "2026-10-15T00:00:00Z" },
      { id: "open", closed_at: null },
      { id: "live", closed_at: null },
    ])
    expect(again.map((p) => p.id)).toEqual(["live", "open", "closed"])
    expect(ordered[ordered.length - 1]?.id).toBe("closed")
  })

  test("settleClosedJob clears live Apply and keeps saved", () => {
    const saved = new Set<string>()
    recordApplyActivity({ postingId: "zeb", status: "filling", message: "Filling in the background…" })
    expect(applyActivityOf("zeb")?.status).toBe("filling")
    // Avoid importing real sonner in unit — call clear path via settle with mocked toast
    // by only asserting clear + saved when closed_at is set (toast is fire-and-forget).
    settleClosedJob(
      {
        saved,
        setSaved: (id, on) => { if (on) saved.add(id); else saved.delete(id) },
        setPassed: () => undefined,
      },
      { id: "zeb", title: "Intern", closed_at: "2026-10-15T12:00:00Z" },
    )
    expect(saved.has("zeb")).toBe(true)
    expect(applyActivityOf("zeb")).toBeNull()
    clearApplyActivity("zeb")
  })
})


test("settled closed jobs cannot be replayed by extension polls after reopening", () => {
  const saved = new Set<string>()
  const data = {saved,setSaved:(id:string,on:boolean)=>{if(on)saved.add(id)},setPassed:()=>undefined}
  const post = {id:"replayed-closed",title:"Intern",closed_at:"2026-10-15"}
  recordApplyActivity({postingId:post.id,status:"failed",message:"This job is no longer accepting applications."})
  settleClosedJob(data,post)
  resetClosedJobToasts() // simulate the module-level gate being lost on reload
  recordApplyActivity({postingId:post.id,status:"failed",message:"This job is no longer accepting applications."})
  expect(applyActivityOf(post.id)).toBeNull()
  expect(saved.has(post.id)).toBe(true)
})
