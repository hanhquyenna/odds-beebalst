import { DEFAULT_FILTERS, NO_FILTERS, normalizeFilters, type JobFilters } from "@/lib/filters"
import { NO_TRACKER_FILTER, normalizeTrackerFilter } from "@/lib/tracker"
import type { SavedView, ViewConfig, ViewLayout } from "@/lib/types"

/**
 * The views of the job tracker, as tabs over one list of jobs (the idea of a Notion database). The starting set follows the popular job-tracker templates: everything in
 * a table, a pipeline board by status, a list of follow-ups that are due, the interviews, and a calendar. Nothing is stored until you change something; then your set is
 * kept with the profile and the starting set no longer applies.
 */
export const SEED_VIEWS: ReadonlyArray<SavedView> = [
  { id: "all", name: "All jobs", layout: "table", filters: NO_FILTERS, tracker: NO_TRACKER_FILTER },
  { id: "pipeline", name: "Pipeline", layout: "board", filters: NO_FILTERS, tracker: NO_TRACKER_FILTER },
  { id: "calendar", name: "Calendar", layout: "calendar", filters: NO_FILTERS, tracker: NO_TRACKER_FILTER, dateKey: "applied" },
]

/** The views of the jobs that fit you start as one table, the same as your own jobs: first jobs, best fit first (a job that needs Dutch ranks lower by itself). */
export const FIT_SEED_VIEWS: ReadonlyArray<SavedView> = [{ id: "fit", name: "Best fit", layout: "table", filters: { ...DEFAULT_FILTERS, language: [] }, tracker: NO_TRACKER_FILTER }]

/** What a seed view starts with besides its filters. */
export const SEED_CONFIG: Record<string, Partial<ViewConfig>> = {}

const LAYOUTS: ReadonlyArray<ViewLayout> = ["list", "table", "board", "calendar"]

/** Reads views back from storage: anything malformed is dropped, a view with a bad layout becomes a table, and with none left the starting set is used. */
export function normalizeViews(raw: unknown, seed: ReadonlyArray<SavedView> = SEED_VIEWS): SavedView[] {
  if (!Array.isArray(raw)) {
    return seed.map((v) => ({ ...v }))
  }
  const seen = new Set<string>()
  const out: SavedView[] = []
  for (const item of raw) {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>
    const id = typeof r.id === "string" && r.id.trim() ? r.id : null
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 40) : null
    if (!id || !name || seen.has(id)) {
      continue
    }
    seen.add(id)
    out.push({
      id,
      name,
      layout: LAYOUTS.includes(r.layout as ViewLayout) ? (r.layout as ViewLayout) : "table",
      filters: normalizeFilters(r.filters),
      tracker: normalizeTrackerFilter(r.tracker),
      ...(typeof r.dateKey === "string" ? { dateKey: r.dateKey } : {}),
    })
  }

  return out.length > 0 ? out : seed.map((v) => ({ ...v }))
}

export const newId = (taken: ReadonlyArray<{ id: string }>): string => {
  let id = ""
  do {
    id = Math.random().toString(36).slice(2, 8)
  } while (taken.some((v) => v.id === id))

  return id
}

/** Adds a view (named, in a layout) after the others, with the given filters, and returns the new set and the new view. */
export function addView(views: ReadonlyArray<SavedView>, name: string, layout: ViewLayout, base?: { filters: JobFilters; tracker: SavedView["tracker"] }): { views: SavedView[]; added: SavedView } {
  const added: SavedView = { id: newId(views), name: name.trim().slice(0, 40) || "New view", layout, filters: base?.filters ?? NO_FILTERS, tracker: base?.tracker ?? NO_TRACKER_FILTER, ...(layout === "calendar" ? { dateKey: "applied" } : {}) }

  return { views: [...views, added], added }
}

export const renameView = <V extends { id: string; name: string }>(views: ReadonlyArray<V>, id: string, name: string): V[] => views.map((v) => (v.id === id && name.trim() ? { ...v, name: name.trim().slice(0, 40) } : v))

export const updateView = <V extends { id: string }>(views: ReadonlyArray<V>, id: string, patch: Partial<Omit<V, "id">>): V[] => views.map((v) => (v.id === id ? { ...v, ...patch } : v))

/** Takes a view away. The last one cannot be deleted: there is always a view to look at. */
export function removeView<V extends { id: string }>(views: ReadonlyArray<V>, id: string): V[] {
  return views.length <= 1 ? [...views] : views.filter((v) => v.id !== id)
}

/** A copy of a view, right after it, with its filters and settings. The settings (sort, group, shown properties) are copied by the caller under the new id. */
export function duplicateView<V extends { id: string; name: string }>(views: ReadonlyArray<V>, id: string): { views: V[]; added: V | null } {
  const at = views.findIndex((v) => v.id === id)
  if (at < 0) {
    return { views: [...views], added: null }
  }
  const added: V = { ...views[at], id: newId(views), name: `${views[at].name} copy`.slice(0, 40) }

  return { views: [...views.slice(0, at + 1), added, ...views.slice(at + 1)], added }
}
