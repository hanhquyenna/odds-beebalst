import type { JobSource } from "@/lib/sources"

/**
 * Where to apply when a job was found in several places: the employer's own application first, then student boards, then LinkedIn
 * (Easy Apply or company handoff), and Indeed/Glassdoor last — those boards are middlemen that open another tab ("Apply on the employer's website")
 * and often the wrong listing. One job must stay one tab.
 */
const RANK: Array<[RegExp, number]> = [
  [/^(greenhouse|lever|ashby|workday|smartrecruiters|successfactors|recruitee|teamtailor|personio|workable|join|icims|taleo|other|henkel)$/i, 0],
  [/^(magnet\.me|academictransfer)$/i, 1],
  [/^linkedin$/i, 2],
  [/^(indeed|glassdoor)$/i, 3],
]
const rankOf = (s: JobSource): number => RANK.find(([rx]) => rx.test(s.ats) || rx.test(s.name))?.[1] ?? 0

/** The place to apply: the best-ranked source that has an address, the first listed among equals. Null when none has one. */
export function applySourceOf(sources: ReadonlyArray<JobSource>): JobSource | null {
  const withUrl = sources.filter((s) => s.url)

  return withUrl.map((s, i) => ({ s, i })).sort((a, b) => rankOf(a.s) - rankOf(b.s) || a.i - b.i)[0]?.s ?? null
}
