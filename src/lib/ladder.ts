import { levelOf, type Level } from "@/lib/engine"
import { formatPosted } from "@/lib/format"
import type { Posting } from "@/lib/types"

/** The rungs every job sits on, in order. An internship is its own first rung: its allowance is not a graduate salary. */
const LADDER = ["Internship", "Entry", "Mid", "Senior", "Manager", "Director"] as const
export type Rung = (typeof LADDER)[number]

export interface RungStats {
  level: Rung
  /** Years of experience a job at this level usually asks: the middle of what postings here ask. Null with too few to say. */
  years: number | null
  /** Postings at this level that state the years, and all postings at it. */
  sample: number
  open: number
  /** The middle of the pay postings at this level state, a month before tax, or null with too few. */
  pay: number | null
  paySample: number
  /** The job titles most often posted at this level in the same line of work, as written. Empty with none. */
  roles: string[]
}

const MIN_YEARS = 4
const MIN_PAY = 6

/** "Senior Accountant (m/f/x) - Amsterdam" is "Senior Accountant": the noise taken off, the words kept as posted. */
function cleanTitle(title: string): string {
  const t = title
    .replace(/&amp;/g, "&")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(m\/[fwvx](\/[dxfmw])?|f\/m(\/[dx])?|all genders|h\/f)\b/gi, " ")
    .split(/\s[-–—|:]\s|,|\s\/\s/)[0]
    .replace(/\s+/g, " ")
    .trim()

  const words = t.split(" ")
  // A title names a role: a company name or a fragment ("Nike", "Manager") is no title.
  if (t.length < 3 || words.length > 6 || !ROLE_NOUN.test(t) || (words.length === 1 && GENERIC_ALONE.test(t))) {
    return ""
  }

  return t
}

const ROLE_NOUN = /\b(manager|analyst|engineer|developer|consultant|accountant|specialist|associate|scientist|designer|director|officer|lead|trainee|advis[eo]r|architect|coordinator|assistant|representative|writer|controller|auditor|researcher|technician|administrator|executive|head|president|intern(ship)?|student|postdoc|professor|phd|recruiter|buyer|planner|underwriter|actuary|lawyer|attorney|strategist|editor|operator|tester|owner|partner)\b/i
const GENERIC_ALONE = /^(manager|director|lead|associate|specialist|intern(ship)?|head|executive|partner|owner|officer)$/i

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)

  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export const rungOf = (level: Level): Rung | null => (level === "Not stated" ? null : level)

/** The postings a job's path is read from: those in the same line of work, else the same broad category. */
export function poolOf(posts: ReadonlyArray<Posting>, like?: Posting): { posts: Posting[]; name: string } {
  if (!like) {
    return { posts: [...posts], name: "all postings" }
  }
  if (like.family) {
    return { posts: posts.filter((p) => p.family === like.family), name: like.family }
  }

  return { posts: posts.filter((p) => p.cat === like.cat), name: like.cat === "tech" ? "tech jobs" : like.cat === "finance_business" ? "finance and business jobs" : "all other jobs" }
}

/** What each rung of the ladder looks like in postings like this job: years asked, pay stated, titles, how many are open. */
export function ladderStats(posts: ReadonlyArray<Posting>, like?: Posting): RungStats[] {
  const years: Record<string, number[]> = {}
  const pay: Record<string, number[]> = {}
  const open: Record<string, number> = {}
  const titles: Record<string, Map<string, { name: string; n: number }>> = {}
  for (const post of poolOf(posts, like).posts) {
    const rung = rungOf(levelOf(post))
    if (!rung) {
      continue
    }
    open[rung] = (open[rung] ?? 0) + 1
    if (post.years_min != null) {
      ;(years[rung] ??= []).push(post.years_min)
    }
    const stated = formatPosted(post.pay_posted)
    if (stated && stated.high <= stated.low * 3) {
      const month = (stated.low + stated.high) / 2 / (stated.unit === "year" ? 12 : 1)
      ;(pay[rung] ??= []).push(month)
    }
    const name = cleanTitle(post.usable != null ? (post.title_clean ?? "") : post.title)
    if (name) {
      const map = (titles[rung] ??= new Map())
      const hit = map.get(name.toLowerCase())
      if (hit) hit.n += 1
      else map.set(name.toLowerCase(), { name, n: 1 })
    }
  }
  let floor = 0

  return LADDER.map((level) => {
    const ys = years[level] ?? []
    const ps = pay[level] ?? []
    // A rung never asks for less than the one below it.
    const y = ys.length >= MIN_YEARS ? (floor = Math.max(floor, median(ys))) : null

    return {
      level,
      years: y,
      sample: ys.length,
      open: open[level] ?? 0,
      pay: ps.length >= MIN_PAY ? Math.round(median(ps) / 50) * 50 : null,
      paySample: ps.length,
      roles: [...(titles[level]?.values() ?? [])].sort((a, b) => b.n - a.n || a.name.length - b.name.length).slice(0, 3).map((t) => t.name),
    }
  })
}
