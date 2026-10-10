import { describe, expect, test } from "bun:test"
import { hearBackFor, LIFT, TOP_SHARE } from "@/lib/hear-back"
import { oddsV2 } from "@/lib/odds-v2"
import { JOBS, PEOPLE, job } from "@/lib/odds-v2.personas"
import { isLike, likeness, shortName, shortTitle, similarMix, stretches, tailor } from "@/lib/tailor"
import { DEFAULT_PROFILE, type Posting } from "@/lib/types"

const pool: Posting[] = Array.from({ length: 200 }, (_, i) =>
  job({ ...Object.values(JOBS)[i % Object.values(JOBS).length], id: `j${i}`, title: `${Object.values(JOBS)[i % Object.values(JOBS).length].title} ${i}`, employer: `E${i}` }),
)

describe("most likely to hear back", () => {
  test("it is rare: at most the top share of a pool, never every job", () => {
    const tags = hearBackFor(pool, PEOPLE.gsAnalyst, new Set(), () => null)
    expect(tags.size).toBeLessThanOrEqual(Math.ceil(pool.length * TOP_SHARE) + 10)
    expect(tags.size).toBeGreaterThan(0)
  })
  test("a tagged job is one where you clearly beat an average applicant", () => {
    for (const [id, t] of hearBackFor(pool, PEOPLE.gsAnalyst, new Set(), () => null)) {
      const post = pool.find((p) => p.id === id) as Posting
      const r = oddsV2(post, PEOPLE.gsAnalyst)
      expect(t.chance).toBeGreaterThanOrEqual(LIFT * (r.pile.interviews / r.pile.applicants) - 1e-9)
      expect(t.reason).toContain("You stand out here")
    }
  })
  test("no profile, no tags; and the same profile and pool are worked out once", () => {
    expect(hearBackFor(pool, { ...DEFAULT_PROFILE, positions: [], education: [], skills: [], cv: "" }, new Set(), () => null).size).toBe(0)
    const a = hearBackFor(pool, PEOPLE.midFinanceIntern, new Set(), () => null)
    expect(hearBackFor(pool, PEOPLE.midFinanceIntern, new Set(), () => null)).toBe(a)
  })
  test("an empty pool is fine", () => {
    expect(hearBackFor([], PEOPLE.gsAnalyst, new Set(), () => null).size).toBe(0)
  })
})

