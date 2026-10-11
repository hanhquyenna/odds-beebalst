/**
 * "Jobs tailored to you": what you told us (preferences, and the lines of work your profile points to) together with what you showed us
 * (the jobs you saved or applied to, and the roles on your own CV). Ranked by what you are into first, then the newest, and only then
 * by your interview chance: a job you would get but never look for (copywriting for a finance and AI person) sinks to the bottom.
 * Jobs past their own closing date are left out. Each job carries one line on why it is here.
 *
 * Similarity to a saved job counts the job title's own words most (a "Treasury Intern" is like a "Finance Intern" through "finance",
 * not through "intern"), then the level (the same level counts, an internship next to an entry-level job counts against), the skills the
 * posting's text asks for, the line of work, the city, and the kind of company (size and type, from company-profile.ts).
 * A shared line of work alone is not enough: the first try matched a procurement consultant to a warehouse job through "operations".
 */
import { fieldOf } from "@/lib/filters"
import { stem, words } from "@/lib/fit"
import type { CompanyProfile } from "@/lib/company-profile"
import { likelyFilled } from "@/lib/odds-v2"
import type { Posting } from "@/lib/types"

const GENERIC = new Set(["intern", "internship", "stage", "stagiair", "junior", "senior", "medior", "trainee", "graduate", "working", "student", "werkstudent", "the", "and", "of", "for", "in", "a", "to", "m", "f", "d", "x", "all", "gender", "genders", "2026", "2027", "month", "months", "start", "programme", "program", "netherlands", "amsterdam", "nl",
  // Words that say what rank or kind of help a job is, not what the work is: "Teaching Assistant" is not like "Boutique Assistant".
  "assistant", "associate", "coordinator", "officer", "member", "support", "team", "general", "office", "employee", "staff", "medewerker", "assistent"].map(stem))

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
  // Level: the same level is what you are looking at; an internship next to an entry-level job is a different search.
  if (saved.level_view && job.level_view && saved.level_view !== "Not stated" && job.level_view !== "Not stated") {
    if (saved.level_view === job.level_view) {
      score += 0.15
      why.push(saved.level_view === "Internship" ? "internship" : `${saved.level_view.toLowerCase()} level`)
    } else if ((saved.level_view === "Internship") !== (job.level_view === "Internship")) {
      score -= 0.1
    }
  }
  // What the posting's text asks for, as far as the list holds it (the skills read from the description): the same tools and skills make two jobs alike.
  const sa = new Set((saved.skills ?? []).map((x) => x.toLowerCase()))
  const sb = new Set((job.skills ?? []).map((x) => x.toLowerCase()))
  if (sa.size > 0 && sb.size > 0) {
    const common = [...sa].filter((x) => sb.has(x))
    const share = common.length / Math.min(sa.size, sb.size)
    score += 0.15 * share
    if (common.length >= 2) why.push(common.slice(0, 2).join(", "))
  }
  if (saved.role_kind && saved.role_kind === job.role_kind) score += 0.04
  if (saved.industry && saved.industry === job.industry) score += 0.04
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

  return { score, why: [...new Set(why)], anchored: overlap > 0 || saved.employer === job.employer }
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
  /** The lines of work you ranked, first choice first. When given, a job in your first choice comes before one in your second, and so on. */
  fieldOrder?: ReadonlyArray<string>
  /** What the LinkedIn profile says about each job (profile-fit.ts): a job closed to the person is left out, a good fit comes first within its tier. */
  fitOf?: (post: Posting) => { score: number | null; reasons: string[]; blocked: string | null }
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

/** How old a posting may be to appear in "Jobs tailored to you" and "Like the jobs you saved": two weeks. Older ones may well be filled, and no list should send you to one. */
export const LIST_MAX_AGE_DAYS = 14

/**
 * Fresh enough for the two suggestion lists: posted in the last two weeks, or its own closing date is still ahead (the employer says it is
 * open, and reads the whole pile after that date, so it is not outdated however long it has been up). A posting with no date and no
 * closing date cannot be shown to be fresh, so it is left out of these lists (it stays in "All jobs").
 */
export function freshForLists(post: Pick<Posting, "days_open" | "valid_through">, today: Date): boolean {
  if (post.valid_through) {
    const end = new Date(post.valid_through)
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999)
      if (end.getTime() >= today.getTime()) return true
    }
  }

  return post.days_open !== null && post.days_open !== undefined && post.days_open <= LIST_MAX_AGE_DAYS
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

