import { describe, expect, test } from "bun:test"
import { NO_FILTERS } from "@/lib/filters"
import { SEED_VIEWS, addView, duplicateView, normalizeViews, removeView, renameView, updateView } from "@/lib/saved-views"
import { NO_TRACKER_FILTER } from "@/lib/tracker"

describe("the starting set", () => {
  test("follows the templates: a table, a pipeline board and a calendar", () => {
    expect(SEED_VIEWS.map((v) => v.name)).toEqual(["All jobs", "Pipeline", "Calendar"])
    expect(SEED_VIEWS.map((v) => v.layout)).toEqual(["table", "board", "calendar"])
    expect(new Set(SEED_VIEWS.map((v) => v.id)).size).toBe(SEED_VIEWS.length)
  })
})

describe("normalizeViews", () => {
  test("nothing stored means the starting set, as copies", () => {
    const v = normalizeViews(undefined)
    expect(v).toHaveLength(SEED_VIEWS.length)
    expect(v[0]).not.toBe(SEED_VIEWS[0])
  })
  test("keeps good views, drops bad ones, repairs a layout", () => {
    const v = normalizeViews([
      { id: "a", name: "Mine", layout: "board", filters: { query: "x" }, tracker: { status: ["applied"] } },
      { id: "a", name: "Duplicate id", layout: "table" },
      { id: "", name: "No id" },
      { id: "b", name: "  ", layout: "table" },
      { id: "c", name: "Weird", layout: "kanban", dateKey: "applied" },
      "junk",
      null,
    ])
    expect(v.map((x) => x.id)).toEqual(["a", "c"])
    expect(v[0].filters.query).toBe("x")
    expect(v[0].tracker.status).toEqual(["applied"])
    expect(v[1].layout).toBe("table")
    expect(v[1].dateKey).toBe("applied")
  })
  test("a stored empty or unusable list falls back to the starting set", () => {
    expect(normalizeViews([])).toHaveLength(SEED_VIEWS.length)
    expect(normalizeViews([{ nothing: true }])).toHaveLength(SEED_VIEWS.length)
  })
  test("names are kept short", () => {
    expect(normalizeViews([{ id: "a", name: "x".repeat(100), layout: "table" }])[0].name).toHaveLength(40)
  })
})

describe("changing the set", () => {
  const base = SEED_VIEWS.map((v) => ({ ...v }))
  test("addView appends with a fresh id, a calendar by Date applied", () => {
    const { views, added } = addView(base, " Waiting ", "calendar")
    expect(views).toHaveLength(base.length + 1)
    expect(views[views.length - 1]).toBe(added)
    expect(added.name).toBe("Waiting")
    expect(added.dateKey).toBe("applied")
    expect(base.some((v) => v.id === added.id)).toBe(false)
    expect(addView(base, "  ", "table").added.name).toBe("New view")
  })
  test("addView can start from the filters you have now", () => {
    const { added } = addView(base, "Mine", "table", { filters: { ...NO_FILTERS, query: "bank" }, tracker: { ...NO_TRACKER_FILTER, hideClosed: true } })
    expect(added.filters.query).toBe("bank")
    expect(added.tracker.hideClosed).toBe(true)
  })
  test("rename, update, remove", () => {
    expect(renameView(base, "all", "Everything")[0].name).toBe("Everything")
    expect(renameView(base, "all", "   ")[0].name).toBe("All jobs")
    expect(updateView(base, "pipeline", { layout: "table" })[1].layout).toBe("table")
    expect(removeView(base, "pipeline").map((v) => v.id)).not.toContain("pipeline")
  })
  test("the last view cannot be removed", () => {
    expect(removeView([base[0]], "all")).toHaveLength(1)
  })
  test("duplicate goes right after the original, with its own id and a copy name", () => {
    const { views, added } = duplicateView(base, "all")
    expect(views[1]).toBe(added)
    expect(added!.name).toBe("All jobs copy")
    expect(added!.id).not.toBe("all")
    expect(duplicateView(base, "nope").added).toBeNull()
  })
})
