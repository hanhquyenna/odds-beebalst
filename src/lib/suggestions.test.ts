import { describe, expect, test } from "bun:test"
import { departmentOf } from "./field"
import { JOB_POOL, PAST_SEARCHES_KEPT, REVEAL, addPage, backfillPeople, canFindMore, dropPerson, firstPage, hasFree, isUrl, linkedinHref, rankForJob, rankSuggestions, readPast, revealNext, keepPast, type PastSearch } from "./suggest"

const p = (name: string, headline: string) => ({ name, headline, place: "Amsterdam", url: `https://www.linkedin.com/in/${name}` })

describe("rankSuggestions", () => {
  test("heads and directors are a later shot, not left out", () => {
    const out = rankSuggestions([p("a", "Director of Finance"), p("b", "Financial Analyst"), p("c", "Head of FP&A"), p("d", "Chief Financial Officer"), p("e", "VP Finance")])
    expect(out.map((x) => x.name)).toEqual(["b", "a", "c", "d", "e"])
  })
  test("seniors come before heads, and people with no readable position come last", () => {
    const out = rankSuggestions([p("none", ""), p("head", "Head of Data"), p("senior", "Senior Data Analyst"), p("plain", "Data Analyst")])
    expect(out.map((x) => x.name)).toEqual(["plain", "senior", "head", "none"])
  })

  test("puts seniors after people nearer the role, keeping the order inside each group", () => {
    const out = rankSuggestions([p("a", "Senior Financial Analyst"), p("b", "Financial Analyst"), p("c", "Finance Manager"), p("d", "Junior Analyst")])
    expect(out.map((x) => x.name)).toEqual(["b", "d", "a", "c"])
  })

  test("keeps everyone when nobody is senior", () => {
    expect(rankSuggestions([p("a", "Analyst"), p("b", "Associate")]).length).toBe(2)
  })
})

describe("Connect for a person in your list", () => {
  test("a LinkedIn link opens that page", () => {
    expect(linkedinHref({ name: "Anna", company: "ING", contact: " https://www.linkedin.com/in/anna " })).toBe("https://www.linkedin.com/in/anna")
  })
  test("no link opens a LinkedIn search for the name and the company", () => {
    expect(linkedinHref({ name: "Anna de Vries", company: "ING", contact: "" })).toBe("https://www.linkedin.com/search/results/people/?keywords=Anna%20de%20Vries%20ING")
  })
  test("an email or a phone number is not a link, so it also falls back to the search", () => {
    expect(isUrl("anna@ing.com")).toBe(false)
    expect(isUrl("+31 6 1234 5678")).toBe(false)
    expect(linkedinHref({ name: "Anna", company: "", contact: "anna@ing.com" })).toBe("https://www.linkedin.com/search/results/people/?keywords=Anna")
  })
  test("odd characters in a name are escaped", () => {
    expect(linkedinHref({ name: "Zoë & Co/Ltd", company: "A&B", contact: "" })).toContain("keywords=Zo%C3%AB%20%26%20Co%2FLtd%20A%26B")
  })
})

