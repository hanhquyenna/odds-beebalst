import { standing, NO_WHAT_IF, type CategoryShare } from "@/lib/engine"
import type { Reference } from "@/lib/jobs"
import { placeOf } from "@/lib/format"
import { industryOf } from "@/lib/industries"
import { payMid } from "@/lib/spec"
import { levelOf, LEVELS } from "@/lib/engine"
import type { Posting, Profile } from "@/lib/types"

/** What a list of jobs can be sorted by, named the way people say it. */
export const JOB_SORTS = [
  { key: "match", label: "Best match", dir: "desc" },
  { key: "newest", label: "Newest", dir: "desc" },
  { key: "pay", label: "Highest pay", dir: "desc" },
  { key: "chance", label: "Interview chance", dir: "desc" },
  { key: "company", label: "Company A to Z", dir: "asc" },
  { key: "title", label: "Job title A to Z", dir: "asc" },
  { key: "level", label: "Level", dir: "desc" },
] as const

export type JobSortKey = (typeof JOB_SORTS)[number]["key"]

interface Context {
  reference: Reference | null
  shares: Record<Posting["cat"], CategoryShare> | null
  profile: Profile
  referrals: Set<string>
}

/** The chance worth sorting by: the top of the range when you meet everything, else nothing. */
function chanceOf(post: Posting, ctx: Context): number {
  if (!ctx.reference || !ctx.shares) {
    return 0
  }
  const st = standing(post, ctx.profile, ctx.reference, ctx.shares, NO_WHAT_IF, ctx.referrals.has(post.id))

  return st.rate && !st.rate.thin ? st.rate.mid : -1
}

/**
 * Sorts jobs by one key. Each job's value is worked out once, then compared.
 * Jobs with no value for the key (no pay, no date) go last in either direction.
 */
export function sortJobs<T extends Posting>(posts: ReadonlyArray<T>, key: string, dir: "asc" | "desc", ctx: Context, extra?: (post: T) => string | number | null): T[] {
  const value = (post: T): string | number | null => {
    switch (key) {
      case "match":
      case "chance":
        return chanceOf(post, ctx)
      case "newest":
      case "posted":
        return post.days_open === null ? null : -post.days_open
      case "pay":
        return payMid(post, ctx.reference)?.month ?? null
      case "company":
        return post.employer_display.toLowerCase()
      case "title":
        return post.title.toLowerCase()
      case "location":
        return placeOf(post.region).toLowerCase()
      case "level":
        return LEVELS.length - LEVELS.indexOf(levelOf(post))
      case "industry":
        return industryOf(post) ?? null
      case "open":
        // Open first, then closed; among the open, the longest since a check last.
        return post.closed_at ? 1 : 0
      case "added":
        return post.fetched_at ?? null
      case "applicants":
        return post.applicants ?? null
      case "language":
        return post.dutch_required ? 1 : 0
      case "sponsor":
        return post.ind_sponsor ? 1 : 0
      default:
        return extra ? extra(post) : null
    }
  }
  const values = new Map(posts.map((p) => [p.id, value(p)]))
  const sign = dir === "asc" ? 1 : -1

  return [...posts].sort((a, b) => {
    const x = values.get(a.id)
    const y = values.get(b.id)
    if (x === null && y === null) {
      return 0
    }
    if (x === null || x === undefined) {
      return 1
    }
    if (y === null || y === undefined) {
      return -1
    }
    const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })

    return order * sign || (a.days_open ?? 1e9) - (b.days_open ?? 1e9) || a.title.localeCompare(b.title)
  })
}
