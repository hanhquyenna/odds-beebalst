import { describe, expect, test } from "bun:test"
import { placeOf } from "@/lib/format"

describe("placeOf", () => {
  const cases: Array<[string | null, string]> = [
    [null, "Not stated"], ["", "Not stated"], ["   ", "Not stated"], [";", "Not stated"],
    ["Amsterdam", "Amsterdam"], ["Amsterdam, NL", "Amsterdam, NL"], ["Utrecht, Netherlands", "Utrecht"], ["Netherlands", "Netherlands"],
    ["Utrecht Croeselaan 18", "Utrecht Croeselaan 18"],
    ["Amsterdam; Madrid; Luxembourg", "Amsterdam, +2 more"], ["Nijmegen; Hamburg", "Nijmegen, +1 more"],
    ["Amsterdam; Munich; Paris; Madrid; Vienna; Copenhagen (+2 more)", "Amsterdam, +7 more"],
    ["Amsterdam | Rotterdam", "Amsterdam, +1 more"], [" Delft ;  Leiden ", "Delft, +1 more"],
  ]
  for (const [input, want] of cases) {
    test(`${JSON.stringify(input)} → ${want}`, () => expect(placeOf(input)).toBe(want))
  }
  test("is never empty", () => {
    for (const r of [null, "", "x", ";;", "(+3 more)"]) expect(placeOf(r).length).toBeGreaterThan(0)
  })
})
