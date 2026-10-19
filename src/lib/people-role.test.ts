import { describe, expect, test } from "bun:test"
import { inRole } from "@/lib/role-match"

const person = (headline: string) => ({ name: "x", headline, place: "", url: "u" })

describe("people who hold the job's own role", () => {
  const job = "Social Media & Influencer Marketing Internship (1 Year)"
  test("a title sharing two of the job's main words is in the role", () => {
    expect(inRole(person("Social Media Manager at Bosch Group"), job, "Bosch Group")).toBe(true)
  })
  test("an unrelated title is not", () => {
    expect(inRole(person("Senior Business Line Manager Energy"), job, "Bosch Group")).toBe(false)
  })
  test("one shared word is not enough when the job has more", () => {
    expect(inRole(person("Marketing Intern"), job, "Bosch Group")).toBe(false)
  })
})
