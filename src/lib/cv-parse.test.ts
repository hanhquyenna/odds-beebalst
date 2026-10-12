import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { derive } from "@/lib/engine"
import { readCvFile } from "@/lib/cv-file"
import { fillFromCv, parseCv } from "@/lib/cv-parse"
import { DEFAULT_PROFILE } from "@/lib/types"

const pdf = async () => (await import("pdfjs-dist/legacy/build/pdf.mjs")) as never
const text = async (name: string) => (await readCvFile(new File([readFileSync(`tests/cvs/${name}`)], name), pdf)).text

describe("parseCv on real CV files", () => {
  test("a PDF: the role, its company, place and dates; the degrees; the skills", async () => {
    const r = parseCv(await text("vietnam-finance.pdf"))
    expect(r.positions).toHaveLength(1)
    expect(r.positions[0]).toMatchObject({ Title: "Financial Analyst", "Company Name": "Vietcombank", Location: "Hanoi, Vietnam", "Started On": "Mar 2021", "Finished On": "Aug 2023" })
    expect(r.positions[0].Description).toContain("IFRS")
    expect(r.education.map((e) => e["Degree Name"])).toEqual(["MSc Finance", "BSc Banking"])
    expect(r.education[0]["School Name"]).toBe("Erasmus University Rotterdam")
    expect(r.skills.map((s) => s.Name)).toEqual(["Excel", "IFRS", "Financial modelling", "Budgeting", "Power BI"])
  })
  test("a Word file", async () => {
    const r = parseCv(await text("india-btech.docx"))
    expect(r.positions[0]).toMatchObject({ Title: "Software Engineering Intern", "Company Name": "Infosys", "Started On": "Jan 2024", "Finished On": "Jun 2024" })
    expect(r.education[0]["Degree Name"]).toBe("B.Tech Computer Science and Engineering")
    expect(r.skills.map((s) => s.Name)).toContain("Java")
  })
  test("two roles, newest first", async () => {
    const r = parseCv(await text("elite-heavy.pdf"))
    expect(r.positions.map((p) => p["Company Name"])).toEqual(["Goldman Sachs", "McKinsey and Company"])
    expect(r.positions.map((p) => p["Started On"])).toEqual(["Jun 2023", "Jun 2022"])
  })
  test("a CV in Portuguese", async () => {
    const r = parseCv(await text("brazil-pt.docx"))
    expect(r.positions[0]).toMatchObject({ Title: "Estagiária de Marketing Digital", "Company Name": "Natura", "Started On": "Jan 2023", "Finished On": "Dez 2023" })
    expect(r.education.map((e) => e["Degree Name"])).toEqual(["Mestrado em Administração", "Bacharelado em Administração"])
  })
  test("a Word file with a table for the roles", async () => {
    const r = parseCv(await text("table-resume.docx"))
    expect(r.positions[0]["Company Name"]).toBe("Flipkart")
    expect(r.education[0]["Degree Name"]).toBe("MSc Data Science")
  })
  test("a plain text CV with a year-only date", async () => {
    const r = parseCv(await text("weak-cv.txt"))
    expect(r.positions[0]).toMatchObject({ Title: "Barista", "Company Name": "A cafe", "Started On": "2022", "Finished On": "2023" })
    expect(r.education[0]["Degree Name"]).toBe("High school diploma")
    expect(r.skills).toEqual([])
  })
})

describe("what the rows give the model", () => {
  const profileOf = async (name: string) => {
    const t = await text(name)
    const rows = parseCv(t)

    return { ...DEFAULT_PROFILE, cv: t, ...rows }
  }
  test("years of work come out right", async () => {
    expect(derive(await profileOf("vietnam-finance.pdf")).years).toBeCloseTo(2.42, 1)
    expect(derive(await profileOf("nigeria-accountant.pdf")).years).toBeCloseTo(1.92, 1)
    expect(derive(await profileOf("elite-heavy.pdf")).years).toBeCloseTo(0.33, 1)
    expect(derive(await profileOf("india-btech.docx")).years).toBeCloseTo(0.42, 1)
  })
  test("the degree is the highest one", async () => {
    expect(derive(await profileOf("vietnam-finance.pdf")).degree).toBe("master")
    expect(derive(await profileOf("india-btech.docx")).degree).toBe("bachelor")
    expect(derive(await profileOf("brazil-pt.docx")).degree).toBe("master")
    expect(derive(await profileOf("china-mech.pdf")).degree).toBe("master")
    expect(derive(await profileOf("weak-cv.txt")).degree).toBe("unknown")
  })
  test("an internship on the CV is seen as one", async () => {
    expect(derive(await profileOf("india-btech.docx")).internship).toBe(true)
    expect(derive(await profileOf("nigeria-accountant.pdf")).internship).toBe(false)
  })
  test("where the work was is read from the place on the role line", async () => {
    const d = derive(await profileOf("vietnam-finance.pdf"))
    expect(d.share.nonEu).toBeGreaterThan(0.9)
  })
})

describe("fillFromCv", () => {
  const cv = "Experience\nAnalyst, Acme, Utrecht\nJan 2022 - Present\n- Reporting\nEducation\nMSc Finance, UvA\nSkills\nExcel, SQL"
  test("fills what is empty and says how much", () => {
    const r = fillFromCv({ positions: [], education: [], skills: [] }, cv)
    expect(r.filled).toEqual({ roles: 1, degrees: 1, skills: 2 })
    expect(r.patch.positions?.[0]).toMatchObject({ Title: "Analyst", "Company Name": "Acme", Location: "Utrecht", "Started On": "Jan 2022", "Finished On": "" })
  })
  test("never overwrites roles, degrees or skills that are already there", () => {
    const r = fillFromCv({ positions: [{ Title: "Mine" }], education: [{ "Degree Name": "BSc" }], skills: [{ Name: "Go" }] }, cv)
    expect(r.patch).toEqual({})
    expect(r.filled).toEqual({ roles: 0, degrees: 0, skills: 0 })
  })
  test("fills each part on its own", () => {
    const r = fillFromCv({ positions: [{ Title: "Mine" }], education: [], skills: [] }, cv)
    expect(r.patch.positions).toBeUndefined()
    expect(r.filled).toEqual({ roles: 0, degrees: 1, skills: 2 })
  })
})

