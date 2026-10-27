import { describe, expect, test } from "bun:test"
import { cleanTitle, isUsable, normaliseProfile } from "../../supabase/functions/_shared/linkedin-profile"
import { derive } from "@/lib/engine"
import { mergeLinkedIn } from "@/lib/linkedin-merge"
import { DEFAULT_PROFILE, type Profile } from "@/lib/types"

// A made-up profile in the exact shape harvestapi/linkedin-profile-scraper documents.
const ITEM = {
  id: "ACoAAB",
  publicIdentifier: "sam-example",
  linkedinUrl: "https://www.linkedin.com/in/sam-example",
  firstName: "Sam",
  lastName: "Example",
  headline: "Financial analyst | IFRS | Excel | FP&A",
  about: "I build monthly reporting and forecasts for finance teams.",
  location: { linkedinText: "Rotterdam, South Holland, Netherlands", countryCode: "NL", parsed: { text: "Rotterdam, South Holland, Netherlands", city: "Rotterdam", country: "Netherlands" } },
  experience: [
    {
      position: "Senior Financial Analyst | Reporting, Forecasting, Budgeting",
      companyName: "Adyen",
      location: "Amsterdam, North Holland, Netherlands",
      startDate: { month: "Jan", year: 2023, text: "Jan 2023" },
      endDate: { text: "Present" },
      description: "Monthly reporting in Excel and SQL, IFRS consolidation.",
      skills: ["Excel"],
    },
    {
      position: "Financial Analyst",
      companyName: "Vietcombank",
      location: "Hanoi, Vietnam",
      startDate: { month: "Mar", year: 2019, text: "Mar 2019" },
      endDate: { month: "Dec", year: 2022, text: "Dec 2022" },
      description: "Budgeting and forecasting.",
    },
    {
      position: "Finance Intern",
      companyName: "Deloitte",
      location: "Hanoi, Vietnam",
      startDate: { month: "Jun", year: 2018, text: "Jun 2018" },
      endDate: { month: "Aug", year: 2018, text: "Aug 2018" },
      description: "Audit support.",
    },
  ],
  education: [
    { schoolName: "Erasmus University Rotterdam", degree: "Master of Science", fieldOfStudy: "Finance", startDate: { month: "Sep", year: 2016, text: "Sep 2016" }, endDate: { month: "Aug", year: 2018, text: "Aug 2018" } },
    { schoolName: "Foreign Trade University", degree: "Bachelor", fieldOfStudy: "Bachelor", startDate: { text: "2012" }, endDate: { text: "2016" } },
  ],
  skills: [{ name: "Excel", positions: [] }, { name: "IFRS", positions: [] }, { name: "excel", positions: [] }, { name: "Financial Modeling", positions: [] }],
  languages: [{ name: "English", proficiency: "Full professional proficiency" }, { name: "Vietnamese", proficiency: "Native or bilingual proficiency" }],
  certifications: [{ title: "CFA Level I", issuedBy: "CFA Institute", issuedAt: "Issued Aug 2021" }],
  projects: [{ title: "Group reporting automation" }],
  volunteering: [{ role: "Treasurer", organizationName: "Student Finance Society" }],
  honorsAndAwards: [{ title: "Dean's list" }],
}

