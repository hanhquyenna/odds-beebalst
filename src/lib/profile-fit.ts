/**
 * "Jobs tailored to you", the part that comes from the LinkedIn profile: what the profile says about what a job should be, and how well
 * each job meets it. Eligibility first, then fit.
 *
 * Eligibility (from the same gates the job page shows, engine.ts standing()): a job that asks for a current student when you graduated,
 * for a language you do not list, or for Dutch you do not have, is not shown: it is closed to you. An internship is not shown to someone who
 * left university over two years ago. Years and degree asked beyond the profile only count against a job, because postings overstate both.
 *
 * Fit is two things multiplied, so that where a job is can never stand in for what it is:
 *   content    what the job is, against what the profile says: cv (the CV against the posting: skills, role words, level, line of work, fit.ts,
 *              already on every job page) 0.6, industry (an employer they worked at is in it) 0.2, headline (the job named in what they say they
 *              want) 0.2. Parts that cannot be judged leave the rest to share the weight. A posting that says nothing about the work (a title of
 *              "Internship", no skills listed) is held to 0.15 whatever else is true of it.
 *   logistics  whether it can work, 0.5 to 1 of the score: level (internship for someone studying, entry-level for someone who finished in the
 *              last two years) 0.4, city (the one they live in) 0.3, sponsor (on the IND register, only for someone who needs a permit) 0.3.
 * score = content x (0.5 + 0.5 x logistics). The weights are our assumption: no study measures them. They are written here and checked by tests.
 */
import { derive } from "@/lib/engine"
import type { Standing } from "@/lib/engine"
import { industryOf } from "@/lib/industries"
import { cityOf } from "@/lib/job-facts"
import { stem, words } from "@/lib/fit"
import { titleWords } from "@/lib/tailor"
import type { Posting, Profile } from "@/lib/types"

export const CONTENT_WEIGHTS = { cv: 0.6, industry: 0.2, headline: 0.2 } as const
export const LOGISTICS_WEIGHTS = { level: 0.4, city: 0.3, sponsor: 0.3 } as const

/** What the profile says, worked out once per profile. */
export interface ProfileSignals {
  studying: boolean | null
  graduatedMonthsAgo: number | null
  /** Levels the person is looking at, best first: studying -> Internship; finished lately -> Entry then Internship; longer ago -> Entry. */
  levels: string[]
  city: string | null
  needsPermit: boolean
  /** Industries of the employers they worked at, newest first, from the open postings of those employers. */
  industries: string[]
  /** The employer an industry came from, for the reason. */
  industryFrom: Record<string, string>
  /** Words of the headline that name a job (not "student", "at", "UvA"). */
  wanted: Set<string>
}

const WANT_STOP = new Set(["student", "studying", "aspiring", "at", "the", "of", "and", "in", "for", "with", "to", "a", "an", "msc", "bsc", "master", "bachelor", "university", "amsterdam", "rotterdam", "utrecht", "netherlands", "looking", "seeking", "open", "work", "intern", "internship"].map(stem))

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/** Employer name -> industry, from the open postings (one industry per employer, as the app shows it). */
export function industryByEmployer(pool: ReadonlyArray<Posting>): Map<string, string> {
  const out = new Map<string, string>()
  for (const p of pool) {
    const ind = industryOf(p)
    if (ind && !out.has(norm(p.employer_display || p.employer))) out.set(norm(p.employer_display || p.employer), ind)
  }

  return out
}

export function profileSignals(profile: Profile, byEmployer: ReadonlyMap<string, string> = new Map()): ProfileSignals {
  const d = derive(profile)
  const studying = d.studying
  const gone = d.graduatedMonthsAgo
  const levels = studying === true ? ["Internship"] : gone !== null && gone <= 24 ? ["Entry", "Internship"] : d.years >= 2 ? ["Entry", "Mid"] : ["Entry", "Internship"]
  const place = (profile.place ?? "").split(/[,;]/)[0].trim().toLowerCase()
  const industries: string[] = []
  const industryFrom: Record<string, string> = {}
  for (const role of d.roles) {
    const ind = byEmployer.get(norm(role.company))
    if (ind && !industries.includes(ind)) {
      industries.push(ind)
      industryFrom[ind] = role.company
    }
  }
  const wanted = new Set(words(profile.headline ?? "").map(stem).filter((w) => w.length > 2 && !WANT_STOP.has(w)))

  return { studying, graduatedMonthsAgo: gone, levels, city: place || null, needsPermit: profile.permit === "other_non_eu" || profile.permit === "orientation_year" || profile.permit === "hsm", industries, industryFrom, wanted }
}

export interface ProfileFit {
  /** 0 to 1; null when nothing could be judged. */
  score: number | null
  /** Plain-words reasons, strongest first, at most three. */
  reasons: string[]
  /** Set when the job is closed to this person: the reason in words. */
  blocked: string | null
}

const REASON_BAR = 0.6
const SPONSOR_REASON = "a recognised visa sponsor"