describe("parseCv edge cases", () => {
  test("empty and heading-less text gives nothing, and does not throw", () => {
    for (const t of ["", "   \n\n ", "just a sentence about me", "😀😀😀", "Experience", "Experience\n"]) {
      expect(() => parseCv(t)).not.toThrow()
      expect(parseCv(t).positions).toEqual([])
    }
  })
  test("dates before the title, on their own line", () => {
    const r = parseCv("Experience\nAnalyst\nMar 2020 - Mar 2022\nBuilt models")
    expect(r.positions[0]).toMatchObject({ Title: "Analyst", "Started On": "Mar 2020", "Finished On": "Mar 2022" })
  })
  test("title and dates on one line", () => {
    const r = parseCv("Work Experience\nData Analyst, Zalando, Berlin (2021 - 2023)\n• SQL dashboards")
    expect(r.positions[0]).toMatchObject({ Title: "Data Analyst", "Company Name": "Zalando", "Started On": "2021", "Finished On": "2023" })
  })
  test("'at' and bars between title and company", () => {
    expect(parseCv("Experience\nAnalyst at Acme\n2021 - 2022").positions[0]).toMatchObject({ Title: "Analyst", "Company Name": "Acme" })
    expect(parseCv("Experience\nAnalyst | Acme | Utrecht\n2021 - 2022").positions[0]).toMatchObject({ Title: "Analyst", "Company Name": "Acme", Location: "Utrecht" })
  })
  test("Present, Now and Current mean an open end", () => {
    for (const w of ["Present", "present", "Now", "Current"]) expect(parseCv(`Experience\nAnalyst, Acme\nJan 2022 - ${w}`).positions[0]["Finished On"]).toBe("")
  })
  test("dates in the education section are dates of study, not of work", () => {
    const r = parseCv("Education\nBSc Economics, UvA, 2018 - 2021")
    expect(r.positions).toEqual([])
    expect(r.education[0]).toMatchObject({ "Degree Name": "BSc Economics", "School Name": "UvA", "Start Date": "2018", "End Date": "2021" })
  })
  test("a huge CV is capped", () => {
    const many = "Experience\n" + Array.from({ length: 80 }, (_, i) => `Role ${i}, Co ${i}\nJan 20${10 + (i % 15)} - Dec 20${12 + (i % 13)}`).join("\n")
    expect(parseCv(many).positions.length).toBeLessThanOrEqual(12)
  })
  test("skills are split on commas, bars and bullets and kept short", () => {
    const s = parseCv("Skills\nExcel, SQL | Python • R\n" + "x".repeat(80)).skills.map((x) => x.Name)
    expect(s).toEqual(["Excel", "SQL", "Python", "R"])
  })
})

describe("parseCv: the layout where the company sits beside the dates and the title is on the next line", () => {
  const cv = `KIEN PHUNG

EDUCATION

University of Amsterdam

BSc Communication Science Expected June 2027

SKILLS

Financial Analysis: Financial modeling, DCF valuation, SQL, Excel

Research & Analysis: Market research, data-driven
recommendations

Languages: English (Fluent), Dutch (Beginner)

EXPERIENCE

FLC Group Mar 2026 – Aug 2026
Corporate Finance Specialist
Hanoi, Vietnam
• Built discounted cash flow models.

BIDV May 2024 – Aug 2024
Business Strategy & Market Analysis Intern
Hanoi, Vietnam
• Produced market insight reports.

BeeBlast Oct 2025 – Present
CEO & Co-Founder
Amsterdam, Netherlands
• Grew BeeBlast.`
  test("the title is the title, the company the company, the place the place", () => {
    const r = parseCv(cv)
    expect(r.positions.map((p) => [p.Title, p["Company Name"], p.Location])).toEqual([
      ["Corporate Finance Specialist", "FLC Group", "Hanoi, Vietnam"],
      ["Business Strategy & Market Analysis Intern", "BIDV", "Hanoi, Vietnam"],
      ["CEO & Co-Founder", "BeeBlast", "Amsterdam, Netherlands"],
    ])
    expect(r.positions[2]["Finished On"]).toBe("")
  })
  test("a school and its degree on two lines are one row, with the expected date as the end", () => {
    const r = parseCv(cv)
    expect(r.education).toHaveLength(1)
    expect(r.education[0]).toMatchObject({ "Degree Name": "BSc Communication Science", "School Name": "University of Amsterdam", "End Date": "June 2027" })
  })
  test("skills drop their group label, spoken languages are not skills, and a wrapped line is joined", () => {
    const r = parseCv(cv)
    expect(r.skills.map((s) => s.Name)).toEqual(["Financial modeling", "DCF valuation", "SQL", "Excel", "Market research", "data-driven recommendations"])
  })
  test("the layouts that already worked are unchanged: title and company on the line with the dates", () => {
    const r = parseCv("EXPERIENCE\nFinancial Analyst, Vietcombank, Hanoi, Vietnam  Mar 2021 - Aug 2023\n• IFRS reporting")
    expect(r.positions[0]).toMatchObject({ Title: "Financial Analyst", "Company Name": "Vietcombank", Location: "Hanoi, Vietnam" })
  })
})
