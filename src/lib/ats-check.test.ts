import { describe, expect, test } from "bun:test"
import { applyVerdict, ashbyBoard, boardUrl, greenhouseBoard, idFromUrl, jobEndpoint, norm, onBoard, personioBoard, recruiteeBoard } from "../../supabase/functions/_shared/ats-check"

const row = (ats: string, url: string | null, employer = "Acme", title = "Data Analyst") => ({ id: "x", ats, employer, title, url })

describe("reading a board", () => {
  test("greenhouse: by id from the link, or by title when we hold no link", () => {
    const b = greenhouseBoard(JSON.stringify({ jobs: [{ id: 123, title: "Data Analyst" }, { id: 9, title: "Senior Platform Engineer" }] }))!
    expect(onBoard(b, idFromUrl("greenhouse", "https://job-boards.eu.greenhouse.io/acme/jobs/123"), "x")).toBe(true)
    expect(onBoard(b, idFromUrl("greenhouse", "https://careers.acme.com/?gh_jid=124"), "Other role")).toBe(false)
    expect(onBoard(b, null, "senior  platform engineer")).toBe(true)
  })
  test("a board that is not a list is not read", () => {
    expect(greenhouseBoard("<html>")).toBeNull()
    expect(ashbyBoard(JSON.stringify({ error: "x" }))).toBeNull()
    expect(recruiteeBoard("nope")).toBeNull()
    expect(personioBoard("<html/>")).toBeNull()
  })
  test("ashby, recruitee and personio ids", () => {
    expect(onBoard(ashbyBoard(JSON.stringify({ jobs: [{ id: "62b6f958-713f-4313-b73c-3b8202d9bbc8", title: "A" }] }))!, idFromUrl("ashby", "https://jobs.ashbyhq.com/prosus/62b6f958-713f-4313-b73c-3b8202d9bbc8"), "A")).toBe(true)
    expect(onBoard(recruiteeBoard(JSON.stringify({ offers: [{ slug: "ios-developer-3", title: "iOS Developer" }] }))!, idFromUrl("recruitee", "https://careers.bunq.com/o/ios-developer-3"), "x")).toBe(true)
    expect(onBoard(personioBoard("<workzag-jobs><position><id>2744552</id><name>Dev</name></position></workzag-jobs>")!, idFromUrl("personio", "https://fairphone.jobs.personio.de/job/2744552"), "x")).toBe(true)
  })
  test("titles are compared without case, accents or punctuation", () => {
    expect(norm("Sr. Développeur – Data (m/f)")).toBe(norm("sr developpeur data m f"))
  })
})

describe("where to ask", () => {
  test("list boards", () => {
    expect(boardUrl(row("greenhouse", "https://job-boards.eu.greenhouse.io/jetbrains/jobs/1"))).toBe("https://boards-api.greenhouse.io/v1/boards/jetbrains/jobs")
    expect(boardUrl(row("greenhouse", null, "Schuberg Philis"))).toBe("https://boards-api.greenhouse.io/v1/boards/schubergphilis/jobs")
    expect(boardUrl(row("recruitee", "https://careers.bunq.com/o/x"))).toBe("https://careers.bunq.com/api/offers/")
  })
  test("single-job boards", () => {
    expect(jobEndpoint(row("lever", "https://jobs.eu.lever.co/olx/abc"))).toEqual({ url: "https://api.eu.lever.co/v0/postings/olx/abc", gone: [404] })
    expect(jobEndpoint(row("smartrecruiters", "https://jobs.smartrecruiters.com/Eurofins/744000143069619-lead"))?.url).toBe("https://api.smartrecruiters.com/v1/companies/Eurofins/postings/744000143069619")
    expect(jobEndpoint(row("workday", "https://medtronic.wd1.myworkdayjobs.com/MedtronicCareers/job/Geleen/R-D-Engineer-II_R66820-2"))?.url).toBe("https://medtronic.wd1.myworkdayjobs.com/wday/cxs/medtronic/MedtronicCareers/job/Geleen/R-D-Engineer-II_R66820-2")
    expect(jobEndpoint(row("workday", "https://wd3.myworkdaysite.com/recruiting/rabobank/jobs/job/Utrecht/Analyst_JR_1"))?.url).toBe("https://wd3.myworkdaysite.com/wday/cxs/rabobank/jobs/job/Utrecht/Analyst_JR_1")
    expect(jobEndpoint(row("lever", null))).toBeNull()
  })
})

describe("what an answer does", () => {
  const now = "2026-10-02T10:00:00Z"
  test("one miss does not close a posting, two in a row do", () => {
    const one = applyVerdict({ miss_count: 0, closed_at: null }, "closed", now)
    expect(one.state).toEqual({ miss_count: 1, closed_at: null })
    expect(applyVerdict(one.state, "closed", now).state).toEqual({ miss_count: 2, closed_at: now })
  })
  test("an unknown answer changes nothing", () => {
    const s = { miss_count: 1, closed_at: null }
    expect(applyVerdict(s, "unknown", now)).toEqual({ state: s, seen: false })
  })
  test("a posting that comes back is open again and counts as seen", () => {
    expect(applyVerdict({ miss_count: 3, closed_at: now }, "open", "later")).toEqual({ state: { miss_count: 0, closed_at: null }, seen: true })
  })
  test("a closed posting keeps its first closing time", () => {
    expect(applyVerdict({ miss_count: 2, closed_at: now }, "closed", "later").state.closed_at).toBe(now)
  })
})
