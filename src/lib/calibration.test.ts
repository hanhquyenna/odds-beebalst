import { describe, expect, test } from "bun:test"
import { bucketOf, calibrate, callsIn100, fromPooled, MIN_ANSWERED, type CalibrationRow } from "./calibration"

const NOW = Date.parse("2026-10-18T12:00:00Z")
const old = "2026-09-01"
const rows = (n: number, chance: number, hits: number, applied_on = old): CalibrationRow[] =>
  Array.from({ length: n }, (_, i) => ({ chance, applied_on, outcome: i < hits ? "interview" : "rejected" }))
const at = (list: ReturnType<typeof calibrate>, key: string) => list.find((b) => b.key === key)!

describe("bucketOf", () => {
  test("edges belong to the upper bucket", () => {
    expect(bucketOf(0.009).key).toBe("lt1")
    expect(bucketOf(0.01).key).toBe("1-3")
    expect(bucketOf(0.03).key).toBe("3-6")
    expect(bucketOf(0.06).key).toBe("6-10")
    expect(bucketOf(0.1).key).toBe("10+")
    expect(bucketOf(0.9).key).toBe("10+")
  })
})

describe("calibrate", () => {
  test("compares the average shown chance with the share that got an interview", () => {
    const b = at(calibrate([...rows(20, 0.07, 2)], NOW), "6-10")
    expect(b.enough).toBe(true)
    expect(b.answered).toBe(20)
    expect(b.shown).toBeCloseTo(0.07)
    expect(b.actual).toBeCloseTo(0.1)
  })

  test("under 10 answers gives no figure at all, only the count", () => {
    const b = at(calibrate(rows(MIN_ANSWERED - 1, 0.07, 3), NOW), "6-10")
    expect(b.enough).toBe(false)
    expect(b.answered).toBe(9)
    expect(b.shown).toBeNull()
    expect(b.actual).toBeNull()
  })

  test("exactly 10 answers is enough", () => {
    expect(at(calibrate(rows(10, 0.02, 1), NOW), "1-3").enough).toBe(true)
  })

  test("no answer yet is never counted, not as a miss and not as an answer", () => {
    const list = [...rows(10, 0.07, 1), ...Array.from({ length: 50 }, () => ({ chance: 0.07, applied_on: old, outcome: null }) as CalibrationRow)]
    const b = at(calibrate(list, NOW), "6-10")
    expect(b.answered).toBe(10)
    expect(b.old).toBe(60)
    expect(b.actual).toBeCloseTo(0.1)
  })

  test("a recorded no reply is an answer that was not an interview", () => {
    const list: CalibrationRow[] = Array.from({ length: 10 }, (_, i) => ({ chance: 0.04, applied_on: old, outcome: i === 0 ? "interview" : "no_reply" }))
    expect(at(calibrate(list, NOW), "3-6").actual).toBeCloseTo(0.1)
  })

  test("applications younger than 21 days are left out", () => {
    const list = [...rows(10, 0.07, 5, "2026-10-01"), ...rows(10, 0.07, 1, old)]
    const b = at(calibrate(list, NOW), "6-10")
    expect(b.answered).toBe(10)
    expect(b.actual).toBeCloseTo(0.1)
    // exactly 21 days old counts
    expect(at(calibrate(rows(10, 0.07, 1, "2026-09-27"), NOW), "6-10").enough).toBe(true)
    expect(at(calibrate(rows(10, 0.07, 1, "2026-09-28"), NOW), "6-10").enough).toBe(false)
  })

  test("bad rows are ignored and every bucket is returned", () => {
    const list = [{ chance: NaN, applied_on: old, outcome: "interview" }, { chance: 0.05, applied_on: "nope", outcome: "interview" }] as CalibrationRow[]
    const out = calibrate(list, NOW)
    expect(out).toHaveLength(5)
    expect(out.every((b) => b.answered === 0 && b.actual === null)).toBe(true)
  })

  test("empty input", () => {
    expect(calibrate([], NOW).every((b) => !b.enough && b.old === 0)).toBe(true)
  })
})

describe("fromPooled", () => {
  test("applies the too-few rule even if the server sent numbers", () => {
    const out = fromPooled([{ bucket: "6-10", answered: 9, interviews: 1, mean_chance: 0.07 }])
    expect(at(out, "6-10").enough).toBe(false)
    expect(at(out, "6-10").actual).toBeNull()
  })

  test("uses the counts when there are enough, and missing buckets are empty", () => {
    const out = fromPooled([{ bucket: "1-3", answered: 40, interviews: 2, mean_chance: 0.021 }])
    expect(at(out, "1-3").actual).toBeCloseTo(0.05)
    expect(at(out, "1-3").shown).toBeCloseTo(0.021)
    expect(at(out, "10+").answered).toBe(0)
  })

  test("server-suppressed rows (null figures) stay not enough", () => {
    expect(at(fromPooled([{ bucket: "3-6", answered: 25, interviews: null, mean_chance: null }]), "3-6").enough).toBe(false)
  })
})

describe("callsIn100", () => {
  test("a whole number only when the bucket has enough", () => {
    const enough = calibrate(rows(30, 0.07, 3), NOW)
    expect(callsIn100(enough, 0.08)).toBe(10)
    expect(callsIn100(enough, 0.02)).toBeNull()
    expect(callsIn100(calibrate(rows(9, 0.07, 3), NOW), 0.07)).toBeNull()
  })
})
