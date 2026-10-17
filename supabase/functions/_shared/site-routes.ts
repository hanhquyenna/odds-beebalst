/**
 * Route templates: how an application moves on one platform, as a short guide for Broods (never a script). The same platform has one
 * route from the job page to "only Submit left"; what differs between employers is their questions. A template names the route, the
 * platform's quirks and a step budget, so Broods spends its steps on the job's own questions instead of re-exploring the page.
 *
 * Templates start hand-written (below) and are replaced by routes learned from runs that reached review: each finished run's route is
 * kept in structure only (step kinds and canonical button words, never a value). The first route that reaches review on a platform (or
 * on an employer's own career site) is the guide from the next run on; it is dropped once it fails more often than it works.
 */

export interface RouteTemplate {
  /** The route, in order, as short steps. */
  steps: string[]
  /** What is particular to this platform (widgets, traps). */
  quirks: string[]
  /** Steps a clean run needs; going well over means lost. */
  budget: number
}

/** Hand-written templates, from the platforms' real pages and Broods' runs on them (October 2026). */
export const ROUTES: Record<string, RouteTemplate> = {
  greenhouse: {
    steps: ["read_page (the form is on the job page itself)", "ONE fill: every field the facts answer, dropdowns by value", "upload_cv into Resume/CV", "tick required consent; fill EEO with Prefer not to say / Decline", "finish review"],
    quirks: ["Dropdowns (react-select) take the typed value: do not call options for country, location, school, yes/no", "After the CV upload the Resume box shows the file name: that is done, do not upload again", "'Cover letter' is usually optional: leave it unless required", "Location (City) is a typeahead: give lives_in"],
    budget: 5,
  },
  ashby: {
    steps: ["read_page; if the form is not shown press the 'Application' tab", "upload_cv first (Ashby may autofill from it), then ONE fill of everything still empty", "yes/no questions are buttons: fill them by value", "finish review"],
    quirks: ["'Autofill from resume' box is not the CV field: use the Resume field", "Location is a typeahead: give lives_in and take the first suggestion", "Yes/No questions are toggle buttons, fill takes Yes or No"],
    budget: 6,
  },
  lever: {
    steps: ["read_page", "click 'Apply for this job'", "ONE fill of everything + upload_cv (Resume/CV)", "finish review"],
    quirks: ["Uploading the CV may refill or clear name/email: check the returned page once, refill only what was cleared", "'Current company' and 'Additional information' are optional"],
    budget: 5,
  },
  workday: {
    steps: ["read_page", "click 'Apply'", "choose 'Apply Manually' (never 'Autofill with Resume' or LinkedIn)", "a sign-in / create-account page → finish needs_you account at once"],
    quirks: ["Workday always asks for an account before the form: do not try to get around it", "After the person signs in: steps are My Information → My Experience (upload_cv) → Application Questions → Voluntary Disclosures → Review; press 'Save and Continue' after each"],
    budget: 4,
  },
  smartrecruiters: {
    steps: ["read_page", "click 'I'm interested' / 'Apply'", "ONE fill + upload_cv", "press 'Next' if shown", "finish review"],
    quirks: ["Phone has a separate country picker: national number in the phone box", "'Confirm your email' repeats the email"],
    budget: 6,
  },
  oracle: {
    steps: ["read_page", "Apply / 'Apply Now'", "email + accept terms; a code or password page → finish needs_you account"],
    quirks: ["Oracle Candidate Experience sends an email code: that is the person's"],
    budget: 5,
  },
  "magnet.me": {
    steps: ["read_page", "click 'Apply now' / 'Apply'", "a pop-up (sign-up or preferences): Close or Skip", "click 'Apply on the company website' → the employer's site opens (follow its own route)"],
    quirks: ["Magnet.me never holds the form: the employer's site does", "If the same pop-up returns, close it instead of filling it"],
    budget: 5,
  },
  linkedin: {
    steps: ["read_page", "'Easy Apply' → the dialog: fill each step and press Next until Review → finish review", "'Apply' (external) → the employer's site opens (follow its own route)"],
    quirks: ["Easy Apply's contact step is prefilled from the person's LinkedIn: keep it", "A LinkedIn sign-in wall → finish needs_you account"],
    budget: 7,
  },
  glassdoor: {
    steps: ["read_page", "a 'Verify you are human' / Cloudflare page → finish needs_you captcha at once", "else 'Apply on employer site' / 'Easy Apply'"],
    quirks: ["Do not retry a human-verification page: it is the person's"],
    budget: 3,
  },
  indeed: {
    steps: ["read_page", "a verification or sign-in page → finish needs_you (captcha / account) at once", "else 'Apply on company site' / 'Apply now'"],
    quirks: ["Indeed's own apply needs an Indeed account: that is the person's"],
    budget: 3,
  },
  ats: {
    steps: ["read_page (the form is usually on the job page or one 'Apply' click away)", "ONE fill of everything + upload_cv", "Next/Continue while shown", "finish review"],
    quirks: [],
    budget: 6,
  },
}

