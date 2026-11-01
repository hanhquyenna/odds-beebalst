import { describe, expect, test } from "bun:test"
import { detectDelimiter, parseCsv } from "@/lib/csv"
import { guessMapping, guessType, readJobs, toIsoDate } from "@/lib/import"

describe("reading any csv", () => {
  test("a semicolon file from Dutch Excel", () => {
    const text = "Functie;Bedrijf;Plaats\nAnalist;ING;Amsterdam\nController;Adyen;Utrecht\n"
    expect(detectDelimiter(text)).toBe(";")
    expect(parseCsv(text)).toEqual([{ Functie: "Analist", Bedrijf: "ING", Plaats: "Amsterdam" }, { Functie: "Controller", Bedrijf: "Adyen", Plaats: "Utrecht" }])
  })
  test("tabs, and commas inside quotes do not split", () => {
    expect(parseCsv('Role\tCompany\nA, B\tX\n')).toEqual([{ Role: "A, B", Company: "X" }])
    expect(detectDelimiter('a,b\n"x;y;z",2\n')).toBe(",")
  })
  test("blank and repeated headers are made distinct; a mark at the start is ignored", () => {
    expect(parseCsv("﻿Name,,Name\n1,2,3\n")).toEqual([{ Name: "1", "Column 2": "2", "Name 2": "3" }])
  })
  test("a notes line above the header is skipped, a one-column file works", () => {
    expect(parseCsv("Exported on Monday\nTitle,Company\nA,B\n")[0]).toEqual({ Title: "A", Company: "B" })
    expect(parseCsv("Title\nA\nB\n")).toEqual([{ Title: "A" }, { Title: "B" }])
  })
})

describe("dates and types", () => {
  test("the usual ways to write a date", () => {
    expect(toIsoDate("2026-11-15")).toBe("2026-11-15")
    expect(toIsoDate("15/11/2026")).toBe("2026-11-15")
    expect(toIsoDate("15-11-26")).toBe("2026-11-15")
    expect(toIsoDate("4 Oct 2026")).toBe("2026-10-04")
    expect(toIsoDate("October 4, 2026")).toBe("2026-10-04")
    expect(toIsoDate("31/02/2026")).toBeNull()
    expect(toIsoDate("soon")).toBeNull()
  })
  test("types from values", () => {
    expect(guessType(["1/2/2026", "3/4/2026"]).type).toBe("date")
    expect(guessType(["10", "2,5"]).type).toBe("number")
    expect(guessType(["https://a.nl", "www.b.nl"]).type).toBe("url")
    expect(guessType(["yes", "no"]).type).toBe("checkbox")
    expect(guessType(["High", "Low", "High", "Low", "High"])).toEqual({ type: "select", options: ["High", "Low"] })
    expect(guessType(["a b", "c d"]).type).toBe("text")
  })
})

describe("mapping and import", () => {
  test("guesses columns by name in Dutch and English, and by what is in them", () => {
    const rows = [{ Vacature: "Analist", Werkgever: "ING", Stad: "Amsterdam", Site: "https://x.nl/1", Prio: "High" }]
    expect(guessMapping(Object.keys(rows[0]), rows)).toEqual({ Vacature: "title", Werkgever: "company", Stad: "place", Site: "link", Prio: "property" })
  })
  test("with no title column the first column of words is the title", () => {
    const rows = [{ "Thing to apply": "Analyst", Org: "ING" }]
    expect(guessMapping(["Thing to apply", "Org"], rows)["Thing to apply"]).toBe("title")
  })
  test("a row needs only a title; properties are typed and dates normalised", () => {
    const rows = [
      { Job: "Analyst", Deadline: "15/11/2026", Remote: "yes" },
      { Job: "Controller", Deadline: "1/12/2026", Remote: "no" },
      { Job: "", Deadline: "", Remote: "" },
    ]
    const r = readJobs(rows, [])
    expect(r.jobs).toHaveLength(2)
    expect(r.skipped).toBe(1)
    expect(r.jobs[0].post.employer_display).toBe("Not stated")
    expect(r.types).toEqual({ Deadline: "date", Remote: "checkbox" })
    expect(r.jobs[0].extras).toEqual({ Deadline: "2026-11-15", Remote: "true" })
    expect(r.jobs[1].extras).toEqual({ Deadline: "2026-12-01" })
  })
  test("a chosen mapping overrides the guess", () => {
    const rows = [{ A: "Analyst", B: "ING", C: "Amsterdam" }]
    const r = readJobs(rows, [], { A: "company", B: "title", C: "ignore" })
    expect(r.jobs[0].post.title).toBe("ING")
    expect(r.jobs[0].post.employer_display).toBe("Analyst")
    expect(r.columns).toEqual([])
  })
})
