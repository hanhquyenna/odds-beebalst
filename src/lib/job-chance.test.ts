import { describe, expect, test } from "bun:test"
import * as core from "../../supabase/functions/mcp/core.src"
import { keptChances, type KeptCore } from "../../supabase/functions/mcp/kept-chance"
import { computeShares, displayedChance, NO_WHAT_IF, standing } from "@/lib/engine"
import { EXAMPLE_PROFILE } from "@/lib/example"
import { chanceInputs, pinToWrite, withPinned, type PinnedChance } from "@/lib/job-chance"
import type { Reference } from "@/lib/jobs"
import type { Posting } from "@/lib/types"

const ref = { bands: {}, transitions: {}, ageFactors: {}, tax: null } as unknown as Reference
const post = {
  id: "p1", employer: "acme", employer_display: "Acme", ats: "greenhouse", source: "ats_board", title: "Financial Analyst", region: "Amsterdam, NL", cat: "finance_business", cbs_group: "0812",
  url: "https://example.com/1", ind_sponsor: true, ind_sponsor_name: "Acme", years_min: null, dutch_required: false, visa_mention: false, junior_title: false, degree_asked: null,
  skills: ["excel", "ifrs", "sql"], pay_posted: null, applicants: null, applicants_text: null, valid_through: null, seniority: "Entry level", posted_at: null, days_open: 3,
  freshness_state: "fresh", fetched_at: null, title_clean: null, level_jev: null, level_conf: null, usable: 1, industry: null, workplace: null, job_type: null, dutch_jev: null, family: "Finance & accounting",
} as unknown as Posting
const shares = computeShares([post])

describe("one chance per person per job", () => {
  test("the fingerprint moves with what the chance reads, never with names, notes or views", () => {
    const k = chanceInputs(EXAMPLE_PROFILE, false, null)
    expect(chanceInputs({ ...EXAMPLE_PROFILE, name: "Someone Else", notes: { p1: { Status: "x" } }, views: {} }, false, null)).toBe(k)
    expect(chanceInputs({ ...EXAMPLE_PROFILE, skills: [...EXAMPLE_PROFILE.skills, { Name: "Python" }] }, false, null)).not.toBe(k)
    expect(chanceInputs(EXAMPLE_PROFILE, true, null)).not.toBe(k)
    expect(chanceInputs(EXAMPLE_PROFILE, false, { value: 0.2, detail: "KPMG" })).not.toBe(k)
  })

  test("the kept figure is shown while its fingerprint holds, a later day's figure does not move it, and a what-if moves from it", () => {
    const today = standing(post, EXAMPLE_PROFILE, ref, shares)
    const k = chanceInputs(EXAMPLE_PROFILE, false, null)
    const pin = pinToWrite(today, undefined, k)!
    expect(pin.mid).toBe(today.rate!.mid)
    // Weeks later the posting has many more applicants: worked out again the figure is lower, but the kept one is shown.
    const later = standing({ ...post, days_open: 60, applicants: 900 } as Posting, EXAMPLE_PROFILE, ref, shares)
    expect(later.rate!.mid).not.toBe(today.rate!.mid)
    expect(withPinned(later, pin, k).rate!.mid).toBe(pin.mid)
    expect(pinToWrite(later, pin, k)).toBeNull()
    // A referral ticked as a what-if: the shown figure rises by the same factor it rises by when worked out.
    const alt = standing({ ...post, days_open: 60, applicants: 900 } as Posting, EXAMPLE_PROFILE, ref, shares, { ...NO_WHAT_IF, referral: true }, false)
    expect(withPinned(alt, pin, k, later).rate!.mid).toBeCloseTo(pin.mid * (alt.rate!.mid / later.rate!.mid), 12)
  })

  test("a change the person makes (another CV, a referral) works the figure out again and keeps the new one", () => {
    const pin: PinnedChance = { ...standing(post, EXAMPLE_PROFILE, ref, shares).rate!, inputs: chanceInputs(EXAMPLE_PROFILE, false, null) }
    const referred = standing(post, EXAMPLE_PROFILE, ref, shares, undefined, true)
    const k2 = chanceInputs(EXAMPLE_PROFILE, true, null)
    expect(withPinned(referred, pin, k2).rate!.mid).toBe(referred.rate!.mid)
    expect(pinToWrite(referred, pin, k2)?.inputs).toBe(k2)
  })
})

/** The database as the server sees it, for one person: the kept figures, CVs on jobs, documents and profile facts. */
interface KeptRow extends PinnedChance {
  posting_id: string
}

function fakeDb(start: KeptRow[] = []) {
  const kept = new Map(start.map((p) => [p.posting_id, p]))
  const writes: unknown[] = []
  const svc = async (path: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST" && path === "job_chances") {
      for (const row of JSON.parse(init.body!)) { kept.set(row.posting_id, row); writes.push(row) }
      return null
    }
    if (path.startsWith("job_chances")) return [...kept.values()]
    return []
  }

  return { svc, kept, writes }
}

describe("the badge and Claude get the app's figure (server)", () => {
  const coreLike = core as unknown as KeptCore

  test("a job seen first beside a posting keeps the figure worked out there; the app's way of working it out gives the same number", async () => {
    const db = fakeDb()
    const first = await keptChances(coreLike, db.svc, "u1", EXAMPLE_PROFILE, [post], ref, shares)
    expect(db.writes.length).toBe(1)
    const appFigure = standing(post, EXAMPLE_PROFILE, ref, shares, NO_WHAT_IF, false, null).rate!.mid
    expect(first.get("p1").chance_pct).toBe(displayedChance(appFigure).pct)
    expect((db.kept.get("p1") as PinnedChance).inputs).toBe(chanceInputs(EXAMPLE_PROFILE, false, null))
  })

  test("asked again weeks later, the badge still shows the kept figure and writes nothing", async () => {
    const db = fakeDb()
    const first = (await keptChances(coreLike, db.svc, "u1", EXAMPLE_PROFILE, [post], ref, shares)).get("p1")
    const later = (await keptChances(coreLike, db.svc, "u1", EXAMPLE_PROFILE, [{ ...post, days_open: 60, applicants: 900 }], ref, shares)).get("p1")
    expect(later.chance_pct).toBe(first.chance_pct)
    expect(db.writes.length).toBe(1)
  })

  test("a figure the app kept from more than the server knows (a referral ticked in the browser) is shown, never overwritten", async () => {
    const appPin = { posting_id: "p1", ...standing(post, EXAMPLE_PROFILE, ref, shares, undefined, true).rate!, inputs: chanceInputs(EXAMPLE_PROFILE, true, null) }
    const db = fakeDb([appPin])
    const shown = (await keptChances(coreLike, db.svc, "u1", EXAMPLE_PROFILE, [post], ref, shares)).get("p1")
    expect(shown.chance_pct).toBe(displayedChance(appPin.mid).pct)
    expect(db.writes.length).toBe(0)
  })

  test("someone Claude describes in the chat gets a plain estimate, and nothing is kept", async () => {
    const db = fakeDb()
    const plain = (await keptChances(coreLike, db.svc, null, EXAMPLE_PROFILE, [post], ref, shares)).get("p1")
    expect(plain.chance_pct).toBeGreaterThan(0)
    expect(db.writes.length).toBe(0)
  })
})
