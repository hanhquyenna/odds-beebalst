/**
 * "Jobs tailored to you": what you told us (preferences, and the lines of work your profile points to) together with what you showed us
 * (the jobs you saved or applied to, and the roles on your own CV). Ranked by what you are into first, then the newest, and only then
 * by your interview chance: a job you would get but never look for (copywriting for a finance and AI person) sinks to the bottom.
 * Jobs past their own closing date are left out. Each job carries one line on why it is here.
 *
 * Similarity to a saved job counts the job title's own words most (a "Treasury Intern" is like a "Finance Intern" through "finance",
 * not through "intern"), then the line of work, the level, the city, and the kind of company (size and type, from company-profile.ts).
 * A shared line of work alone is not enough: the first try matched a procurement consultant to a warehouse job through "operations".
 */
import { stem, words } from "@/lib/fit"
import type { CompanyProfile } from "@/lib/company-profile"
import type { Posting } from "@/lib/types"

const GENERIC = new Set(["intern", "internship", "stage", "stagiair", "junior", "senior", "medior", "trainee", "graduate", "working", "student", "werkstudent", "the", "and", "of", "for", "in", "a", "to", "m", "f", "d", "x", "all", "gender", "genders", "2026", "2027", "month", "months", "start", "programme", "program", "netherlands", "amsterdam", "nl"].map(stem))

export const titleWords = (t: string): Set<string> => new Set(words(t.replace(/\([^)]*\)/g, " ")).map(stem).filter((w) => w.length > 2 && !GENERIC.has(w)))

const city = (p: Posting): string => (p.region ?? "").split(/[,;]/)[0].trim().toLowerCase()

export interface Likeness {
  score: number
  why: string[]
  /** Shares words of the job title, or is the same company: without one of these, nothing else makes two jobs alike. */
  anchored: boolean
}

/** How much a job is like one you saved, 0 to about 1, with the shared things named. */
export function likeness(saved: Posting, job: Posting, profiles: Record<string, CompanyProfile>): Likeness {
  const a = titleWords(saved.title)
  const b = titleWords(job.title)
  const shared = [...a].filter((w) => b.has(w))
  const overlap = a.size && b.size ? shared.length / Math.min(a.size, b.size) : 0
  const why: string[] = []
  let score = 0.45 * overlap
  if (saved.family && saved.family === job.family) {
    score += 0.2
    why.push(saved.family.split(" & ")[0].split(",")[0].toLowerCase())
  }
  if (saved.level_view && saved.level_view === job.level_view && saved.level_view !== "Not stated") {
    score += 0.12
    why.push(saved.level_view === "Internship" ? "internship" : `${saved.level_view.toLowerCase()} level`)
  }
  if (city(saved) && city(saved) === city(job)) {
    score += 0.08
    why.push((job.region ?? "").split(/[,;]/)[0].trim())
  }
  const ps = profiles[saved.employer]
  const pj = profiles[job.employer]
  if (saved.employer === job.employer) {
    score += 0.15
    why.unshift("same company")
  } else if (ps?.type && pj?.type && ps.type.split(" (")[0] === pj.type.split(" (")[0]) {
    score += 0.08
    why.push(pj.type.split(" (")[0])
  }
  if (overlap > 0 && !why.includes("same company")) why.unshift(shared.slice(0, 2).join(" "))

  return { score, why, anchored: overlap > 0 || saved.employer === job.employer }
}

/** Similar enough to suggest: shares title words or the company, and enough else besides. */
export const isLike = (l: Likeness): boolean => l.anchored && l.score >= 0.38

/** "2027 MUFG 6 month Amsterdam internship: Japanese Corporate Banking" -> "internship"; "Senior Financial Analyst (m/f/d)" -> "Senior Financial Analyst". */
export function shortTitle(t: string): string {
  const clean = t.replace(/\([^)]*\)/g, " ").split(/[:|–—]| - /)[0].replace(/\b20\d\d\b/g, " ").replace(/\b\d+[- ]?months?\b/gi, " ").replace(/\s+/g, " ").trim()
  const words = clean.split(" ")
  // A title that is mostly a programme name keeps only its kind of job.
  const kind = words.find((w) => /^(internship|intern|traineeship|trainee|analyst|programme)$/i.test(w))

  return clean.length <= 40 ? clean : kind ? kind.toLowerCase() : `${clean.slice(0, 38).trim()}…`
}

/** "MUFG Bank (Europe) N.V." -> "MUFG Bank". */
export const shortName = (n: string): string => n.replace(/\([^)]*\)/g, " ").replace(/\b(N\.?V\.?|B\.?V\.?|Inc\.?|Ltd\.?|GmbH|S\.?A\.?)\s*$/i, "").replace(/\s+/g, " ").trim()

