import { describe, expect, test } from "bun:test"
import { PEOPLE_PRESETS, PROPERTY_PRESETS, addColumn, availablePresets, columnsOf, removeColumn, setNote } from "@/lib/columns"
import { DEFAULT_PROFILE } from "@/lib/types"

describe("addColumn", () => {
  test("adds a property with its type, and a select with its choices", () => {
    const p = addColumn(DEFAULT_PROFILE, "Priority", "select", ["High", "Medium", "High", " Low "])
    expect(p.columns).toEqual(["Priority"])
    expect(p.columnTypes.Priority).toBe("select")
    expect(p.columnOptions?.Priority).toEqual(["High", "Medium", "Low"])
    expect(DEFAULT_PROFILE.columns).toEqual([])
  })
  test("a duplicate (any case) or empty name changes nothing", () => {
    const p = addColumn(DEFAULT_PROFILE, "Notes", "text")
    expect(addColumn(p, "notes", "date")).toBe(p)
    expect(addColumn(p, "  ", "text")).toBe(p)
  })
  test("choices are only kept for a select", () => {
    expect(addColumn(DEFAULT_PROFILE, "Deadline", "date", ["x"]).columnOptions).toBeUndefined()
  })
})

describe("availablePresets and removeColumn", () => {
  test("the presets offered are the ones not added yet", () => {
    expect(availablePresets(DEFAULT_PROFILE)).toHaveLength(PROPERTY_PRESETS.length)
    const p = addColumn(DEFAULT_PROFILE, "priority", "select", ["High"])
    expect(availablePresets(p).map((x) => x.name)).not.toContain("Priority")
  })
  test("every preset select has choices, and every preset has a hint", () => {
    for (const preset of PROPERTY_PRESETS) {
      expect(preset.hint.length).toBeGreaterThan(3)
      if (preset.type === "select") expect(preset.options?.length).toBeGreaterThan(1)
    }
  })
  test("removing a property takes its values and choices too", () => {
    let p = addColumn(DEFAULT_PROFILE, "Priority", "select", ["High", "Low"])
    p = { ...p, notes: { job1: { Priority: "High", Other: "x" } } }
    const r = removeColumn(p, "Priority")
    expect(r.columns).toEqual([])
    expect(r.notes.job1).toEqual({ Other: "x" })
    expect(r.columnOptions).toEqual({})
    expect(r.columnTypes.Priority).toBeUndefined()
  })
})

describe("people have their own properties, apart from the jobs'", () => {
  test("added under the people fields, leaving the jobs' alone", () => {
    const p = addColumn(DEFAULT_PROFILE, "Warmth", "select", ["Cold", "Warm", "Hot"], "people")
    expect(p.peopleColumns).toEqual(["Warmth"])
    expect(p.peopleColumnTypes?.Warmth).toBe("select")
    expect(p.peopleColumnOptions?.Warmth).toEqual(["Cold", "Warm", "Hot"])
    expect(p.columns).toEqual([])
    expect(columnsOf(p, "people").columns).toEqual(["Warmth"])
    expect(columnsOf(p, "jobs").columns).toEqual([])
  })
  test("the same name may exist on both tables", () => {
    const j = addColumn(DEFAULT_PROFILE, "Next action", "text")
    const both = addColumn(j, "Next action", "text", undefined, "people")
    expect(both.columns).toEqual(["Next action"])
    expect(both.peopleColumns).toEqual(["Next action"])
    expect(addColumn(both, "next action", "text", undefined, "people")).toBe(both)
  })
  test("people presets: every select has choices, and the ones added are no longer offered", () => {
    for (const preset of PEOPLE_PRESETS) {
      expect(preset.hint.length).toBeGreaterThan(3)
      if (preset.type === "select") expect(preset.options?.length).toBeGreaterThan(1)
    }
    const p = addColumn(DEFAULT_PROFILE, "Channel", "select", ["LinkedIn", "Email"], "people")
    expect(availablePresets(p, "people").map((x) => x.name)).not.toContain("Channel")
    expect(availablePresets(p, "jobs").map((x) => x.name)).toContain("Priority")
  })
  test("values are kept per person and removed with the property", () => {
    let p = addColumn(DEFAULT_PROFILE, "Warmth", "select", ["Cold", "Warm"], "people")
    p = setNote(p, "people", "person1", "Warmth", "Warm")
    expect(columnsOf(p, "people").notes.person1).toEqual({ Warmth: "Warm" })
    const r = removeColumn(p, "Warmth", "people")
    expect(r.peopleColumns).toEqual([])
    expect(columnsOf(r, "people").notes.person1).toEqual({})
    expect(r.peopleColumnOptions).toEqual({})
  })
})
