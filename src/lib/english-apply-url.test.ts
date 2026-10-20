import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"

// The extension's own function, taken from background.js as it ships.
const src = readFileSync("extension/background.js", "utf8")
const start = src.indexOf("const ENGLISH_BY_LOCALE")
const end = src.indexOf("\n}\n", src.indexOf("function preferEnglishApplyUrl")) + 3
// oxlint-disable-next-line no-implied-eval -- deliberately evaluates the function as it ships in the extension
const preferEnglishApplyUrl = new Function(`${src.slice(start, end)}; return preferEnglishApplyUrl`)() as (url: string) => string

test("an employer's own site keeps its language page: Ormit's /nl/ → /en-US/ was a 404 read as 'job closed'", () => {
  const ormit = "https://ormittalent.nl/nl/traineeships/traineeship-change-ai-adoption-asml"
  expect(preferEnglishApplyUrl(ormit)).toBe(ormit)
  expect(preferEnglishApplyUrl("https://careers.example.com/fr/jobs/1?lang=fr")).toBe("https://careers.example.com/fr/jobs/1?lang=fr")
})

test("platforms that serve every page in English still open in English", () => {
  expect(preferEnglishApplyUrl("https://medtronic.wd1.myworkdayjobs.com/nl-NL/MedtronicCareers/job/X_R1")).toBe("https://medtronic.wd1.myworkdayjobs.com/en-US/MedtronicCareers/job/X_R1?locale=en_US")
  expect(preferEnglishApplyUrl("https://career5.successfactors.eu/careers?company=acme&lang=nl_NL")).toContain("en_US")
})
