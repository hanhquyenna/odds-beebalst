import { describe, expect, test } from "bun:test"
import { buildIcs, escapeText, fold } from "@/lib/ics"

describe("calendar export", () => {
  const now = new Date("2026-10-06T09:30:00.000Z")

  test("an all-day entry runs from its day to the next, with a stable id", () => {
    const text = buildIcs([{ uid: "job-1-applied", day: "2026-10-31", title: "Applied: Analyst · ING", description: "Status: Applied", url: "https://example.com/job" }], "odds: Date applied", now)
    expect(text).toContain("DTSTART;VALUE=DATE:20261031\r\n")
    expect(text).toContain("DTEND;VALUE=DATE:20261101\r\n")
    expect(text).toContain("UID:job-1-applied@odds\r\n")
    expect(text).toContain("DTSTAMP:20261006T093000Z\r\n")
    expect(text).toContain("URL:https://example.com/job\r\n")
    expect(text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true)
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true)
  })

  test("the year turns over at the end of December", () => {
    expect(buildIcs([{ uid: "a", day: "2026-12-31", title: "t", description: "d" }], "n", now)).toContain("DTEND;VALUE=DATE:20270101")
  })

  test("status and notes go in the description, escaped", () => {
    expect(escapeText("Status: Interview\nSalary; 3,000 \\ month")).toBe("Status: Interview\\nSalary\\; 3\\,000 \\\\ month")
    const text = buildIcs([{ uid: "a", day: "2026-10-06", title: "t", description: "Status: Interview\nContact: Anna, HR" }], "n", now)
    expect(text).toContain("DESCRIPTION:Status: Interview\\nContact: Anna\\, HR")
  })

  test("long lines fold at 75 octets without splitting a character", () => {
    const line = `DESCRIPTION:${"é".repeat(80)}`
    const folded = fold(line)
    const encoder = new TextEncoder()
    for (const part of folded.split("\r\n")) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75)
    }
    expect(folded.split("\r\n").map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(line)
  })

  test("an empty export is still a valid calendar", () => {
    expect(buildIcs([], "n", now)).toBe("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//odds//job search//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:n\r\nEND:VCALENDAR\r\n")
  })
})