export function tailor({ candidates, fitting, saved, chanceOf, profiles, liftOf, own = [], fieldOrder = [], fitOf, today = new Date() }: TailorInput): Tailored[] {
  const ownSets = own.map(titleWords)
  const scored: Array<Tailored & { interest: Interest; fresh: number; rank: number; fit: number }> = []
  for (const post of candidates) {
    if (pastDeadline(post, today) || !freshForLists(post, today)) continue
    const pf = fitOf?.(post)
    // Closed to this person (it asks for a student and they graduated, for a language they do not list): not worth a place in the list.
    if (pf?.blocked) continue
    let best: { s: Posting; l: Likeness } | null = null
    for (const s of saved) {
      const l = likeness(s, post, profiles)
      if (isLike(l) && (!best || l.score > best.l.score)) best = { s, l }
    }
    const mine = ownMatch(post, ownSets)
    // A job outside your lines of work still comes in when your profile fits it very well (skills, level, place and industry together).
    const interest: Interest = best || mine.share >= 0.5 ? 3 : mine.share > 0 ? 2 : fitting.has(post.id) || (pf?.score ?? 0) >= 0.5 ? 1 : 0
    if (interest === 0) continue
    const lift = liftOf(post)
    const note = best
      ? `Like the ${shortTitle(best.s.title)} at ${shortName(best.s.employer_display)} you saved`
      : mine.share > 0
        ? `Close to your own work as ${shortTitle(own[mine.title])}: ${mine.words.slice(0, 2).join(", ")}`
        : lift
          ? `Fits your background: ${lift}`
          : "Fits your preferences"
    // What else the profile says about it, in one more phrase: "...: finance · in Amsterdam, where you live".
    const why = !best && mine.share === 0 && pf && pf.reasons.length > 0 ? `Fits your profile: ${pf.reasons.slice(0, 2).join("; ")}` : pf && pf.reasons.length > 0 && !/visa sponsor/.test(pf.reasons[0]) ? `${note} · ${pf.reasons[0]}` : note
    const at = fieldOrder.length > 0 ? fieldOrder.indexOf(fieldOf(post) ?? "") : -1
    scored.push({ post, chance: chanceOf(post), note: why, interest, fresh: freshness(post), rank: at < 0 ? fieldOrder.length : at, fit: pf?.score == null ? 3 : Math.floor(pf.score * 10) })
  }

  // Your ranked lines of work first, then what you are into, then how well your profile fits, then the newest, then your chance.
  const sorted = scored
    .sort((x, y) => x.rank - y.rank || y.interest - x.interest || y.fit - x.fit || x.fresh - y.fresh || y.chance - x.chance || (x.post.days_open ?? 1e9) - (y.post.days_open ?? 1e9))
    .map(({ post, chance, note }) => ({ post, chance, note }))

  return spread(dedupe(sorted))
}

const same = (p: Posting): string => `${p.employer}|${[...titleWords(p.title)].sort().join(" ")}|${city(p)}`

