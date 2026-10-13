// Job pages on every site odds reads: which addresses are one job, the one address each job is stored under, and the job itself as the page
// describes it for search engines (schema.org JobPosting). Pure: no network and no imports, so the jobs function, the extension's own route,
// the tests and the extension itself (built into extension/job-sites.js by scripts/build-extension.sh) all use this one file.

/** One job at one address. `site` names where it was found; `ats` is the value kept in postings.ats. */
export interface JobLink {
  site: string
  ats: string
  /** The site's own id of the job (LinkedIn's number, Indeed's jk, ...), or the address path for sites without one. */
  id: string
  /** The one form the job is stored under, so the same job is never held twice. */
  url: string
}

/** The job as a page describes it. Text only, no markup. */
export interface Posting {
  title: string
  company: string
  location: string
  description: string
  posted: string | null
  valid: string | null
  logo: string | null
  employment: string | null
  /** What LinkedIn says about the job beside it, when it was read there: "Be among the first 25 applicants", "Entry level", closed. */
  applicants?: string | null
  seniority?: string | null
  closed?: boolean
}

// Each host a site is served from: its country sites too (nl.indeed.com, www.glassdoor.nl, uk.indeed.com, www.glassdoor.co.uk, ...).
const LINKEDIN_HOST = /^(www\.|[a-z]{2,3}\.)?linkedin\.com$/
const INDEED_HOST = /^([a-z]{2,3}\.)?indeed\.(com|nl|de|fr|be|ch|at|ie|es|it|ca|pl|pt|se|dk|no|fi|lu|co\.uk|com\.au|co\.in|com\.sg|co\.za|com\.br|com\.mx)$/
const GLASSDOOR_HOST = /^(www\.)?glassdoor\.(com|nl|de|fr|be|ch|at|ie|es|it|ca|co\.uk|com\.au|co\.in|com\.sg|com\.br|com\.mx|sg)$/
const MAGNET_HOST = /^(www\.)?magnet\.me$/
const ACADEMIC_HOST = /^(www\.)?academictransfer\.com$/

/** Employer job boards: the host says which, and the address path says which job. */
const BOARDS: Array<[ats: string, host: RegExp, path: RegExp]> = [
  ["greenhouse", /^(boards|job-boards)(\.eu)?\.greenhouse\.io$/, /^\/[^/]+\/jobs\/\d+$/],
  ["lever", /^jobs(\.eu)?\.lever\.co$/, /^\/[^/]+\/[0-9a-f-]{36}$/],
  ["ashby", /^jobs\.ashbyhq\.com$/, /^\/[^/]+\/[0-9a-f-]{36}$/],
  ["smartrecruiters", /^(jobs|careers)\.smartrecruiters\.com$/, /^\/[^/]+\/\d{6,}(-[^/]*)?$/],
  ["workday", /^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/, /\/job\/.+_[A-Za-z0-9-]+$/],
  ["personio", /^[a-z0-9-]+\.jobs\.personio\.(de|com)$/, /^\/job\/\d+$/],
  ["recruitee", /^[a-z0-9-]+\.recruitee\.com$/, /^\/o\/[^/]+$/],
  ["teamtailor", /^[a-z0-9-]+\.teamtailor\.com$/, /^\/jobs\/\d+[^/]*$/],
  ["workable", /^apply\.workable\.com$/, /^\/[^/]+\/j\/[0-9A-F]{6,}$/i],
  ["join", /^join\.com$/, /^\/companies\/[^/]+\/\d+[^/]*$/],
]
/** The last part of a board's address that is the form, not the job: the job is the page above it. */
const FORM = /\/(apply|application|applications\/new)$/

/** A query part that names the job on a page of its own (company career sites); everything else in the query is tracking. */
const JOB_QUERY = ["gh_jid", "jobid", "jobId", "job_id", "jid", "id", "vacancy", "vacancyid", "vacancyId", "job", "postingId", "req", "requisitionId"]

