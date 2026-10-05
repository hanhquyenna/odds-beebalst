import { describe, expect, test } from "bun:test"
import { FAMILY_NAMES, GRADES, RECOGNITION, STANDING, buildQuestions, readItemAnswers } from "../../supabase/functions/read-profile/judge"
import { MAX_ITEMS, MAX_LINE, hashItem, itemsOf } from "../../supabase/functions/read-profile/items"
import { FAMILIES } from "@/lib/field"
import { GRADE_TIERS, RECOGNITION_TIERS, STANDING_TIERS, parseItemFacts } from "@/lib/strength"

const profile = {
  cv: "Winner, national case competition 2022\nCum laude, MSc Finance",
  positions: [{ Title: "Audit intern", "Company Name": "KPMG", Location: "Amsterdam", "Started On": "Jun 2023", "Finished On": "Aug 2023", Description: "Tested controls." }],
  education: [{ "School Name": "Erasmus University", "Degree Name": "MSc Finance", "Start Date": "2023", "End Date": "2025", Notes: "Cum laude" }],
}
const reply = (over: Record<string, string> = {}) => ({ answers: Object.fromEntries(Object.entries({ standing: "known", recognition: "none", grades: "stated_high", family: "f4", ...over }).map(([k, v]) => [k, { choice: v, confidence: 0.9 }])) })

describe("itemsOf", () => {
  test("cuts a profile into roles, degrees and CV lines, in that order, one fact each", () => {
    const items = itemsOf(profile)
    // "Cum laude, MSc Finance" only repeats the degree row, so it is not a part of its own.
    expect(items.map((i) => i.kind)).toEqual(["role", "education", "line"])
    expect(items[0].text).toBe("Audit intern, KPMG (Amsterdam). Jun 2023 to Aug 2023. Tested controls.")
    expect(items[1].text).toBe("MSc Finance, Erasmus University, 2023 to 2025, Cum laude")
  })
  test("a CV line that only repeats a listed role or degree is not read twice", () => {
    const rowsAndCv = {
      positions: [{ Title: "Financial Analyst", "Company Name": "Vietcombank", Location: "Hanoi, Vietnam", "Started On": "Mar 2021", "Finished On": "Aug 2023", Description: "Prepared monthly IFRS reports" }],
      education: [{ "Degree Name": "MSc Finance", "School Name": "Erasmus University Rotterdam" }],
      cv: "Financial Analyst, Vietcombank, Hanoi, Vietnam\nMar 2021 - Aug 2023\nMSc Finance, Erasmus University Rotterdam\nWinner, national finance case competition, 2020",
    }
    expect(itemsOf(rowsAndCv).map((i) => i.kind)).toEqual(["role", "education", "line"])
    expect(itemsOf(rowsAndCv)[2].text).toContain("national finance case competition")
  })
  test("contact details, section headings and the name line are not parts: they say nothing about a track record and should not be sent", () => {
    const cv = "Nguyen Thi Lan\nRotterdam | lan.nguyen@example.com\n+31 6 1234 5678\nlinkedin.com/in/lan\nSummary\nExperience\nEducation\nSkills:\nWinner, national case competition 2022"
    expect(itemsOf({ cv }).map((i) => i.text)).toEqual(["Winner, national case competition 2022"])
  })
  test("a first line that is not a name is kept", () => {
    expect(itemsOf({ cv: "Fulbright Fellow 2022 to 2023" }).map((i) => i.text)).toEqual(["Fulbright Fellow 2022 to 2023"])
    expect(itemsOf({ cv: "Winner, national case competition" }).map((i) => i.text)).toEqual(["Winner, national case competition"])
  })
  test("the name rule applies to the first line only", () => {
    // The first line looks like a name and goes; the same shape on the second line is kept.
    expect(itemsOf({ cv: "Nguyen Thi Lan\nGoldman Sachs Analyst" }).map((i) => i.text)).toEqual(["Goldman Sachs Analyst"])
  })
  test("with no roles or degrees listed, every CV line is kept", () => {
    expect(itemsOf({ cv: "Financial Analyst, Vietcombank, Hanoi, Vietnam\nMSc Finance, Erasmus University Rotterdam" }).map((i) => i.kind)).toEqual(["line", "line"])
  })
  test("an empty or missing profile has no parts", () => {
    expect(itemsOf({})).toEqual([])
    expect(itemsOf({ cv: "", positions: [], education: [] })).toEqual([])
  })
  test("blank, tiny and repeated entries are dropped", () => {
    const items = itemsOf({ cv: "ok\n\n   \nSame line of text\nsame LINE of text\nSame line of text", positions: [{ Title: "" }, { Title: "x" }], education: [{}] })
    expect(items.map((i) => i.text)).toEqual(["Same line of text"])
  })
  test("whitespace is tidied so spacing never changes a part", () => {
    expect(itemsOf({ cv: "Audit   intern,\tKPMG   Amsterdam" })[0].text).toBe("Audit intern, KPMG Amsterdam")
  })
  test("long entries are cut and the number of parts is capped", () => {
    expect(itemsOf({ cv: "x".repeat(5000) })[0].text).toHaveLength(MAX_LINE)
    const many = Array.from({ length: 200 }, (_, i) => `Position number ${i} at some company`).join("\n")
    expect(itemsOf({ cv: many })).toHaveLength(MAX_ITEMS)
  })
  test("unicode, emoji and right-to-left text are kept as written", () => {
    expect(itemsOf({ cv: "مهندس برمجيات 💻 软件工程师 — Python" })[0].text).toBe("مهندس برمجيات 💻 软件工程师 — Python")
  })
  test("the same profile always gives the same parts in the same order", () => {
    expect(itemsOf(profile)).toEqual(itemsOf(JSON.parse(JSON.stringify(profile))))
  })
})

