import { describe, expect, test } from "bun:test"
import { agentCanAnswer, applicationQuestionKey, answerText, chooseOption, heardChoice, isConsentCheckbox, isHearQuestion, isTrapQuestion, nationalNumber, privacyChoice, questionKey, questionText, resolveAgentAnswer, valueFor, type Facts } from "../../supabase/functions/_shared/apply-form"

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
    // The code beside the number is the one on the number.
    expect(answerText("Phone country code", facts)).toBe("+31")
    expect(answerText("Mobiel telefoonnummer", facts)).toBe("+31 6 1234 5678")
    expect(answerText("Landcode", facts)).toBe("+31")
    expect(answerText("E-mailadres E-mailadres", facts)).toBe("kien@example.com")
    expect(answerText("City", facts)).toBe("Amsterdam")
    expect(answerText("LinkedIn Profile URL", facts)).toBe("https://www.linkedin.com/in/kien")
    expect(answerText("LinkedIn", facts)).toBe("https://www.linkedin.com/in/kien")
    expect(answerText("LinkedIn *", facts)).toBe("https://www.linkedin.com/in/kien")
    expect(answerText("Your LinkedIn", facts)).toBe("https://www.linkedin.com/in/kien")
    expect(answerText("Do you have a LinkedIn profile?", facts)).toBeNull()
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
    const zoek: Facts = { answers: { work_authorization: "Yes, zoekjaar (orientation year)" } }
    expect(answerText("Do you require sponsorship?", zoek)).toBe("No")
    expect(answerText("Are you legally authorized to work in the Netherlands?", zoek)).toBe("Yes")
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
  test("Karl Lagerfeld-style internship questions come from Autofill (enrolled, EU passport, based+relocate, compulsory, start)", () => {
    const karl: Facts = {
      place: "Amsterdam, Netherlands",
      answers: {
        study_status: "Yes, enrolled full time",
        work_authorization: "Yes, EU citizen",
        city: "Amsterdam",
        relocation: "Yes, anywhere in the Netherlands",
        internship_agreement: "Yes, my university signs one",
        start_date: "1 February 2027",
      },
    }
    expect(answerText("Will you be enrolled in a Bachelor's or Master's degree program for the entire duration of the internship?", karl)).toBe("Yes, enrolled full time")
    expect(answerText("Do you hold an EU/EEA passport, or do you have a valid Dutch student residence permit?", karl)).toBe("Yes")
    expect(chooseOption(["Yes", "No", "Other"], "Yes", "Do you hold an EU/EEA passport?")).toBe(0)
    expect(answerText("Where are you based? Are you able to relocate?", karl)).toBe("Amsterdam. Yes, anywhere in the Netherlands")
    expect(answerText("Is the internship a compulsory part of your academic program?", karl)).toBe("Yes, my university signs one")
    expect(chooseOption(["Yes", "No"], "Yes, my university signs one", "Is the internship compulsory?")).toBe(0)
    expect(answerText("When would you be able to start?", karl)).toBe("1 February 2027")
    // Combined start + notice: fill from start_date alone (notice often unset); both when present.
    expect(answerText("When would you be able to start? What is your notice period?", karl)).toBe("1 February 2027")
    expect(answerText("When would you be able to start? What is your notice period?", {
      answers: { start_date: "1 February 2027", notice_period: "2 weeks" },
    })).toBe("1 February 2027. Notice period: 2 weeks")
    // Placeholder chrome is never a question Odds can answer from Autofill.
    expect(answerText("Type your response", karl)).toBeNull()
  })
  test("nothing is guessed when the person has not said", () => {
    for (const q of ["University", "Degree", "Field of study", "Graduation year", "Are you currently a student?", "Nationality"]) expect(answerText(q, { answers: {} })).toBeNull()
  })
  test("a question that only mentions a school is not the university", () => {
    expect(answerText("What high school did you attend?", student)).toBeNull()
    expect(answerText("How did you hear about us? (university career fair)", student)).toBeNull()
  })
})

