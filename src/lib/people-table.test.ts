import { describe, expect, test } from "bun:test"
import { NO_PEOPLE_FILTER, PEOPLE_SEED_VIEWS, applyPeopleFilter, isPeopleFilterOn, lastUpdate, matchesPerson, normalizePeopleFilter, normalizePeopleViews, nudgeOn, sortPeople, stageIndex } from "@/lib/people-table"
import type { Person } from "@/lib/types"

const NOW = new Date(2026, 9, 14, 12, 0)
const person = (over: Partial<Person>): Person => ({ id: "x", name: "Sanne de Vries", company: "ING", jobId: null, status: "To contact", contact: "", notes: "", ...over })

describe("nudgeOn and lastUpdate", () => {
  test("a week after the stage changed, only for a stage where waiting is the move", () => {
    expect(nudgeOn(person({ status: "Contacted", statusAt: "2026-10-01T09:00:00Z" }))).toBe("2026-10-08")
    expect(nudgeOn(person({ status: "Referral asked", statusAt: "2026-10-10" }))).toBe("2026-10-17")
    expect(nudgeOn(person({ status: "Met", statusAt: "2026-10-01" }))).toBeNull()
    expect(nudgeOn(person({ status: "Contacted" }))).toBeNull()
    expect(lastUpdate(person({ statusAt: "2026-10-01T09:00:00Z" }))).toBe("2026-10-01")
    expect(lastUpdate(person({}))).toBeNull()
  })
})

describe("applyPeopleFilter", () => {
  const people = [
    person({ id: "a", status: "Contacted", statusAt: "2026-10-01T00:00:00Z", jobId: "j1" }),
    person({ id: "b", status: "Contacted", statusAt: "2026-10-12T00:00:00Z" }),
    person({ id: "c", status: "Met", statusAt: "2026-09-01T00:00:00Z" }),
    person({ id: "d", status: "To contact" }),
  ]
  const run = (f: Partial<typeof NO_PEOPLE_FILTER>): string[] => applyPeopleFilter(people, { ...NO_PEOPLE_FILTER, ...f }, NOW).map((p) => p.id)
  test("no filter keeps everyone", () => {
    expect(run({})).toEqual(["a", "b", "c", "d"])
    expect(isPeopleFilterOn(NO_PEOPLE_FILTER)).toBe(false)
  })
  test("by stage, nudge due, and not linked to a job", () => {
    expect(run({ status: ["Contacted"] })).toEqual(["a", "b"])
    expect(run({ status: ["Met", "To contact"] })).toEqual(["c", "d"])
    expect(run({ nudgeDue: true })).toEqual(["a"])
    expect(run({ unlinked: true })).toEqual(["b", "c", "d"])
    expect(run({ status: ["Contacted"], unlinked: true })).toEqual(["b"])
  })
})

describe("normalizePeopleFilter", () => {
  test("keeps known stages and flags, drops the rest", () => {
    expect(normalizePeopleFilter({ status: ["Met", "Nonsense", 4], nudgeDue: true, unlinked: "y" })).toEqual({ status: ["Met"], nudgeDue: true, unlinked: false })
    expect(normalizePeopleFilter(undefined)).toEqual(NO_PEOPLE_FILTER)
  })
})

describe("search", () => {
  test("every word must be found in name, company, position, notes or stage", () => {
    const p = person({ role: "Talent partner", notes: "met at the alumni drinks" })
    expect(matchesPerson(p, "sanne ing")).toBe(true)
    expect(matchesPerson(p, "talent alumni")).toBe(true)
    expect(matchesPerson(p, "sanne abn")).toBe(false)
    expect(matchesPerson(p, "")).toBe(true)
  })
})

describe("the starting views and reading them back", () => {
  test("follow the outreach trackers", () => {
    expect(PEOPLE_SEED_VIEWS.map((v) => v.name)).toEqual(["Everyone", "Pipeline", "Calendar"])
    expect(PEOPLE_SEED_VIEWS.map((v) => v.layout)).toEqual(["table", "board", "calendar"])
  })
  test("good views kept, bad dropped, layout repaired, empty falls back", () => {
    const v = normalizePeopleViews([{ id: "a", name: "Mine", layout: "kanban", filter: { status: ["Met"] } }, { id: "a", name: "dup" }, "x"])
    expect(v).toHaveLength(1)
    expect(v[0].layout).toBe("table")
    expect(v[0].filter.status).toEqual(["Met"])
    expect(normalizePeopleViews([])).toHaveLength(PEOPLE_SEED_VIEWS.length)
    expect(normalizePeopleViews(undefined)).toHaveLength(PEOPLE_SEED_VIEWS.length)
  })
  test("stageIndex follows the playbook order", () => {
    expect(stageIndex("To contact")).toBe(0)
    expect(stageIndex("Met")).toBeGreaterThan(stageIndex("Replied"))
  })
})

describe("sortPeople", () => {
  const mk = (name: string, over: Partial<Person> = {}): Person => ({ id: name, name, company: "", jobId: null, status: "To contact", contact: "", notes: "", ...over })
  test("sorts by name and puts empty values last in both directions", () => {
    const people = [mk("b", { role: "Zed" }), mk("a"), mk("c", { role: "Alpha" })]
    expect(sortPeople(people, "role", "asc", () => "", () => "").map((p) => p.name)).toEqual(["c", "b", "a"])
    expect(sortPeople(people, "role", "desc", () => "", () => "").map((p) => p.name)).toEqual(["b", "c", "a"])
    expect(sortPeople(people, "name", "desc", () => "", () => "").map((p) => p.name)).toEqual(["c", "b", "a"])
  })
  test("sorts by stage order", () => {
    const people = [mk("x", { status: "Met" }), mk("y", { status: "To contact" })]
    expect(sortPeople(people, "status", "asc", () => "", () => "").map((p) => p.name)).toEqual(["y", "x"])
  })
})

import { nudgeFor } from "@/lib/people-table"
describe("nudgeFor", () => {
  const waiting = { status: "Contacted" as const, statusAt: "2026-10-01T09:00:00Z" }
  test("default is a week after the last update, while waiting", () => {
    expect(nudgeFor(waiting, "", NOW)).toEqual({ on: "2026-10-08", due: true })
  })
  test("typed days count from the last update; a typed date is that date; not waiting gives none", () => {
    expect(nudgeFor(waiting, "20 days", NOW)).toEqual({ on: "2026-10-21", due: false })
    expect(nudgeFor({ status: "Met", statusAt: "2026-10-01" }, "", NOW)).toBeNull()
    expect(nudgeFor({ status: "Met", statusAt: "2026-10-01" }, "2026-10-20", NOW)).toEqual({ on: "2026-10-20", due: false })
  })
})
