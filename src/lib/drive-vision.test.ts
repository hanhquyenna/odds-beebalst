import { describe, expect, test } from "bun:test"
import { PLACEHOLDER_JPEG, VISION_MAX, pageSignature, pushScreenshot, troubleReasons, type VisionDeps } from "../../supabase/functions/_shared/drive-vision"

const page = (over: Record<string, unknown> = {}) => ({ url: "https://jobs.example.com/apply", fields: [{ id: "f1", value: "", filled: false }], buttons: [{ text: "Next" }], errors: [], ...over })

describe("real vision only when a step shows trouble", () => {
  test("a fill that did not take, a click that changed nothing, an error and a pop-up are trouble; a good step is not", () => {
    expect(troubleReasons("fill", { results: [{ id: "f1", ok: false, error: "the site did not keep the value" }] }, page(), page())).toEqual(["a fill did not take (1 field)"])
    expect(troubleReasons("fill", { results: [{ id: "f1", ok: false, error: "not tried: out of time in this step" }] }, page(), page())).toEqual([])
    expect(troubleReasons("click", {}, page(), page())).toEqual(["the click changed nothing on the page"])
    expect(troubleReasons("click", {}, page({ url: "https://jobs.example.com/apply/2" }), page())).toEqual([])
    expect(troubleReasons("read_page", {}, page({ errors: ["City is required"] }), null)).toEqual(["the page shows an error"])
    expect(troubleReasons("read_page", {}, page({ dialog: { title: "Cookies" } }), null)).toEqual(["a pop-up is open"])
    expect(troubleReasons("fill", { results: [{ id: "f1", ok: true }] }, page({ fields: [{ id: "f1", value: "x", filled: true }] }), page())).toEqual([])
    expect(pageSignature(page())).toBe(pageSignature(page()))
  })

  const deps = (pushedBefore: string[], fail: Partial<Record<"put" | "sign" | "steer", boolean>> = {}) => {
    const puts: Array<[string, string]> = []
    const steers: Array<[string, string]> = []
    const remembered: string[] = []
    const d: VisionDeps = {
      put: async (path, b64) => { puts.push([path, b64]); return !fail.put },
      sign: async (path) => (fail.sign ? null : `https://store.test/sign/${path}`),
      pushed: async () => pushedBefore,
      remember: async (path) => { remembered.push(path) },
      steer: async (text, url) => { steers.push([text, url]); return !fail.steer },
    }
    return { d, puts, steers, remembered }
  }

  test("the screenshot is stored, steered in as a link with the reason, and only the last 2 stay real", async () => {
    const { d, puts, steers, remembered } = deps(["run1/1.jpg", "run1/2.jpg"])
    expect(await pushScreenshot(d, "run1", "SHOT", ["a fill did not take (1 field)"], 3)).toBe(true)
    expect(puts[0]).toEqual(["run1/3.jpg", "SHOT"])
    // 2 already pushed + this one = 3: the oldest becomes the grey placeholder at the same path (its link keeps working).
    expect(puts.slice(1)).toEqual([["run1/1.jpg", PLACEHOLDER_JPEG]])
    expect(steers[0][1]).toBe("https://store.test/sign/run1/3.jpg")
    expect(steers[0][0]).toContain("a fill did not take")
    expect(remembered).toEqual(["run1/3.jpg"])
  })

  test("over the per-run cap, or when storage or steering fails, nothing is pushed (text sight remains)", async () => {
    expect(await pushScreenshot(deps(Array.from({ length: VISION_MAX }, (_, i) => `r/${i}.jpg`)).d, "r", "SHOT", ["x"])).toBe(false)
    expect(await pushScreenshot(deps([], { put: true }).d, "r", "SHOT", ["x"])).toBe(false)
    expect(await pushScreenshot(deps([], { sign: true }).d, "r", "SHOT", ["x"])).toBe(false)
    const failedSteer = deps([], { steer: true })
    expect(await pushScreenshot(failedSteer.d, "r", "SHOT", ["x"])).toBe(false)
    expect(failedSteer.remembered).toEqual([])
    expect(await pushScreenshot(deps([]).d, "r", "", ["x"])).toBe(false)
    expect(await pushScreenshot(deps([]).d, "r", "SHOT", [])).toBe(false)
  })
})
