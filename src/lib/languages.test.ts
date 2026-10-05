import { describe, expect, test } from "bun:test"
import { hasLanguage, requiredLanguages } from "@/lib/languages"

describe("requiredLanguages", () => {
  const cases: Array<[string, string[]]> = [
    ["Legal Assistant (German-speaking)", ["german"]],
    ["Commercial Sales Engineer (Spanish-Speaking)", ["spanish"]],
    ["Credit Controller(f/m/d) - Spanish & Italian speaking - temporary", ["spanish", "italian"]],
    ["Intern, Risk Management & Accounts Receivable, German speaking(m/f/x)", ["german"]],
    ["Ecommere Business Project Intern, Chinese Speaking (TikTok Shop)", ["chinese"]],
    ["Mandarin speaking Account Manager", ["chinese"]],
    ["Customer Success, French/German speaking", ["french", "german"]],
    ["Sales Support - fluent Italian", ["italian"]],
    ["Native German Speaker needed", ["german"]],
    ["Financial Analyst", []],
    ["Software Engineer", []],
    ["English speaking Analyst", []],
    ["Dutch speaking Customer Service", []],
    ["German Shepherd Trainer", []],
    ["French Fries Operator", []],
    ["Spanish Harlem Community Manager", []],
    ["Head of Turkish Delight Marketing", []],
    ["", []],
  ]
  for (const [title, want] of cases) {
    test(title || "(empty)", () => expect(requiredLanguages(title)).toEqual(want))
  }
  test("the same language named twice is listed once", () => {
    expect(requiredLanguages("German speaking (native German)")).toEqual(["german"])
  })
})

describe("hasLanguage", () => {
  test("listed languages decide", () => {
    expect(hasLanguage([{ Name: "English" }, { Name: "German" }], ["german"])).toBe("pass")
    expect(hasLanguage([{ Name: "English" }], ["german"])).toBe("fail")
    expect(hasLanguage([{ Name: "Mandarin Chinese" }], ["chinese"])).toBe("pass")
    expect(hasLanguage([{ Name: "Chinese" }], ["chinese"])).toBe("pass")
  })
  test("one of several required languages is enough to be worth applying", () => {
    expect(hasLanguage([{ Name: "Italian" }], ["spanish", "italian"])).toBe("pass")
  })
  test("no languages listed is unknown, never a no", () => {
    expect(hasLanguage([], ["german"])).toBe("unknown")
    expect(hasLanguage([{ Name: "" }, {}], ["german"])).toBe("unknown")
  })
  test("case and spaces do not matter", () => {
    expect(hasLanguage([{ Name: "  GERMAN " }], ["german"])).toBe("pass")
  })
})
