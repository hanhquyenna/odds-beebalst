import { describe, expect, test } from "bun:test"
import { statedPay, degreeAsked, dutchNeeded, idFor, inNetherlands, isEnglish, juniorTitle, parseJobUrl, readVerdict, restrictedToNationals, rowFromDetails, skillsOf, yearsMin } from "../../supabase/functions/_shared/job-intake"

describe("parseJobUrl", () => {
  test("every address LinkedIn shows for one job gives the same stored address", () => {
    const want = { id: "4466096458", url: "https://www.linkedin.com/jobs/view/4466096458" }
    expect(parseJobUrl("https://www.linkedin.com/jobs/view/4466096458")).toEqual(want)
    expect(parseJobUrl("https://nl.linkedin.com/jobs/view/reservations-agent-intern-at-de-l-europe-amsterdam-4466096458?position=7&pageNum=0")).toEqual(want)
    expect(parseJobUrl("https://www.linkedin.com/jobs/view/4466096458/")).toEqual(want)
    expect(parseJobUrl("https://www.linkedin.com/jobs/search/?keywords=intern&currentJobId=4466096458")).toEqual(want)
    expect(parseJobUrl("  https://linkedin.com/jobs/view/4466096458  ")).toEqual(want)
  })
  test("anything else is refused before any money is spent", () => {
    for (const bad of ["", "hello", "http://www.linkedin.com/jobs/view/4466096458", "https://www.linkedin.com/in/someone", "https://www.linkedin.com/jobs/view/123", "https://evil.com/jobs/view/4466096458", "https://linkedin.com.evil.com/jobs/view/4466096458", "https://www.linkedin.com/company/acme", "https://www.linkedin.com/jobs/search/?keywords=intern"]) {
      expect(parseJobUrl(bad)).toBeNull()
    }
  })
})

describe("dutchNeeded", () => {
  test("needs Dutch", () => {
    expect(dutchNeeded("Native Dutch language skills, professional English")).toBe(true)
    expect(dutchNeeded("You speak fluent Dutch and English")).toBe(true)
  })
  test("does not need Dutch", () => {
    expect(dutchNeeded("Dutch is not required for this role")).toBe(false)
    expect(dutchNeeded("No Dutch required")).toBe(false)
    expect(dutchNeeded("Dutch is a plus")).toBe(false)
    expect(dutchNeeded("We work in an international team in Amsterdam")).toBe(false)
  })
})

describe("other readings", () => {
  test("nationality conditions", () => {
    expect(restrictedToNationals("You need the Dutch nationality", "Analyst")).toBe(true)
    expect(restrictedToNationals("Open to all", "National Graduate Trainee")).toBe(true)
    expect(restrictedToNationals("A security screening is part of hiring", "Analyst")).toBe(false)
  })
  test("English", () => {
    expect(isEnglish("We are looking for a motivated intern. You will work with our team and your tasks are to support the project, and we offer you a place to learn.")).toBe(true)
    expect(isEnglish("Wij zoeken een stagiair voor onze afdeling. Je gaat werken met het team en je taken zijn het ondersteunen van het project, voor een periode van zes maanden.")).toBe(false)
    expect(isEnglish("too short")).toBe(false)
  })
  test("place", () => {
    expect(inNetherlands("Amsterdam, North Holland, Netherlands")).toBe(true)
    expect(inNetherlands("Berlin, Germany")).toBe(false)
  })
  test("years, degree, skills, junior title", () => {
    expect(yearsMin("3-5 years of experience, 2 years of SQL")).toBe(2)
    expect(yearsMin("no experience needed")).toBeNull()
    expect(degreeAsked("A master's degree in finance")).toBe("master")
    expect(degreeAsked("PhD preferred")).toBe("phd")
    expect(skillsOf("Strong Excel and SQL skills, Python is a plus")).toEqual(expect.arrayContaining(["excel", "sql", "python"]))
    expect(juniorTitle("Marketing Intern")).toBe(true)
    expect(juniorTitle("Senior Accountant")).toBe(false)
  })
})

