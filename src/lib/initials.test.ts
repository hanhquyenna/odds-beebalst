import { describe, expect, test } from "bun:test"
import { hueOf, initialsOf } from "./initials"

describe("initialsOf", () => {
  test("first and last name", () => {
    expect(initialsOf("Alex Terpstra")).toBe("AT")
    expect(initialsOf("Marco van Veen")).toBe("MV")
    expect(initialsOf("Wesley van Barlingen")).toBe("WB")
    expect(initialsOf("Rob K.")).toBe("RK")
  })
  test("credentials, roles after a comma and emoji are left out", () => {
    expect(initialsOf("Mina Abdolah Zadeh, PhD")).toBe("MZ")
    expect(initialsOf("Bas Smeitink FRM")).toBe("BS")
    expect(initialsOf("Mashrur Haider 🕶️")).toBe("MH")
    expect(initialsOf("Karin Schmitz / Amsterdam")).toBe("KS")
    expect(initialsOf("Jessica R.")).toBe("JR")
  })
  test("one word, accents, and nothing readable", () => {
    expect(initialsOf("Madonna")).toBe("M")
    expect(initialsOf("Özge Öneyman")).toBe("ÖÖ")
    expect(initialsOf("   ")).toBe("?")
    expect(initialsOf("👋👋")).toBe("?")
  })
})
describe("hueOf", () => {
  test("the same name always gets the same colour, in range", () => {
    expect(hueOf("Alex Terpstra")).toBe(hueOf(" alex terpstra "))
    expect(hueOf("Alex Terpstra")).toBeGreaterThanOrEqual(0)
    expect(hueOf("Alex Terpstra")).toBeLessThan(360)
    expect(hueOf("Alex Terpstra")).not.toBe(hueOf("Sven Harris"))
  })
})
