import { describe, expect, test } from "bun:test"
import { hasCvData } from "@/lib/engine"
import { profileWithCv } from "@/lib/cv-profile"
import { DEFAULT_PROFILE } from "@/lib/types"

describe("a CV as the way in", () => {
  test("a CV alone gives a profile the jobs can be scored against", async () => {
    const cv = "Jane Doe\njane@doe.nl\n\nEXPERIENCE\nTeaching Assistant, University of Amsterdam, 2024 - 2025\nData Analyst Intern, ING, 2023\n\nEDUCATION\nMSc Business Analytics, University of Amsterdam, 2025\n\nSKILLS\nPython, SQL, Excel"
    const before = { ...DEFAULT_PROFILE }
    expect(hasCvData(before)).toBe(false)
    const after = await profileWithCv(before, new File([cv], "Jane CV.txt", { type: "text/plain" }))
    expect(after.cv).toContain("Teaching Assistant")
    expect(after.cvName).toBe("Jane CV")
    expect(hasCvData(after)).toBe(true)
  })

  test("a file that is not a CV says so in words a person can act on", async () => {
    let message = ""
    try {
      await profileWithCv(DEFAULT_PROFILE, new File([new Uint8Array([0, 1, 2, 3])], "photo.png", { type: "image/png" }))
    } catch (err) {
      message = err instanceof Error ? err.message : ""
    }
    expect(message.length).toBeGreaterThan(10)
  })
})
