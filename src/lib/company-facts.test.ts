import { describe, expect, test } from "bun:test"
import { factsRow, industryFromLinkedIn, sameCompany } from "../../supabase/functions/_shared/company-facts"

describe("sameCompany", () => {
  test("same company, spelled differently", () => {
    expect(sameCompany("Picnic", "Picnic Technologies")).toBe(true)
    expect(sameCompany("ABN AMRO Bank N.V.", "ABN AMRO")).toBe(true)
    expect(sameCompany("McKinsey &amp; Company", "McKinsey & Company")).toBe(true)
  })
  test("a different company is refused", () => {
    expect(sameCompany("Versuni", "VERSINI ARCHITECTES ASSOCIES")).toBe(false)
    expect(sameCompany("parsionate", "Passionate Care Management, LLC.")).toBe(false)
    expect(sameCompany("", "Anything")).toBe(false)
    expect(sameCompany("Workwize", undefined)).toBe(false)
  })
})

describe("industryFromLinkedIn", () => {
  test("LinkedIn's names become the app's", () => {
    expect(industryFromLinkedIn(["Retail"])).toBe("Retail & e-commerce")
    expect(industryFromLinkedIn(["Hospitality"])).toBe("Hospitality & travel")
    expect(industryFromLinkedIn(["IT Services and IT Consulting"])).toBe("IT services")
    expect(industryFromLinkedIn(["Investment Management"])).toBe("Financial services")
    expect(industryFromLinkedIn(["Pharmaceutical Manufacturing"])).toBe("Health & life sciences")
    expect(industryFromLinkedIn(["Technology, Information and Internet"])).toBe("Software & internet")
    expect(industryFromLinkedIn(["Higher Education"])).toBe("Education")
    expect(industryFromLinkedIn(["Management Consulting"])).toBe("Consulting")
    expect(industryFromLinkedIn(["Personal Care Product Manufacturing"])).toBe("Food & consumer goods")
    expect(industryFromLinkedIn(["Food and Beverage Manufacturing"])).toBe("Food & consumer goods")
    expect(industryFromLinkedIn(["Machinery Manufacturing"])).toBe("Manufacturing")
  })
  test("no guess when nothing fits", () => {
    expect(industryFromLinkedIn([])).toBeNull()
    expect(industryFromLinkedIn(["Zzz Unknown"])).toBeNull()
  })
})

describe("factsRow", () => {
  test("a company page becomes a row", () => {
    const row = factsRow("Picnic", { name: "Picnic Technologies", foundedOn: { year: 2015 }, employeeCount: 5569, employeeCountRange: { start: 5001, end: 10000 }, locations: [{ headquarter: true, parsed: { text: "Duivendrecht, Netherlands", city: "Duivendrecht", country: "Netherlands" } }], industries: [{ name: "Retail" }], peopleStats: [{ statTitle: "School", values: [{ title: "UvA", count: 5 }] }] }, "data:image/png;base64,AA==")
    expect(row.employer).toBe("Picnic")
    expect(row.founded_year).toBe(2015)
    expect(row.employee_range).toBe("5001-10000")
    expect(row.headquarters).toBe("Duivendrecht, Netherlands")
    expect(row.top_schools).toEqual([{ title: "UvA", count: 5 }])
    expect(row.logo).toBe("data:image/png;base64,AA==")
  })
  test("missing parts stay empty, nothing is made up", () => {
    const row = factsRow("X", {}, null)
    expect(row.founded_year).toBeNull()
    expect(row.employees).toBeNull()
    expect(row.top_schools).toBeNull()
    expect(row.specialities).toBeNull()
  })
})