describe("hashItem", () => {
  test("is a 64-character fingerprint, the same for the same part", async () => {
    const a = await hashItem({ kind: "role", text: "Audit intern, KPMG" })
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashItem({ kind: "role", text: "Audit intern, KPMG" })).toBe(a)
  })
  test("a different text or a different kind is a different part", async () => {
    const a = await hashItem({ kind: "role", text: "Audit intern, KPMG" })
    expect(await hashItem({ kind: "role", text: "Audit intern, KPMG!" })).not.toBe(a)
    expect(await hashItem({ kind: "line", text: "Audit intern, KPMG" })).not.toBe(a)
  })
  test("editing one entry changes only that entry's fingerprint, so only it is read again", async () => {
    const before = await Promise.all(itemsOf(profile).map(hashItem))
    const edited = { ...profile, positions: [{ ...profile.positions[0], Description: "Tested controls for three clients." }] }
    const after = await Promise.all(itemsOf(edited).map(hashItem))
    expect(after[0]).not.toBe(before[0])
    expect(after.slice(1)).toEqual(before.slice(1))
  })
  test("adding an entry leaves every earlier fingerprint as it was", async () => {
    const before = await Promise.all(itemsOf(profile).map(hashItem))
    const more = { ...profile, cv: profile.cv + "\nFulbright Fellow 2022 to 2023" }
    const after = await Promise.all(itemsOf(more).map(hashItem))
    expect(after.slice(0, before.length)).toEqual(before)
    expect(after).toHaveLength(before.length + 1)
  })
})

describe("what Jev may answer matches what the app accepts", () => {
  test("the lines of work are exactly the app's families", () => {
    expect([...FAMILY_NAMES].sort((a, b) => a.localeCompare(b))).toEqual([...FAMILIES].sort((a, b) => a.localeCompare(b)))
  })
  test("the tiers are exactly the app's tiers", () => {
    expect(Object.keys(STANDING)).toEqual([...STANDING_TIERS])
    expect(Object.keys(RECOGNITION)).toEqual([...RECOGNITION_TIERS])
    expect(Object.keys(GRADES)).toEqual([...GRADE_TIERS])
  })
  test("four closed questions are asked of every part", () => {
    const q = buildQuestions() as Record<string, { type: string; criteria: Record<string, string> }>
    expect(Object.keys(q)).toEqual(["standing", "recognition", "grades", "family"])
    expect(Object.values(q).every((x) => x.type === "choice")).toBe(true)
    expect(Object.keys(q.family.criteria)).toEqual(["none", ...FAMILY_NAMES.map((_, i) => `f${i}`)])
  })
})

describe("readItemAnswers", () => {
  test("a complete reply becomes facts the app accepts", () => {
    const f = readItemAnswers(reply())!
    expect(f).toEqual({ standing: "known", recognition: "none", grades: "stated_high", family: FAMILY_NAMES[4] })
    expect(parseItemFacts(f)).not.toBeNull()
  })
  test("'none' as the line of work is stored as no line of work", () => {
    expect(readItemAnswers(reply({ family: "none" }))?.family).toBeNull()
  })
  test("every possible reply is stored in a form the app accepts", () => {
    for (const standing of STANDING_TIERS) for (const recognition of RECOGNITION_TIERS) for (const grades of GRADE_TIERS) for (const family of ["none", ...FAMILY_NAMES.map((_, i) => `f${i}`)]) {
      expect(parseItemFacts(readItemAnswers(reply({ standing, recognition, grades, family })))).not.toBeNull()
    }
  })
  test("one unknown or missing choice rejects the whole reply", () => {
    for (const q of ["standing", "recognition", "grades", "family"]) {
      expect(readItemAnswers(reply({ [q]: "legendary" }))).toBeNull()
      const partial = reply()
      delete (partial.answers as Record<string, unknown>)[q]
      expect(readItemAnswers(partial)).toBeNull()
    }
  })
  test("a line-of-work key that does not exist is rejected", () => {
    expect(readItemAnswers(reply({ family: "f16" }))).toBeNull()
    expect(readItemAnswers(reply({ family: "f-1" }))).toBeNull()
    expect(readItemAnswers(reply({ family: "F4" }))).toBeNull()
  })
  test("garbage replies and prototype names are rejected, not guessed at", () => {
    expect(readItemAnswers(null)).toBeNull()
    expect(readItemAnswers(undefined)).toBeNull()
    expect(readItemAnswers({})).toBeNull()
    expect(readItemAnswers({ answers: {} })).toBeNull()
    expect(readItemAnswers(reply({ standing: "constructor", recognition: "toString", grades: "hasOwnProperty", family: "__proto__" }))).toBeNull()
  })
})