/** The same job posted twice by one employer (one per office, one per start date) shows once, the better placed of the two. */
function dedupe(rows: Tailored[]): Tailored[] {
  const seen = new Set<string>()

  return rows.filter((r) => {
    const k = same(r.post)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** At most two of one employer among the first places: a third and later one moves down behind the rest, so the top of the list has range. The order is otherwise kept. */
function spread(rows: Tailored[], perEmployer = 2): Tailored[] {
  const seen = new Map<string, number>()
  const first: Tailored[] = []
  const later: Tailored[] = []
  for (const r of rows) {
    const n = seen.get(r.post.employer) ?? 0
    seen.set(r.post.employer, n + 1)
    ;(n < perEmployer ? first : later).push(r)
  }

  return [...first, ...later]
}

export interface Similar {
  post: Posting
  note: string
}

export interface SimilarOptions {
  /** How much each saved job counts: one you applied to or are interviewing for counts more than one you only saved. Default 1. */
  weightOf?: (post: Posting) => number
  /** Jobs you pressed X on: nothing much like them is suggested unless it is even more like something you saved. */
  avoid?: ReadonlyArray<Posting>
  /** The lines of work you ranked, first choice first: a line you put first counts a little more in the mix. */
  fieldOrder?: ReadonlyArray<string>
  /** Your chance on a job: between two equally like jobs, the one you are more likely to hear back from. */
  chanceOf?: (post: Posting) => number
  /** False for a job closed to you (profile-fit.ts blocked): never suggested. */
  eligible?: (post: Posting) => boolean
  /** Most suggestions from one employer. Default 1; raised only when nothing else is left. */
  perEmployer?: number
}

/** What a rank in "your lines of work" adds to a saved job's weight: first choice 1.4, second 1.2, third 1.1. */
const RANK_WEIGHT = [1.4, 1.2, 1.1]

/**
 * Jobs like the ones you saved, a few of them, in the same mix as your saved list: if two thirds of what you saved is finance and one third is
 * marketing, about two thirds of the suggestions are finance-like and one third marketing-like (largest remainder, so five slots over three
 * lines of work are 2, 2 and 1, not 1, 1 and 1 with two lost). What counts in "how much of your list": each saved job's weight, which is higher
 * for one you applied to or are interviewing for (an application says more than a bookmark), and a little higher for a line of work you ranked first.
 * Each slot goes to the job most like one you saved in that line, lifted a little when your chance there is better; no employer comes twice until
 * nothing else is left; nothing is suggested that is closed to you, past its closing date, older than a typical posting's life, or much like a job
 * you pressed X on. A line with nothing like it gives its slots to the others. Shown newest first.
 */
export function similarMix(saved: ReadonlyArray<Posting>, candidates: ReadonlyArray<Posting>, profiles: Record<string, CompanyProfile>, count = 5, today = new Date(), opts: SimilarOptions = {}): Similar[] {
  const have = new Set(saved.map((s) => s.id))
  const rankOf = (f: string | null): number => (f && opts.fieldOrder ? opts.fieldOrder.indexOf(f) : -1)
  const weight = (s: Posting): number => {
    const r = rankOf(s.family ?? null)

    return Math.max(0.1, opts.weightOf?.(s) ?? 1) * (r >= 0 && r < RANK_WEIGHT.length ? RANK_WEIGHT[r] : 1)
  }
  const groups = new Map<string, Posting[]>()
  for (const s of saved) groups.set(s.family ?? "", [...(groups.get(s.family ?? "") ?? []), s])
  if (groups.size === 0) return []
  const groupWeight = new Map([...groups.entries()].map(([g, list]) => [g, list.reduce((n, s) => n + weight(s), 0)]))
  const heaviest = new Map([...groups.entries()].map(([g, list]) => [g, Math.max(...list.map(weight))]))

  // For each open job, the saved job it is most like (weighted a little by how much that saved job counts), and the line of work that saved job is in.
  const best = new Map<string, { job: Posting; like: Likeness; group: string; s: Posting; score: number }>()
  for (const job of candidates) {
    // Past its deadline, older than a typical posting's life (most likely filled), closed to you: not worth suggesting.
    if (have.has(job.id) || pastDeadline(job, today) || !freshForLists(job, today) || likelyFilled(job) || opts.eligible?.(job) === false) continue
    for (const [group, list] of groups) {
      for (const s of list) {
        const like = likeness(s, job, profiles)
        if (!isLike(like)) continue
        const chance = opts.chanceOf ? Math.min(1, opts.chanceOf(job) / 0.25) : 0
        const score = like.score * (0.85 + 0.15 * (weight(s) / (heaviest.get(group) ?? 1))) + 0.08 * chance
        const now = best.get(job.id)
        if (!now || score > now.score) best.set(job.id, { job, like, group, s, score })
      }
    }
  }
  // Much like something you pressed X on, and no more like anything you saved: left out.
  const avoid = opts.avoid ?? []
  const wanted = [...best.values()].filter((x) => !avoid.some((a) => {
    const l = likeness(a, x.job, profiles)

    return l.anchored && l.score >= 0.5 && l.score > x.like.score
  }))

  const byGroup = new Map<string, Array<{ job: Posting; like: Likeness; s: Posting; score: number }>>()
  for (const x of wanted) byGroup.set(x.group, [...(byGroup.get(x.group) ?? []), x])
  for (const list of byGroup.values()) list.sort((x, y) => y.score - x.score || freshness(x.job) - freshness(y.job))

  // Slots in proportion to the weight of each saved line of work (largest remainder); a line with nothing like it gives its slots away.
  const live = [...groups.keys()].filter((g) => (byGroup.get(g)?.length ?? 0) > 0)
  const total = live.reduce((n, g) => n + (groupWeight.get(g) ?? 0), 0)
  const want = new Map<string, number>()
  const exact = live.map((g) => ({ g, x: ((groupWeight.get(g) ?? 0) / total) * count }))
  for (const e of exact) want.set(e.g, Math.floor(e.x))
  let left = count - [...want.values()].reduce((a, b) => a + b, 0)
  for (const e of [...exact].sort((a, b) => b.x - Math.floor(b.x) - (a.x - Math.floor(a.x)))) {
    if (left <= 0) break
    want.set(e.g, (want.get(e.g) ?? 0) + 1)
    left -= 1
  }

  const out: Similar[] = []
  const used = new Set<string>()
  const perEmployer = new Map<string, number>()
  const take = (g: string, n: number, cap: number): void => {
    for (const x of byGroup.get(g) ?? []) {
      if (n <= 0 || out.length >= count) return
      const emp = x.job.employer
      if (used.has(x.job.id) || (perEmployer.get(emp) ?? 0) >= cap) continue
      used.add(x.job.id)
      perEmployer.set(emp, (perEmployer.get(emp) ?? 0) + 1)
      out.push({ post: x.job, note: `Like the ${shortTitle(x.s.title)} at ${shortName(x.s.employer_display)} you saved` })
      n -= 1
    }
  }
  const cap = opts.perEmployer ?? 1
  for (const g of live) take(g, want.get(g) ?? 0, cap)
  // Slots a line could not fill go to the heaviest lines that still have something; an employer may come again only when nothing else is left.
  const heavy = [...live].sort((a, b) => (groupWeight.get(b) ?? 0) - (groupWeight.get(a) ?? 0))
  for (const g of heavy) take(g, count - out.length, cap)
  for (const g of heavy) take(g, count - out.length, Math.max(cap, 2))

  // Shown newest first: which ones are chosen follows the mix above, the order follows how fresh they are.
  return out.sort((a, b) => (a.post.days_open ?? Number.MAX_SAFE_INTEGER) - (b.post.days_open ?? Number.MAX_SAFE_INTEGER))
}