/**
 * The job at an address, or null when it is not one job. Takes every address the sites show for a job: with tracking, a search page with one job
 * open beside the list (LinkedIn's currentJobId, Indeed's vjk), a country site. `anyPage` also takes an address on any other site (a company's own
 * career pages), for a page that says itself it is a job (see postingFrom); without it only the sites above count.
 */
export function jobLink(input: string, anyPage = false): JobLink | null {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  if (u.protocol !== "https:") return null
  const host = u.hostname.toLowerCase()
  const path = u.pathname.replace(/\/+$/, "")

  if (LINKEDIN_HOST.test(host)) {
    const view = /^\/jobs\/view\/(?:[^/?#]*-)?(\d{8,12})$/.exec(path)
    const current = path.startsWith("/jobs") ? u.searchParams.get("currentJobId") : null
    const id = view?.[1] ?? (current && /^\d{8,12}$/.test(current) ? current : null)

    return id ? { site: "linkedin", ats: "linkedin", id, url: `https://www.linkedin.com/jobs/view/${id}` } : null
  }
  if (INDEED_HOST.test(host)) {
    const jk = u.searchParams.get("jk") ?? u.searchParams.get("vjk")
    if (!jk || !/^[0-9a-f]{16}$/.test(jk)) return null

    return { site: "indeed", ats: "indeed", id: jk, url: `https://${host.includes(".") && host.split(".").length > 2 ? host : `www.${host}`}/viewjob?jk=${jk}` }
  }
  if (GLASSDOOR_HOST.test(host)) {
    const jl = u.searchParams.get("jl") ?? u.searchParams.get("jobListingId")
    if (!jl || !/^\d{6,20}$/.test(jl)) return null
    const listing = /^\/job-listing\/[^/]+\.htm$/.test(path) ? path : "/job-listing/j.htm"

    return { site: "glassdoor", ats: "glassdoor", id: jl, url: `https://${host.startsWith("www.") ? host : `www.${host}`}${listing}?jl=${jl}` }
  }
  if (MAGNET_HOST.test(host)) {
    const m = /^\/([a-z]{2}(?:-[A-Z]{2})?)\/(vacature|opportunity|vacancy|job|stage|internship|traineeship)\/(\d{3,})(\/[^/]+)?$/i.exec(path)

    return m ? { site: "magnet.me", ats: "magnet.me", id: m[3], url: `https://magnet.me/${m[1]}/${m[2]}/${m[3]}${m[4] ?? ""}` } : null
  }
  if (ACADEMIC_HOST.test(host)) {
    const m = /^\/([a-z]{2})\/jobs\/(\d{3,})(\/[^/]+)?$/.exec(path)

    return m ? { site: "academictransfer", ats: "academictransfer", id: m[2], url: `https://www.academictransfer.com/${m[1]}/jobs/${m[2]}${m[3] ?? ""}/` } : null
  }
  const job = path.replace(FORM, "")
  for (const [ats, hostRx, pathRx] of BOARDS) {
    if (hostRx.test(host)) return pathRx.test(job) ? { site: ats, ats, id: job, url: `https://${host}${job}` } : null
  }
  if (!anyPage || !/\.[a-z]{2,}$/.test(host) || job === "") return null
  const keep = JOB_QUERY.filter((k) => u.searchParams.get(k)).map((k) => `${k}=${encodeURIComponent(u.searchParams.get(k) ?? "")}`)
  const where = `${job}${keep.length ? `?${keep.join("&")}` : ""}`

  return { site: "web", ats: "other", id: where, url: `https://${host}${where}` }
}

/**
 * The PostgREST filter that finds a job odds already holds, under the address it was stored with. Job boards that were loaded in bulk kept their
 * own longer addresses (an Indeed link from another country site, a Glassdoor link with the job's name in it), so those are found by the job's id.
 */
export function heldFilter(link: JobLink): string {
  const id = encodeURIComponent(link.id)
  if (link.site === "indeed") return `url=like.*indeed.*jk=${id}*`
  if (link.site === "glassdoor") return `url=like.*glassdoor.*jl=${id}*`
  if (link.site === "magnet.me") return `or=(url.like.*magnet.me/*/${id}/*,url.like.*magnet.me/*/${id})`
  if (link.site === "academictransfer") return `url=like.*academictransfer.com/*/jobs/${id}/*`

  return `url=eq.${encodeURIComponent(link.url)}`
}

/** The site a host belongs to when it is one odds knows (a job site or an employer job board), else null. */
export function siteOfHost(hostname: string): string | null {
  const host = hostname.toLowerCase()
  if (LINKEDIN_HOST.test(host)) return "linkedin"
  if (INDEED_HOST.test(host)) return "indeed"
  if (GLASSDOOR_HOST.test(host)) return "glassdoor"
  if (MAGNET_HOST.test(host)) return "magnet.me"
  if (ACADEMIC_HOST.test(host)) return "academictransfer"

  return BOARDS.find(([, rx]) => rx.test(host))?.[0] ?? null
}

const COUNTRY: Record<string, string> = { NL: "Netherlands", NLD: "Netherlands", BE: "Belgium", DE: "Germany", FR: "France", GB: "United Kingdom", UK: "United Kingdom", IE: "Ireland", US: "United States", ES: "Spain", IT: "Italy", CH: "Switzerland", AT: "Austria", LU: "Luxembourg", DK: "Denmark", SE: "Sweden", PL: "Poland", PT: "Portugal" }

/** Dutch provinces as job boards abbreviate them (Indeed: "Amsterdam, NH"); the rest of the table spells them out. */
const PROVINCE: Record<string, string> = { NH: "North Holland", ZH: "South Holland", UT: "Utrecht", NB: "North Brabant", LI: "Limburg", GE: "Gelderland", OV: "Overijssel", DR: "Drenthe", FR: "Friesland", GR: "Groningen", ZE: "Zeeland", FL: "Flevoland" }

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", bull: "•" }

/** Plain text from the markup a JobPosting description is written in: paragraphs and list items on lines of their own. */
export function textOf(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)

        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " "
      }

      return ENTITY[e.toLowerCase()] ?? whole
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

type Obj = Record<string, unknown>
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "")
const nameOf = (v: unknown): string => (typeof v === "string" ? v.trim() : v && typeof v === "object" ? str((v as Obj).name) : "")
const isPosting = (o: Obj): boolean => [o["@type"]].flat().some((t) => typeof t === "string" && /(^|\/)JobPosting$/i.test(t))

