import { describe, expect, test } from "bun:test"
import { judgePage, parseJobPosting } from "../../supabase/functions/jobs/public-judge"

const page = (ld: object | string): string => `<html><head><script>var a={"x":1}</script><script type="application/ld+json" nonce="_">${typeof ld === "string" ? ld : JSON.stringify(ld)}</script></head><body>Hello</body></html>`
const job = (extra: object = {}) => ({ "@context": "https://schema.org/", "@type": "JobPosting", title: "Intern", description: "Use {curly} braces and \"quotes\" } in text", hiringOrganization: { "@type": "Organization", name: "Acme" }, ...extra })
const NOW = "2026-10-03"

describe("parseJobPosting", () => {
  test("finds the job data among other scripts and survives braces and quotes inside the description", () => {
    const ld = parseJobPosting(page(job({ validThrough: "2026-12-01T00:00:00Z" })))
    expect(ld?.title).toBe("Intern")
    expect(ld?.validThrough).toBe("2026-12-01T00:00:00Z")
  })
  test("null when there is no job data, or it is broken", () => {
    expect(parseJobPosting("<html>nothing</html>")).toBeNull()
    expect(parseJobPosting(page('{"@type": "JobPosting", "title": "x"'))).toBeNull()
  })
})

describe("judgePage", () => {
  test("a page that is gone is closed", () => {
    expect(judgePage("magnet.me", 404, "", NOW).verdict).toBe("closed")
    expect(judgePage("academictransfer", 410, "", NOW).verdict).toBe("closed")
  })
  test("a deadline in the past is closed, today and the future are open", () => {
    expect(judgePage("magnet.me", 200, page(job({ validThrough: "2026-10-02T08:00:00Z" })), NOW).verdict).toBe("closed")
    expect(judgePage("magnet.me", 200, page(job({ validThrough: "2026-10-03T08:00:00Z" })), NOW).verdict).toBe("open")
    expect(judgePage("magnet.me", 200, page(job({ validThrough: "2026-11-24T08:00:00.797Z" })), NOW).verdict).toBe("open")
  })
  test("the deadline is passed back so the database can close the job on that day", () => {
    expect(judgePage("academictransfer", 200, page(job({ validThrough: "2026-12-31" })), NOW).validThrough).toBe("2026-12-31")
    expect(judgePage("magnet.me", 200, page(job()), NOW).validThrough).toBeNull()
  })
  test("an open page with no deadline is open", () => {
    expect(judgePage("magnet.me", 200, page(job()), NOW).verdict).toBe("open")
  })
  test("anything we cannot read is unknown and never closed", () => {
    for (const status of [0, 403, 429, 500, 502, 503, 504, 301]) expect(judgePage("magnet.me", status, "", NOW).verdict).toBe("unknown")
    expect(judgePage("magnet.me", 200, "<html>maintenance</html>", NOW).verdict).toBe("unknown")
    expect(judgePage("magnet.me", 200, "", NOW).verdict).toBe("unknown")
  })
  test("a garbled deadline does not close a job", () => {
    for (const v of ["soon", "2026-13-45", "", null, 20261201]) expect(judgePage("magnet.me", 200, page(job({ validThrough: v })), NOW).verdict).toBe("open")
  })
  test("EY: the closed message closes it, an Apply button keeps it open, neither is unknown", () => {
    const closed = "<html><body><h1>Senior Manager</h1><p>The Job is no longer available.</p></body></html>"
    const open = "<html><body><h1>Senior Manager</h1><a>Apply now</a></body></html>"
    expect(judgePage("successfactors", 200, closed, NOW).verdict).toBe("closed")
    expect(judgePage("successfactors", 200, open, NOW).verdict).toBe("open")
    expect(judgePage("successfactors", 200, "<html><body>Loading</body></html>", NOW).verdict).toBe("unknown")
  })
  test("the closed phrase hidden inside a script does not close an EY job", () => {
    const body = '<html><script>var t="The Job is no longer available"</script><body><a>Apply now</a></body></html>'
    expect(judgePage("successfactors", 200, body, NOW).verdict).toBe("open")
  })
  test("a 404 beats an Apply button, and a passed deadline beats it too", () => {
    expect(judgePage("successfactors", 404, "<a>Apply now</a>", NOW).verdict).toBe("closed")
    expect(judgePage("successfactors", 200, page(job({ validThrough: "2026-01-01" })) + "<a>Apply now</a>", NOW).verdict).toBe("closed")
  })
})