describe("a job's people, shown REVEAL at a time", () => {
  const people = (n: number, from = 0) => Array.from({ length: n }, (_, i) => p(`Person${from + i}`, "Analyst"))
  const names = (xs: ReadonlyArray<{ name: string }>) => xs.map((x) => x.name)

  test("the first page hands out one person", () => {
    const rec = firstPage(people(25), 1, true, new Date("2026-10-03T10:00:00Z"))!
    expect(REVEAL).toBe(1)
    expect(rec.shown).toBe(REVEAL)
    expect(rec.pool).toHaveLength(25)
    expect(rec.at).toBe("2026-10-03T10:00:00.000Z")
  })
  test("no one found is no search, and a short list never shows more than it has", () => {
    expect(firstPage(people(3), 1, false)!.shown).toBe(Math.min(3, REVEAL))
    expect(firstPage([], 1, false)).toBeNull()
  })
  test("Find shows the next person from what is already fetched, in order, without repeats", () => {
    let rec = firstPage(people(12), 1, true)!
    expect(hasFree(rec)).toBe(true)
    rec = revealNext(rec)
    expect(names(rec.pool.slice(0, rec.shown))).toEqual(Array.from({ length: 2 * REVEAL }, (_, i) => `Person${i}`))
    for (let i = 0; i < 20 && hasFree(rec); i++) rec = revealNext(rec)
    expect(rec.shown).toBe(12)
    expect(hasFree(rec)).toBe(false)
    expect(revealNext(rec).shown).toBe(12)
  })
  test("when all fetched are shown, the next page adds people not seen before and shows the next one", () => {
    let rec = firstPage(people(REVEAL), 1, true)!
    expect(hasFree(rec)).toBe(false)
    rec = addPage(rec, [...people(2, REVEAL - 1), ...people(8, REVEAL + 1)], 2, true)
    expect(rec.pool).toHaveLength(REVEAL + 9)
    expect(new Set(rec.pool.map((x) => x.url)).size).toBe(REVEAL + 9)
    expect(rec.shown).toBe(2 * REVEAL)
    expect(rec.page).toBe(2)
  })
  test("a page with no one new ends the search", () => {
    const rec = addPage(firstPage(people(REVEAL), 1, true)!, people(REVEAL), 2, true)
    expect(rec.more).toBe(false)
    expect(canFindMore(rec)).toBe(false)
  })
  test("Find can be pressed until nothing is left to show or fetch", () => {
    expect(canFindMore(null)).toBe(true)
    expect(canFindMore(firstPage(people(12), 1, false))).toBe(true)
    expect(canFindMore({ ...firstPage(people(5), 1, true)! })).toBe(true)
    expect(canFindMore(firstPage(people(REVEAL), 1, false))).toBe(false)
  })
  test("the X drops a person for good, and what was shown stays counted right", () => {
    const rec = firstPage(people(12), 1, true)!
    const shownDropped = dropPerson(rec, "https://www.linkedin.com/in/Person0")
    expect(shownDropped.pool).toHaveLength(11)
    expect(shownDropped.shown).toBe(REVEAL - 1)
    expect(names(shownDropped.pool)).not.toContain("Person0")
    const hiddenDropped = dropPerson(rec, "https://www.linkedin.com/in/Person9")
    expect(hiddenDropped.shown).toBe(REVEAL)
    expect(hiddenDropped.pool).toHaveLength(11)
    expect(dropPerson(rec, "https://example.com/nobody")).toBe(rec)
  })
  test("a dropped person does not come back when the next one is shown", () => {
    let rec = dropPerson(firstPage(people(12), 1, true)!, "https://www.linkedin.com/in/Person7")
    for (let i = 0; i < 20 && hasFree(rec); i++) rec = revealNext(rec)
    expect(names(rec.pool.slice(0, rec.shown))).not.toContain("Person7")
  })
  test("only the newest 25 jobs are kept, a job's search is replaced not doubled, and null removes it", () => {
    let all: Record<string, PastSearch> = {}
    for (let i = 0; i < 30; i++) all = keepPast(all, `job${i}`, firstPage(people(1), 1, false, new Date(2026, 9, 1, 0, i)))
    expect(Object.keys(all)).toHaveLength(PAST_SEARCHES_KEPT)
    expect(all.job29).toBeDefined()
    expect(all.job0).toBeUndefined()
    const again = keepPast(all, "job29", firstPage(people(4), 1, false, new Date(2026, 9, 2)))
    expect(again.job29.pool).toHaveLength(4)
    expect(Object.keys(again)).toHaveLength(PAST_SEARCHES_KEPT)
    expect(keepPast(again, "job29", null).job29).toBeUndefined()
  })
  test("the input is never changed", () => {
    const rec = firstPage(people(12), 1, true)!
    const snapshot = JSON.stringify(rec)
    revealNext(rec); dropPerson(rec, "https://www.linkedin.com/in/Person1"); addPage(rec, people(3, 20), 2, true)
    expect(JSON.stringify(rec)).toBe(snapshot)
  })
})

describe("reading a saved search", () => {
  test("a saved search comes back as it was", () => {
    const rec = firstPage([p("A", "Analyst"), p("B", "Analyst")], 1, true)!
    expect(readPast(JSON.parse(JSON.stringify(rec)))).toEqual(rec)
  })
  test("searches saved by the earlier live scrapers are dropped: they held employer names and place text as positions", () => {
    expect(readPast({ at: "2026-10-03T10:00:00Z", people: [p("A", "Genmab"), p("B", "Utrecht, Utrecht, Netherlands | Professional Profile")] })).toBeNull()
    expect(readPast({ at: "2026-10-03T10:00:00Z", pool: [p("A", "Genmab")], shown: 1, page: 1, more: true })).toBeNull()
  })
  test("garbage is no search and never throws", () => {
    for (const bad of [null, undefined, 5, "x", [], {}, { pool: "no" }, { pool: [] }, { pool: [null, 1, {}] }, { people: [{ name: 1, url: 2 }] }]) {
      expect(readPast(bad)).toBeNull()
    }
  })
  test("odd numbers are brought back into range", () => {
    const rec = readPast({ src: "stored", pool: [p("A", "Analyst")], shown: 99, page: -3, more: "yes" })!
    expect(rec.shown).toBe(1)
    expect(rec.page).toBe(1)
    expect(rec.more).toBe(false)
  })
})