/** Every object in what a page's ld+json scripts hold: arrays, @graph lists and nested items included. */
function* objects(v: unknown, depth = 0): Generator<Obj> {
  if (depth > 6 || !v || typeof v !== "object") return
  if (Array.isArray(v)) {
    for (const x of v) yield* objects(x, depth + 1)

    return
  }
  const o = v as Obj
  yield o
  for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) if (key in o) yield* objects(o[key], depth + 1)
}

function placeOf(p: Obj): string {
  const places = [p.jobLocation].flat().filter(Boolean) as unknown[]
  const read = places.map((pl) => {
    const a = ((pl as Obj)?.address ?? pl) as Obj | string
    if (typeof a === "string") return a.trim()
    const code = nameOf(a?.addressCountry)
    const country = COUNTRY[code.toUpperCase()] ?? code
    const region = str(a?.addressRegion)
    const parts = [str(a?.addressLocality), country === "Netherlands" ? (PROVINCE[region.toUpperCase()] ?? region) : region, country]

    return parts.filter((x, i) => x && parts.indexOf(x) === i).join(", ")
  }).filter(Boolean)
  const remote = [p.jobLocationType].flat().some((t) => /telecommute/i.test(str(t)))
  if (read.length) return read[0]
  if (remote) {
    const where = [p.applicantLocationRequirements].flat().map(nameOf).filter(Boolean)[0]

    return where ? `Remote, ${COUNTRY[where.toUpperCase()] ?? where}` : "Remote"
  }

  return ""
}

