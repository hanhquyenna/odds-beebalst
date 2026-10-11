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
  test("never on a posting older than a typical posting's life", () => {
    const old = pool.map((p) => ({ ...p, days_open: 45 }))
    expect(hearBackFor(old, PEOPLE.gsAnalyst, new Set(), () => null).size).toBe(0)
  })

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

  test("newest first, and nothing older than a typical posting's life (most likely filled)", () => {
    const aged = open.map((p, i) => ({ ...p, days_open: [45, 3, 12, 31, 1, 20, 8][i] }))
    const out = similarMix(saved, aged, {}, 5)
    expect(out.every((s) => (s.post.days_open ?? 0) <= 30)).toBe(true)
    const days = out.map((s) => s.post.days_open ?? 0)
    expect(days).toEqual([...days].sort((a, b) => a - b))
  })
})

describe("a shared rank word is not shared work", () => {
  test("a teaching assistant is not like a boutique assistant", () => {
    const rows = tailor({ candidates: [job({ id: "c1", title: "Boutique assistant intern", employer: "Cartier", family: "Sales" })], fitting: new Set(), saved: [], chanceOf: () => 0.1, profiles: {}, liftOf: () => null, own: ["Teaching Assistant Accounting"] })
    expect(rows).toHaveLength(0)
  })
})

describe("jobs tailored to you, with what the profile says", () => {
  const mk = (id: string, title: string, employer: string, family = "Finance & accounting", over: Partial<Posting> = {}): Posting => job({ id, title, employer, family, level_view: "Internship", region: "Amsterdam", days_open: 5, ...over })
  const all = (rows: ReturnType<typeof tailor>) => rows.map((r) => r.post.id)
  const base = { saved: [], chanceOf: () => 0.1, profiles: {}, liftOf: () => null as string | null }

  test("a job closed to the person is left out even when its title is exactly their own work", () => {
    const rows = tailor({ ...base, candidates: [mk("a", "Finance Intern", "A"), mk("b", "Finance Intern Treasury", "B")], fitting: new Set(["a", "b"]), own: ["Finance Intern"], fitOf: (p) => ({ score: 0.5, reasons: [], blocked: p.id === "b" ? "asks for a student" : null }) })
    expect(all(rows)).toEqual(["a"])
  })

  test("within the same tier the better fit comes first, then the newer; the fit's reasons are the note when nothing else explains the job", () => {
    const fits: Record<string, number> = { low: 0.2, high: 0.8 }
    const rows = tailor({ ...base, candidates: [mk("low", "Risk Analyst", "L", "Finance & accounting", { days_open: 1 }), mk("high", "Treasury Analyst", "H", "Finance & accounting", { days_open: 20 })], fitting: new Set(["low", "high"]), fitOf: (p) => ({ score: fits[p.id], reasons: ["skills: 2 of 2 must-have", "in Amsterdam, where you live"], blocked: null }) })
    expect(all(rows)).toEqual(["high", "low"])
    expect(rows[0].note).toBe("Fits your profile: skills: 2 of 2 must-have; in Amsterdam, where you live")
  })

  test("a job outside the lines of work comes in when the profile fits it very well", () => {
    const rows = tailor({ ...base, candidates: [mk("x", "Growth Analyst", "X", "Marketing & communications")], fitting: new Set(), fitOf: () => ({ score: 0.7, reasons: ["skills: 3 of 3 must-have"], blocked: null }) })
    expect(all(rows)).toEqual(["x"])
    expect(tailor({ ...base, candidates: [mk("x", "Growth Analyst", "X", "Marketing & communications")], fitting: new Set(), fitOf: () => ({ score: 0.2, reasons: [], blocked: null }) })).toEqual([])
  })

  test("the same job posted twice by one employer in one city shows once", () => {
    const rows = tailor({ ...base, candidates: [mk("1", "Finance Intern (Feb 2027)", "Acme"), mk("2", "Finance Intern (Aug 2027)", "Acme")], fitting: new Set(["1", "2"]) })
    expect(rows).toHaveLength(1)
  })

  test("no more than two of one employer in the first places: a third moves behind the others", () => {
    const rows = tailor({ ...base, candidates: [mk("a1", "Finance Intern Treasury", "A", "Finance & accounting", { region: "Utrecht" }), mk("a2", "Finance Intern Audit", "A"), mk("a3", "Finance Intern Tax", "A"), mk("b1", "Finance Intern Risk", "B", "Finance & accounting", { days_open: 25 })], fitting: new Set(["a1", "a2", "a3", "b1"]) })
    expect(all(rows).indexOf("b1")).toBeLessThan(all(rows).indexOf("a3"))
    expect(rows).toHaveLength(4)
  })
})

