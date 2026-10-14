import { describe, expect, test } from "bun:test"
import { applicationQuestionKey, answerText, chooseOption, nationalNumber, questionKey, questionText, valueFor, type Facts } from "../../supabase/functions/_shared/apply-form"

const facts: Facts = {
  name: "Phung Chi Kien",
  email: "kien@example.com",
  phone: "+31 6 1234 5678",
  place: "Amsterdam, North Holland, Netherlands",
  linkedin: "https://www.linkedin.com/in/kien",
  dutch: "basic",
  answers: { first_name: "Chi Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, I have a residence permit that allows me to work", expected_salary: "€ 1.500 a month", start_date: "1 February 2027", hours_per_week: "40", website: "https://kien.dev" },
  remembered: { "how many years of work experience do you have with google analytics": "2" },
}

describe("questionKey", () => {
  test("a label LinkedIn writes twice, punctuation and 'required' are left out", () => {
    expect(questionKey("Email address Email address")).toBe("email address")
    expect(questionText("Email address Email address")).toBe("Email address")
    expect(questionKey("How many years of work experience do you have with Google Analytics? Required")).toBe("how many years of work experience do you have with google analytics")
  })
})

describe("answerText", () => {
  test("profile names and phone win over stale remembered contact answers; a full name is never split", () => {
    expect(answerText("First name", { name: "Phung Chi Kien" })).toBeNull()
    expect(answerText("Last name", { name: "Phung Chi Kien" })).toBeNull()
    expect(answerText("First name", { ...facts, remembered: { "first name": "Old" } })).toBe("Chi Kien")
    expect(answerText("Phone number", { ...facts, remembered: { "phone number": "old" } })).toBe("+31 6 1234 5678")
    expect(answerText("Phone number", { phone: "+84 123456789" })).toBe("+84 123456789")
  })

  test("the standard questions, from what odds keeps", () => {
    expect(answerText("First name", facts)).toBe("Chi Kien")
    expect(answerText("Last name", facts)).toBe("Phung")
    expect(answerText("Email address Email address", facts)).toBe("kien@example.com")
    expect(answerText("Mobile phone number", facts)).toBe("+31 6 1234 5678")
    expect(answerText("Phone country code", facts)).toBeNull()
    expect(answerText("Mobiel telefoonnummer", facts)).toBe("+31 6 1234 5678")
    expect(answerText("Landcode", facts)).toBeNull()
    expect(answerText("E-mailadres E-mailadres", facts)).toBe("kien@example.com")
    expect(answerText("City", facts)).toBe("Amsterdam")
    expect(answerText("LinkedIn Profile URL", facts)).toBe("https://www.linkedin.com/in/kien")
    expect(answerText("What are your salary expectations?", facts)).toBe("€ 1.500 a month")
    expect(answerText("When can you start?", facts)).toBe("1 February 2027")
    expect(answerText("What is your level of proficiency in Dutch?", facts)).toBe("basic")
  })
  test("right to work and sponsorship read from the kept answer, the opposite ways round", () => {
    expect(answerText("Are you legally authorized to work in the Netherlands?", facts)).toBe("Yes")
    expect(answerText("Will you now or in the future require visa sponsorship?", facts)).toBe("No")
    const needs: Facts = { answers: { work_authorization: "I need a visa sponsorship (kennismigrant)" } }
    expect(answerText("Do you require sponsorship?", needs)).toBe("Yes")
    expect(answerText("Are you authorized to work in the Netherlands?", needs)).toBe("No")
    expect(answerText("Do you require sponsorship?", { answers: {} })).toBeNull()
  })
  test("the person's own earlier answer first; nothing made up for the rest", () => {
    expect(answerText("How many years of work experience do you have with Google Analytics?", facts)).toBe("2")
    expect(answerText("How many years of work experience do you have with Python?", facts)).toBeNull()
    expect(answerText("Why do you want to work here?", facts)).toBeNull()
  })
})

