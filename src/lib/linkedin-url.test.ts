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
    ]) {
      expect(toLinkedInUrl(pasted)).toBe(want)
    }
  })

  test("what it gives back passes the reader's own check", () => {
    expect(LINKEDIN_URL.test(toLinkedInUrl("www.linkedin.com/in/phicks-447805221/")!)).toBe(true)
  })

  test("refuses what is not a profile link", () => {
    for (const pasted of ["", "phicks", "https://www.linkedin.com/company/odds", "https://www.linkedin.com/jobs/view/123", "https://evil.com/in/phicks", "https://linkedin.com.evil.com/in/phicks", "https://www.linkedin.com/in/ab"]) {
      expect(toLinkedInUrl(pasted)).toBeNull()
    }
  })
})
