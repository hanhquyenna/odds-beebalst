import type { Posting } from "@/lib/types"

/** Where a job was found: the platform's name and the address of that posting. */
export interface JobSource {
  name: string
  url: string | null
  /** The platform or system the posting came through, as stored. */
  ats: string
}

const NAMES: Record<string, string> = {
  linkedin: "LinkedIn",
  "magnet.me": "Magnet.me",
  academictransfer: "AcademicTransfer",
  indeed: "Indeed",
  glassdoor: "Glassdoor",
}

/** Employers' own careers systems: the job is on the employer's site. */
const EMPLOYER_SYSTEMS = new Set(["workday", "greenhouse", "ashby", "smartrecruiters", "successfactors", "recruitee", "lever", "teamtailor", "personio", "workable"])

/** Which source wins when one job is found in several places: the employer's own page, then the specialist boards, then the big platforms. */
const RANK = (ats: string): number => (EMPLOYER_SYSTEMS.has(ats) ? 0 : ats === "academictransfer" ? 1 : ats === "magnet.me" ? 2 : ats === "indeed" ? 3 : ats === "glassdoor" ? 4 : 5)

export function sourceOf(p: Pick<Posting, "ats" | "url">): JobSource {
  const recorded = (p.ats ?? "").toLowerCase()
  let fromUrl = ""
  if (!recorded || recorded === "other") {
    try {
      const host = new URL(p.url ?? "").hostname.toLowerCase().replace(/^www\./, "")
      if (host === "linkedin.com" || host.endsWith(".linkedin.com")) fromUrl = "linkedin"
      else if (host === "magnet.me" || host.endsWith(".magnet.me")) fromUrl = "magnet.me"
      else if (host === "indeed.com" || host.endsWith(".indeed.com")) fromUrl = "indeed"
      else if (host === "glassdoor.com" || host.endsWith(".glassdoor.com")) fromUrl = "glassdoor"
      else if (host === "academictransfer.com" || host.endsWith(".academictransfer.com")) fromUrl = "academictransfer"
    } catch {
      // Keep the stored source label when the URL is missing or malformed.
    }
  }
  const ats = fromUrl || recorded

  return { name: NAMES[ats] ?? (EMPLOYER_SYSTEMS.has(ats) ? "Employer site" : "Other"), url: p.url, ats }
}

/** The platform names a job was found on, each once. Jobs the person added themselves have none. */
export function sourceNamesOf(p: Pick<Posting, "ats" | "url" | "sources" | "local">): string[] {
  if (p.local) {
    return []
  }

  return [...new Set((p.sources && p.sources.length > 0 ? p.sources : [sourceOf(p)]).map((x) => x.name))]
}

const norm = (s: string | null | undefined): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/** Gender and "everyone welcome" tags that boards add or drop: (m/f/d), (all genders), (f/m/x). */
const TAGS = /\b(m ?\/ ?f ?\/ ?[dx]|f ?\/ ?m ?\/ ?[dx]|m ?\/ ?v ?\/ ?x|m ?\/ ?w ?\/ ?d|h ?\/ ?f ?\/ ?x|all genders|gender neutral)\b/g

/** The title as every platform would agree on it: no gender tag, and no city tacked on at the end ("Legal Intern - Amsterdam"). */
function cleanTitle(p: Pick<Posting, "title" | "region">): string {
  let t = norm(p.title).replace(TAGS, " ").replace(/\s+/g, " ").trim()
  const city = cityOf(p)
  if (city && t.endsWith(` ${city}`) && t.length > city.length + 4) {
    t = t.slice(0, -city.length).trim()
  }
  const trailing = /\s(amsterdam|rotterdam|utrecht|eindhoven|den haag|the hague|netherlands|nl)$/
  while (trailing.test(t) && t.split(" ").length > 2) {
    t = t.replace(trailing, "").trim()
  }

  return t
}

/** The first city of the location, in lower case: "Utrecht Croeselaan 18" keeps its street, which is why cities are compared by their start. */
function cityOf(p: Pick<Posting, "region">): string {
  return norm((p.region ?? "").split(";")[0].split(",")[0])
}

