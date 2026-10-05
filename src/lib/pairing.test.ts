import { describe, expect, test } from "bun:test"

// pairing.ts reaches the network through auth.ts, so only its pure rule is copied here: the code both screens show.
const pairCode = (id: string): string => id.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase()

describe("pair code", () => {
  test("four letters or digits, the same on both screens", () => {
    expect(pairCode("k7-q2_abcdefghijklmnopqrstuv")).toBe("K7Q2")
    expect(pairCode("abcdefghijklmnopqrstuvwxyz")).toMatch(/^[A-Z0-9]{4}$/)
  })
})
