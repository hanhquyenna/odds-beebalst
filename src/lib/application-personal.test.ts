import { expect, test } from "bun:test"
import { personalFromProfile } from "../../supabase/functions/_shared/application-personal"
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
test("personal overrides fill contact and address fields without changing source profile", () => {
  const a = { email: "chosen@example.com", city: "Utrecht", address: "Example street 10", country: "Netherlands", postcode: "1234 AB", linkedin: "https://www.linkedin.com/in/chosen" }
  for (const [question, expected] of [["Email", a.email], ["City", a.city], ["Address line 1", a.address], ["Country", a.country], ["Postal code", a.postcode], ["LinkedIn profile URL", a.linkedin]]) expect(answerText(question, { answers: a })).toBe(expected)
})
