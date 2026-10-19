import { expect, test } from "bun:test"
import { chanceSentence, point } from "@/lib/engine"

test("the interview chance reads the same everywhere: the big number and the sentence under it carry one rounding", () => {
  for (const p of [0.004, 0.071, 0.0949, 0.095, 0.12, 0.5]) {
    const big = point(p)
    expect(chanceSentence(p)).toBe(`${big.replace("%", "")} in 100 similar applicants get a call`)
  }
  // Below 9.5% one decimal (7.1), from there whole numbers (12): never "7" in one place and "7.1" in another.
  expect(point(0.071)).toBe("7.1%")
  expect(chanceSentence(0.071)).toBe("7.1 in 100 similar applicants get a call")
  expect(chanceSentence(0.12)).toBe("12 in 100 similar applicants get a call")
})
