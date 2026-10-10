import { describe, expect, test } from "bun:test"
import { atEmployer, byNewest, dateKey, englishFirst, monthYear, reviewerStatus } from "@/lib/past-roles"

describe("past hires and reviews, as shown", () => {
  test("dates in any of the scraped formats sort the same way", () => {
    expect(dateKey("2026-02")).toBe(dateKey("Feb 2026"))
    expect(dateKey("February 2026")).toBe(dateKey("2026-02-15"))
    expect(dateKey("2021")).toBeLessThan(dateKey("Sep 2021") ?? 0)
    expect(dateKey(null)).toBeNull()
  })
  test("newest first, what someone does now on top", () => {
    const roles = [
      { employer: "A", title: "Old", start: "Sep 2021", end: "Sep 2024", current: false, type: null, description: null },
      { employer: "B", title: "Newer", start: "2026-02", end: "2026-04", current: false, type: null, description: null },
      { employer: "C", title: "Now", start: "2024-01", end: null, current: true, type: null, description: null },
    ]
    expect(byNewest(roles).map((r) => r.title)).toEqual(["Now", "Newer", "Old"])
  })
  test("a role at the employer is found under its legal name too", () => {
    expect(atEmployer({ employer: "Picnic Technologies", title: null, start: null, end: null, current: null, type: null, description: null }, "Picnic", "Picnic")).toBe(true)
    expect(atEmployer({ employer: "Adyen N.V.", title: null, start: null, end: null, current: null, type: null, description: null }, "adyen", "Adyen")).toBe(true)
    expect(atEmployer({ employer: "Booking.com", title: null, start: null, end: null, current: null, type: null, description: null }, "adyen", "Adyen")).toBe(false)
  })
  test("Dutch Glassdoor statuses read in English", () => {
    expect(reviewerStatus("Voormalige werknemer, meer dan 3 jaar")).toBe("Former employee, more than 3 years")
    expect(monthYear("2024-03")).toBe("Mar 2024")
  })
})

describe("reviews for readers from abroad", () => {
  test("Dutch reviews go after English ones, each in their own order", () => {
    const r = (title: string, pros: string) => ({ title, pros, cons: null })
    const out = englishFirst([r("Flexibel, zwaar werk.", "Flexibel en vanwege de hoeveelheid uren per dag, al snel genoeg verdiend"), r("Great tech culture", "great vibe, cool stuff to build"), r("Fine place", "good people and nice lunch")])
    expect(out.map((x) => x.title)).toEqual(["Great tech culture", "Fine place", "Flexibel, zwaar werk."])
  })
  test("a bare status reads as a sentence", () => {
    expect(reviewerStatus("current")).toBe("Current employee")
  })
})
