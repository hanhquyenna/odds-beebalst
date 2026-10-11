import { describe, expect, test } from "bun:test"
import { chanceSnapshot, SNAPSHOT_MODEL } from "@/lib/outcome-snapshot"
import { JOBS, PEOPLE } from "@/lib/odds-v2.personas"

describe("the snapshot kept when a job is marked applied", () => {
  const post = { ...JOBS.financeIntern, id: "p-snap", days_open: 3, employer_display: "Secret Employer BV", title: "Very Specific Finance Title" }
  const snap = chanceSnapshot(post, PEOPLE.gsAnalyst, { referral: true })

  test("has the chance shown, its range and the model that made it", () => {
    expect(snap.posting_id).toBe("p-snap")
    expect(snap.model).toBe(SNAPSHOT_MODEL)
    expect(snap.chance).toBeGreaterThan(0)
    expect(snap.chance).toBeLessThan(1)
    expect(snap.low).toBeLessThanOrEqual(snap.chance)
    expect(snap.high).toBeGreaterThanOrEqual(snap.chance)
  })

  test("keeps one number per factor, in the shape the backtest reads, and the pile and the facts of the posting", () => {
    expect(Object.keys(snap.snapshot.parts).length).toBeGreaterThan(0)
    for (const z of Object.values(snap.snapshot.parts)) expect(Number.isFinite(z)).toBe(true)
    expect(snap.snapshot.pile.applicants).toBeGreaterThan(snap.snapshot.pile.interviews)
    expect(snap.snapshot.referral).toBe(true)
    expect(snap.snapshot.post.family).toBe("Finance & accounting")
    expect(snap.snapshot.reviewing).toBe(1)
  })

  test("keeps nothing that identifies the person, the employer or the job, and stays small", () => {
    const json = JSON.stringify(snap)
    expect(json).not.toContain("Secret Employer")
    expect(json).not.toContain("Very Specific")
    for (const p of PEOPLE.gsAnalyst.positions) expect(json).not.toContain(String(p.Title))
    expect(json.length).toBeLessThan(2000)
  })

  test("an old posting is kept with its reduced chance and how much it was reduced", () => {
    const old = chanceSnapshot({ ...post, days_open: 60, valid_through: null }, PEOPLE.gsAnalyst)
    expect(old.snapshot.reviewing).toBeLessThan(0.6)
    expect(old.chance).toBeLessThan(snap.chance)
  })
})
