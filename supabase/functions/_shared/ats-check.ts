/**
 * Is a posting still open? Asks the employer's own public job board, the one the posting came from.
 * An answer is "open" or "closed" only when the board says so plainly (the job is listed, or the board answers
 * "not found"). Anything else, a timeout, a rate limit, a server error, a board we cannot find, is "unknown",
 * and an unknown answer never changes a posting.
 */
export type Verdict = "open" | "closed" | "unknown"

export interface Row {
  id: string
  ats: string
  employer: string
  title: string
  url: string | null
}

/** The ATS types that have a free public feed. Others (LinkedIn, Magnet.me, AcademicTransfer, SuccessFactors) are not checked here. */
export const CHECKED = ["greenhouse", "ashby", "lever", "smartrecruiters", "recruitee", "personio", "teamtailor", "workday"]

const UA = "odds-job-check/1.0 (checks that job postings are still open)"

type Fetched = { status: number; text: string } | null

async function get(url: string, timeoutMs = 20000): Promise<Fetched> {
  // One quiet retry for a rate limit or a server hiccup; anything still wrong after that is "unknown".
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json, text/xml, text/html" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) })
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }

      return { status: res.status, text: await res.text() }
    } catch {
      if (attempt === 1) {
        return null
      }
    }
  }

  return null
}

export const norm = (s: string): string => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&nbsp;|&amp;/g, " ").replace(/[^a-z0-9]+/g, " ").trim()

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "")

/** A board's list of open jobs: the ids, and the normalised titles for postings we hold without a link. */
export interface Board {
  ids: Set<string>
  titles: Set<string>
}

/** Whether a posting is on a board's list. By id when the posting has a link, otherwise by title. */
export function onBoard(board: Board, id: string | null, title: string): boolean {
  if (id && board.ids.has(id)) {
    return true
  }

  return board.titles.has(norm(title))
}

// ---- boards that are read as a list (one request per employer, however many postings we hold) ----

export function greenhouseBoard(json: string): Board | null {
  try {
    const jobs = (JSON.parse(json) as { jobs?: Array<{ id: number; title: string }> }).jobs
    if (!Array.isArray(jobs)) {
      return null
    }

    return { ids: new Set(jobs.map((j) => String(j.id))), titles: new Set(jobs.map((j) => norm(j.title))) }
  } catch {
    return null
  }
}

export function ashbyBoard(json: string): Board | null {
  try {
    const jobs = (JSON.parse(json) as { jobs?: Array<{ id: string; title: string }> }).jobs
    if (!Array.isArray(jobs)) {
      return null
    }

    return { ids: new Set(jobs.map((j) => j.id)), titles: new Set(jobs.map((j) => norm(j.title))) }
  } catch {
    return null
  }
}

export function recruiteeBoard(json: string): Board | null {
  try {
    const offers = (JSON.parse(json) as { offers?: Array<{ slug: string; title: string }> }).offers
    if (!Array.isArray(offers)) {
      return null
    }

    return { ids: new Set(offers.map((o) => o.slug)), titles: new Set(offers.map((o) => norm(o.title))) }
  } catch {
    return null
  }
}

export function personioBoard(xml: string): Board | null {
  if (!xml.includes("<workzag-jobs")) {
    return null
  }
  const ids = new Set([...xml.matchAll(/<id>(\d+)<\/id>/g)].map((m) => m[1]))
  const titles = new Set([...xml.matchAll(/<name>([^<]*)<\/name>/g)].map((m) => norm(m[1])))

  return { ids, titles }
}

