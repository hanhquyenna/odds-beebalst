import { describe, expect, test } from "bun:test"
import { csvCell, toCsv } from "@/lib/export-csv"

describe("csv export", () => {
  test("quotes what needs it and doubles quotes", () => {
    expect(csvCell('a, "b"')).toBe('"a, ""b"""')
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"')
    expect(csvCell(null)).toBe("")
    expect(csvCell(12)).toBe("12")
  })
  test("a cell that starts like a formula is not run as one", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)")
    expect(csvCell("-5")).toBe("-5")
  })
  test("header and rows", () => {
    expect(toCsv(["A", "B"], [["1", "x,y"]])).toBe('﻿A,B\r\n1,"x,y"\r\n')
  })
})