describe("LinkedIn import mapping", () => {
  const li = normaliseProfile(ITEM)

  test("name, headline, place and about come across", () => {
    expect(li.name).toBe("Sam Example")
    expect(li.headline).toContain("Financial analyst")
    expect(li.place).toBe("Rotterdam, Netherlands")
    expect(li.about).toContain("monthly reporting")
  })
  test("roles keep title, company, place, dates and description", () => {
    expect(li.positions).toHaveLength(3)
    expect(li.positions[0]).toEqual({ Title: "Senior Financial Analyst", "Company Name": "Adyen", Location: "Amsterdam, North Holland, Netherlands", "Started On": "Jan 2023", "Finished On": "", Description: "Monthly reporting in Excel and SQL, IFRS consolidation." })
    expect(li.positions[1]["Finished On"]).toBe("Dec 2022")
  })
  test("a role that is still going has no end date", () => {
    expect(li.positions[0]["Finished On"]).toBe("")
  })
  test("degree and field are joined once, not repeated", () => {
    expect(li.education[0]["Degree Name"]).toBe("Master of Science, Finance")
    expect(li.education[1]["Degree Name"]).toBe("Bachelor")
    expect(li.education[1]["Start Date"]).toBe("2012")
  })
  test("skills are listed once, whatever the capitals", () => {
    expect(li.skills.map((s) => s.Name)).toEqual(["Excel", "IFRS", "Financial Modeling"])
  })
  test("languages keep their level", () => {
    expect(li.languages[0]).toEqual({ Name: "English", Proficiency: "Full professional proficiency" })
  })
  test("certifications, projects, volunteering and honors go into the CV text", () => {
    expect(li.cv).toContain("Certifications: CFA Level I")
    expect(li.cv).toContain("Projects: Group reporting automation")
    expect(li.cv).toContain("Treasurer at Student Finance Society")
    expect(li.cv).toContain("Honors: Dean's list")
  })
  test("a title with keywords after a bar keeps the title", () => {
    expect(cleanTitle("Staff Pharmacist | Prescription Dispensing, Regulatory Compliance")).toBe("Staff Pharmacist")
    expect(cleanTitle("R&D | Lead")).toBe("R&D")
  })
  test("a failed read is not a profile", () => {
    expect(isUsable({ error: "Profile not found" })).toBe(false)
    expect(isUsable({ status: "not_found" })).toBe(false)
    expect(isUsable({})).toBe(false)
    expect(isUsable(ITEM)).toBe(true)
  })
})

describe("what the app makes of an imported profile", () => {
  const li = normaliseProfile(ITEM)
  const merged: Profile = mergeLinkedIn({ ...DEFAULT_PROFILE, positions: [], education: [], skills: [], languages: [], cv: "" }, li)
  const d = derive(merged)

  test("lists land in the profile", () => {
    expect(merged.positions).toHaveLength(3)
    expect(merged.education).toHaveLength(2)
    expect(merged.skills).toHaveLength(3)
    expect(merged.cv).toContain("CFA Level I")
  })
  test("years of work count overlapping time once", () => {
    // Jun-Aug 2018 + Mar 2019 to now, with Jan 2023 to now inside it: about 3 months + (Mar 2019 .. today)
    const sinceMarch2019 = (Date.now() - Date.parse("Mar 1, 2019")) / 2_629_800_000 / 12
    expect(d.years).toBeGreaterThan(sinceMarch2019)
    expect(d.years).toBeLessThan(sinceMarch2019 + 0.4)
  })
  test("the master's degree, Dutch school, skills and CFA are found", () => {
    expect(d.degree).toBe("master")
    expect(d.dutchDegree).toBe(true)
    expect(d.skills.has("excel")).toBe(true)
    expect(d.skills.has("ifrs")).toBe(true)
    expect(d.skills.has("cfa")).toBe(true)
    expect(d.skills.has("sql")).toBe(true)
  })
  test("an internship on the profile is noticed", () => {
    expect(d.internship).toBe(true)
  })
})

describe("pressing Connect replaces what was there", () => {
  const li = normaliseProfile(ITEM)
  const before: Profile = { ...DEFAULT_PROFILE, name: "Example", headline: "Example profile: a finance graduate", place: "Rotterdam", about: "old about", cv: "old cv", positions: [{ Title: "Old role" }], education: [], skills: [], languages: [] }
  const after = mergeLinkedIn(before, li)
  test("the text fields come from LinkedIn", () => {
    expect(after.name).toBe("Sam Example")
    expect(after.headline).toContain("Financial analyst")
    expect(after.about).toContain("monthly reporting")
    expect(after.cv).toContain("CFA Level I")
    expect(after.positions).toHaveLength(3)
  })
  test("where LinkedIn gives nothing for a field, what you had stays", () => {
    const kept = mergeLinkedIn(before, { ...li, about: "", headline: "", place: "" })
    expect(kept.about).toBe("old about")
    expect(kept.headline).toBe("Example profile: a finance graduate")
    expect(kept.place).toBe("Rotterdam")
  })
})