/** The id inside a posting's link, for the boards read as lists. */
export function idFromUrl(ats: string, url: string | null): string | null {
  if (!url) {
    return null
  }
  switch (ats) {
    case "greenhouse":
      return url.match(/\/jobs\/(\d+)/)?.[1] ?? url.match(/[?&]gh_jid=(\d+)/)?.[1] ?? null
    case "ashby":
      return url.match(/ashbyhq\.com\/[^/]+\/([0-9a-f-]{36})/i)?.[1] ?? null
    case "recruitee":
      return url.match(/\/o\/([^/?#]+)/)?.[1] ?? null
    case "personio":
      return url.match(/\/job\/(\d+)/)?.[1] ?? null
    default:
      return null
  }
}

/** Where a list board lives, for one posting. Null when we cannot tell, which makes the answer "unknown". */
export function boardUrl(row: Row): string | null {
  const u = row.url ?? ""
  switch (row.ats) {
    case "greenhouse": {
      const token = u.match(/greenhouse\.io\/([^/?#]+)/)?.[1] ?? slug(row.employer)

      return `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`
    }
    case "ashby": {
      const token = u.match(/ashbyhq\.com\/([^/?#]+)/)?.[1] ?? row.employer.toLowerCase().replace(/\s+/g, "")

      return `https://api.ashbyhq.com/posting-api/job-board/${token}`
    }
    case "recruitee": {
      const host = u.match(/^https:\/\/([^/]+)\/o\//)?.[1]

      return host ? `https://${host}/api/offers/` : null
    }
    case "personio": {
      const host = u.match(/^https:\/\/([^/]+)\/job\//)?.[1]

      return host ? `https://${host}/xml` : null
    }
    default:
      return null
  }
}

const parseBoard: Record<string, (body: string) => Board | null> = { greenhouse: greenhouseBoard, ashby: ashbyBoard, recruitee: recruiteeBoard, personio: personioBoard }

// ---- boards that answer for one job ----

/** The address that answers for a single job, and the answers that mean it is gone. */
export function jobEndpoint(row: Row): { url: string; gone: number[] } | null {
  const u = row.url
  if (!u) {
    return null
  }
  switch (row.ats) {
    case "lever": {
      const m = u.match(/^https:\/\/jobs\.(eu\.)?lever\.co\/([^/]+)\/([^/?#]+)/)

      return m ? { url: `https://api.${m[1] ?? ""}lever.co/v0/postings/${m[2]}/${m[3]}`, gone: [404] } : null
    }
    case "smartrecruiters": {
      const m = u.match(/smartrecruiters\.com\/([^/]+)\/(\d+)/)

      return m ? { url: `https://api.smartrecruiters.com/v1/companies/${m[1]}/postings/${m[2]}`, gone: [400, 404] } : null
    }
    case "workday": {
      const m = u.match(/^https:\/\/([^/]+)\/(?:recruiting\/([^/]+)\/)?(?:[a-z]{2}-[A-Z]{2}\/)?([^/]+)\/job\/(.+)$/)
      if (!m) {
        return null
      }
      const host = m[1]
      // myworkdaysite.com: /recruiting/{tenant}/{site}/job/...   myworkdayjobs.com: {tenant}.wdN.../{site}/job/...
      const tenant = m[2] ?? host.split(".")[0]
      const site = m[2] ? u.match(/recruiting\/[^/]+\/([^/]+)\/job\//)?.[1] : m[3]

      return site ? { url: `https://${host}/wday/cxs/${tenant}/${site}/job/${m[4]}`, gone: [404] } : null
    }
    case "teamtailor":
      return { url: u, gone: [404, 410] }
    default:
      return null
  }
}

/**
 * Some Workday tenants answer 403 for a job that is gone, and 200 for one that is open. We believe that only after the
 * tenant has shown it: one job from its own search must read 200. If the control fails, a 403 stays "unknown".
 */
async function tenantAnswers403ForGone(jobUrl: string): Promise<boolean> {
  const base = jobUrl.match(/^(https:\/\/[^/]+\/wday\/cxs\/[^/]+\/[^/]+)\/job\//)?.[1]
  if (!base) {
    return false
  }
  try {
    const res = await fetch(`${base}/jobs`, {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
      signal: AbortSignal.timeout(20000),
    })
    const path = ((await res.json()) as { jobPostings?: Array<{ externalPath?: string }> }).jobPostings?.[0]?.externalPath
    if (res.status !== 200 || !path) {
      return false
    }

    return (await get(`${base}${path}`))?.status === 200
  } catch {
    return false
  }
}

/** Decide every row. Reads each employer's list once, and asks for the single jobs a few at a time. */
export async function checkRows(rows: Row[], pool = 4): Promise<Map<string, Verdict>> {
  const out = new Map<string, Verdict>()

  // 1. List boards: one request per board.
  const boards = new Map<string, Promise<Board | null>>()
  const listRows = rows.filter((r) => boardUrl(r))
  for (const r of listRows) {
    const url = boardUrl(r) as string
    if (!boards.has(url)) {
      // A Recruitee company on its own domain does not always serve the feed there; its recruitee.com address does.
      const spare = r.ats === "recruitee" ? `https://${slug(r.employer)}.recruitee.com/api/offers/` : null
      const read = async (): Promise<Board | null> => {
        for (const u of spare ? [url, spare] : [url]) {
          const res = await get(u)
          const board = res && res.status === 200 ? parseBoard[r.ats](res.text) : null
          if (board) {
            return board
          }
        }

        return null
      }
      boards.set(url, read())
    }
  }
  for (const r of listRows) {
    const board = await boards.get(boardUrl(r) as string)
    if (!board || (board.ids.size === 0 && board.titles.size === 0)) {
      // A board that did not answer, or answered empty, tells us nothing: an outage must not close every job.
      out.set(r.id, "unknown")
      continue
    }
    const id = idFromUrl(r.ats, r.url)
    out.set(r.id, onBoard(board, id, r.title) ? "open" : "closed")
  }

  // 2. Single-job boards: a handful at a time.
  const single = rows.filter((r) => !out.has(r.id))
  const controls = new Map<string, Promise<boolean>>()
  let next = 0
  const work = async (): Promise<void> => {
    while (next < single.length) {
      const r = single[next++]
      const ep = jobEndpoint(r)
      if (!ep) {
        out.set(r.id, "unknown")
        continue
      }
      const res = await get(ep.url)
      let verdict: Verdict = !res ? "unknown" : res.status === 200 ? "open" : ep.gone.includes(res.status) ? "closed" : "unknown"
      if (res?.status === 403 && r.ats === "workday") {
        const base = ep.url.replace(/\/job\/.*$/, "")
        if (!controls.has(base)) {
          controls.set(base, tenantAnswers403ForGone(ep.url))
        }
        verdict = (await controls.get(base)) ? "closed" : "unknown"
      }
      out.set(r.id, verdict)
    }
  }
  await Promise.all(Array.from({ length: pool }, work))

  return out
}

/** What a verdict does to a posting. A job is closed only after two misses in a row, so one hiccup in a feed never hides it. */
export interface State {
  miss_count: number
  closed_at: string | null
}
export const CLOSE_AFTER = 2

export function applyVerdict(state: State, verdict: Verdict, now: string): { state: State; seen: boolean } {
  if (verdict === "unknown") {
    return { state, seen: false }
  }
  if (verdict === "open") {
    return { state: { miss_count: 0, closed_at: null }, seen: true }
  }
  const miss = state.miss_count + 1

  return { state: { miss_count: miss, closed_at: state.closed_at ?? (miss >= CLOSE_AFTER ? now : null) }, seen: false }
}