describe("the questions every Dutch form asks that odds can answer from what it has", () => {
  const nl: Facts = { place: "Amsterdam, Netherlands", answers: { city: "Amsterdam" } }
  test("the country someone lives in, from what they kept or where they are", () => {
    expect(answerText("Please confirm the country in which you reside for data privacy purposes. *", nl)).toBe("Netherlands")
    expect(answerText("Country of residence", { place: "Utrecht", answers: {} })).toBe("Netherlands")
    expect(answerText("Country you live in", { answers: { country: "Germany" } })).toBe("Germany")
    expect(answerText("Country", { answers: {} })).toBeNull()
  })
  test("the province of a Dutch town, and nothing for a place odds does not know", () => {
    expect(answerText("State/Province *", nl)).toBe("North Holland")
    expect(answerText("Province", { place: "Eindhoven", answers: {} })).toBe("North Brabant")
    expect(answerText("State/Province", { place: "Springfield, United States", answers: {} })).toBeNull()
    expect(answerText("State/Province", { place: "Smalltown, Netherlands", answers: {} })).toBeNull()
  })
  test("the Dutch name of a province is the same place as the English one, in a dropdown", () => {
    expect(chooseOption(["— Make a Selection —", "Drenthe", "Noord-Holland", "Zuid-Holland", "Utrecht"], "North Holland")).toBe(2)
    expect(chooseOption(["Noord-Brabant", "Fryslân"], "Friesland")).toBe(1)
    expect(chooseOption(["Nederland", "Belgium"], "Netherlands")).toBe(0)
  })
  test("a data privacy choice picks the one that shares least: this job only", () => {
    expect(privacyChoice(["— Make a Selection —", "Please consider my information for any opportunities at Booking.com", "I just want to be considered for this job"])).toBe(2)
    expect(privacyChoice(["Yes, keep my details for future roles", "No, only for this position"])).toBe(1)
    expect(privacyChoice(["Yes", "No"])).toBe(-1)
  })

  test("Easy Apply consent boxes are always ticked; demographic/medical are not", () => {
    expect(isConsentCheckbox("You declare that you have read and agree to the job applications privacy notice of Redcare Pharmacy.")).toBe(true)
    expect(isConsentCheckbox("I consent")).toBe(true)
    expect(isConsentCheckbox("I consent.")).toBe(true)
    expect(isConsentCheckbox("I agree")).toBe(true)
    expect(isConsentCheckbox("I consent to being part of communities for future career opportunities.")).toBe(true)
    expect(isConsentCheckbox("I consent to receive WhatsApp messages for my job applications.")).toBe(true)
    expect(isConsentCheckbox("I certify that the information provided is accurate.")).toBe(true)
    expect(isConsentCheckbox("J'ai lu l'Avis de confidentialité de KHC.")).toBe(true)
    expect(isConsentCheckbox("Informations complètes et exactes")).toBe(true)
    expect(isConsentCheckbox("What is your gender?")).toBe(false)
    expect(isConsentCheckbox("Do you have a disability?")).toBe(false)
    expect(isConsentCheckbox("SQL")).toBe(false)
  })
})