describe("the department of a position", () => {
  test("a clear title names its department", () => {
    expect(departmentOf("Senior Financial Analyst")).toBe("Finance & accounting")
    expect(departmentOf("Software Engineer")).toBe("Software engineering")
  })
  test("no title, or words nobody knows, name nothing", () => {
    expect(departmentOf("")).toBeNull()
    expect(departmentOf("zzzqqq xxyy")).toBeNull()
  })
})

describe("filling in people already in your list", () => {
  const found = [{ name: "Henri V.", headline: "Senior Data Analyst", place: "Utrecht", url: "https://www.linkedin.com/in/henri", photo: "https://x/y.jpg", about: "About Henri", positions: [{ title: "Senior Data Analyst", company: "Adyen" }] }]
  const person = (over: Record<string, unknown> = {}) => ({ id: "1", contact: "https://www.linkedin.com/in/henri", ...over })

  test("a person with nothing saved gets everything the search found", () => {
    const out = backfillPeople([person()], found)
    expect(out).toHaveLength(1)
    expect(out[0].patch).toEqual({ role: "Senior Data Analyst", photo: "https://x/y.jpg", place: "Utrecht", about: "About Henri", positions: [{ title: "Senior Data Analyst", company: "Adyen" }] })
  })
  test("what the person typed or already has is never overwritten", () => {
    const out = backfillPeople([person({ role: "My own title", photo: "mine.jpg", place: "Home", about: "mine", positions: [{ title: "X", company: "Y" }] })], found)
    expect(out).toEqual([])
  })
  test("only the gaps are filled", () => {
    const out = backfillPeople([person({ role: "Typed", photo: "mine.jpg" })], found)
    expect(Object.keys(out[0].patch).sort()).toEqual(["about", "place", "positions"])
  })
  test("people who are not in the results are left alone, and so are results with nothing to add", () => {
    expect(backfillPeople([person({ contact: "https://www.linkedin.com/in/someone-else" })], found)).toEqual([])
    expect(backfillPeople([person()], [{ name: "Henri V.", headline: "", place: "", url: "https://www.linkedin.com/in/henri" }])).toEqual([])
  })
  test("a blank position counts as missing; spaces around the link do not stop the match", () => {
    expect(backfillPeople([person({ role: "   ", contact: " https://www.linkedin.com/in/henri " })], found)[0].patch.role).toBe("Senior Data Analyst")
  })
})

describe("rankForJob: the people stored for an employer, picked for one job", () => {
  const FIN = "Finance & accounting"
  const pool = [p("sw", "Software Engineer"), p("fin1", "Financial Analyst"), p("risk", "Compliance Officer"), p("fin2", "Senior Accountant"), p("dir", "Director of Finance"), p("none", ""), p("hr", "Recruiter"), p("mkt", "Brand Marketing Manager")]
  const names = (xs: ReadonlyArray<{ name: string }>) => xs.map((x) => x.name)

  test("the job's own department comes first, then a department next to it, then a head", () => {
    const out = names(rankForJob(pool, FIN, 10))
    expect(out.slice(0, 2)).toEqual(["fin1", "fin2"])
    expect(out.indexOf("risk")).toBeLessThan(out.indexOf("dir"))
    expect(out).toContain("dir")
  })
  test("never HR or recruiters for a job that is not an HR job, and nobody from a department far away", () => {
    const out = names(rankForJob(pool, FIN, 10))
    expect(out).not.toContain("hr")
    expect(out).not.toContain("sw")
    expect(out).not.toContain("mkt")
  })
  test("for an HR job, HR people are the team", () => {
    expect(names(rankForJob(pool, "HR & recruiting", 10))[0]).toBe("hr")
  })
  test("someone with no readable position is last, and a job offers at most the pool size", () => {
    const out = rankForJob(pool, FIN, 10)
    expect(names(out)[names(out).length - 1]).toBe("none")
    expect(rankForJob(pool, FIN)).toHaveLength(JOB_POOL)
  })
  test("another job at the same employer gets its own people from the same list", () => {
    expect(names(rankForJob(pool, "Software engineering", 10))[0]).toBe("sw")
    expect(names(rankForJob(pool, FIN, 10))[0]).toBe("fin1")
  })
  test("no one in or next to the job's department: nobody, not the rest of the company", () => {
    expect(rankForJob([p("a", "Machine Learning Engineer"), p("b", "Recruiter")], FIN, 10)).toEqual([])
  })
  test("no department known for the job: nobody is dropped for it", () => {
    expect(rankForJob(pool, null, 10).length).toBe(pool.length)
  })
})
