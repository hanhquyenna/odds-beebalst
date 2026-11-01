import { useMemo, useState } from "react"
import { useData } from "@/lib/data"
import type { JobFilters } from "@/lib/filters"
import { readStored, store } from "@/lib/remembered"
import { FIT_SEED_VIEWS, SEED_CONFIG, SEED_VIEWS, addView, duplicateView, normalizeViews, removeView, renameView, updateView } from "@/lib/saved-views"
import type { TrackerFilter } from "@/lib/tracker"
import type { SavedView, ViewConfig, ViewLayout } from "@/lib/types"

/**
 * The tracker's views as tabs: which one is open, and every way to change them. Changes are kept with the profile as they are made, like a Notion database: the filters,
 * layout and sort of the open view are that view's, so the next visit finds it as it was left. The search words are the one thing not kept (they are only for now).
 */
export function useSavedViews(kind: "jobs" | "fit" = "jobs"): {
  views: SavedView[]
  active: SavedView
  /** The name under which the open view keeps its sort, grouping and shown properties. */
  configName: `v:${string}`
  filters: JobFilters
  select: (id: string) => void
  setFilters: (next: JobFilters) => void
  setTracker: (next: TrackerFilter) => void
  setLayout: (layout: ViewLayout) => void
  setDateKey: (key: string) => void
  add: (name: string, layout: ViewLayout, fromCurrent: boolean) => void
  rename: (id: string, name: string) => void
  duplicate: (id: string) => void
  remove: (id: string) => void
  /** Back to the starting set of views, and the sort, grouping and shown properties each had. Your filters and layouts in them are lost. */
  reset: () => void
} {
  const data = useData()
  const { profile } = data
  // Your own jobs and the jobs that fit you each keep their own views, their own open tab and their own sort, grouping and properties.
  const fit = kind === "fit"
  const field = fit ? "fitViews" : "savedViews"
  const seed = fit ? FIT_SEED_VIEWS : SEED_VIEWS
  const prefix = fit ? "fit-" : ""
  const storeKey = fit ? "odds:fit-view" : "odds:tracker-view"
  const views = useMemo(() => normalizeViews(profile[field], seed), [profile, field, seed])
  const [activeId, setActiveId] = useState<string | null>(() => readStored(storeKey))
  const active = views.find((v) => v.id === activeId) ?? views[0]
  const [query, setQuery] = useState<string>("")

  const select = (id: string): void => {
    setActiveId(id)
    setQuery("")
    store(storeKey, id)
  }
  const save = (next: SavedView[], extraViews?: Record<string, ViewConfig | undefined>): void => {
    data.setProfile({ ...profile, [field]: next, ...(extraViews ? { views: { ...profile.views, ...extraViews } } : {}) })
  }
  const configOf = (id: string): ViewConfig | undefined => profile.views?.[`v:${prefix}${id}`] ?? (SEED_CONFIG[id] ? { hidden: [], sortKey: "", sortDir: "desc", ...SEED_CONFIG[id] } : undefined)

  return {
    views,
    active,
    configName: `v:${prefix}${active.id}`,
    filters: { ...active.filters, query },
    select,
    setFilters: (next) => {
      if (next.query !== query) setQuery(next.query)
      const { query: _query, ...rest } = next
      void _query
      if (JSON.stringify({ ...rest, query: "" }) !== JSON.stringify({ ...active.filters, query: "" })) {
        save(updateView(views, active.id, { filters: { ...rest, query: "" } }))
      }
    },
    setTracker: (next) => save(updateView(views, active.id, { tracker: next })),
    setLayout: (layout) => save(updateView(views, active.id, { layout, ...(layout === "calendar" && !active.dateKey ? { dateKey: "applied" } : {}) })),
    setDateKey: (key) => save(updateView(views, active.id, { dateKey: key })),
    add: (name, layout, fromCurrent) => {
      const { views: next, added } = addView(views, name, layout, fromCurrent ? { filters: { ...active.filters, query: "" }, tracker: active.tracker } : undefined)
      save(next, fromCurrent && configOf(active.id) ? { [`v:${prefix}${added.id}`]: configOf(active.id) } : undefined)
      select(added.id)
    },
    rename: (id, name) => save(renameView(views, id, name)),
    duplicate: (id) => {
      const { views: next, added } = duplicateView(views, id)
      if (added) {
        save(next, configOf(id) ? { [`v:${prefix}${added.id}`]: configOf(id) } : undefined)
        select(added.id)
      }
    },
    reset: () => {
      const rest = Object.fromEntries(Object.entries(profile.views ?? {}).filter(([k]) => (fit ? !k.startsWith("v:fit-") : !k.startsWith("v:") || k.startsWith("v:fit-"))))
      data.setProfile({ ...profile, [field]: undefined, views: rest })
      select(seed[0].id)
    },
    remove: (id) => {
      const next = removeView(views, id)
      if (next.length === views.length) return
      const { [`v:${prefix}${id}`]: _gone, ...rest } = profile.views as Record<string, ViewConfig | undefined>
      void _gone
      data.setProfile({ ...profile, [field]: next, views: rest })
      if (active.id === id) select(next[0].id)
    },
  }
}
