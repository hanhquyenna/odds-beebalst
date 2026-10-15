import type { JobSource } from "@/lib/sources"

/**
 * Where to apply when a job was found in several places: the employer's own application first (its own site or its applicant system), then the
 * student boards, then Indeed and Glassdoor, and LinkedIn last. The employer's form is the one odds fills in best, with no account on a middleman
 * and no pop-up flow; LinkedIn is used only when it is the only place the job is.
 */
const RANK: Array<[RegExp, number]> = [
  [/^(greenhouse|lever|ashby|workday|smartrecruiters|successfactors|recruitee|teamtailor|personio|workable|join|icims|taleo|other|henkel)$/i, 0],
  [/^(magnet\.me|academictransfer)$/i, 1],
  [/^(indeed|glassdoor)$/i, 2],
  [/^linkedin$/i, 3],
]
const rankOf = (s: JobSource): number => RANK.find(([rx]) => rx.test(s.ats) || rx.test(s.name))?.[1] ?? 0

/** The place to apply: the best-ranked source that has an address, the first listed among equals. Null when none has one. */
export function applySourceOf(sources: ReadonlyArray<JobSource>): JobSource | null {
  const withUrl = sources.filter((s) => s.url)

  return withUrl.map((s, i) => ({ s, i })).sort((a, b) => rankOf(a.s) - rankOf(b.s) || a.i - b.i)[0]?.s ?? null
}
