import { describe, expect, test } from "bun:test"
import { cumulative, isInternship, levelOf, mentionsVisaSponsorship, middle, netMonth, point } from "@/lib/engine"
import { formatHourly } from "@/lib/format"
import { payMid, payOf, TRAINEE_PAY } from "@/lib/spec"
import type { Posting } from "@/lib/types"
import { TAX } from "../../e2e/fixtures/reference"

// Gross per year of CBS 0411 Accountants: P25 28.4, P50 36.4 euro an hour, 2,080 hours, 8% holiday allowance.
const P25 = 28.4 * 2080 * 1.08
const P50 = 36.4 * 2080 * 1.08

describe("netMonth", () => {
  test("accountant P25, no ruling", () => {
    expect(Math.round(netMonth(P25, false, false, TAX).net)).toBe(3831)
  })
  test("accountant P25, ruling for someone over 30: the salary floor limits the exemption to 24.7%", () => {
    const r = netMonth(P25, true, false, TAX)
    expect(Math.round(r.net)).toBe(4495)
    expect(r.freeShare).toBeCloseTo(0.247, 3)
  })
  test("accountant P25, ruling for under-30 with a master's: full 30%", () => {
    const r = netMonth(P25, true, true, TAX)
    expect(Math.round(r.net)).toBe(4631)
    expect(r.freeShare).toBeCloseTo(0.3, 3)
  })
  test("accountant P50, ruling", () => {
    expect(Math.round(netMonth(P50, true, false, TAX).net)).toBe(5605)
    expect(Math.round(netMonth(P50, false, false, TAX).net)).toBe(4558)
  })
})

describe("cumulative", () => {
  test("20 applications at 5%", () => {
    expect(cumulative(0.05, 20)).toBeCloseTo(0.6415, 3)
  })
})

const base = { years_min: null, seniority: null } as Posting
describe("levelOf", () => {
  test("titles", () => {
    expect(levelOf({ ...base, title: "Finance internship" })).toBe("Internship")
    expect(levelOf({ ...base, title: "Junior Accountant" })).toBe("Entry")
    expect(levelOf({ ...base, title: "Senior Financial Analyst" })).toBe("Senior")
    expect(levelOf({ ...base, title: "Head of Engineering" })).toBe("Director")
    expect(levelOf({ ...base, title: "Engineering Manager" })).toBe("Manager")
  })
  test("an account manager is an individual role, so the years decide", () => {
    expect(levelOf({ ...base, title: "Account Manager", years_min: 2 })).toBe("Entry")
  })
})

describe("one figure from a range", () => {
  test("the middle is the geometric mean and is written with one decimal below 10%", () => {
    expect(middle(0.02, 0.08)).toBeCloseTo(0.04, 10)
    expect(point(middle(0.0236, 0.054))).toBe("3.6%")
    expect(point(0.123)).toBe("12%")
  })
})

describe("hasCvData", () => {
  test("a profile with nothing to compare reads as empty", async () => {
    const { hasCvData } = await import("@/lib/engine")
    const { DEFAULT_PROFILE } = await import("@/lib/types")
    expect(hasCvData({ ...DEFAULT_PROFILE, positions: [], education: [], skills: [], cv: "" })).toBe(false)
    expect(hasCvData({ ...DEFAULT_PROFILE, positions: [], education: [], skills: [], cv: "   short   " })).toBe(false)
    expect(hasCvData({ ...DEFAULT_PROFILE, positions: [], education: [], skills: [{ Name: "Excel" }], cv: "" })).toBe(true)
    expect(hasCvData({ ...DEFAULT_PROFILE, positions: [], education: [], skills: [], cv: "Financial analyst with IFRS reporting and Excel modelling." })).toBe(true)
  })
})

describe("derive: where the work was and where the degree is from", () => {
  const role = (location: string): Record<string, string> => ({ Title: "Analyst", "Company Name": "Acme", "Started On": "Jan 2022", "Finished On": "Jan 2024", Location: location })

  test("a role with no place is left out of the shares, not counted as work outside the EU", async () => {
    const { derive } = await import("@/lib/engine")
    const { DEFAULT_PROFILE } = await import("@/lib/types")
    const none = derive({ ...DEFAULT_PROFILE, positions: [role("")] })
    expect(none.share.nonEu).toBe(0)
    const mixed = derive({ ...DEFAULT_PROFILE, positions: [role(""), role("Amsterdam, Netherlands")] })
    expect(mixed.share.nl).toBe(1)
    expect(mixed.share.nonEu).toBe(0)
    expect(derive({ ...DEFAULT_PROFILE, positions: [role("Hanoi, Vietnam")] }).share.nonEu).toBe(1)
  })

  test("only a Dutch school makes a Dutch degree, not any school called a university", async () => {
    const { derive } = await import("@/lib/engine")
    const { DEFAULT_PROFILE } = await import("@/lib/types")
    const school = (name: string) => derive({ ...DEFAULT_PROFILE, education: [{ "School Name": name, "Degree Name": "MSc" }] }).dutchDegree
    expect(school("Peking University")).toBe(false)
    expect(school("University of Amsterdam")).toBe(true)
    expect(school("Erasmus University Rotterdam")).toBe(true)
    expect(school("Hogeschool van Amsterdam")).toBe(true)
  })
})

