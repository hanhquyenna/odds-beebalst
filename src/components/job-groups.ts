import { STEPS, stepOf } from "@/components/job-steps"
import type { useData } from "@/lib/data"
import { LEVELS, levelOf } from "@/lib/engine"
import { placeOf } from "@/lib/format"
import { industryOf } from "@/lib/industries"
import type { Posting } from "@/lib/types"

type Data = ReturnType<typeof useData>

/** What a table can put its rows under, and a board its columns: the same choices in both. */
export const JOB_GROUPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "", label: "No grouping" },
  { key: "status", label: "Status" },
  { key: "open", label: "Still open" },
  { key: "company", label: "Company" },
  { key: "level", label: "Level" },
  { key: "industry", label: "Industry" },
  { key: "location", label: "Location" },
]

/** The heading a job falls under for a grouping. Empty for no grouping. */
export function groupOf(data: Data, post: Posting, groupBy: string): string {
  switch (groupBy) {
    case "status":
      return STEPS.find((c) => c.step === stepOf(data, post))?.title ?? "Saved"
    case "open":
      return post.closed_at ? "Closed" : "Open"
    case "company":
      return post.employer_display
    case "level":
      return levelOf(post)
    case "industry":
      return industryOf(post) ?? "No industry"
    case "location":
      return placeOf(post.region)
    default:
      return ""
  }
}

/** Groups in their natural order: the steps of an application, levels from junior up, open before closed; anything else by name. */
export function groupOrder(groupBy: string, label: string): number {
  return groupBy === "status" ? STEPS.findIndex((c) => c.title === label) : groupBy === "level" ? LEVELS.indexOf(label as (typeof LEVELS)[number]) : groupBy === "open" ? (label === "Open" ? 0 : 1) : 0
}

/** The jobs under each heading, headings in order. */
export function groupJobs(data: Data, posts: ReadonlyArray<Posting>, groupBy: string): Array<{ label: string; posts: Posting[] }> {
  const map = new Map<string, Posting[]>()
  for (const post of posts) {
    const label = groupOf(data, post, groupBy)
    map.set(label, [...(map.get(label) ?? []), post])
  }

  return [...map.entries()].sort((a, b) => groupOrder(groupBy, a[0]) - groupOrder(groupBy, b[0]) || a[0].localeCompare(b[0])).map(([label, list]) => ({ label, posts: list }))
}
