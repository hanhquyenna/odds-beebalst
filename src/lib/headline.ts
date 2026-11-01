import type { JobFilters } from "@/lib/filters"
import { STARTING_LEVELS } from "@/lib/filters"

const list = (names: ReadonlyArray<string>): string => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`)
const sameSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean => a.length === b.length && a.every((x) => b.includes(x))

/**
 * The line over the list: how many jobs, which levels, and which field or industry, so a person sees at once what the number
 * is a number of. "408 internship & entry jobs right now", "37 internship & entry jobs right now in banking",
 * "1,863 jobs right now" when nothing narrows it. It is worked out from the filters, so it moves with them.
 */
export function jobsHeadline(count: number, filters: Pick<JobFilters, "level" | "field" | "industry">): string {
  const n = count === 0 ? "No" : count.toLocaleString("en-US")
  const levels = filters.level.length === 0 ? "" : sameSet(filters.level, STARTING_LEVELS) ? "internship, traineeship & entry" : filters.level.length > 3 ? "" : list(filters.level.map((l) => l.toLowerCase()))
  const fields = filters.field.length === 0 ? "" : filters.field.length > 3 ? `${filters.field.length} fields` : list(filters.field)
  const industries = filters.industry.length === 0 ? "" : filters.industry.length > 3 ? `${filters.industry.length} industries` : list(filters.industry.map((i) => i.toLowerCase()))
  const noun = count === 1 ? "job" : "jobs"

  return `${n} ${levels ? `${levels} ` : ""}${noun} right now${fields ? ` in ${fields}` : ""}${industries ? (fields ? ` at ${industries} employers` : ` in ${industries}`) : ""}`
}
