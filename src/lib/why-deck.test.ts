import { describe, expect, test } from "bun:test"
import { FIRST_SCREEN, HIRED, MENTAL_MODEL, MINUTE_STEPS, SLIDES, START_BEHIND, behindRange, callbackBand, coldBarShare, firstScreenLift, hiredMultiple, hiredShare, pctText } from "@/lib/why-deck"

describe("the numbers on the slides", () => {
  test("the first-screen lift is the 52% against 35% from the sourced report, about +49%", () => {
    expect(FIRST_SCREEN.all).toBe(0.35)
    expect(FIRST_SCREEN.referred).toBe(0.52)
    expect(Math.round(firstScreenLift() * 100)).toBe(49)
  })
  test("referred candidates are hired 9.5 times as often, from 1 in 16 against 1 in 152", () => {
    expect(HIRED.referredOneIn).toBe(16)
    expect(HIRED.coldOneIn).toBe(152)
    expect(hiredMultiple()).toBe(9.5)
    expect(hiredShare(16)).toBeCloseTo(0.0625, 10)
  })
  test("non-native applicants get 7% to 24% fewer callbacks, from 0.93 and 0.76", () => {
    expect(START_BEHIND.low).toBe(0.76)
    expect(START_BEHIND.high).toBe(0.93)
    expect(behindRange()).toEqual({ from: 7, to: 24 })
  })
  test("percentages read short", () => {
    expect(pctText(0.35)).toBe("35%")
    expect(pctText(0.52)).toBe("52%")
    expect(pctText(hiredShare(152))).toBe("0.7%")
    expect(pctText(hiredShare(16))).toBe("6.3%")
  })
  test("every figure has a source label, and the hired figure links to its source", () => {
    for (const s of [FIRST_SCREEN.source, HIRED.source, START_BEHIND.source]) expect(s.label.length).toBeGreaterThan(10)
    expect(HIRED.source.url).toMatch(/^https:\/\//)
  })
  test("the deck has six slides, one idea each, in order", () => {
    expect(SLIDES.map((s) => s.id)).toEqual(["title", "hired", "screen", "abroad", "minute", "model"])
  })
  test("the one-minute steps are real steps and the mental model stays about thinking, not wording", () => {
    expect(MINUTE_STEPS).toHaveLength(4)
    const text = [...MINUTE_STEPS, ...MENTAL_MODEL.flatMap((m) => [m.title, m.line])].join(" ")
    expect(text).not.toContain("—")
    // The message panel owns the wording and the order of the messages.
    expect(text.toLowerCase()).not.toMatch(/connection note|nudge|follow.?up|template/)
    expect(MENTAL_MODEL).toHaveLength(3)
  })
})

describe("the stressed words", () => {
  test("each mental-model title contains the word the slide highlights", () => {
    for (const m of MENTAL_MODEL) expect(m.title).toContain(m.stress)
  })
})

describe("the scales the slides are drawn on", () => {
  test("the cold bar is a tenth of the referred bar, so the picture says 9.5 times", () => {
    expect(coldBarShare()).toBeCloseTo(1 / hiredMultiple(), 10)
    expect(coldBarShare()).toBeGreaterThan(0.1)
    expect(coldBarShare()).toBeLessThan(0.11)
  })
  test("the callback band sits between 76 and 93 on a ruler where a native applicant is 100", () => {
    expect(callbackBand()).toEqual({ from: 76, to: 93 })
    expect(callbackBand().to).toBeLessThan(100)
  })
})
