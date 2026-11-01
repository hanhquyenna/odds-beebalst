import { describe, expect, test } from "bun:test"
import { LINKEDIN_URL, toLinkedInUrl } from "@/lib/linkedin-url"

describe("toLinkedInUrl", () => {
  const want = "https://www.linkedin.com/in/phicks-447805221"

  test("takes a profile link however it is pasted", () => {
    for (const pasted of [
      "www.linkedin.com/in/phicks-447805221/",
      "linkedin.com/in/phicks-447805221",
      "https://www.linkedin.com/in/phicks-447805221/",
      "http://linkedin.com/in/phicks-447805221",
      "  https://nl.linkedin.com/in/phicks-447805221  ",
      "https://m.linkedin.com/in/phicks-447805221/",
      "https://www.linkedin.com/in/phicks-447805221?utm_source=share&utm_medium=member_ios",
      "HTTPS://WWW.LINKEDIN.COM/in/phicks-447805221#about",
      "<https://www.linkedin.com/in/phicks-447805221>",
      "My LinkedIn: linkedin.com/in/phicks-447805221 thanks!",
      "https://www.linkedin.com/in/phicks-447805221/details/experience/",
      "https://www.linkedin.com/in/phicks-447805221/recent-activity/all/",
      "https://www.linkedin.com/in/phicks-447805221/en",
      "https://www.linkedin.com/mwlite/in/phicks-447805221",
      "https://www.linkedin.com/in/phicks-447805221/?originalSubdomain=nl",
      "\"https://www.linkedin.com/in/phicks-447805221\"",
      "(linkedin.com/in/phicks-447805221)",
    ]) {
      expect(toLinkedInUrl(pasted)).toBe(want)
    }
  })

  test("what it gives back passes the reader's own check", () => {
    expect(LINKEDIN_URL.test(toLinkedInUrl("www.linkedin.com/in/phicks-447805221/")!)).toBe(true)
  })

  test("a name with accents, typed or copied from the address bar, gives one link", () => {
    const want = "https://www.linkedin.com/in/nguy%E1%BB%85n-v%C4%83n-an"
    expect(toLinkedInUrl("linkedin.com/in/nguyễn-văn-an")).toBe(want)
    expect(toLinkedInUrl("https://www.linkedin.com/in/nguy%E1%BB%85n-v%C4%83n-an/")).toBe(want)
    expect(LINKEDIN_URL.test(want)).toBe(true)
  })

  test("refuses what is not a profile link", () => {
    for (const pasted of ["", "phicks", "https://www.linkedin.com/company/odds", "https://www.linkedin.com/jobs/view/123", "https://evil.com/in/phicks", "https://linkedin.com.evil.com/in/phicks", "https://www.linkedin.com/in/ab", "https://www.linkedin.com/feed/", "https://www.linkedin.com/in/", "https://www.linkedin.com/company/odds/in/phicks", "https://www.linkedin.com/in/bad%ZZname", "https://www.linkedin.com/in/a.b.c"]) {
      expect(toLinkedInUrl(pasted)).toBeNull()
    }
  })
})