/** Which template a page follows: its ATS, a job board, or the generic ATS route for the small ones. */
export function routeKey(url: string): string | null {
  let host = ""
  try { host = new URL(url).hostname.toLowerCase() } catch { return null }
  if (/(^|\.)lever\.co$/.test(host)) return "lever"
  if (/greenhouse\.io$/.test(host)) return "greenhouse"
  if (/ashbyhq\.com$/.test(host)) return "ashby"
  if (/myworkday(jobs|site)\.com$/.test(host)) return "workday"
  if (/oraclecloud\.com$/.test(host)) return "oracle"
  if (/smartrecruiters\.com$/.test(host)) return "smartrecruiters"
  if (/(^|\.)magnet\.me$/.test(host)) return "magnet.me"
  if (/(^|\.)linkedin\.com$/.test(host)) return "linkedin"
  if (/(^|\.)glassdoor\./.test(host)) return "glassdoor"
  if (/(^|\.)indeed\./.test(host)) return "indeed"
  if (/recruitee\.com$|teamtailor\.com$|personio\.(de|com)$|workable\.com$|join\.com$|homerun\.co$|bamboohr\.com$/.test(host)) return "ats"
  return null
}

/** Canonical words for buttons in a learned route: only these (and nothing typed by or about the person) are ever stored. */
const BUTTON_WORDS = /^(apply( now| for this job| on (the )?(company|employer)('s)? (site|website))?|easy apply|i'?m interested|apply manually|application|next|continue|save and continue|review|close|skip|not now|reject all|necessary only|accept|start|volgende|solliciteren|doorgaan)$/i

/** A finished run's route in structure only: step kinds and canonical button words. Null when a step cannot be said safely. */
export function compressRoute(commands: Array<{ tool: string; args?: Record<string, unknown> | null; result?: Record<string, unknown> | null }>, buttonText: (id: string, index: number) => string | null): string[] | null {
  const out: string[] = []
  commands.forEach((c, i) => {
    if (c.tool === "read_page" && c.args?.after_action) return
    if (c.tool === "click") {
      const text = (buttonText(String(c.args?.id ?? ""), i) || "").replace(/\s+/g, " ").trim()
      out.push(BUTTON_WORDS.test(text) ? `click ${text.toLowerCase()}` : "click")
      return
    }
    if (["read_page", "fill", "upload_cv", "upload_letter", "write_letter", "options", "screenshot", "scroll", "click_at", "type_text", "press_key", "back", "open_job"].includes(c.tool)) out.push(c.tool)
  })
  // Repeats of the same step collapse ("fill, fill" → "fill"): a route is the order of kinds of steps, not their count.
  return out.filter((s, i) => s !== out[i - 1]).slice(0, 30)
}

/** Where a page's learned routes are kept: its platform, else its own site ("host:jobs.example.com") for employer career sites. */
export function routeStoreKey(url: string): string | null {
  const key = routeKey(url)
  if (key && key !== "ats") return key
  try { return `host:${new URL(url).hostname.toLowerCase().replace(/^www\./, "")}` } catch { return key }
}

export interface LearnedRoute { route: string[]; successes: number; failures: number; avgSteps: number }

/** A learned route is used from its FIRST success, and dropped once it fails more often than it works (sites change). */
export const usable = (l: LearnedRoute): boolean => l.successes >= 1 && l.failures <= l.successes

/** The guide Broods gets: a route that already reached review on this platform or site, else the hand-written template. */
export function routeHint(key: string | null, learned: LearnedRoute | null, template: string | null = key): { platform: string; route: string[]; quirks: string[]; budget: number; source: "learned" | "template"; proven?: number } | null {
  if (!key) return null
  const t = template ? ROUTES[template] : undefined
  if (learned && usable(learned)) return { platform: key, route: learned.route, quirks: t?.quirks ?? [], budget: Math.max(3, Math.round(learned.avgSteps) + 1), source: "learned", proven: learned.successes }
  return t ? { platform: key, route: t.steps, quirks: t.quirks, budget: t.budget, source: "template" } : null
}
