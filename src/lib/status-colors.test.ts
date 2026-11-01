import { describe, expect, test } from "bun:test"
import { COLOR_CHOICES, DEFAULT_PERSON_COLORS, DEFAULT_STATUS_COLORS, PERSON_STAGES, STATUS_KEYS, inkOn, isHex, lookOf, personColors, personKey, personLook, statusColors } from "@/lib/status-colors"
import { CONTACT_STATUSES } from "@/lib/types"

describe("inkOn", () => {
  test("white on dark colours, black on light ones", () => {
    expect(inkOn("#111827")).toBe("#ffffff")
    expect(inkOn("#DC2626")).toBe("#ffffff")
    expect(inkOn("#16A34A")).toBe("#ffffff")
    expect(inkOn("#F97316")).toBe("#ffffff")
    expect(inkOn("#FBBF24")).toBe("#000000")
    expect(inkOn("#2563EB")).toBe("#ffffff")
    expect(inkOn("#9CA3AF")).toBe("#000000")
    expect(inkOn("#ffffff")).toBe("#000000")
  })
  test("every starting colour and every choice has a readable ink", () => {
    for (const hex of [...Object.values(DEFAULT_STATUS_COLORS), ...COLOR_CHOICES.map((c) => c.hex)]) {
      expect(isHex(hex)).toBe(true)
      expect(["#000000", "#ffffff"]).toContain(inkOn(hex))
    }
  })
})

describe("statusColors", () => {
  test("starts from the defaults", () => {
    expect(statusColors(undefined)).toEqual(DEFAULT_STATUS_COLORS)
    expect(Object.keys(statusColors({}))).toEqual(STATUS_KEYS.map((s) => s.key))
  })
  test("takes a person's valid choices and ignores anything else", () => {
    const c = statusColors({ applied: "#2563EB", offer: "green", rejected: 12, interview: "#12345", nonsense: "#000000" })
    expect(c.applied).toBe("#2563EB")
    expect(c.offer).toBe(DEFAULT_STATUS_COLORS.offer)
    expect(c.rejected).toBe(DEFAULT_STATUS_COLORS.rejected)
    expect(c.interview).toBe(DEFAULT_STATUS_COLORS.interview)
    expect((c as Record<string, string>).nonsense).toBeUndefined()
  })
})

describe("lookOf", () => {
  test("a colour and its ink; hired looks like offer; not saved has none", () => {
    expect(lookOf("applied", DEFAULT_STATUS_COLORS)).toEqual({ background: "#16A34A", ink: "#ffffff" })
    expect(lookOf("hired", DEFAULT_STATUS_COLORS)).toEqual(lookOf("offer", DEFAULT_STATUS_COLORS))
    expect(lookOf("none", DEFAULT_STATUS_COLORS)).toBeNull()
  })
})

describe("outreach stage colours", () => {
  test("every stage of the outreach has a colour, and the stages are the app's", () => {
    expect([...PERSON_STAGES]).toEqual([...CONTACT_STATUSES])
    for (const stage of PERSON_STAGES) expect(isHex(DEFAULT_PERSON_COLORS[stage])).toBe(true)
  })
  test("a person's valid choice wins, anything else is ignored", () => {
    const c = personColors({ [personKey("Met")]: "#2563EB", [personKey("Replied")]: "blue", applied: "#000000" })
    expect(c.Met).toBe("#2563EB")
    expect(c.Replied).toBe(DEFAULT_PERSON_COLORS.Replied)
    expect(personColors(undefined)).toEqual(DEFAULT_PERSON_COLORS)
  })
  test("a look has readable ink; an unknown stage has none", () => {
    expect(personLook("Contacted", DEFAULT_PERSON_COLORS)).toEqual({ background: "#FBBF24", ink: "#000000" })
    expect(personLook("Met", DEFAULT_PERSON_COLORS)?.ink).toBe("#ffffff")
    expect(personLook("Nope", DEFAULT_PERSON_COLORS)).toBeNull()
  })
  test("job statuses and outreach stages do not share keys", () => {
    expect(statusColors({ [personKey("Met")]: "#2563EB" }).saved).toBe(DEFAULT_STATUS_COLORS.saved)
  })
})
