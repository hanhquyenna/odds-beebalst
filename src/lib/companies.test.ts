import { describe, expect, test } from "bun:test"
import { logoFor, monogram, siteDomain } from "@/lib/companies"
import { nameKey } from "@/lib/stored-logos"

describe("logos for any job", () => {
  test("a company's own career site gives its domain", () => {
    expect(siteDomain("https://careers.acme.com/jobs/123")).toBe("acme.com")
    expect(siteDomain("https://www.acme.nl/vacatures/analist")).toBe("acme.nl")
  })
  test("a job board says nothing about the employer", () => {
    expect(siteDomain("https://www.linkedin.com/jobs/view/1")).toBeNull()
    expect(siteDomain("https://boards.greenhouse.io/acme/jobs/1")).toBeNull()
    expect(siteDomain("https://www.magnet.me/en-nl/vacancies/some-job")).toBeNull()
    expect(siteDomain("https://www.academictransfer.com/en/jobs/123/phd")).toBeNull()
    expect(siteDomain("not a link")).toBeNull()
  })
  test("an unknown employer with a company link uses its site icon, otherwise initials", () => {
    expect(logoFor("Zzz Unknown BV", "https://careers.zzz-unknown.com/job/1")).toContain("zzz-unknown.com")
    expect(logoFor("Zzz Unknown BV", "https://www.indeed.com/viewjob?jk=1")).toBeNull()
    expect(monogram("Zzz Unknown BV")).toBe("ZU")
  })
  test("the same company under a slightly different name finds its logo", () => {
    expect(nameKey("McKinsey &amp; Company")).toBe(nameKey("McKinsey & Company"))
    expect(nameKey("ABN AMRO Bank N.V.")).toBe(nameKey("ABN AMRO"))
    expect(nameKey("MUFG Bank (Europe) N.V.")).toBe(nameKey("MUFG"))
    expect(logoFor("ABN AMRO")).toBe(logoFor("ABN AMRO Bank N.V."))
    expect(logoFor("McKinsey & Company")).toBe("/logos/78e316462d.png")
    expect(logoFor("MUFG Bank (Europe) N.V.")).toBe("/logos/5697c1d230.png")
  })
  test("two different companies do not share a logo", () => {
    expect(nameKey("Bank of America")).not.toBe(nameKey("ABN AMRO"))
    expect(nameKey("Philips")).not.toBe(nameKey("Philips Healthcare"))
  })
})
