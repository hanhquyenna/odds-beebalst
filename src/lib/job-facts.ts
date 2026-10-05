import type { Signals } from "@/lib/jobs"
import { levelOf } from "@/lib/engine"
import { formatPlace } from "@/lib/format"
import type { Posting } from "@/lib/types"

export const JOB_TYPES = ["Full-time", "Part-time", "Contract"] as const
export type JobType = (typeof JOB_TYPES)[number]
export const WORKPLACES = ["Remote", "Hybrid", "On-site"] as const
export type Workplace = (typeof WORKPLACES)[number]

/**
 * How the job is employed, from the posting. An internship is a level, not a type, so it is
 * full-time or part-time like any other: only when the posting says so. Part-time and
 * contract are there only when the text says so, and a posting that says both full-time and
 * part-time counts as both. A posting that says nothing is taken as full-time.
 */
export function jobTypesOf(post: Posting, signal: Signals | undefined): JobType[] {
  // Read from the whole text by Jev, where it was sure.
  const read = post.job_type ? ({ fulltime: "Full-time", parttime: "Part-time", contract: "Contract" } as Record<string, JobType>)[post.job_type] : undefined
  if (read) {
    return [read]
  }
  const types: JobType[] = []
  if (signal?.partTime) {
    types.push("Part-time")
  }
  if (signal?.contract) {
    types.push("Contract")
  }
  // A posting that says nothing is full-time, except an internship: its hours are not something to assume.
  if (signal?.fullTime || (types.length === 0 && levelOf(post) !== "Internship")) {
    types.unshift("Full-time")
  }

  return types
}

/** Where the work is done, when the text says: fully remote, hybrid, or otherwise on-site. */
export function workplaceOf(post: Posting, signal: Signals | undefined): Workplace {
  const read = post.workplace ? { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }[post.workplace] : undefined
  if (read) {
    return read as Workplace
  }

  return signal?.remote ? "Remote" : signal?.hybrid ? "Hybrid" : "On-site"
}

/** The town a job is in, as the list writes it. */
export const cityOf = (post: Posting): string => formatPlace(post.region).split(",")[0].trim()
