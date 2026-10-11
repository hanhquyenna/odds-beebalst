import { describe, expect, test } from "bun:test"
import { profileFitFor, profileSignals, type ProfileSignals } from "@/lib/profile-fit"
import { job } from "@/lib/odds-v2.personas"
import { DEFAULT_PROFILE, type Posting, type Profile } from "@/lib/types"

type St = Parameters<typeof profileFitFor>[1]
const st = (over: Partial<St> = {}, score = 0.5): St => ({ gates: [], fit: { score, parts: [] }, ...over })
const gate = (name: string, status: "pass" | "fail" | "unknown") => ({ name, status, why: "", source: "" }) as St["gates"][number]
const sig = (over: Partial<ProfileSignals> = {}): ProfileSignals => ({ studying: true, graduatedMonthsAgo: null, levels: ["Internship"], city: null, needsPermit: false, industries: [], industryFrom: {}, wanted: new Set(), ...over })
const intern = (o: Partial<Posting> = {}): Posting => job({ title: "Finance Analyst Intern", employer: "Acme", family: "Finance & accounting", level_view: "Internship", role_kind: "internship", skills: ["Excel"], ...o })

describe("what the profile says about a job: closed to you, or not", () => {
  test("a job that asks for a student is not shown to someone who graduated; a language or Dutch they lack closes it too", () => {
    expect(profileFitFor(intern(), st({ gates: [gate("Student", "fail")] }), sig()).blocked).toContain("student")
    expect(profileFitFor(intern(), st({ gates: [gate("Language", "fail")] }), sig()).blocked).toContain("language")
    expect(profileFitFor(intern(), st({ gates: [gate("Dutch", "fail")] }), sig()).blocked).toContain("Dutch")
    expect(profileFitFor(intern(), st({ gates: [gate("Student", "unknown")] }), sig()).blocked).toBeNull()
  })

  test("an internship is not shown to someone who left university over two years ago; a recent graduate still sees it", () => {
    const old = sig({ studying: false, graduatedMonthsAgo: 40, levels: ["Entry", "Mid"] })
    const recent = sig({ studying: false, graduatedMonthsAgo: 6, levels: ["Entry", "Internship"] })
    expect(profileFitFor(intern(), st(), old).blocked).toContain("internship")
    expect(profileFitFor(intern(), st(), recent).blocked).toBeNull()
    expect(profileFitFor(job({ title: "Junior Analyst", employer: "Acme", level_view: "Entry", role_kind: "entry_job" }), st(), old).blocked).toBeNull()
  })

  test("years or degree asked beyond the profile count against the job, they do not hide it", () => {
    const base = profileFitFor(intern(), st(), sig())
    const short = profileFitFor(intern(), st({ gates: [gate("Minimum years", "fail")] }), sig())
    expect(short.blocked).toBeNull()
    expect(short.score as number).toBeLessThan(base.score as number)
  })
})