const sameCity = (a: string, b: string): boolean => a !== "" && b !== "" && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `))

/** The same job is the same employer and title, in the same city (a street or "Area" after the city does not make it another). */
export function jobKey(p: Pick<Posting, "employer_display" | "title" | "region">): string {
  return `${norm(p.employer_display)}|${cleanTitle(p)}|${cityOf(p)}`
}

/**
 * One entry per job. A job found on LinkedIn, on Magnet.me and on the employer's own site is one job with three sources,
 * kept as the employer's posting (the fullest, with the direct way to apply). The postings left out are mapped to the one
 * kept, so anything saved against an older id still finds its job.
 */
export function dedupe<T extends Posting>(posts: ReadonlyArray<T>): { jobs: T[]; alias: Map<string, string> } {
  const byTitle = new Map<string, T[]>()
  for (const p of posts) {
    const k = `${norm(p.employer_display)}|${cleanTitle(p)}`
    byTitle.set(k, [...(byTitle.get(k) ?? []), p])
  }
  // Within one employer and title, postings in the same city are one job.
  const groups: T[][] = []
  for (const same of byTitle.values()) {
    const clusters: Array<{ city: string; members: T[] }> = []
    for (const p of same) {
      const city = cityOf(p)
      const home = clusters.find((c) => sameCity(c.city, city))
      if (home) {
        home.members.push(p)
        if (city.length < home.city.length) home.city = city
      } else {
        clusters.push({ city, members: [p] })
      }
    }
    groups.push(...clusters.map((c) => c.members))
  }
  const jobs: T[] = []
  const alias = new Map<string, string>()
  const order = new Map(posts.map((p, i) => [p.id, i]))
  for (const group of groups) {
    const ranked = [...group].sort((a, b) => RANK((a.ats ?? "").toLowerCase()) - RANK((b.ats ?? "").toLowerCase()) || (b.posted_at ?? "").localeCompare(a.posted_at ?? "") || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    const keep = ranked[0]
    const seen = new Set<string>()
    const sources: JobSource[] = []
    for (const p of ranked) {
      const s = sourceOf(p)
      const id = `${s.ats}|${s.url ?? ""}`
      if (!seen.has(id)) {
        seen.add(id)
        sources.push(s)
      }
      if (p.id !== keep.id) {
        alias.set(p.id, keep.id)
      }
    }
    jobs.push({ ...keep, sources })
  }
  // Keep the original order of the list.
  jobs.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  return { jobs, alias }
}

/**
 * The pool as the database view app_jobs gives it: every active posting, each saying which posting it was merged into (kept_id) and its
 * rank among the postings of the same job. The database has already decided what is the same job, so nothing is guessed here: the kept
 * posting is the job, the others become aliases for it (so an older saved id still finds its job), and the platforms of the whole group
 * are listed on it. Null when the rows do not come from the view.
 */
export function mergeByView<T extends Posting>(posts: ReadonlyArray<T>): { jobs: T[]; alias: Map<string, string> } | null {
  if (posts.length === 0 || !posts.every((p) => typeof p.kept_id === "string" && p.kept_id !== "")) {
    return null
  }
  const groups = new Map<string, T[]>()
  for (const p of posts) {
    const k = p.kept_id as string
    groups.set(k, [...(groups.get(k) ?? []), p])
  }
  const jobs: T[] = []
  const alias = new Map<string, string>()
  for (const p of posts) {
    if (p.id !== p.kept_id) {
      alias.set(p.id, p.kept_id as string)
      continue
    }
    const seen = new Set<string>()
    const sources: JobSource[] = []
    for (const q of [...(groups.get(p.id) ?? [p])].sort((a, b) => (a.pick_rank ?? 0) - (b.pick_rank ?? 0))) {
      const s = sourceOf(q)
      const id = `${s.ats}|${s.url ?? ""}`
      if (!seen.has(id)) {
        seen.add(id)
        sources.push(s)
      }
    }
    jobs.push({ ...p, sources })
  }

  return { jobs, alias }
}

/** One entry per job, from the database's own merge where the rows come from the view, else worked out here. */
export function mergePool<T extends Posting>(posts: ReadonlyArray<T>): { jobs: T[]; alias: Map<string, string> } {
  const merged = mergeByView(posts) ?? dedupe(posts)
  const urls = new Map<string,string>(), jobs:T[]=[]
  for(const post of merged.jobs) {
    let key=""
    try { const u=new URL(post.url || "");u.hash="";u.pathname=u.pathname.replace(/\/+$/,
      "") || "/";key=`${u.toString()}|${norm(post.employer_display)}|${cleanTitle(post)}` } catch { /* Missing links do not establish identity. */ }
    const kept=key ? urls.get(key) : undefined
    if(kept) merged.alias.set(post.id,kept)
    else {jobs.push(post);if(key)urls.set(key,post.id)}
  }
  for(const [from,to] of merged.alias) {
    let target=to
    const seen=new Set([from])
    while(merged.alias.has(target) && !seen.has(target)) {seen.add(target);target=merged.alias.get(target)!}
    merged.alias.set(from,target)
  }
  return {jobs,alias:merged.alias}
}