describe("jobs tailored to you", () => {
  const procurement = job({ title: "(Associate) Consultant in Procurement / Supply Chain Management", employer: "Inverto", family: "Operations & supply chain", level_view: "Entry", region: "Amsterdam" })
  test("a shared line of work alone is not likeness: a procurement consultant is not a warehouse job", () => {
    expect(isLike(likeness(procurement, job({ title: "Warehouse Employee", employer: "Crisp", family: "Operations & supply chain", level_view: "Entry", region: "Amsterdam" }), {}))).toBe(false)
    expect(isLike(likeness(procurement, job({ title: "Procurement Consultant", employer: "Other", family: "Operations & supply chain", level_view: "Entry", region: "Utrecht" }), {}))).toBe(true)
  })
  test("title words count, generic ones do not: 'Finance Intern' is like 'Finance Internship', not like 'Marketing Intern'", () => {
    const fin = job({ title: "Finance Intern", employer: "A", family: "Finance & accounting", level_view: "Internship" })
    expect(likeness(fin, job({ title: "Finance Internship", employer: "B", family: "Finance & accounting", level_view: "Internship" }), {}).score).toBeGreaterThan(likeness(fin, job({ title: "Marketing Intern", employer: "C", family: "Marketing & communications", level_view: "Internship" }), {}).score)
  })
  test("what you are into ranks above your chance, every row has a reason, and nothing comes in that neither fits nor is like a saved job", () => {
    const fin = job({ title: "Finance Intern", employer: "Saved Co", family: "Finance & accounting", level_view: "Internship", region: "Amsterdam" })
    const candidates = [job({ title: "Finance Internship", employer: "B", family: "Finance & accounting", level_view: "Internship", region: "Amsterdam", id: "a" }), job({ title: "Chef", employer: "C", id: "b" }), job({ title: "Controller", employer: "D", family: "Finance & accounting", id: "c" })]
    const chance = { a: 0.2, b: 0.9, c: 0.4 } as Record<string, number>
    const rows = tailor({ candidates, fitting: new Set(["c"]), saved: [fin], chanceOf: (p) => chance[p.id], profiles: {}, liftOf: () => "your finance work" })
    expect(rows.map((r) => r.post.id)).toEqual(["a", "c"])
    expect(rows.every((r) => r.note.length > 0)).toBe(true)
    expect(rows[0].note).toContain("you saved")
  })
  test("a job you would get but never look for sinks below one named like your own work, however good the chance", () => {
    const own = ["AI Marketing Content Specialist", "Finance Analyst (AI tooling)"]
    const copy = job({ title: "Copywriter", employer: "Ad Co", family: "Marketing & communications", id: "copy", days_open: 1 })
    const content = job({ title: "Content Marketing Associate", employer: "Tech Co", family: "Marketing & communications", id: "content", days_open: 4 })
    const finAi = job({ title: "AI Finance Analyst", employer: "Bank", family: "Finance & accounting", id: "finai", days_open: 6 })
    const chance = { copy: 0.7, content: 0.1, finai: 0.05 } as Record<string, number>
    const rows = tailor({ candidates: [copy, content, finAi], fitting: new Set(["copy", "content", "finai"]), saved: [], chanceOf: (p) => chance[p.id], profiles: {}, liftOf: () => null, own })
    expect(rows.map((r) => r.post.id).at(-1)).toBe("copy")
    expect(rows[0].note).toContain("Close to your own work")
  })
  test("newest first among jobs you are equally into; chance only breaks ties", () => {
    const own = ["Financial Analyst"]
    const old = job({ title: "Financial Analyst", employer: "Old", family: "Finance & accounting", id: "old", days_open: 12 })
    const fresh = job({ title: "Financial Analyst", employer: "New", family: "Finance & accounting", id: "fresh", days_open: 1 })
    const rows = tailor({ candidates: [old, fresh], fitting: new Set(), saved: [], chanceOf: (p) => (p.id === "old" ? 0.9 : 0.1), profiles: {}, liftOf: () => null, own })
    expect(rows.map((r) => r.post.id)).toEqual(["fresh", "old"])
  })
  test("a job past its own closing date is left out, one closing today stays", () => {
    const today = new Date("2026-10-07T12:00:00")
    const gone = job({ title: "Financial Analyst", employer: "A", id: "gone", valid_through: "2026-10-05" })
    const lastDay = job({ title: "Financial Analyst", employer: "B", id: "last", valid_through: "2026-10-07" })
    const open = job({ title: "Financial Analyst", employer: "C", id: "open", valid_through: null })
    const rows = tailor({ candidates: [gone, lastDay, open], fitting: new Set(["gone", "last", "open"]), saved: [], chanceOf: () => 0.1, profiles: {}, liftOf: () => null, today })
    expect(rows.map((r) => r.post.id).sort()).toEqual(["last", "open"])
  })
  test("nothing saved and nothing fitting gives an empty list, not an error", () => {
    expect(tailor({ candidates: [], fitting: new Set(), saved: [], chanceOf: () => 0, profiles: {}, liftOf: () => null })).toEqual([])
  })
  test("saved jobs where your chance is low are named once per line of work", () => {
    const s = [job({ title: "Brand Design Internship", employer: "X", family: "Design & UX", id: "x" }), job({ title: "Brand Design Internship", employer: "Y", family: "Design & UX", id: "y" }), job({ title: "Finance Intern", employer: "Z", family: "Finance & accounting", id: "z" })]
    const out = stretches(s, (p) => (p.family === "Design & UX" ? 0.03 : 0.4))
    expect(out).toHaveLength(1)
    expect(out[0].family).toBe("Design & UX")
    expect(out[0].titles).toEqual(["Brand Design Internship"])
  })
  test("names read short", () => {
    expect(shortTitle("2027 MUFG 6 month Amsterdam internship: Japanese Corporate Banking")).toBe("MUFG Amsterdam internship")
    expect(shortTitle("Senior Financial Analyst (m/f/d)")).toBe("Senior Financial Analyst")
    expect(shortName("MUFG Bank (Europe) N.V.")).toBe("MUFG Bank")
  })
})

describe("similarMix", () => {
  const mk = (id: string, title: string, family: string, employer = "Acme"): Posting => job({ id, title, family, employer, level_view: "Entry", region: "Amsterdam" })
  const saved = [mk("s1", "Finance Analyst", "Finance"), mk("s2", "Finance Controller", "Finance"), mk("s3", "Marketing Manager", "Marketing")]
  const open = [
    ...["A", "B", "C", "D"].map((x, i) => mk(`f${i}`, `Finance Business Partner ${x}`, "Finance", `Fin${x}`)),
    ...["A", "B", "C"].map((x, i) => mk(`m${i}`, `Marketing Specialist ${x}`, "Marketing", `Mkt${x}`)),
  ]

  test("follows the mix of what you saved: two finance for every marketing", () => {
    const out = similarMix(saved, open, {}, 3)
    expect(out.filter((s) => s.post.family === "Finance")).toHaveLength(2)
    expect(out.filter((s) => s.post.family === "Marketing")).toHaveLength(1)
  })

  test("never suggests a saved job, and gives unused slots to the other line", () => {
    const out = similarMix(saved, [...open.filter((p) => p.family === "Finance"), saved[0]], {}, 5)
    expect(out.every((s) => !["s1", "s2", "s3"].includes(s.post.id))).toBe(true)
    expect(out).toHaveLength(4)
  })

  test("nothing saved, nothing suggested", () => {
    expect(similarMix([], open, {})).toEqual([])
  })
})
