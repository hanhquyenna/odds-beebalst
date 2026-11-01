import { useMemo, useState } from "react"
import { useData } from "@/lib/data"
import { NO_PEOPLE_FILTER, PEOPLE_SEED_CONFIG, PEOPLE_SEED_VIEWS, normalizePeopleViews, type PeopleFilter } from "@/lib/people-table"
import { readStored, store } from "@/lib/remembered"
import { duplicateView, newId, removeView, renameView, updateView } from "@/lib/saved-views"
import type { SavedPeopleView, ViewConfig, ViewLayout } from "@/lib/types"

const KEY = "odds:people-view"

/**
 * The views of the people you write to, as tabs, the same way the jobs have them: each its own layout and filter over the same people, kept with the profile as you change
 * them. The search words are only for now. The sort, grouping and shown properties of a view are kept in `views` under "pv:" and its id.
 */
export function usePeopleViews(): {
  views: SavedPeopleView[]
  active: SavedPeopleView
  configName: `pv:${string}`
  query: string
  setQuery: (q: string) => void
  select: (id: string) => void
  setFilter: (next: PeopleFilter) => void
  setLayout: (layout: ViewLayout) => void
  setDateKey: (key: string) => void
  add: (name: string, layout: ViewLayout, fromCurrent: boolean) => void
  rename: (id: string, name: string) => void
  duplicate: (id: string) => void
  remove: (id: string) => void
  reset: () => void
} {
  const data = useData()
  const { profile } = data
  const views = useMemo(() => normalizePeopleViews(profile.peopleViews), [profile.peopleViews])
  const [activeId, setActiveId] = useState<string | null>(() => readStored(KEY))
  const [query, setQuery] = useState<string>("")
  const active = views.find((v) => v.id === activeId) ?? views[0]

  const select = (id: string): void => {
    setActiveId(id)
    setQuery("")
    store(KEY, id)
  }
  const save = (next: SavedPeopleView[], extra?: Record<string, ViewConfig | undefined>): void => {
    data.setProfile({ ...profile, peopleViews: next, ...(extra ? { views: { ...profile.views, ...extra } } : {}) })
  }
  const configOf = (id: string): ViewConfig | undefined => profile.views?.[`pv:${id}`] ?? (PEOPLE_SEED_CONFIG[id] ? { hidden: [], sortKey: "", sortDir: "desc", ...PEOPLE_SEED_CONFIG[id] } : undefined)

  return {
    views,
    active,
    configName: `pv:${active.id}`,
    query,
    setQuery,
    select,
    setFilter: (next) => save(updateView(views, active.id, { filter: next })),
    setLayout: (layout) => save(updateView(views, active.id, { layout, ...(layout === "calendar" && !active.dateKey ? { dateKey: "nudge" } : {}) })),
    setDateKey: (key) => save(updateView(views, active.id, { dateKey: key })),
    add: (name, layout, fromCurrent) => {
      const added: SavedPeopleView = { id: newId(views), name: name.trim().slice(0, 40) || "New view", layout, filter: fromCurrent ? active.filter : NO_PEOPLE_FILTER, ...(layout === "calendar" ? { dateKey: "nudge" } : {}) }
      save([...views, added], fromCurrent && configOf(active.id) ? { [`pv:${added.id}`]: configOf(active.id) } : undefined)
      select(added.id)
    },
    rename: (id, name) => save(renameView(views, id, name)),
    duplicate: (id) => {
      const { views: next, added } = duplicateView(views, id)
      if (added) {
        save(next, configOf(id) ? { [`pv:${added.id}`]: configOf(id) } : undefined)
        select(added.id)
      }
    },
    remove: (id) => {
      const next = removeView(views, id)
      if (next.length === views.length) return
      const { [`pv:${id}`]: _gone, ...rest } = profile.views as Record<string, ViewConfig | undefined>
      void _gone
      data.setProfile({ ...profile, peopleViews: next, views: rest })
      if (active.id === id) select(next[0].id)
    },
    reset: () => {
      const rest = Object.fromEntries(Object.entries(profile.views ?? {}).filter(([k]) => !k.startsWith("pv:")))
      data.setProfile({ ...profile, peopleViews: undefined, views: rest })
      select(PEOPLE_SEED_VIEWS[0].id)
    },
  }
}
