import { describe, expect, test } from "bun:test"
import { destinationForApply, jobClosedAllowed, page404Action, preferEnglishApplyUrl } from "../../supabase/functions/_shared/apply-navigation"

const ORMIT = "https://ormittalent.nl/nl/traineeships/traineeship-change-ai-adoption-asml/"
const ORMIT_404 = "https://ormittalent.nl/en-US/traineeships/traineeship-change-ai-adoption-asml/"
const LINKEDIN = "https://www.linkedin.com/jobs/view/4477162060"

describe("apply navigation", () => {
  test("a Dutch career path is not rewritten to /en-US/", () => {
    expect(preferEnglishApplyUrl(ORMIT)).toBe(ORMIT)
    expect(preferEnglishApplyUrl("https://ormittalent.nl/nl-NL/traineeships/example")).toBe("https://ormittalent.nl/nl-NL/traineeships/example")
    expect(destinationForApply(ORMIT, { seen: [ORMIT], jobUrls: [LINKEDIN] })).toBe(ORMIT)
    expect(destinationForApply(ORMIT_404, { seen: [ORMIT], jobUrls: [LINKEDIN] })).toBeNull()
  })

  test("an English hreflang link on the page can be used, and Workday only changes its locale query", () => {
    const dutch = "https://jobs.example.com/nl/roles/analyst"
    const english = "https://jobs.example.com/en/roles/analyst"
    expect(preferEnglishApplyUrl(dutch, [english])).toBe(english)
    const workday = "https://acme.wd3.myworkdayjobs.com/careers/job/Amsterdam/Analyst_R1?locale=nl_NL"
    expect(preferEnglishApplyUrl(workday)).toContain("locale=en_US")
    expect(preferEnglishApplyUrl(workday)).toContain("/job/Amsterdam/Analyst_R1")
    expect(destinationForApply(workday, { jobUrls: [workday] })).toContain("locale=en_US")
  })

  test("Ormit's derived 404 does not close the LinkedIn posting and returns once", () => {
    expect(jobClosedAllowed(ORMIT_404, LINKEDIN)).toBe(false)
    expect(jobClosedAllowed(ORMIT_404, ORMIT)).toBe(false)
    expect(page404Action(ORMIT_404, ORMIT, false)).toBe("return")
    expect(page404Action(ORMIT_404, ORMIT, true)).toBe("unknown")
    expect(page404Action(ORMIT, ORMIT, false)).toBe("close")
    expect(jobClosedAllowed("https://nl.linkedin.com/jobs/view/traineeship-4477162060", LINKEDIN)).toBe(true)
  })

  test("a locale query Odds added is not the stored posting, and an unseen URL cannot be opened", () => {
    const stored = "https://acme.wd3.myworkdayjobs.com/careers/job/Amsterdam/Analyst_R1"
    const rewritten = preferEnglishApplyUrl(`${stored}?locale=nl_NL`)
    expect(rewritten).toContain("locale=en_US")
    expect(jobClosedAllowed(rewritten, stored)).toBe(false)
    expect(page404Action(rewritten, stored, false)).toBe("return")
    expect(destinationForApply(ORMIT_404, { seen: [ORMIT], jobUrls: [LINKEDIN] })).toBeNull()
    expect(destinationForApply("https://jobs.example.com/invented", { seen: ["https://jobs.example.com/roles/analyst"], jobUrls: [LINKEDIN] })).toBeNull()
    const factors = "https://acme.successfactors.eu/career?lang=nl_NL"
    expect(preferEnglishApplyUrl(factors)).toContain("lang=en_US")
    expect(preferEnglishApplyUrl(factors)).toContain("locale=en_US")
    expect(preferEnglishApplyUrl(factors)).toContain("/career")
  })
})