describe("the questions a traineeship form asks, answered from code", () => {
  const f: Facts = { place: "Amsterdam, Netherlands", job_source: "LinkedIn", answers: { first_name: "Kien", last_name: "Phung", university: "University of Amsterdam", field_of_study: "Data science", graduation_date: "July 2027", study_year: "2nd year", work_authorization: "I need a work permit; the employer sponsors it" } }
  test("school, field, residing country, sponsorship and the graduation month and year each get their own part", () => {
    expect(answerText("School", f)).toBe("University of Amsterdam")
    expect(answerText("What is your latest field of study?", f)).toBe("Data science")
    expect(answerText("What country are you currently residing?", f)).toBe("Netherlands")
    expect(answerText("Will you require immigration sponsorship now or in the future?", f)).toBe("Yes")
    expect(answerText("When is your expected year of graduation?", f)).toBe("2027")
    expect(answerText("When is your expected graduation month?", f)).toBe("July")
  })
  test("the year of study fits a list written as 'Year 2', '2nd year' or 'Second year'", () => {
    const year = answerText("What is the current year of your studies?", f) ?? ""
    expect(year).toBe("2nd year")
    expect(chooseOption(["Year 1", "Year 2", "Year 3"], year, "Current year of studies")).toBe(1)
    expect(chooseOption(["First year", "Second year", "Third year"], year, "Current year of studies")).toBe(1)
    expect(chooseOption(["1st year", "2nd year"], year, "Current year of studies")).toBe(1)
  })
  test("how you heard is where you found the job, and 'applied before' is only ever a known yes", () => {
    expect(answerText("How did you hear about us?", f)).toBe("LinkedIn")
    expect(chooseOption(["Company website", "LinkedIn", "Friend"], "LinkedIn")).toBe(1)
    const q = "Have you previously applied to this role or a similar role with us this season?"
    expect(answerText(q, { ...f, applied_before: true })).toBe("Yes")
    // Nothing on record is "No"; not knowing at all is left to the person.
    expect(answerText(q, { ...f, applied_before: false })).toBe("No")
    expect(answerText(q, f)).toBeNull()
  })
  test("what only the person knows is left to them: gender, grades, a language they prefer, a cohort, the policies", () => {
    for (const q of ["What is your gender?", "What is your current academic performance rating?", "If you had to choose, which of the following programming languages would you prefer:", "Preferred Global Traineeship Cohort:", "Privacy Statement", "Interview Conduct Policy"]) expect(answerText(q, f)).toBeNull()
  })
})

 test("saved role values fill an explicit priorities question without guessing", () => {
  expect(answerText("What do you value in a new role?", { answers: { role_values: "Mentorship & skill development; Work-life balance" } })).toBe("Mentorship & skill development; Work-life balance")
  expect(answerText("What do you value in a new role?", { answers: {} })).toBeNull()
})