describe("chooseOption", () => {
  test("yes/no, levels and ranges", () => {
    expect(chooseOption(["Select an option", "Yes", "No"], "Yes")).toBe(1)
    expect(chooseOption(["Yes", "No"], "No, I do not")).toBe(1)
    expect(chooseOption(["Select an option", "None", "Conversational", "Professional", "Native or bilingual"], "basic", "What is your level of proficiency in Dutch?")).toBe(2)
    expect(chooseOption(["Select an option", "None", "Conversational", "Professional", "Native or bilingual"], "native", "Dutch proficiency")).toBe(4)
    expect(chooseOption(["0-1 years", "2-4 years", "5+ years"], "3")).toBe(1)
    expect(chooseOption(["0-1 years", "2-4 years", "5+ years"], "7")).toBe(2)
    expect(chooseOption(["Select an option", "phungchikien3004@gmail.com"], "phungchikien3004@gmail.com")).toBe(1)
    expect(chooseOption(["Select an option", "Yes", "No"], "Maybe")).toBe(-1)
    expect(chooseOption(["Select an option"], "Yes")).toBe(-1)
    // LinkedIn in Dutch.
    expect(chooseOption(["Selecteer een optie", "Ja", "Nee"], "Yes")).toBe(1)
    expect(chooseOption(["Selecteer een optie", "Yes", "No"], "No")).toBe(2)
  })
})

test("values for the field: digits for a number, the national number beside a country picker", () => {
  expect(valueFor("number", "Expected salary", "€ 1.500 a month")).toBe("1500")
  expect(valueFor("text", "Mobile phone number", "+31 6 1234 5678", true)).toBe("612345678")
  expect(valueFor("text", "Mobile phone number", "+31 6 1234 5678")).toBe("+31 6 1234 5678")
  expect(nationalNumber("06 1234 5678")).toBe("612345678")
  expect(nationalNumber("+44 7700 900123")).toBe("7700900123")
})

describe("confirmed answer context", () => {
  test("study and visa answers stay with a vacancy while exact general answers can be reused", () => {
    const question = "Will you remain enrolled throughout this internship?"
    const key = applicationQuestionKey(question, "job-a")
    const remembered = { [key]: "Yes", [questionKey(question)]: "Old global answer" }
    expect(answerText(question, { job_id: "job-a", remembered })).toBe("Yes")
    expect(answerText(question, { job_id: "job-b", remembered })).toBeNull()
    expect(applicationQuestionKey("How many years of Excel experience?", "job-a")).toBe(applicationQuestionKey("How many years of Excel experience?", "job-b"))
  })
  test("NL work authorisation does not fill a different or unknown country's visa question", () => {
    expect(answerText("Do you require sponsorship?", { ...facts, job_id: "abroad", job_country: "US" })).toBeNull()
    expect(answerText("Are you authorized to work?", { ...facts, job_id: "abroad", job_country: null })).toBeNull()
    expect(answerText("Do you require sponsorship?", { ...facts, job_id: "nl", job_country: "NL" })).toBe("No")
  })
  test("a supplied answer can fill a missing contact field, but saved Profile details still win", () => {
    expect(answerText("First name", { remembered: { "first name": "Kien" } })).toBe("Kien")
    expect(answerText("First name", { answers: { first_name: "Chi Kien" }, remembered: { "first name": "Kien" } })).toBe("Chi Kien")
  })
})

describe("what an international student is asked", () => {
  const student: Facts = { answers: { university: "University of Amsterdam", degree: "Master's degree (MSc)", field_of_study: "Data science", graduation_date: "July 2027", study_status: "Yes, enrolled full time", internship_agreement: "Yes, my university signs one", nationality: "Vietnamese" } }
  test("school, degree, field, graduation and nationality come from the kept answers", () => {
    expect(answerText("University *", student)).toBe("University of Amsterdam")
    expect(answerText("School name", student)).toBe("University of Amsterdam")
    expect(answerText("Degree", student)).toBe("Master's degree (MSc)")
    expect(answerText("Field of study", student)).toBe("Data science")
    expect(answerText("Expected graduation date", student)).toBe("July 2027")
    expect(answerText("Nationality", student)).toBe("Vietnamese")
  })
  test("are you a student, and the university's internship agreement, are yes/no questions answered in the person's words", () => {
    expect(answerText("Are you currently enrolled at a university?", student)).toBe("Yes, enrolled full time")
    expect(chooseOption(["Yes", "No"], "Yes, enrolled full time", "Are you currently enrolled?")).toBe(0)
    expect(answerText("Do you have an internship agreement (stageovereenkomst) from your university?", student)).toBe("Yes, my university signs one")
    expect(answerText("Will your school provide an internship agreement?", student)).toBe("Yes, my university signs one")
  })
  test("nothing is guessed when the person has not said", () => {
    for (const q of ["University", "Degree", "Field of study", "Graduation year", "Are you currently a student?", "Nationality"]) expect(answerText(q, { answers: {} })).toBeNull()
  })
  test("a question that only mentions a school is not the university", () => {
    expect(answerText("What high school did you attend?", student)).toBeNull()
    expect(answerText("How did you hear about us? (university career fair)", student)).toBeNull()
  })
})
