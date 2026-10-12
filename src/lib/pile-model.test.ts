import { describe, expect, test } from "bun:test"
import { pileSize } from "@/lib/pile-model"
import { job } from "@/lib/odds-v2.personas"

const base = { title: "Analyst", employer: "X" }
describe("pile model: the shape of the pile from our own Dutch postings", () => {
  test("the typical posting sits near the anchor and nothing leaves the factor-2.2 band", () => {
    const sizes = ["Internship", "Entry", "Mid"].flatMap((level_view) => ["Data, analytics & AI", "Sales & account management", "Finance & accounting", null].map((family) => pileSize(job({ ...base, level_view: level_view as never, family }), "unknown")))
    for (const n of sizes) {
      expect(n).toBeGreaterThanOrEqual(Math.round(180 * 0.45))
      expect(n).toBeLessThanOrEqual(Math.round(180 * 2.2))
    }
  })
  test("data and software jobs draw more people than sales jobs; the Randstad more than a small city", () => {
    const data = pileSize(job({ ...base, family: "Data, analytics & AI", level_view: "Entry", region: "Amsterdam, North Holland" }), "unknown")
    const sales = pileSize(job({ ...base, family: "Sales & account management", level_view: "Entry", region: "Amsterdam, North Holland" }), "unknown")
    expect(data).toBeGreaterThan(sales)
    const randstad = pileSize(job({ ...base, family: "Finance & accounting", region: "The Randstad, Netherlands" }), "unknown")
    const small = pileSize(job({ ...base, family: "Finance & accounting", region: "Venlo, Limburg" }), "unknown")
    expect(randstad).toBeGreaterThan(small)
  })
  test("a more sought-after employer draws more, at half the old assumption", () => {
    const p = job({ ...base, family: "Finance & accounting", level_view: "Entry" })
    expect(pileSize(p, "elite")).toBeGreaterThan(pileSize(p, "unknown"))
    expect(pileSize(p, "elite") / pileSize(p, "unknown")).toBeLessThan(600 / 180)
    expect(pileSize(p, "small")).toBeLessThan(pileSize(p, "unknown"))
  })
  test("a field the posting does not have is not a kind of posting: missing fields change nothing", () => {
    const a = pileSize(job({ ...base, family: "Finance & accounting" }), "unknown")
    const b = pileSize(job({ ...base, family: "Finance & accounting", industry: null, workplace: null, job_type: null }), "unknown")
    expect(b).toBe(a)
  })
})