describe("what the real forms in the jobs database asked and the first rules missed", () => {
  const f: Facts = { phone: "+44 7123 456789", place: "London, United Kingdom", dutch: "native", job_source: "Glassdoor", answers: {} }
  test("the code beside a number, in other words and for a number from another country", () => {
    expect(answerText("Code du pays", f)).toBe("+44")
    expect(answerText("Country Phone Code", { place: "Amsterdam, Netherlands", answers: {} })).toBe("+31")
    expect(chooseOption(["Belgium (+32)", "Netherlands (+31)", "Germany (+49)"], "+31", "Country code")).toBe(1)
    expect(chooseOption(["Pays-Bas +31", "Belgique +32"], "+31", "Code du pays")).toBe(0)
  })
  test("are you a native Dutch speaker, from the level kept", () => {
    expect(answerText("Are you a native Dutch speaker?", f)).toBe("Yes")
    expect(answerText("Are you a native Dutch speaker?", { ...f, dutch: "basic" })).toBe("No")
    expect(answerText("Are you a native Dutch speaker?", { answers: {} })).toBeNull()
  })
  test("a degree is the option for its level, whatever else the option says", () => {
    const options = ["Associate's Degree", "Bachelor's Degree", "Master's Degree", "Doctor of Philosophy (Ph.D.)"]
    expect(chooseOption(options, "MSc Finance", "Degree")).toBe(2)
    expect(chooseOption(options, "BSc Economics", "Degree")).toBe(1)
    expect(chooseOption(["High School", "Master of Science (MSc)"], "Master's degree (MSc)", "Degree")).toBe(1)
  })
  test("how did you hear, when the list has no LinkedIn or Glassdoor, is the closest honest option", () => {
    expect(isHearQuestion("How did you hear about this role?")).toBe(true)
    expect(isHearQuestion("Where did you find this job?")).toBe(true)
    expect(isHearQuestion("Where did you find this vacancy?")).toBe(true)
    expect(isHearQuestion("What is your name?")).toBe(false)
    expect(heardChoice(["Friend", "Job board", "Other"], "Glassdoor")).toBe(1)
    expect(heardChoice(["Friend", "Company website", "Other"], "Indeed")).toBe(1)
    expect(heardChoice(["Friend", "Other (please specify)"], "Indeed")).toBe(1)
    expect(heardChoice(["Friend", "Colleague"], "Indeed")).toBe(-1)
  })
  test("French Kraft Heinz questions and a missing job country still get safe answers; grades stay with the person", () => {
    const kraft: Facts = {
      job_id: "pkraft",
      adult: true,
      never_worked_here: true,
      job_source: "LinkedIn",
      phone: "+31 6 1234 5678",
      place: "Amsterdam, Netherlands",
      answers: { work_authorization: "Yes, I have a residence permit that allows me to work", prior_agreements: "No", insider: "No", expected_salary: "EUR 600 a month" },
    }
    expect(answerText("Nécessiterez-vous, maintenant ou dans l'avenir, un parrainage pour obtenir un visa d'emploi?", kraft)).toBe("No")
    expect(answerText("Avez-vous 18 ans ou plus?", kraft)).toBe("Yes")
    expect(answerText("Are you a current Kraft Heinz employee? If yes, please exit this application", kraft)).toBe("No")
    expect(answerText("L'un de vos membres de famille directe est-il actuellement employé(e) chez Kraft Heinz ?", kraft)).toBe("No")
    expect(answerText("Where did you find this vacancy?", kraft)).toBe("LinkedIn")
    expect(answerText("What is your current GPA / grade list?", kraft)).toBeNull()
    expect(answerText("Will you require immigration sponsorship now or in the future?", { ...kraft, job_country: "DE", answers: { work_authorization: "Yes" } })).toBeNull()
    // Agent-owned: never bounce these empty to the person (French Workday labels included).
    expect(agentCanAnswer("Code du pays", kraft)).toBe(true)
    expect(agentCanAnswer("Pays", kraft)).toBe(true)
    expect(resolveAgentAnswer("Pays", kraft, ["Belgique", "Pays-Bas", "France"])).toBe("Pays-Bas")
    expect(agentCanAnswer("Divulgation volontaire d'informations", kraft, ["Femme", "Homme", "Nonbinary", "Prefer not to answer"])).toBe(true)
    expect(resolveAgentAnswer("Divulgation volontaire d'informations", kraft, ["Femme", "Homme", "Nonbinary", "Prefer not to answer"])).toBe("Prefer not to answer")
    expect(agentCanAnswer("Nécessiterez-vous, maintenant ou dans l'avenir, un parrainage pour obtenir un visa d'emploi?", kraft)).toBe(true)
    expect(agentCanAnswer("Avez-vous 18 ans ou plus?", kraft)).toBe(true)
    expect(agentCanAnswer("What is your current GPA / grade list?", kraft)).toBe(false)
  })
})

describe("honeypot traps", () => {
  test("never bounce to the person; leave empty", () => {
    expect(isTrapQuestion("Leave this field empty if you're human:")).toBe(true)
    expect(agentCanAnswer("Leave this field empty if you're human:", facts)).toBe(true)
    expect(resolveAgentAnswer("Leave this field empty if you're human:", facts)).toBe("")
  })
})