describe("levelOf with the database's level", () => {
  const b = { years_min: null, seniority: null } as Posting
  test("the level the view gives is the one used, whatever the title says", () => {
    expect(levelOf({ ...b, title: "Senior Accountant", level_view: "Entry" })).toBe("Entry")
    expect(levelOf({ ...b, title: "Finance internship", level_view: "Mid" })).toBe("Mid")
  })
  test("an unknown value is ignored and the app's own rules apply", () => {
    expect(levelOf({ ...b, title: "Finance internship", level_view: "Wizard" as never })).toBe("Internship")
    expect(levelOf({ ...b, title: "Senior Accountant", level_view: null })).toBe("Senior")
  })
})

describe("levelOf: traineeships and starter programmes", () => {
  const b = { years_min: null, seniority: null } as Posting
  test("a traineeship is in the starting levels", () => {
    expect(["Internship", "Entry"]).toContain(levelOf({ ...b, title: "Global Traineeship Finance the Netherlands (all genders)" }))
    expect(["Internship", "Entry"]).toContain(levelOf({ ...b, title: "Management Trainee" }))
  })
  test("a named programme for people starting out is entry level", () => {
    for (const t of ["Tax & Legal EVOLVE Development Program", "Europe Finance Graduate Programme", "Leadership Development Programme", "Rotational Program", "Young Professionals Programme"]) {
      expect(levelOf({ ...b, title: t })).toBe("Entry")
    }
  })
  test("a program manager is not a programme for starters", () => {
    expect(levelOf({ ...b, title: "Technical Program Manager" })).not.toBe("Entry")
    expect(levelOf({ ...b, title: "Senior Program Manager" })).toBe("Senior")
  })
})

describe("internships and working students get no salary figure", () => {
  const t = (title: string, over: { seniority?: string | null; level_view?: string } = {}): boolean => isInternship({ title, seniority: (over.seniority ?? null) as never, level_view: over.level_view as never })
  test("intern, stage, werkstudent and working student all count", () => {
    expect(t("Marketing Intern")).toBe(true)
    expect(t("Stagiair Finance")).toBe(true)
    expect(t("Werkstudent HR")).toBe(true)
    expect(t("Business Analyst - Working Student")).toBe(true)
  })
  test("a job the database reads as Internship counts, a graduate programme does not", () => {
    expect(t("Graduation Project Hull Monitoring", { level_view: "Internship" })).toBe(true)
    expect(t("Management Trainee", { level_view: "Entry" })).toBe(false)
  })
})

describe("the kind of first job, read from the whole posting, decides", () => {
  const kind = (title: string, role_kind: string): boolean => isInternship({ title, seniority: null as never, role_kind: role_kind as never })
  test("a hotel 'trainee' read as an internship is one, a 'Talent Program' read as a traineeship is not", () => {
    expect(kind("Concierge Trainee - Anantara", "internship")).toBe(true)
    expect(kind("Finance Talent Program", "traineeship")).toBe(false)
    expect(kind("Werkstudent HR", "working_student")).toBe(true)
  })
  test("a traineeship with no stated pay gets the two-source range, not an allowance and not the occupation's salary", () => {
    const post = { id: "t1", title: "Management Trainee", seniority: null, role_kind: "traineeship", pay_posted: null, cbs_group: "0412" } as unknown as Posting
    const pay = payOf(post, null)
    expect(pay.basis).toBe("Typical")
    expect(pay.source).toBe("Typical traineeship pay")
    expect(payMid(post, null)?.month).toBe((TRAINEE_PAY.low + TRAINEE_PAY.high) / 2)
  })
  test("pay the employer states still wins for a traineeship", () => {
    const post = { id: "t2", title: "Management Trainee", seniority: null, role_kind: "traineeship", pay_posted: "€ 3.900 - € 4.500 per maand" } as unknown as Posting
    expect(payOf(post, null).basis).toBe("Stated")
  })
})

describe("hourly pay is shown as an hourly rate", () => {
  test("it is read from the ways postings write it", () => {
    expect(formatHourly("€ 17.75 / hour")).toEqual({ low: 17.75, high: 17.75 })
    expect(formatHourly("€ 18 - € 21 per uur")).toEqual({ low: 18, high: 21 })
    expect(formatHourly("€3230—€3288 per month")).toBeNull()
    expect(formatHourly(null)).toBeNull()
  })
  test("a working student with an hourly rate gets no monthly or tax figure", () => {
    const post = { id: "w1", title: "Werkstudent", seniority: null, role_kind: "working_student", pay_posted: "€ 18 - € 21 per uur" } as unknown as Posting
    expect(payOf(post, null).perHour).toBe(true)
    expect(payOf(post, null).text).toBe("€18 – €21")
    expect(payMid(post, null)).toBeNull()
  })
})

test("a working student with no stated pay gets no figure, not an internship allowance", () => {
  const post = { id: "w2", title: "Working Student Marketing", seniority: null, role_kind: "working_student", pay_posted: null } as unknown as Posting
  expect(payOf(post, null).text).toBeNull()
})

describe("visa sponsorship signal", () => {
  test("requires an offer of sponsorship or work-permit support", () => {
    expect(mentionsVisaSponsorship("We offer visa sponsorship for this role.")).toBe(true)
    expect(mentionsVisaSponsorship("Relocation support and work permit assistance are available.")).toBe(true)
  })
  test("does not treat generic international language as sponsorship", () => {
    expect(mentionsVisaSponsorship("We are an international company with colleagues from many countries.")).toBe(false)
    expect(mentionsVisaSponsorship("You must already have the right to work in the Netherlands.")).toBe(false)
    expect(mentionsVisaSponsorship("We do not provide visa sponsorship.")).toBe(false)
    expect(mentionsVisaSponsorship("We don't offer visa sponsorship for this role.")).toBe(false)
  })
})