/** How well one job meets what the profile says. `st` is the standing of this profile on this job (engine.ts), already worked out for the chance. */
export function profileFitFor(post: Posting, st: Pick<Standing, "gates" | "fit">, sig: ProfileSignals): ProfileFit {
  const failed = (name: string): boolean => st.gates.some((g) => g.name === name && g.status === "fail")
  // An internship or a student job is for people who study or finished lately: not for someone who left university over two years ago and has worked since.
  const studentJob = post.role_kind === "internship" || post.role_kind === "working_student" || post.level_view === "Internship"
  const pastStudent = sig.studying === false && sig.graduatedMonthsAgo !== null && sig.graduatedMonthsAgo > 24
  const blocked = failed("Student") ? "asks for a student and you are not studying" : failed("Language") ? "asks for a language you do not list" : failed("Dutch") ? "asks for Dutch" : studentJob && pastStudent ? "an internship, and you finished your studies over two years ago" : null
  const content: Array<{ w: number; v: number; reason?: string }> = []
  const logistics: Array<{ w: number; v: number; reason?: string }> = []

  if (st.fit) {
    // What the CV matches, in the words of the part that matched best: the skills it lists, the title against the roles, the line of work.
    const part = (key: string): { value: number; detail: string } | undefined => st.fit?.parts.find((x) => x.key === key)
    const skills = part("skills")
    const role = part("role")
    const field = part("field")
    const reason = skills && skills.value >= 0.55 ? skillsReason(skills.detail) : role && role.value >= 0.5 ? "the job title is like your past roles" : field && field.value >= 0.5 ? "the kind of work on your CV" : st.fit.score >= REASON_BAR ? "your CV fits what it asks for" : undefined
    content.push({ w: CONTENT_WEIGHTS.cv, v: st.fit.score, reason })
  }

  const ind = industryOf(post)
  if (sig.industries.length > 0 && ind) {
    const hit = sig.industries.indexOf(ind)
    content.push({ w: CONTENT_WEIGHTS.industry, v: hit === 0 ? 1 : hit > 0 ? 0.7 : 0, reason: hit >= 0 ? `same industry as ${sig.industryFrom[ind]}, where you worked` : undefined })
  }

  if (sig.wanted.size > 0) {
    const title = new Set(words(post.title.replace(/\([^)]*\)/g, " ")).map(stem))
    const hit = [...sig.wanted].filter((w) => title.has(w))
    content.push({ w: CONTENT_WEIGHTS.headline, v: hit.length > 0 ? 1 : 0, reason: hit.length > 0 ? `${hit[0]} is what your headline says you want` : undefined })
  }

  const level = post.level_view ?? null
  if (level && level !== "Not stated") {
    const at = sig.levels.indexOf(level)
    logistics.push({ w: LOGISTICS_WEIGHTS.level, v: at === 0 ? 1 : at > 0 ? 0.5 : 0 })
  }

  const here = sig.city
  if (here) {
    const there = cityOf(post).toLowerCase()
    if (there && there !== "location not stated") logistics.push({ w: LOGISTICS_WEIGHTS.city, v: there === here ? 1 : 0, reason: there === here ? `in ${cityOf(post)}, where you live` : undefined })
  }

  if (sig.needsPermit) logistics.push({ w: LOGISTICS_WEIGHTS.sponsor, v: post.ind_sponsor ? 1 : 0, reason: post.ind_sponsor ? SPONSOR_REASON : undefined })

  const mean = (parts: Array<{ w: number; v: number }>): number | null => {
    const total = parts.reduce((n, p) => n + p.w, 0)

    return total === 0 ? null : parts.reduce((n, p) => n + p.w * p.v, 0) / total
  }
  // A posting that says nothing about the work (a title of "Internship" or "Intern", no skills listed) cannot be a good match for anyone's CV: where it is must not lift it above jobs that say what they are.
  const says = titleWords(post.title).size > 0 || (post.skills?.length ?? 0) > 0
  const c0 = mean(content)
  const c = c0 !== null && !says ? Math.min(c0, 0.15) : c0
  const l = mean(logistics)
  if (c === null && l === null) return { score: null, reasons: [], blocked }
  let score = (c ?? 0.2) * (0.5 + 0.5 * (l ?? 0.7))
  // Years or degree asked beyond what the profile shows: counted against, not a reason to hide the job.
  if (failed("Minimum years") || failed("Degree")) score = Math.max(0, score - 0.1)
  // The reasons that tell this job from the next come first; being a sponsor is true of most of the list, so it comes last.
  const reasons = [...content, ...logistics]
    .filter((p) => p.reason)
    .sort((x, y) => Number(x.reason === SPONSOR_REASON) - Number(y.reason === SPONSOR_REASON) || y.w * y.v - x.w * x.v)
    .map((p) => p.reason as string)

  return { score, reasons: reasons.slice(0, 3), blocked }
}

/** "3 of 4 must-have, 1 of 2 strong plus" in plain words. */
function skillsReason(detail: string): string {
  const must = detail.match(/(\d+) of (\d+) must-have/)

  return must ? `you have ${must[1]} of the ${must[2]} skills it requires` : "you have some of the skills it lists"
}