describe("jobs like the ones you saved: the mix, what counts, what is left out", () => {
  const mk = (id: string, title: string, employer: string, family: string, over: Partial<Posting> = {}): Posting => job({ id, title, employer, family, level_view: "Internship", region: "Amsterdam", days_open: 5, ...over })
  const saved = [mk("f1", "Finance Analyst Intern", "S1", "Finance & accounting"), mk("f2", "Finance Controller Intern", "S2", "Finance & accounting"), mk("f3", "Finance Treasury Intern", "S3", "Finance & accounting"), mk("m1", "Marketing Campaign Intern", "S4", "Marketing & communications"), mk("m2", "Marketing Content Intern", "S5", "Marketing & communications"), mk("m3", "Marketing Brand Intern", "S6", "Marketing & communications"), mk("o1", "Operations Logistics Intern", "S7", "Operations & supply chain"), mk("o2", "Operations Planning Intern", "S8", "Operations & supply chain"), mk("o3", "Operations Procurement Intern", "S9", "Operations & supply chain")]
  const fam = (n: number, prefix: string, family: string, title: string): Posting[] => Array.from({ length: n }, (_, i) => mk(`${prefix}${i}`, `${title} ${["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"][i]}`, `${prefix}${i}-co`, family, { days_open: 3 + i }))
  const pool = [...fam(6, "F", "Finance & accounting", "Finance Intern"), ...fam(6, "M", "Marketing & communications", "Marketing Intern"), ...fam(6, "O", "Operations & supply chain", "Operations Intern")]
  const count = (rows: Array<{ post: Posting }>, family: string): number => rows.filter((r) => r.post.family === family).length

  test("three saved lines of equal weight get an equal share of the suggestions", () => {
    const rows = similarMix(saved, pool, {}, 9)
    expect([count(rows, "Finance & accounting"), count(rows, "Marketing & communications"), count(rows, "Operations & supply chain")]).toEqual([3, 3, 3])
  })

  test("what you saved most of gets most of the suggestions", () => {
    const heavy = [...saved, mk("f4", "Finance Audit Intern", "S10", "Finance & accounting"), mk("f5", "Finance Tax Intern", "S11", "Finance & accounting"), mk("f6", "Finance Risk Intern", "S12", "Finance & accounting")]
    const rows = similarMix(heavy, pool, {}, 6)
    expect(count(rows, "Finance & accounting")).toBe(3)
    expect(count(rows, "Marketing & communications")).toBe(2)
  })

  test("an application counts for more than a bookmark: the line you applied in gets a bigger share", () => {
    const even = similarMix(saved, pool, {}, 9)
    const applied = similarMix(saved, pool, {}, 9, new Date(), { weightOf: (p) => (p.family === "Marketing & communications" ? 2.2 : 1) })
    expect(count(applied, "Marketing & communications")).toBeGreaterThan(count(even, "Marketing & communications"))
  })

  test("the line of work you ranked first counts a little more", () => {
    const even = similarMix(saved, pool, {}, 7)
    const ranked = similarMix(saved, pool, {}, 7, new Date(), { fieldOrder: ["Operations & supply chain"] })
    expect(count(ranked, "Operations & supply chain")).toBeGreaterThanOrEqual(count(even, "Operations & supply chain"))
  })

  test("nothing much like a job you pressed X on is suggested", () => {
    // "Campaign Specialist" is a little like what was saved (Marketing Campaign) and a lot like what was dismissed (Campaign Specialist Analyst).
    const dismissed = [mk("x", "Campaign Specialist Analyst Intern", "Nope", "Marketing & communications")]
    const only = [mk("near", "Campaign Specialist Intern", "Z1", "Marketing & communications"), mk("far", "Marketing Content Intern", "Z2", "Marketing & communications")]
    const rows = similarMix([saved[3]], only, {}, 2, new Date(), { avoid: dismissed })
    expect(rows.map((r) => r.post.id)).not.toContain("near")
  })

  test("a job closed to you is never suggested, one past its closing date neither, one older than a posting's life neither", () => {
    const candidates = [mk("a", "Finance Treasury Analyst Intern", "A1", "Finance & accounting"), mk("b", "Finance Treasury Analyst Intern", "A2", "Finance & accounting", { valid_through: "2020-01-01" }), mk("c", "Finance Treasury Analyst Intern", "A3", "Finance & accounting", { days_open: 80 }), mk("d", "Finance Treasury Analyst Intern", "A4", "Finance & accounting")]
    const rows = similarMix([saved[0]], candidates, {}, 5, new Date(), { eligible: (p) => p.id !== "d" })
    expect(rows.map((r) => r.post.id)).toEqual(["a"])
  })

  test("one employer comes once until nothing else is left, then twice", () => {
    const same = Array.from({ length: 4 }, (_, i) => mk(`s${i}`, `Finance Analyst Intern ${["North", "South", "East", "West"][i]}`, "SameCo", "Finance & accounting"))
    const other = [mk("o", "Finance Analyst Intern Europe", "OtherCo", "Finance & accounting")]
    const rows = similarMix([saved[0]], [...same, ...other], {}, 3)
    expect(rows.map((r) => r.post.employer).sort()).toEqual(["OtherCo", "SameCo", "SameCo"])
    expect(rows.filter((r) => r.post.employer === "SameCo")).toHaveLength(2)
  })

  test("between two jobs as like the ones you saved, the one you are more likely to hear back from", () => {
    const pair = [mk("lo", "Finance Analyst Intern Alpha", "L1", "Finance & accounting"), mk("hi", "Finance Analyst Intern Beta", "L2", "Finance & accounting")]
    const rows = similarMix([saved[0]], pair, {}, 1, new Date(), { chanceOf: (p) => (p.id === "hi" ? 0.3 : 0.02) })
    expect(rows[0].post.id).toBe("hi")
  })

  test("shown newest first, whatever line each belongs to", () => {
    const rows = similarMix(saved, pool, {}, 9)
    const ages = rows.map((r) => r.post.days_open ?? 99)
    expect(ages).toEqual([...ages].sort((a, b) => a - b))
  })

  test("only one line saved: every suggestion is from it; nothing saved: nothing suggested", () => {
    expect(similarMix([saved[0]], pool, {}, 4).every((r) => r.post.family === "Finance & accounting")).toBe(true)
    expect(similarMix([], pool, {}, 4)).toEqual([])
  })
})
