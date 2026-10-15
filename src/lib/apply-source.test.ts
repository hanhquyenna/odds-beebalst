import { describe, expect, test } from "bun:test"
import { applySourceOf } from "@/lib/apply-source"

const s = (name: string, ats: string, url: string | null = `https://x.test/${name}`): { name: string; ats: string; url: string | null } => ({ name, ats, url })

describe("where to apply", () => {
  test("the employer's own application beats LinkedIn, whichever is listed first", () => {
    expect(applySourceOf([s("LinkedIn", "linkedin"), s("Greenhouse", "greenhouse")])?.ats).toBe("greenhouse")
    expect(applySourceOf([s("LinkedIn", "linkedin"), s("Acme careers", "other")])?.ats).toBe("other")
  })
  test("then the student boards, then LinkedIn, and Glassdoor/Indeed last", () => {
    expect(applySourceOf([s("LinkedIn", "linkedin"), s("Indeed", "indeed"), s("Magnet.me", "magnet.me")])?.ats).toBe("magnet.me")
    expect(applySourceOf([s("LinkedIn", "linkedin"), s("Glassdoor", "glassdoor")])?.ats).toBe("linkedin")
    expect(applySourceOf([s("Glassdoor", "glassdoor"), s("Indeed", "indeed")])?.ats).toBe("glassdoor")
  })
  test("LinkedIn when it is the only place, and nothing when no source has an address", () => {
    expect(applySourceOf([s("LinkedIn", "linkedin")])?.ats).toBe("linkedin")
    expect(applySourceOf([s("Greenhouse", "greenhouse", null)])).toBeNull()
    expect(applySourceOf([])).toBeNull()
  })
  test("a source without an address is skipped, and equals keep their order", () => {
    expect(applySourceOf([s("Greenhouse", "greenhouse", null), s("LinkedIn", "linkedin")])?.ats).toBe("linkedin")
    expect(applySourceOf([s("A", "lever"), s("B", "ashby")])?.name).toBe("A")
  })
})
