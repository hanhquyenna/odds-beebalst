import { useData } from "@/lib/data"
import { HIDDEN_AT_START } from "@/lib/properties"
import { PEOPLE_SEED_CONFIG } from "@/lib/people-table"
import { SEED_CONFIG } from "@/lib/saved-views"
import type { ViewConfig, ViewName } from "@/lib/types"

const EMPTY: ViewConfig = { hidden: [], sortKey: "", sortDir: "desc" }
/** What each view starts with. The board's cards are small, so they start without the long-tail properties. */
const START: Record<"table" | "board" | "people" | "peopleBoard", ViewConfig> = { table: EMPTY, people: EMPTY, peopleBoard: EMPTY, board: { hidden: ["industry", "language", "sponsor"], sortKey: "", sortDir: "desc" } }

/** Where a view starts: a saved view of jobs ("v:") or of people ("pv:") from its seed settings, if it has any; the others from their own starting point. */
function seedOf(view: ViewName): ViewConfig {
  if (view.startsWith("pv:")) return { ...EMPTY, ...PEOPLE_SEED_CONFIG[view.slice(3)] }
  if (view.startsWith("v:")) return { ...EMPTY, ...SEED_CONFIG[view.slice(2)] }

  return START[view as keyof typeof START]
}

/** One view's settings and the ways to change them. Stored with the profile, so they follow the person. */
export function useViewConfig(view: ViewName): { config: ViewConfig; show: (key: string) => boolean; toggle: (key: string) => void; update: (patch: Partial<ViewConfig>) => void; reset: () => void } {
  const data = useData()
  // A saved view ("v:" and its id) starts from the seed settings of that view, if it has any; the others from their own starting point.
  const config = { ...seedOf(view), ...data.profile.views?.[view] }
  // A property that starts hidden is shown only once chosen; any other is shown unless hidden.
  const show = (key: string): boolean => (HIDDEN_AT_START.has(key) ? Boolean(config.shown?.includes(key)) : !config.hidden.includes(key))
  const update = (patch: Partial<ViewConfig>): void => data.setProfile({ ...data.profile, views: { ...data.profile.views, [view]: { ...config, ...patch } } })

  return {
    config,
    show,
    // Showing or hiding one property: one that starts hidden is turned on by listing it in `shown`, any other by taking it out of `hidden`.
    toggle: (key) => {
      if (HIDDEN_AT_START.has(key)) {
        const shown = config.shown ?? []
        update({ shown: show(key) ? shown.filter((k) => k !== key) : [...shown, key] })

        return
      }
      update({ hidden: show(key) ? [...config.hidden, key] : config.hidden.filter((k) => k !== key) })
    },
    update,
    reset: () => data.setProfile({ ...data.profile, views: { ...data.profile.views, [view]: seedOf(view) } }),
  }
}
