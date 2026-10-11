import { describe, expect, it } from "bun:test"
import { toPastHire } from "@/lib/job-company"

describe("toPastHire", () => {
  it("turns the stored current-job object into text, so the page never renders an object", () => {
    const h = toPastHire({ id: "1", name: "A", currentPosition: { position: "Analyst", companyName: "Bosch", startDate: "2024", endDate: null }, location: { city: "Breda", country: "Netherlands" }, status: "exact", experience: [{ employer: "Bosch", title: "Intern", start: "2023-01-01", current: false }], education: null })
    expect(h.currentPosition).toBe("Analyst at Bosch")
    expect(h.location).toBe("Breda, Netherlands")
    expect(h.experience[0].title).toBe("Intern")
    expect(h.education).toEqual([])
  })

  it("an empty object is nothing", () => {
    expect(toPastHire({ id: "2", currentPosition: {} }).currentPosition).toBeNull()
  })
})
