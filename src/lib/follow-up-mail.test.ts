import { describe, expect, test } from "bun:test"
import { emailOf, followUpMailto } from "@/lib/follow-up-mail"

describe("emailOf", () => {
  test("takes an email address and nothing else a contact box holds", () => {
    expect(emailOf(" sanne@adyen.com ")).toBe("sanne@adyen.com")
    expect(emailOf("https://www.linkedin.com/in/sanne")).toBeNull()
    expect(emailOf("+31 6 1234 5678")).toBeNull()
    expect(emailOf("two words@x.com")).toBeNull()
  })
})

describe("followUpMailto", () => {
  const url = followUpMailto({ to: "sanne@adyen.com", name: "Sanne de Vries", job: "Junior Data Analyst", company: "Adyen", appliedOn: "2026-10-02", me: "Kien Phung" })
  test("is addressed to them with the job in the subject", () => {
    expect(url.startsWith("mailto:sanne@adyen.com?")).toBe(true)
    expect(new URLSearchParams(url.split("?")[1]).get("subject")).toBe("Following up: Junior Data Analyst")
  })
  test("greets them by first name, names the job, company and day, and is signed", () => {
    const body = new URLSearchParams(url.split("?")[1]).get("body") ?? ""
    expect(body).toContain("Hi Sanne,")
    expect(body).toContain("Junior Data Analyst role at Adyen on 2 October")
    expect(body.trim().endsWith("Kien Phung")).toBe(true)
  })
  test("without an applied day it leaves the day out", () => {
    const body = new URLSearchParams(followUpMailto({ to: "a@b.nl", name: "Ana", job: "Intern", company: "Acme" }).split("?")[1]).get("body") ?? ""
    expect(body).toContain("Intern role at Acme and wanted")
  })
})
