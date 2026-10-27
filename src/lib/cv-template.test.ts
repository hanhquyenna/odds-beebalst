import { describe, expect, test } from "bun:test"
import * as PDFLib from "pdf-lib"
import { parseCv } from "@/lib/cv-parse"
import { cleanCv, cvText, printable, renderCvPdf, type Cv } from "../../supabase/functions/_shared/cv-template"

const input = {
  name: "Kien Phung",
  headline: "Corporate finance and AI",
  contact: { email: "kien@example.com", phone: "+31 6 12345678", place: "Amsterdam, Netherlands", linkedin: "linkedin.com/in/kien" },
  summary: "Finance student who builds DCF models and AI agents.",
  experience: [
    { title: "Corporate Finance Specialist", company: "FLC Group", location: "Hanoi, Vietnam", start: "Mar 2026", end: "Aug 2026", bullets: ["Built DCF models for $100M+ real estate deals", "Ran feasibility studies in Excel and SQL"] },
    { title: "Business Strategy & Market Analysis Intern", company: "BIDV", location: "Hanoi, Vietnam", start: "May 2024", end: "Aug 2024", bullets: ["Produced 10+ market reports"] },
  ],
  education: [{ school: "University of Amsterdam", degree: "BSc", field: "Communication Science", start: "Sep 2024", end: "Jun 2027" }],
  skills: [{ label: "Finance", items: ["Financial modeling", "DCF valuation", "Excel"] }, "SQL"],
  projects: [{ name: "Automated DCF model", when: "2026", bullets: ["Python, 5-year FCF forecast"] }],
  languages: ["English (fluent)", "Dutch (basic)"],
}
const made = (): Cv => {
  const r = cleanCv(input)
  if ("error" in r) throw new Error(r.error)

  return r.cv
}

describe("cleanCv", () => {
  test("accepts a full CV and a plain list of skills", () => {
    const cv = made()
    expect(cv.experience).toHaveLength(2)
    expect(cv.skills.map((s) => s.items)).toEqual([["Financial modeling", "DCF valuation", "Excel"], ["SQL"]])
  })
  test("says what is missing in words Claude can act on", () => {
    expect(cleanCv({})).toEqual({ error: "The CV needs the person's name (cv.name)." })
    expect("error" in cleanCv({ name: "A", contact: {} })).toBe(true)
    expect(cleanCv({ name: "A", contact: { email: "a@b.c" } })).toEqual({ error: "Give at least one experience or one education (cv.experience, cv.education)." })
    expect("error" in cleanCv({ name: "A", contact: { email: "a@b.c" }, experience: [{ title: "x", bullets: [] }] })).toBe(true)
  })
  test("keeps every size in range", () => {
    const long = "x".repeat(5000)
    const r = cleanCv({ ...input, summary: long, experience: Array.from({ length: 30 }, () => ({ title: "T", company: "C", bullets: Array(30).fill(long) })) })
    if ("error" in r) throw new Error(r.error)
    expect(r.cv.experience).toHaveLength(8)
    expect(r.cv.experience[0].bullets).toHaveLength(8)
    expect(r.cv.experience[0].bullets[0].length).toBeLessThanOrEqual(400)
    expect((r.cv.summary ?? "").length).toBeLessThanOrEqual(700)
  })
})

describe("cvText", () => {
  test("is read back by the app's own CV reader: roles, dates, degree and skills", () => {
    const rows = parseCv(cvText(made()))
    expect(rows.positions.map((p) => `${p.Title} @ ${p["Company Name"]} ${p["Started On"]}-${p["Finished On"]}`)).toEqual(["Corporate Finance Specialist @ FLC Group Mar 2026-Aug 2026", "Business Strategy & Market Analysis Intern @ BIDV May 2024-Aug 2024"])
    expect(rows.education[0]["School Name"]).toBe("University of Amsterdam")
    expect(rows.education[0]["Degree Name"]).toContain("BSc")
    expect(rows.skills.map((s) => s.Name)).toEqual(expect.arrayContaining(["Excel", "SQL"]))
  })
  test("is the same layout for any content", () => {
    const text = cvText(made())
    expect(text.split("\n").filter((l) => /^[A-Z ]{4,}$/.test(l))).toEqual(["KIEN PHUNG", "SUMMARY", "EDUCATION", "SKILLS", "EXPERIENCE", "PROJECTS", "LANGUAGES"])
  })
})

describe("printable", () => {
  test("keeps Latin-1, simplifies quotes and dashes, and keeps what Latin-1 has and drops the rest to the plain letter", () => {
    expect(printable("Zoë – café “ok”")).toBe("Zoë - café \"ok\"")
    expect(printable("Hà Hoàng Đào")).toBe("Hà Hoàng Dào")
    expect(printable("Nguyễn Thị 你好")).toBe("Nguyen Thi ")
  })
})

describe("renderCvPdf", () => {
  test("makes a one-page PDF for a normal CV, readable as text", async () => {
    const bytes = await renderCvPdf(PDFLib as never, made())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-")
    const doc = await PDFLib.PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(bytes.length).toBeGreaterThan(1500)
    expect(bytes.length).toBeLessThan(100_000)
  })
  test("flows a long CV over more pages and survives text the font cannot print", async () => {
    const cv = made()
    cv.name = "Hà Hoàng Đào"
    cv.experience = Array.from({ length: 8 }, (_, i) => ({ title: `Role ${i}`, company: `Company ${i}`, start: "2020", end: "2021", bullets: Array(8).fill("A long bullet about work that goes on and on and needs wrapping across lines ".repeat(3)) }))
    const doc = await PDFLib.PDFDocument.load(await renderCvPdf(PDFLib as never, cv))
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })
})
