import type { Report } from "@/content/research/types"

const modules = import.meta.glob<{ default?: Report }>("./reports/*.ts", { eager: true })

/** Every research report, in reading order. Read by the research pages and the slides on the front page. */
export const REPORTS: Report[] = Object.values(modules)
  .map((m) => m.default)
  .filter((r): r is Report => Boolean(r))
  .sort((a, b) => a.order - b.order)