describe("how well it fits: what the job is, times whether it can work", () => {
  test("where a job is cannot stand in for what it is: a job that says nothing about the work stays low even in your city, with a sponsor", () => {
    const s = sig({ city: "amsterdam", needsPermit: true })
    const nothing = profileFitFor(job({ title: "Internship", employer: "Acme", level_view: "Internship", ind_sponsor: true, skills: [] }), st({}, 0.9), s)
    const real = profileFitFor(intern({ region: "Rotterdam", ind_sponsor: false }), st({}, 0.6), s)
    expect(nothing.score as number).toBeLessThanOrEqual(0.15)
    expect(real.score as number).toBeGreaterThan(nothing.score as number)
  })

  test("the city they live in and a recognised sponsor (for someone who needs a permit) lift a job; a sponsor does not count for someone who does not", () => {
    const there = intern({ region: "Amsterdam", ind_sponsor: true })
    const away = intern({ region: "Eindhoven", ind_sponsor: false })
    const needs = sig({ city: "amsterdam", needsPermit: true })
    expect(profileFitFor(there, st(), needs).score as number).toBeGreaterThan(profileFitFor(away, st(), needs).score as number)
    const eu = sig({ city: null, needsPermit: false })
    expect(profileFitFor(there, st(), eu).score).toBe(profileFitFor(away, st(), eu).score)
  })

  test("level: internship for a student, entry-level for someone who finished lately", () => {
    const entry = intern({ level_view: "Entry", role_kind: "entry_job" })
    const student = sig({ levels: ["Internship"] })
    const grad = sig({ studying: false, graduatedMonthsAgo: 8, levels: ["Entry", "Internship"] })
    expect(profileFitFor(intern(), st(), student).score as number).toBeGreaterThan(profileFitFor(entry, st(), student).score as number)
    expect(profileFitFor(entry, st(), grad).score as number).toBeGreaterThan(profileFitFor(intern(), st(), grad).score as number)
  })

  test("the same industry as an employer they worked at, and the job named in their headline, are reasons in words", () => {
    const s = sig({ industries: ["Consulting"], industryFrom: { Consulting: "Deloitte" }, wanted: new Set(["analyst"]) })
    const f = profileFitFor(intern({ industry: "Consulting" }), st(), s)
    expect(f.reasons.join(" | ")).toContain("same industry as your time at Deloitte")
    expect(f.reasons.join(" | ")).toContain("headline")
    expect(f.reasons.length).toBeLessThanOrEqual(3)
  })

  test("a recognised sponsor is named last: it is true of most of the list", () => {
    const f = profileFitFor(intern({ region: "Amsterdam" }), st(), sig({ city: "amsterdam", needsPermit: true }))
    expect(f.reasons.at(-1)).toBe("a recognised visa sponsor")
  })

  test("with nothing to judge by there is no score, and no crash", () => {
    const f = profileFitFor(job({ title: "Internship", employer: "Acme", level_view: "Not stated" }), { gates: [], fit: null }, sig())
    expect(f.score).toBeNull()
  })
})

describe("what the profile says", () => {
  const person = (over: Partial<Profile>): Profile => ({ ...DEFAULT_PROFILE, ...over })
  const edu = (end: string) => ({ "School Name": "UvA", "Degree Name": "BSc", "Field Of Study": "Economics", "Start Date": "2021", "End Date": end })

  test("studying looks for internships; finished lately for entry-level jobs first; years of work for entry and mid", () => {
    expect(profileSignals(person({ education: [edu("2030")], studying: true })).levels[0]).toBe("Internship")
    const thisYear = String(new Date().getFullYear() - 1)
    expect(profileSignals(person({ education: [edu(thisYear)], studying: false })).levels[0]).toBe("Entry")
    const long = person({ education: [edu("2016")], studying: false, positions: [{ Title: "Analyst", "Company Name": "ING", "Started On": "Jan 2017", "Finished On": "Jan 2024" }] })
    expect(profileSignals(long).levels).toEqual(["Entry", "Mid"])
  })

  test("the city comes from the profile's place; a permit is needed unless the person is EU", () => {
    expect(profileSignals(person({ place: "Amsterdam, North Holland, Netherlands" })).city).toBe("amsterdam")
    expect(profileSignals(person({ permit: "eu" })).needsPermit).toBe(false)
    expect(profileSignals(person({ permit: "other_non_eu" })).needsPermit).toBe(true)
  })

  test("industries come from the employers they worked at, as far as the open postings know them", () => {
    const p = person({ positions: [{ Title: "Intern", "Company Name": "Deloitte", "Started On": "Jan 2025", "Finished On": "Jul 2025" }] })
    expect(profileSignals(p, new Map([["deloitte", "Consulting"]])).industries).toEqual(["Consulting"])
    expect(profileSignals(p, new Map()).industries).toEqual([])
  })

  test("headline words that name a job count; words about studying or places do not", () => {
    const w = profileSignals(person({ headline: "Economics student at UvA, aspiring investment banking analyst in Amsterdam" })).wanted
    expect(w.has("analyst") || w.has("analyst".slice(0, 6))).toBe(true)
    expect([...w].some((x) => x.startsWith("student"))).toBe(false)
    expect([...w].some((x) => x.startsWith("amsterdam"))).toBe(false)
  })
})