/** The job a page describes, from the ld+json it gives search engines (already parsed), or null when it describes none. */
export function postingFrom(data: unknown): Posting | null {
  for (const o of objects(data)) {
    if (!isPosting(o)) continue
    const org = o.hiringOrganization as Obj | string | undefined
    const posting: Posting = {
      title: textOf(str(o.title) || str(o.name)),
      company: textOf(nameOf(org)),
      location: placeOf(o),
      description: textOf(str(o.description)),
      posted: str(o.datePosted) || null,
      valid: str(o.validThrough) || null,
      logo: (org && typeof org === "object" && (str(org.logo) || str((org.logo as Obj)?.url))) || null,
      employment: [o.employmentType].flat().map(str).filter(Boolean).join(", ") || null,
    }
    if (posting.title && posting.company) return posting
  }

  return null
}

/** Whether a posting says enough to be kept for everyone: a title, an employer and a real description, of sane sizes. */
export function postingUsable(p: Posting | null | undefined): p is Posting {
  return Boolean(p && p.title.length >= 2 && p.title.length <= 300 && p.company.length >= 1 && p.company.length <= 200 && p.description.length >= 120 && p.description.length <= 100_000 && p.location.length <= 300)
}

/** A posting handed over by a browser, taken only as plain text fields of sane sizes; null when it is not a usable posting. */
export function postingSent(x: unknown): Posting | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null
  const o = x as Obj
  const text = (k: string, max: number): string => (typeof o[k] === "string" ? [...(o[k] as string)].filter((c) => c >= " " || c === "\n" || c === "\t").join("").trim().slice(0, max) : "")
  const date = (k: string): string | null => (/^\d{4}-\d{2}-\d{2}/.test(text(k, 40)) ? text(k, 40) : null)
  const logo = text("logo", 2000)
  const p: Posting = { title: text("title", 400), company: text("company", 300), location: text("location", 400), description: text("description", 100_000), posted: date("posted"), valid: date("valid"), logo: /^https:\/\//.test(logo) ? logo : null, employment: text("employment", 200) || null, applicants: text("applicants", 120) || null, seniority: text("seniority", 80) || null, closed: o.closed === true }

  return postingUsable(p) ? p : null
}

/** LinkedIn's public page of one job, the address its own job pages read it from (no sign-in needed): what is read for a LinkedIn job. */
export const linkedinPublicJob = (id: string): string => `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`

/**
 * A LinkedIn job from its public page (linkedinPublicJob), the way scripts/pull-linkedin-public.ts reads it: by LinkedIn's own class names, as
 * text, so no part of the page is ever run or drawn. Null when the page holds no job.
 */
export function postingFromLinkedIn(html: string): Posting | null {
  const grab = (rx: RegExp): string => textOf(rx.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim()
  const logo = /artdeco-entity-image[^>]*data-delayed-url="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, "&") ?? null
  const posting: Posting = {
    title: grab(/topcard__title[^>]*>([\s\S]*?)<\//),
    company: grab(/topcard__org-name-link[^>]*>([\s\S]*?)<\/a>/) || grab(/topcard__flavor[^>]*>([\s\S]*?)<\//),
    location: grab(/topcard__flavor topcard__flavor--bullet[^>]*>([\s\S]*?)<\//),
    description: textOf(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ""),
    posted: null,
    valid: null,
    logo: logo && /^https:\/\//.test(logo) ? logo : null,
    employment: grab(/Employment type\s*<\/h3>\s*<span[^>]*>([\s\S]*?)<\/span>/) || null,
    applicants: grab(/num-applicants__caption[^>]*>([\s\S]*?)<\//) || null,
    seniority: grab(/Seniority level\s*<\/h3>\s*<span[^>]*>([\s\S]*?)<\/span>/) || null,
    closed: /closed-job|No longer accepting applications/i.test(html),
  }

  return posting.title && posting.company ? posting : null
}
