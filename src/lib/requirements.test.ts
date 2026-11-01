import { describe, expect, test } from "bun:test"
import { extractRequirements, relaxedGates, tiersOf } from "@/lib/requirements"

const BODY = `About the role
We build things.

Requirements:
- 3+ years of experience with SQL
- Strong knowledge of Python
- Experience with Tableau is a plus
- Must have a degree in finance

Nice to have:
- Familiarity with Snowflake
- Knowledge of IFRS

What we offer:
- A great team`

describe("requirement tiers", () => {
  const reqs = extractRequirements(BODY)
  test("lines under the requirements heading are must-haves", () => {
    expect(reqs.find((r) => /SQL/.test(r.text))?.tier).toBe("must")
    expect(reqs.find((r) => /Must have a degree/.test(r.text))?.tier).toBe("must")
  })
  test("a cue word in the line outranks the heading", () => {
    expect(reqs.find((r) => /Tableau/.test(r.text))?.tier).toBe("optional")
  })
  test("lines under a nice-to-have heading are nice to have", () => {
    expect(reqs.find((r) => /Snowflake/.test(r.text))?.tier).toBe("nice")
    expect(reqs.find((r) => /IFRS/.test(r.text))?.tier).toBe("nice")
  })
  test("each skill gets the strongest tier any line gives it", () => {
    const t = tiersOf(reqs)
    expect(t.sql).toBe("must")
    expect(t.python).toBe("must")
    expect(t.tableau).toBe("optional")
    expect(t.snowflake).toBe("nice")
  })
  test("the offer section is not read as requirements", () => {
    expect(reqs.some((r) => /great team/.test(r.text))).toBe(false)
  })
})

describe("relaxed gates", () => {
  const post = { dutch_required: true, years_min: 3, degree_asked: "master" as const }
  test("Dutch as a plus is lifted from the gates", () => {
    const reqs = extractRequirements("Requirements:\n- Fluency in English; Dutch is a plus.\n- 3+ years of experience with SQL")
    expect(relaxedGates(post, reqs).dutch_required).toBe(false)
    expect(relaxedGates(post, reqs).years_min).toBe(3)
  })
  test("a requirement stays when any line makes it compulsory", () => {
    const reqs = extractRequirements("Requirements:\n- Dutch is a plus\n- You must speak Dutch")
    expect(relaxedGates(post, reqs).dutch_required).toBe(true)
  })
})

describe("long headings without a colon", () => {
  const body = `Job Responsibilities
Analysing market data for mergers and acquisitions (M&A).

Required Qualifications, Capabilities, And Skills
Excellent analytical, quantitative and interpretative skills
Knowing your way around Excel, PowerPoint and Word
Fluency in English and Dutch

Preferred Qualifications, Capabilities And Skills
Being on-track for a United Kingdom 2:1 Bachelor's degree (or equivalent)

Join Us
At the firm we are creating positive change.`
  const reqs = extractRequirements(body)
  test("are read as the requirements part", () => {
    expect(reqs.map((r) => r.tier)).toEqual(["must", "must", "must", "optional"])
  })
  test("responsibilities are not requirements", () => {
    expect(tiersOf(reqs)["m&a"]).toBeUndefined()
    expect(tiersOf(reqs).excel).toBe("must")
  })
})

describe("yearsOf", () => {
  const { yearsOf } = require("@/lib/requirements") as typeof import("@/lib/requirements")
  const cases: Array<[string, number | null]> = [
    ["5+ years of experience", 5], ["2 to 5 years of relevant work experience", 2], ["3-5 yrs in finance", 3], ["3–5 years", 3], ["at least 1-2 years of experience", 1],
    ["three years of experience", 3], ["Two years' experience as a consultant", 2], ["minimaal drie jaar ervaring", 3], ["10+ years", 10], ["1 year", 1],
    ["For over 180 years we have trained engineers", null], ["a team of 10 people", null], ["Bachelor's degree", null], ["", null], ["paid every 3 years", 3], ["version 3.5 years", null],
  ]
  for (const [text, want] of cases) test(`${JSON.stringify(text)} → ${want}`, () => expect(yearsOf(text)).toBe(want))
})

describe("yearsOf ignores what is not a requirement for experience", () => {
  const { yearsOf } = require("@/lib/requirements") as typeof import("@/lib/requirements")
  const cases: Array<[string, number | null]> = [
    ["you are at least 18 years old at the start of the internship", null], ["Must be 18 years of age", null], ["aged 21 or over", null], ["age of 18", null],
    ["Recent graduate or up to two years of professional experience", null], ["maximum of 3 years of experience", null], ["no more than 2 years", null],
    ["You have between four and seven years of experience in strategy", 4], ["between 3 and 5 years of experience", 3],
    ["Vocational with at least 12 years of experience or Bachelor fresh grad", null], ["5 years of experience or a recent graduate", null],
    ["possess a relevant university degree (minimum of three years or more) in STEM", null], ["more than 12 months in the three years prior to the contract start date", null],
    ["results not older than two years", null], ["in the last 5 years you have worked abroad", null], ["a bachelor degree and 3 years of experience", 3], ["3 years of study", null],
    ["Minimum three years of experience", 3], ["7+ years of experience, including 2+ years as tech lead", 7], ["0-3 years of professional experience", 0],
  ]
  for (const [text, want] of cases) test(`${JSON.stringify(text)} → ${want}`, () => expect(yearsOf(text)).toBe(want))
})
