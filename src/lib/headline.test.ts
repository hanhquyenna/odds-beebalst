import { describe, expect, test } from "bun:test"
import { DEFAULT_FILTERS, NO_FILTERS } from "@/lib/filters"
import { jobsHeadline } from "@/lib/headline"

describe("jobsHeadline", () => {
  test("the default filters say what the number is", () => {
    expect(jobsHeadline(408, DEFAULT_FILTERS)).toBe("408 internship, traineeship & entry jobs right now")
  })
  test("an industry joins the line and moves with the filter", () => {
    expect(jobsHeadline(37, { ...DEFAULT_FILTERS, industry: ["Banking"] })).toBe("37 internship, traineeship & entry jobs right now in banking")
    expect(jobsHeadline(60, { ...DEFAULT_FILTERS, industry: ["Banking", "Insurance"] })).toBe("60 internship, traineeship & entry jobs right now in banking and insurance")
    expect(jobsHeadline(80, { ...DEFAULT_FILTERS, industry: ["Banking", "Insurance", "Legal"] })).toBe("80 internship, traineeship & entry jobs right now in banking, insurance and legal")
    expect(jobsHeadline(99, { ...DEFAULT_FILTERS, industry: ["Banking", "Insurance", "Legal", "Consulting"] })).toBe("99 internship, traineeship & entry jobs right now in 4 industries")
  })
  test("a job field names the kind of work, and an industry after it names the employer", () => {
    expect(jobsHeadline(52, { ...DEFAULT_FILTERS, field: ["Software engineering"] })).toBe("52 internship, traineeship & entry jobs right now in Software engineering")
    expect(jobsHeadline(9, { ...DEFAULT_FILTERS, field: ["Software engineering"], industry: ["Banking"] })).toBe("9 internship, traineeship & entry jobs right now in Software engineering at banking employers")
  })
  test("no level and no industry is just the number", () => {
    expect(jobsHeadline(1863, NO_FILTERS)).toBe("1,863 jobs right now")
  })
  test("other levels are named, in lower case", () => {
    expect(jobsHeadline(120, { ...NO_FILTERS, level: ["Mid"] })).toBe("120 mid jobs right now")
    expect(jobsHeadline(300, { ...NO_FILTERS, level: ["Internship", "Entry", "Mid"] })).toBe("300 internship, entry and mid jobs right now")
    expect(jobsHeadline(5, { ...NO_FILTERS, level: ["Entry", "Internship"] })).toBe("5 internship, traineeship & entry jobs right now")
    expect(jobsHeadline(9, { ...NO_FILTERS, level: ["Internship", "Entry", "Mid", "Senior"] })).toBe("9 jobs right now")
  })
  test("one job and no jobs read as words", () => {
    expect(jobsHeadline(1, DEFAULT_FILTERS)).toBe("1 internship, traineeship & entry job right now")
    expect(jobsHeadline(0, { ...DEFAULT_FILTERS, industry: ["Banking"] })).toBe("No internship, traineeship & entry jobs right now in banking")
    expect(jobsHeadline(0, NO_FILTERS)).toBe("No jobs right now")
  })
  test("only the industry filter changes it when the level is left alone", () => {
    expect(jobsHeadline(10, { ...NO_FILTERS, industry: ["Banking"] })).toBe("10 jobs right now in banking")
  })
})
