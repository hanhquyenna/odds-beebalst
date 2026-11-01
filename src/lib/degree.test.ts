import { describe, expect, test } from "bun:test"
import { degreeOf, degreeOfName } from "@/lib/degree"
import { derive } from "@/lib/engine"
import { DEFAULT_PROFILE } from "@/lib/types"

describe("degreeOfName", () => {
  const cases: Array<[string, string]> = [
    ["BSc", "bachelor"], ["B.Sc.", "bachelor"], ["Bachelor of Science - BS", "bachelor"], ["Bachelor's degree", "bachelor"], ["B.Tech", "bachelor"], ["BTech Computer Science", "bachelor"],
    ["B.E.", "bachelor"], ["BEng (Hons)", "bachelor"], ["B.Com", "bachelor"], ["BBA", "bachelor"], ["LLB", "bachelor"], ["HBO Bachelor", "bachelor"], ["Bacharelado em Administração", "bachelor"],
    ["Licenciatura en Economía", "bachelor"], ["Lisans", "bachelor"], ["Licence en gestion", "bachelor"], ["Laurea triennale", "bachelor"], ["BA Economics", "bachelor"], ["B.A.", "bachelor"],
    ["Pre-Master Business Administration", "bachelor"], ["Premaster", "bachelor"],
    ["MSc", "master"], ["M.Sc.", "master"], ["Master of Science - MS", "master"], ["Master's degree", "master"], ["MBA", "master"], ["M.Tech", "master"], ["MTech", "master"], ["M.Eng", "master"],
    ["MEng", "master"], ["MPhil", "master"], ["LLM", "master"], ["Mestrado em Administração", "master"], ["Yüksek Lisans", "master"], ["Maestría en Finanzas", "master"], ["Magister", "master"],
    ["Master of Engineering", "master"], ["MA Economics", "master"], ["M.A.", "master"], ["Engineer's degree", "master"], ["Diplom-Ingenieur", "master"], ["Ingénieur", "master"], ["Laurea magistrale", "master"],
    ["PhD", "phd"], ["Ph.D.", "phd"], ["Doctor of Philosophy - PhD", "phd"], ["DPhil", "phd"], ["Doutorado", "phd"], ["Doktora", "phd"], ["Doctorate in Physics", "phd"],
    ["High School Diploma", "unknown"], ["Associate's degree", "unknown"], ["Certificate in Data Analytics", "unknown"], ["Diploma in Marketing", "unknown"], ["Bootcamp", "unknown"], ["", "unknown"], ["   ", "unknown"],
    ["Magíster en Ingeniería", "master"], ["MÜHENDİSLİK Lisans", "bachelor"],
    ["Some unlisted national degree", "bachelor"],
  ]
  for (const [name, want] of cases) {
    test(`${name || "(empty)"} → ${want}`, () => expect(degreeOfName(name)).toBe(want as never))
  }
  test("a physician is not a doctorate", () => {
    expect(degreeOfName("Medical Doctor")).not.toBe("phd")
  })
})

describe("degreeOf", () => {
  const edu = (d: string, field = "") => ({ "Degree Name": d, "Field Of Study": field })
  test("the highest of several entries counts", () => {
    expect(degreeOf([edu("BSc"), edu("MSc")], "")).toBe("master")
    expect(degreeOf([edu("MSc"), edu("BSc")], "")).toBe("master")
    expect(degreeOf([edu("BSc"), edu("PhD")], "")).toBe("phd")
  })
  test("an empty degree name falls back to the field of study", () => {
    expect(degreeOf([edu("", "Master of Science in Finance")], "")).toBe("master")
  })
  test("with education listed, the free CV text can never raise the degree", () => {
    expect(degreeOf([edu("Bachelor")], "Certified Scrum Master. MSc thesis supervisor. Assisting doctors. PhD students.")).toBe("bachelor")
  })
  test("with no education listed, only phrases that cannot mean anything else count", () => {
    expect(degreeOf([], "Certified Scrum Master. Master data management. Assisting doctors.")).toBe("unknown")
    expect(degreeOf([], "I hold a Master of Science from TU Delft")).toBe("master")
    expect(degreeOf([], "Bachelor of Arts, 2023")).toBe("bachelor")
    expect(degreeOf([], "PhD in physics")).toBe("phd")
    expect(degreeOf([], "")).toBe("unknown")
  })
  test("a degree nobody listed still counts as a bachelor's, never higher", () => {
    expect(degreeOf([edu("Titulo universitario")], "")).toBe("bachelor")
  })
  test("only sub-degree credentials read as no degree", () => {
    expect(degreeOf([edu("High School Diploma"), edu("Certificate in SQL")], "")).toBe("unknown")
  })
})

describe("dates on a CV", () => {
  const years = (from: string, to: string): number => derive({ ...DEFAULT_PROFILE, positions: [{ Title: "x", "Started On": from, "Finished On": to }] }).years
  test("the same span written in different ways is the same length", () => {
    const want = years("Jan 2020", "Jan 2022")
    expect(want).toBeCloseTo(2, 1)
    for (const [a, b] of [["January 2020", "January 2022"], ["01/2020", "01/2022"], ["2020-01", "2022-01"], ["1.2020", "1.2022"], ["Jan. 2020", "Jan. 2022"], ["JAN 2020", "JAN 2022"]]) {
      expect(years(a, b)).toBeCloseTo(want, 6)
    }
  })
  test("Sept and full month names are read, not dropped", () => {
    expect(years("Sept 2021", "June 2023")).toBeCloseTo(1.75, 1)
  })
  test("only a year is read as the start of that year", () => {
    expect(years("2019", "2020")).toBeCloseTo(1, 1)
  })
  test("unreadable, missing or backwards dates give zero or an open end, never NaN", () => {
    for (const [a, b] of [["", ""], ["soon", "later"], ["Dec 2024", "Jan 2020"], ["Smarch 2021", "Jan 2022"], ["13/2020", "14/2021"]]) {
      expect(Number.isFinite(years(a, b))).toBe(true)
      expect(years(a, b)).toBeGreaterThanOrEqual(0)
    }
  })
  test("Present, Now and Current run to today", () => {
    expect(years("Jan 2024", "Present")).toBeGreaterThan(2)
    expect(years("Jan 2024", "")).toBeGreaterThan(2)
  })
})

describe("month names in other languages", () => {
  const years = (from: string, to: string): number => derive({ ...DEFAULT_PROFILE, positions: [{ Title: "x", "Started On": from, "Finished On": to }] }).years
  const same: Array<[string, string, string, string]> = [
    ["Jan 2023", "Dez 2023", "Jan 2023", "Dec 2023"], ["ene 2022", "dic 2022", "Jan 2022", "Dec 2022"], ["mrt 2021", "okt 2022", "Mar 2021", "Oct 2022"],
    ["Mär 2021", "Sep 2021", "Mar 2021", "Sep 2021"], ["Ağustos 2020", "Ocak 2022", "Aug 2020", "Jan 2022"], ["févr. 2022", "juil. 2023", "Feb 2022", "Jul 2023"], ["out 2019", "mai 2021", "Oct 2019", "May 2021"],
  ]
  for (const [a, b, c, d] of same) {
    test(`${a} to ${b} is the same span as ${c} to ${d}`, () => expect(years(a, b)).toBeCloseTo(years(c, d), 6))
  }
  test("a word that is not a month is not read as one", () => {
    expect(years("Marketing 2021", "Marketing 2022")).toBeCloseTo(1, 1)
  })
})