describe("the study dates and the current job, from the profile", () => {
  const f: Facts = { answers: { study_start: "September 2025", graduation_date: "June 2027", current_job_title: "Data Analyst Intern", current_company: "Philips" } }
  test("start and end of the study, as a month, a year, or both", () => {
    expect(answerText("Study Start date month", f)).toBe("September")
    expect(answerText("Study Start date year", f)).toBe("2025")
    expect(answerText("Study End date month", f)).toBe("June")
    expect(answerText("Study End date year", f)).toBe("2027")
  })
  test("current or most recent job title and company", () => {
    expect(answerText("Current or Most Recent Job Title", f)).toBe("Data Analyst Intern")
    expect(answerText("Current or Most Recent Company", f)).toBe("Philips")
    expect(answerText("Does your current or most recent role include direct people-management responsibility?", f)).toBeNull()
  })
})

describe("gender from Autofill", () => {
  const withGender: Facts = { ...facts, answers: { ...facts.answers, gender: "Man" } }
  test("a saved gender answers the question and picks the matching option in any wording", () => {
    expect(answerText("What is your gender?", withGender)).toBe("Man")
    expect(resolveAgentAnswer("What is your gender?", withGender, ["Select an option", "Female", "Male", "Prefer not to answer"])).toBe("Male")
    expect(resolveAgentAnswer("Geslacht", withGender, ["Vrouw", "Man", "Zeg ik liever niet"])).toBe("Man")
    expect(resolveAgentAnswer("Gender", { ...facts, answers: { gender: "Female" } }, ["Male (he/him)", "Female (she/her)"])).toBe("Female (she/her)")
  })
  test("no saved gender: Prefer not to answer, and gender identity or orientation are never filled from it", () => {
    expect(resolveAgentAnswer("What is your gender?", facts, ["Female", "Male", "Prefer not to answer"])).toBe("Prefer not to answer")
    expect(answerText("Do you identify as transgender?", withGender)).toBeNull()
    expect(answerText("Sexual orientation", withGender)).toBeNull()
  })
})

describe("Kraft Heinz French questions", () => {
  const fr: Facts = { ...facts, never_worked_here: true }
  test("currently employed here: No, from the person's work history; a family member is never answered by it", () => {
    expect(resolveAgentAnswer("Êtes-vous actuellement employé(e) chez Kraft Heinz ?", fr, ["Oui", "Non"])).toBe("Non")
    expect(answerText("Avez-vous un membre de votre famille actuellement employé(e) chez Kraft Heinz ?", fr)).toBeNull()
  })
})

test("a Dutch question that starts with a statement is still a yes/no question, answered truthfully from the person's level (Fastned)", () => {
  const label = "For this role, native fluency in Dutch is required. Do you speak Dutch fluently, and are you also comfortable working in English?"
  expect(answerText(label, { dutch: "basic" } as Facts)).toBe("Not fluently: my Dutch is basic.")
  expect(answerText(label, { dutch: "basic", languages: "English (fluent); Vietnamese (native)" } as Facts)).toBe("Not fluently: my Dutch is basic. I work fluently in English.")
  expect(answerText("For this role Dutch is required. Do you speak Dutch fluently?", { dutch: "basic" } as Facts)).toBe("No")
  expect(answerText("For this role Dutch is required. Do you speak Dutch fluently?", { dutch: "native" } as Facts)).toBe("Yes")
})

test("a year of study said in words picks its option; with two levels it is never guessed (IMC)", () => {
  const imc = ["1st year undergraduate (Bachelor's)", "2nd year undergraduate (Bachelor's)", "1st year postgraduate (Master's)", "2nd year postgraduate (Master's)", "Other"]
  const label = "What is the current year of your studies?"
  expect(chooseOption(imc, "Second year", label)).toBe(-1)
  expect(chooseOption(imc, "Second year Master's", label)).toBe(3)
  expect(chooseOption(imc, "first year bachelor", label)).toBe(0)
  expect(chooseOption(["Year 1", "Year 2", "Year 3"], "Second year", label)).toBe(1)
  expect(chooseOption(["First year", "Second year"], "2nd year", label)).toBe(1)
})
