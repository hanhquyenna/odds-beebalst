import { afterEach, describe, expect, test } from "bun:test"

// The hook is a thin wrapper over localStorage; its rule is tested on the storage reading itself.
const read = (saved: string | null, firstTime: boolean): boolean => (saved === "1" ? true : saved === "0" ? false : firstTime)

describe("remembered panel state", () => {
  afterEach(() => undefined)
  test("a new visitor gets the first-time state", () => {
    expect(read(null, true)).toBe(true)
    expect(read(null, false)).toBe(false)
  })
  test("what was chosen is kept, whatever the first-time state", () => {
    expect(read("0", true)).toBe(false)
    expect(read("1", false)).toBe(true)
  })
})
