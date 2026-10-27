import { describe, expect, test } from "bun:test"
import { educationFromProfile, personalFromProfile, splitName, workFromProfile } from "../../supabase/functions/_shared/application-personal"
import { answerText } from "../../supabase/functions/_shared/apply-form"
test("contact details come from structured profile and CV, preserving name order", () => {
  const answers = personalFromProfile({ name: "Family Given" , firstName: "Given Names", lastName: "Family", place: "Amsterdam, Netherlands", cv: "Candidate\nme@example.com | +31 6 12345678\n2024 - 2026\n" } as Parameters<typeof personalFromProfile>[0], "account@example.com")
  expect(answers).toMatchObject({ first_name: "Given Names", last_name: "Family", email: "me@example.com", phone: "+31 6 12345678", city: "Amsterdam" })
  expect(answerText("First name", { answers })).toBe("Given Names")
  expect(answerText("Email address", { email: "old@example.com", answers })).toBe("me@example.com")
})
test("ambiguous display names, phone numbers and email addresses are not guessed", () => {
  const a = personalFromProfile({ cv: "one@example.com two@example.com\n+31 612345678\n+44 7123456789\n2020 - 2024" }, "verified@example.com")
  expect(a).toEqual({ email: "verified@example.com" })
  expect(answerText("First name", { name: "Family Given", answers: a })).toBeNull()
})
test("a full name is split the way the person writes it: their CV's order, else a family name that comes first, else Western order", () => {
  expect(splitName("Phung Chi Kien", "Kien Phung\nAmsterdam | kien@example.com")).toEqual({ first_name: "Kien", last_name: "Phung" })
  expect(splitName("Phung Chi Kien")).toEqual({ first_name: "Chi Kien", last_name: "Phung" })
  expect(splitName("Nguyễn Văn An")).toEqual({ first_name: "Văn An", last_name: "Nguyễn" })
  expect(splitName("Anna van Dijk")).toEqual({ first_name: "Anna", last_name: "van Dijk" })
  expect(splitName("Madonna")).toBeNull()
  expect(personalFromProfile({ name: "Phung Chi Kien", cv: "Kien Phung\n" })).toMatchObject({ first_name: "Kien", last_name: "Phung" })
})
test("personal overrides fill contact and address fields without changing source profile", () => {
  const a = { email: "chosen@example.com", city: "Utrecht", address: "Example street 10", country: "Netherlands", postcode: "1234 AB", linkedin: "https://www.linkedin.com/in/chosen" }
  for (const [question, expected] of [["Email", a.email], ["City", a.city], ["Address line 1", a.address], ["Country", a.country], ["Postal code", a.postcode], ["LinkedIn profile URL", a.linkedin]]) expect(answerText(question, { answers: a })).toBe(expected)
})

describe("educationFromProfile", () => {
  const now = new Date("2026-10-15T10:00:00Z")
  test("the study someone is in now gives the school, degree, field, graduation, year of study and status", () => {
    const e = educationFromProfile({ education: [{ "School Name": "Erasmus University", "Degree Name": "BSc Economics", "Start Date": "Sep 2019", "End Date": "Jun 2022" }, { "School Name": "University of Amsterdam", "Degree Name": "MSc Finance", "Field Of Study": "Finance", "Start Date": "Sep 2025", "End Date": "Jun 2027" }] }, now)
    expect(e).toEqual({ university: "University of Amsterdam", degree: "MSc Finance", field_of_study: "Finance", graduation_date: "June 2027", study_start: "September 2025", study_status: "Yes, enrolled", study_year: "2nd year" })
  })
  test("a first-year student with the dates as numbers", () => {
    const e = educationFromProfile({ education: [{ "School Name": "TU Delft", "Degree Name": "MSc", "Start Date": "09/2026", "End Date": "2028" }] }, now)
    expect(e.study_year).toBe("1st year")
    expect(e.graduation_date).toBe("2028")
  })
  test("someone who has finished is not a student and keeps no year of study", () => {
    const e = educationFromProfile({ education: [{ "School Name": "UvA", "Degree Name": "MSc", "Start Date": "2021", "End Date": "2023" }] }, now)
    expect(e.study_status).toBe("No")
    expect(e.study_year).toBeUndefined()
    expect(e.graduation_date).toBe("2023")
  })
  test("no education, nothing", () => {
    expect(educationFromProfile({ education: [] }, now)).toEqual({})
    expect(educationFromProfile({}, now)).toEqual({})
  })
})

describe("workFromProfile and the study's start", () => {
  const now = new Date("2026-10-15T10:00:00Z")
  test("the open job is the current one; else the latest", () => {
    expect(workFromProfile({ positions: [{ Title: "Intern", "Company Name": "Bol", "Started On": "Jun 2025", "Finished On": "Aug 2025" }, { Title: "Data Analyst Intern", "Company Name": "Philips", "Started On": "Jun 2026", "Finished On": "" }] }, now)).toEqual({ current_job_title: "Data Analyst Intern", current_company: "Philips" })
    expect(workFromProfile({ positions: [{ Title: "Intern", "Company Name": "Bol", "Start Date": "Jun 2024", "End Date": "Aug 2024" }, { Title: "Assistant", "Company Name": "Mollie", "Start Date": "Jun 2025", "End Date": "Aug 2025" }] }, now)).toEqual({ current_job_title: "Assistant", current_company: "Mollie" })
    expect(workFromProfile({ positions: [] }, now)).toEqual({})
  })
  test("the study start is kept as a month and year", () => {
    expect(educationFromProfile({ education: [{ "School Name": "UvA", "Degree Name": "MSc", "Start Date": "Sep 2025", "End Date": "Jun 2027" }] }, now).study_start).toBe("September 2025")
  })
})