describe("readVerdict and rowFromDetails", () => {
  const item = {
    status: "success",
    job_status: "open",
    title: "Reservations Agent Intern",
    location: "Amsterdam, North Holland, Netherlands",
    description: "We are looking for an intern to join our team. You will support the reservations desk and learn how a hotel works, with Excel and good English. Dutch is not required.",
    applicants: "25",
    applicants_text: "Be among the first 25 applicants",
    seniority_level: "Not Applicable",
    "company.name": "De L'Europe Amsterdam",
  }
  const parsed = { id: "4466096458", url: "https://www.linkedin.com/jobs/view/4466096458" }

  test("verdicts", () => {
    expect(readVerdict(item)).toBe("open")
    expect(readVerdict({ ...item, job_status: "closed" })).toBe("closed")
    expect(readVerdict({ ...item, status: "failed" })).toBe("unreadable")
    expect(readVerdict({ ...item, description: "" })).toBe("unreadable")
    expect(readVerdict(undefined)).toBe("unreadable")
  })
  test("the row", async () => {
    const row = await rowFromDetails(item, parsed, null, "2026-10-04", "2026-10-04T10:00:00Z")
    expect(row.ats).toBe("linkedin")
    expect(row.source).toBe("linkedin_user")
    expect(row.url).toBe(parsed.url)
    expect(row.employer_display).toBe("De L'Europe Amsterdam")
    expect(row.dutch_required).toBe(false)
    expect(row.student_fit).toBe(true)
    expect(row.posted_at).toBeNull()
    expect(row.first_seen).toBe("2026-10-04")
    expect(row.skills).toContain("excel")
    expect(row.applicants).toBe(25)
  })
  test("a known employer lends its name, sponsor flag and industry", async () => {
    const row = await rowFromDetails(item, parsed, { employer_display: "De L'Europe", ind_sponsor: true, ind_sponsor_name: "De Europe BV", industry: "Hospitality & travel" }, "2026-10-04", "2026-10-04T10:00:00Z")
    expect(row.employer_display).toBe("De L'Europe")
    expect(row.ind_sponsor).toBe(true)
    expect(row.industry).toBe("Hospitality & travel")
  })
  test("the id is the loaders' sha1 form and stable", async () => {
    const a = await idFor(parsed.url, "X", "Y", "Z")
    expect(a).toMatch(/^p[0-9a-f]{12}$/)
    expect(await idFor(parsed.url, "X", "Y", "Z")).toBe(a)
    expect(await idFor(parsed.url, "X", "Y2", "Z")).not.toBe(a)
  })
})

describe("statedPay", () => {
  test("the PGGM allowance, and not the small extras or the company figures", () => {
    const text = "PGGM manages pension assets, with more than €250 billion in assets under management. Approximately €700 million is allocated to direct equity investments. An internship allowance of €1.016,- per month, full reimbursement of travel expenses and an allowance for costs associated with working from home (approx. €70 per month)."
    expect(statedPay(text)).toBe("€1016 per month")
  })
  test("Dutch wording", () => {
    expect(statedPay("Een bruto stagevergoeding van € 1.000,- per maand op fulltime basis.")).toBe("€1000 per month")
    expect(statedPay("Je ontvangt een stagevergoeding van €450 per maand")).toBe("€450 per month")
  })
  test("English forms and ranges", () => {
    expect(statedPay("Salary: €3,200 per month gross")).toBe("€3200 per month")
    expect(statedPay("We offer a salary between €2.800 and €3.400 gross per month")).toBe("€2800 - €3400 per month")
    expect(statedPay("Compensation €17.75 per hour")).toBe("€17.75 per hour")
    expect(statedPay("An annual salary of €45,000 per year")).toBe("€45000 per year")
    expect(statedPay("Paid internship, 1200 euro a month")).toBe("€1200 per month")
  })
  test("nothing stated, nothing made up", () => {
    expect(statedPay("We are a company with €250 billion in assets and a lovely team.")).toBeNull()
    expect(statedPay("A competitive salary and travel allowance.")).toBeNull()
    expect(statedPay("Home working allowance of approx. €70 per month for costs associated with working from home")).toBeNull()
    expect(statedPay("")).toBeNull()
  })
})