export interface Tailored {
  post: Posting
  chance: number
  note: string
}

export interface TailorInput {
  candidates: ReadonlyArray<Posting>
  /** The jobs that already fit your preferences and profile (the old "Jobs that fit you"). */
  fitting: Set<string>
  saved: Posting[]
  chanceOf: (post: Posting) => number
  profiles: Record<string, CompanyProfile>
  /** The line of work that lifts you most for a job, for the note on jobs that come from your profile. */
  liftOf: (post: Posting) => string | null
  /** The titles of your own roles and your headline: a job named like your own work is one you are into. */
  own?: ReadonlyArray<string>
  /** Today, for closing dates (tests pass a fixed day). */
  today?: Date
}

/** How close a job is to what you want: 3 like a job you saved or named like your own work, 2 sharing some words with it, 1 only your line of work. */
type Interest = 0 | 1 | 2 | 3

/** Newest first, in steps, so a two-day-old job is not beaten by a one-day-old one only for being a day younger. */
function freshness(post: Posting): number {
  const d = post.days_open
  if (d === null || d === undefined) return 4
  return d <= 3 ? 0 : d <= 7 ? 1 : d <= 14 ? 2 : d <= 30 ? 3 : 4
}

/** A closing date before today: the employer stopped taking applications, whatever the board still shows. */
export function pastDeadline(post: Posting, today: Date): boolean {
  if (!post.valid_through) return false
  const end = new Date(post.valid_through)
  if (Number.isNaN(end.getTime())) return false
  end.setHours(23, 59, 59, 999)
  return end.getTime() < today.getTime()
}

/** The share of a job title's own words found in the closest of your role titles. */
function ownMatch(post: Posting, own: ReadonlyArray<Set<string>>): { share: number; words: string[]; title: number } {
  const b = titleWords(post.title)
  let best = { share: 0, words: [] as string[], title: -1 }
  own.forEach((a, i) => {
    const shared = [...a].filter((w) => b.has(w))
    const share = a.size && b.size ? shared.length / Math.min(a.size, b.size) : 0
    if (share > best.share) best = { share, words: shared, title: i }
  })
  return best
}

export function tailor({ candidates, fitting, saved, chanceOf, profiles, liftOf, own = [], today = new Date() }: TailorInput): Tailored[] {
  const ownSets = own.map(titleWords)
  const scored: Array<Tailored & { interest: Interest; fresh: number }> = []
  for (const post of candidates) {
    if (pastDeadline(post, today)) continue
    let best: { s: Posting; l: Likeness } | null = null
    for (const s of saved) {
      const l = likeness(s, post, profiles)
      if (isLike(l) && (!best || l.score > best.l.score)) best = { s, l }
    }
    const mine = ownMatch(post, ownSets)
    const interest: Interest = best || mine.share >= 0.5 ? 3 : mine.share > 0 ? 2 : fitting.has(post.id) ? 1 : 0
    if (interest === 0) continue
    const lift = liftOf(post)
    const note = best
      ? `Like the ${shortTitle(best.s.title)} at ${shortName(best.s.employer_display)} you saved: ${best.l.why.slice(0, 3).join(", ")}`
      : mine.share > 0
        ? `Close to your own work as ${shortTitle(own[mine.title])}: ${mine.words.slice(0, 2).join(", ")}`
        : lift
          ? `Fits your background: ${lift}`
          : "Fits your preferences"
    scored.push({ post, chance: chanceOf(post), note, interest, fresh: freshness(post) })
  }

  // What you are into, then the newest, then your chance.
  return scored
    .sort((x, y) => y.interest - x.interest || x.fresh - y.fresh || y.chance - x.chance || (x.post.days_open ?? 1e9) - (y.post.days_open ?? 1e9))
    .map(({ post, chance, note }) => ({ post, chance, note }))
}

export interface Stretch {
  family: string
  chance: number
  titles: string[]
}

/** Lines of work you saved jobs in where your chance is low: worth a sentence on what would change it. */
export function stretches(saved: Posting[], chanceOf: (post: Posting) => number): Stretch[] {
  const by = new Map<string, { sum: number; n: number; titles: string[] }>()
  for (const s of saved) {
    const c = chanceOf(s)
    if (c >= 0.05 || !s.family) continue
    const e = by.get(s.family) ?? { sum: 0, n: 0, titles: [] }
    e.sum += c
    e.n += 1
    if (!e.titles.includes(s.title)) e.titles.push(s.title)
    by.set(s.family, e)
  }

  return [...by.entries()].map(([family, e]) => ({ family, chance: e.sum / e.n, titles: e.titles.slice(0, 2) }))
}
