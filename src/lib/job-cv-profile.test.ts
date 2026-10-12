import { beforeAll, describe, expect, test } from "bun:test"
import { jobProfileOf, loadCvReader, profileFromCv } from "@/lib/job-cv-profile"
import type { Doc, Store } from "@/lib/document-model"
import { oddsV2 } from "@/lib/odds-v2"
import { job } from "@/lib/odds-v2.personas"
import { DEFAULT_PROFILE, type Profile } from "@/lib/types"

const role = (Title: string, company: string, from: number, to: number) => ({ Title, "Company Name": company, "Started On": `Jan ${from}`, "Finished On": `Jan ${to}`, Location: "Amsterdam, Netherlands" })
const edu = (degree: string) => ({ "School Name": "University of Amsterdam", "Degree Name": degree, "Start Date": "2021", "End Date": "2025" })
/** The saved profile (LinkedIn): finance. */
const profile: Profile = { ...DEFAULT_PROFILE, origin: "non_eu", dutch: "basic", positions: [role("Finance Intern", "Van Oord", 2025, 2026)], education: [edu("MSc Finance")], skills: [{ Name: "Excel" }] } as Profile
const MARKETING_CV = `Test Person

EXPERIENCE
Marketing Manager, Picnic, Amsterdam, Jan 2023 - Jan 2026
Brand campaigns and content.
Marketing Intern, Bol.com, Utrecht, Jan 2022 - Jan 2023
Social media.

EDUCATION
BA Communication, University of Amsterdam, 2018 - 2022

SKILLS
Content, SEO`
const doc = (id: string, name: string, body: string): Doc => ({ id, kind: "cv", name, fileName: `${name}.txt`, mime: "text/plain", size: body.length, body, isMain: false, createdAt: "2026-10-12" }) as Doc
const store = (links: Array<[string, string]>, docs: Doc[]): Store => ({ userId: "u", status: "ready", docs, links: links.map(([postingId, documentId]) => ({ postingId, kind: "cv" as const, documentId })) })

const marketingJob = job({ title: "Marketing Manager", employer: "Mid Company", family: "Marketing & communications", applicants: 120, level_view: "Mid", years_min: 2 })
const financeJob = job({ title: "Finance Intern", employer: "Mid Company", family: "Finance & accounting", applicants: 120, level_view: "Internship", role_kind: "internship" })

// The reader is loaded on demand in the app; here it is loaded once, before the tests.
beforeAll(async () => {
  await loadCvReader()
})

describe("job CV profile: a CV on a job decides that job's chance, other jobs keep the profile's", () => {
  test("a job with no CV uses the saved profile, untouched", () => {
    const j = jobProfileOf(profile, store([], []), "finance")
    expect(j.fromCv).toBe(false)
    expect(j.profile).toBe(profile)
  })
  test("a job with a readable CV uses the CV's roles, degrees and skills; origin and Dutch stay the profile's", () => {
    const d = doc("d1", "CV Marketing", MARKETING_CV)
    const j = jobProfileOf(profile, store([["marketing", "d1"]], [d]), "marketing")
    expect(j.fromCv).toBe(true)
    expect(j.cvName).toBe("CV Marketing")
    expect(j.profile.positions.map((p) => p.Title)).toContain("Marketing Manager")
    expect(j.profile.positions.some((p) => p.Title === "Finance Intern")).toBe(false)
    expect(j.profile.origin).toBe("non_eu")
    expect(j.profile.dutch).toBe("basic")
  })
  test("the chance for the job with the CV moves; the chance for a job without one does not", () => {
    const d = doc("d1", "CV Marketing", MARKETING_CV)
    const s = store([["marketing", "d1"]], [d])
    const withCv = oddsV2(marketingJob, jobProfileOf(profile, s, "marketing").profile).p
    const withoutCv = oddsV2(marketingJob, profile).p
    expect(withCv).toBeGreaterThan(withoutCv)
    // The finance job has no CV: same profile object, same figure as before the CV existed anywhere.
    const other = jobProfileOf(profile, s, "finance")
    expect(other.profile).toBe(profile)
    expect(oddsV2(financeJob, other.profile).p).toBe(oddsV2(financeJob, profile).p)
  })
  test("a CV the rules cannot read does not wipe the profile: the job keeps the profile's figure and says so", () => {
    const d = doc("d2", "Scan", "just some words with nothing a parser can find")
    expect(profileFromCv(profile, d.body)).toBeNull()
    const j = jobProfileOf(profile, store([["finance", "d2"]], [d]), "finance")
    expect(j.fromCv).toBe(false)
    expect(j.cvName).toBe("Scan")
    expect(j.profile.positions).toEqual(profile.positions)
  })
})
