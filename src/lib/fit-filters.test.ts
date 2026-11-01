import { describe, expect, test } from "bun:test"
import { DEFAULT_FILTERS } from "@/lib/filters"
import { fitFilters, savedFitFilters, withFitLanguage } from "@/lib/fit-filters"
import { DEFAULT_PROFILE } from "@/lib/types"

describe("jobs that fit you", () => {
  test("English unless a language is chosen", () => {
    expect(withFitLanguage({ ...DEFAULT_FILTERS, language: [] }).language).toEqual(["english"])
    expect(withFitLanguage({ ...DEFAULT_FILTERS, language: ["dutch"] }).language).toEqual(["dutch"])
    // Both ticked is every job, and stays that way.
    expect(withFitLanguage({ ...DEFAULT_FILTERS, language: ["english", "dutch"] }).language).toEqual(["english", "dutch"])
  })

  test("the server reads the same thing from a saved profile, old views included", () => {
    expect(savedFitFilters({}).language).toEqual(["english"])
    expect(savedFitFilters(null).language).toEqual(["english"])
    // Views saved before English was the default held no language.
    const old = { fitViews: [{ id: "fit", name: "Best fit", layout: "table" as const, filters: { ...DEFAULT_FILTERS, language: [] }, tracker: { status: [], stage: [] } }] }
    expect(savedFitFilters(old as never).language).toEqual(["english"])
  })

  test("a chosen line of work wins over the profile's", () => {
    const profile = { ...DEFAULT_PROFILE }
    expect(fitFilters({ ...DEFAULT_FILTERS, field: ["Finance & accounting"] }, profile, ["Marketing & communications"]).field).toEqual(["Finance & accounting"])
    expect(fitFilters({ ...DEFAULT_FILTERS }, profile, ["Marketing & communications"]).field).toEqual(["Marketing & communications"])
  })
})
