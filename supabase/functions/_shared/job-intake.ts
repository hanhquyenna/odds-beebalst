// Turns one LinkedIn job, as the job-details reader returns it, into a row for public.postings. Pure functions: no network, no clock of their own.
// shared by the jobs Edge Function (/jobs/add, Deno) and the tests (bun). The rules are the ones the loaders use (app/build_data.py, backend/dutch_rules.py), so a job
// that someone pastes is read exactly like one found by a search.
import { guessFamily } from "./job-family.ts"
import { SKILL_PATTERNS } from "./job-skills.ts"

export interface ParsedUrl {
  id: string
  /** The one form every LinkedIn job is stored under, so the same job is never held twice. */
  url: string
}

/** The job id out of any of the addresses LinkedIn shows for a job, or null when the text is not a link to one job. */
export function parseJobUrl(input: string): ParsedUrl | null {
  let u: URL
  try {
    u = new URL(input.trim())
  } catch {
    return null
  }
  if (u.protocol !== "https:" || !/^(www\.|[a-z]{2,3}\.)?linkedin\.com$/.test(u.hostname)) return null
  const view = /^\/jobs\/view\/(?:[^/?#]*-)?(\d{8,12})\/?$/.exec(u.pathname)
  const current = u.pathname.startsWith("/jobs/") ? u.searchParams.get("currentJobId") : null
  const id = view?.[1] ?? (current && /^\d{8,12}$/.test(current) ? current : null)

  return id ? { id, url: `https://www.linkedin.com/jobs/view/${id}` } : null
}

const DUTCH = /\b(dutch|nederlands(e)?)\b/gi
const DREQ = /(required|fluent|proficien|native|must|mandatory|vereist|verplicht|speak|essential|necessary|command)/i
const NEG_A = /\b(no|without|not\s+(?:require|requiring|requires|need|needing|needs))\s+(?:any\s+|knowledge\s+of\s+|speaking\s+|the\s+)?dutch\b/i
const NEG_B = /\bdutch(?:\s+\w+){0,3}?\s+(?:is|are|will\s+be|would\s+be|being)?\s*(?:not|no)\s+(?:a\s+|an\s+)?(?:required|requirement|necessary|needed|mandatory|essential|must)\b/i
const NEG_C = /\bdutch(?:\s+(?:language|skills?|knowledge))?(?:\s*[,/&]\s*(?:(?:or|and)\s+)?\w+|\s+(?:or|and)\s+\w+){0,3}\s*[)!]?\s*(?:is|are|would\s+be)?\s*(?:a\s+|an\s+)?(?:plus|advantage|bonus|pre\b|preferred|preferable|nice|optional|welcome|beneficial|asset)/i

/** Whether the text really needs Dutch: "required" near the word, unless a negation is attached to Dutch itself ("no Dutch required", "Dutch is a plus"). */
export function dutchNeeded(text: string): boolean {
  for (const m of text.matchAll(DUTCH)) {
    const at = m.index ?? 0
    const around = text.slice(Math.max(0, at - 80), at + m[0].length + 80)
    const near = text.slice(Math.max(0, at - 40), at + m[0].length + 60)
    if (DREQ.test(around) && !(NEG_A.test(near) || NEG_B.test(near) || NEG_C.test(near))) return true
  }

  return false
}

const NATCOND = /(nederlandse nationaliteit|nationaliteitseis|nederlander|dutch nationality|dutch citizen|eu-?burger|burger van de eu|eu\/eer|eer-?burger|toegang tot (de )?nederlandse arbeidsmarkt|werkvergunning)/i
const NATCOND_TITLE = /\b\w+(?:ish|ian|an|ese)\s+national\b|\bnational\s+(?:graduate\s+)?trainee\b|\bnationals\s+only\b/i
const SCREEN = /(screening|veiligheidsonderzoek|verklaring omtrent gedrag|\bvog\b|geheimhouding|vertrouwensfunctie)/i

/** Closed to people who are not nationals: a nationality condition in the text, or a "national trainee" scheme in the title. */
export const restrictedToNationals = (text: string, title: string): boolean => NATCOND.test(text) || NATCOND_TITLE.test(title)

/** Whether the opening of the text is English, so a posting in Dutch, German or Chinese is not offered as one for people who do not read it. */
export function isEnglish(text: string): boolean {
  const t = text.slice(0, 1200)
  if (t.length < 80) return false
  const letters = [...t].filter((c) => /\p{L}/u.test(c))
  if (letters.length === 0) return false
  if (letters.filter((c) => c.charCodeAt(0) > 0x024f).length / letters.length > 0.05) return false
  const l = t.toLowerCase()
  const en = (l.match(/\b(the|and|you|your|we|our|with|for|will|are|as|to|of|in|is|on|that|this|have|be)\b/g) ?? []).length
  const other = (l.match(/\b(wij|jij|je|jouw|voor|een|het|van|met|bij|ons|onze|wat|ga|ben|als|der|die|das|und|nicht|ein|eine|mit|fur|für|les|des|une|pour|dans|vous|nous|el|la|los|las|para|con|una|por)\b/g) ?? []).length

  return en >= 6 && en >= other * 2
}

const NL_PLACE = /netherlands|nederland|\bnl\b|amsterdam|rotterdam|utrecht|eindhoven|den haag|the hague|groningen|leiden|delft|tilburg|maastricht|nijmegen|breda|arnhem|almere|veldhoven|amersfoort|zwolle|apeldoorn|enschede|haarlem|heerlen|venlo|gorinchem|hoofddorp|schiphol|zeist|den bosch|hertogenbosch|zaandam|best\b|nieuwegein|leeuwarden|dordrecht|alkmaar|hilversum|wageningen|ede\b|delfzijl|vlissingen|middelburg|emmen|helmond|roosendaal|oss\b|lelystad|amstelveen|capelle|schiedam|zoetermeer|woerden|houten|bunnik|soesterberg|woensdrecht|den helder|zaltbommel|zwijndrecht/i
export const inNetherlands = (place: string): boolean => NL_PLACE.test(place)

const YEARS = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?|jaar)/gi
/** The fewest years of experience the text asks for, or null. */
export function yearsMin(text: string): number | null {
  const years = [...text.matchAll(YEARS)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 15)

  return years.length ? Math.min(...years) : null
}

export function degreeAsked(text: string): "phd" | "master" | "bachelor" | null {
  return /\b(phd|doctorate)\b/i.test(text) ? "phd" : /\b(master'?s?|msc|mba)\b/i.test(text) ? "master" : /\b(bachelor|bsc|hbo|wo)\b/i.test(text) ? "bachelor" : null
}

export const visaMention = (text: string): boolean => /\b(visa|sponsorship|sponsor|relocation|work permit|30% ruling|highly skilled migrant|kennismigrant)\b/i.test(text)
export const juniorTitle = (title: string): boolean => /\b(junior|graduate|trainee|starter|entry|intern|associate|werkstudent)\b/i.test(title)
export const skillsOf = (text: string): string[] => SKILL_PATTERNS.filter(([, rx]) => rx.test(text)).map(([name]) => name)

const CROSSWALK: Array<[RegExp, string]> = [
  [/\baccountant\b|\baudit/i, "0411"],
  [/financial controller|finance controller|controller/i, "0412"],
  [/financial analyst|finance analyst|fp&a|treasury|tax|risk analyst|risk manager|pricing analyst|finance manager|finance business partner|fraud analyst|credit analyst|quant(itative)? (analyst|researcher)|trader|trading/i, "0412"],
  [/accounts? (payable|receivable)|bookkeep|billing|accounting (assistant|specialist)/i, "0421"],
  [/business analyst|consultant|strategy|operations analyst|program(me)? manager|project manager|product manager|product owner/i, "0413"],
  [/data analyst|business intelligence|bi analyst|analytics/i, "0412"],
  [/software|developer|engineer(?!.*(sales|support|network|system|devops|site reliability|security))|data scientist|machine learning|backend|frontend|full ?stack|mobile|ios|android/i, "0814"],
  [/devops|site reliability|sre|cloud engineer|platform engineer|infrastructure|security engineer|network|system(s)? (admin|engineer)|database admin/i, "0812"],
  [/marketing|content|communications|brand|seo|growth/i, "0311"],
  [/account manager|account executive|sales|business development|partnership/i, "0321"],
]
export const crosswalk = (title: string): string | null => CROSSWALK.find(([rx]) => rx.test(title))?.[1] ?? null
export const catOf = (code: string | null): "finance_business" | "tech" | "other" => (code?.startsWith("04") ? "finance_business" : code?.startsWith("08") ? "tech" : "other")

/** "1.016,-", "1,016.50", "1016" and "1 016" as a number, or null. */
function amountOf(raw: string): number | null {
  const t = raw.replace(/[\s\u00a0]/g, "").replace(/,-$|,–$|\.-$/, "")
  let n: number
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) n = Number(t.replace(/\./g, "").replace(",", "."))
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) n = Number(t.replace(/,/g, ""))
  else if (/^\d+([.,]\d{1,2})?$/.test(t)) n = Number(t.replace(",", "."))
  else return null

  return Number.isFinite(n) ? n : null
}

const MONEY = /(?:€|eur(?:o|os)?\b)\s*(\d[\d.,\u00a0 ]*\d|\d)(?:\s*(?:,-|,–|\.-))?|(\d[\d.,]*\d)\s*(?:€|euro|eur\b)/gi
const PAY_CUE = /(allowance|stipend|vergoeding|salary|salaris|compensation|remuneration|paid|pay\b|gross|bruto|brutosalaris|earn|verdien|wage|loon|reimbursement of)/i
const NOT_PAY = /(billion|million|miljard|miljoen|\bbn\b|\bmln\b|\bmn\b|assets|revenue|omzet|turnover|budget|funding|investment|reimburse(?:ment)? of travel|travel cost|reiskosten|home|thuiswerk|laptop)/i

/**
 * The pay the posting itself states, written the way the app reads it ("€1016 per month", "€1000 - €1200 per month", "€17.75 per hour", "€45000 per year"), or
 * null. Only an amount next to a word about pay counts, and company figures ("€250 billion in assets"), small extras ("approx. €70 per month for working from home")
 * and travel costs do not. Dutch and English both: "stagevergoeding van € 1.000,- per maand", "An internship allowance of €1.016,- per month".
 */
export function statedPay(text: string): string | null {
  const found: Array<{ value: number; at: number; unit: "month" | "year" | "hour"; score: number }> = []
  for (const m of text.matchAll(MONEY)) {
    const value = amountOf(m[1] ?? m[2] ?? "")
    if (value === null) continue
    const at = m.index ?? 0
    const before = text.slice(Math.max(0, at - 70), at)
    const after = text.slice(at + m[0].length, at + m[0].length + 50)
    const around = `${before} ${m[0]} ${after}`
    if (NOT_PAY.test(`${before.slice(-28)} ${after.slice(0, 16)}`)) continue
    const unit = /\b(per|a|an|each|every|\/|p\.?)\s*(hour|hr|uur)\b|\bhourly\b|\buurloon\b/i.test(after) ? "hour" : /\b(per|a|\/|p\.?)\s*(year|annum|jaar)\b|\bannual(ly)?\b|\bper jaar\b|\bjaarsalaris\b/i.test(after) ? "year" : "month"
    const stated = /\b(per|a|each|every|\/|p\.?)\s*(month|maand|mnd|mo)\b|\bmonthly\b|\bmaandelijks\b|\bp\/m\b|\bpm\b/i.test(after) || unit !== "month"
    const ok = unit === "hour" ? value >= 5 && value <= 150 : unit === "year" ? value >= 15000 && value <= 250000 : value >= 200 && value <= 20000
    if (!ok || !(stated || PAY_CUE.test(before.slice(-70)))) continue
    if (!PAY_CUE.test(around) && !stated) continue
    // Closest to a pay word wins; an amount said to be per month beats one that is not.
    const cue = [...before.matchAll(new RegExp(PAY_CUE.source, "gi"))].pop()
    const score = (stated ? 2 : 0) + (cue ? 3 - Math.min(3, (before.length - (cue.index ?? 0)) / 30) : 0)
    found.push({ value, at, unit, score })
  }
  if (found.length === 0) return null
  const best = found.sort((a, b) => b.score - a.score || a.at - b.at)[0]
  // A range: the next amount, close behind the best one, in the same unit ("€1.000 - €1.200", "between €1.000 and €1.200").
  const second = found.find((f) => f !== best && f.unit === best.unit && Math.abs(f.at - best.at) < 40 && f.value !== best.value)
  const [low, high] = second ? [Math.min(best.value, second.value), Math.max(best.value, second.value)] : [best.value, best.value]
  const unitText = best.unit === "hour" ? "per hour" : best.unit === "year" ? "per year" : "per month"
  const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2))

  return low === high ? `€${fmt(low)} ${unitText}` : `€${fmt(low)} - €${fmt(high)} ${unitText}`
}

/** The reader's output for one job, the fields we use. */
export interface JobDetails {
  status?: string
  job_status?: string | null
  id?: string
  title?: string
  location?: string
  description?: string
  applicants?: string | number | null
  applicants_text?: string | null
  seniority_level?: string | null
  valid_through?: string | null
  "company.name"?: string
  "company.url"?: string
  "company.logo"?: string
}

/** What the reader said about the job as a whole: usable, closed, or no job found. */
export function readVerdict(item: JobDetails | undefined): "open" | "closed" | "unreadable" {
  if (!item || item.status !== "success" || !item.title || !(item["company.name"] ?? "").trim() || !item.description) return "unreadable"

  return item.job_status === "closed" ? "closed" : "open"
}

/** What the table already knows about this employer, copied so a new job from a known company carries the same display name, sponsor flag and industry. */
export interface KnownEmployer {
  employer_display: string | null
  ind_sponsor: boolean | null
  ind_sponsor_name: string | null
  industry: string | null
}

const cityOf = (place: string): string => place.toLowerCase().split(",")[0].replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()
export { cityOf }

/** The sha1 id the loaders use: the address, employer, title and place together. */
export async function idFor(url: string, employer: string, title: string, place: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${url}|${employer}|${title}|${place}`))

  return "p" + [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12)
}

/** The row to insert. Only call this for a job readVerdict called "open". `today` is a YYYY-MM-DD day. */
export async function rowFromDetails(item: JobDetails, parsed: ParsedUrl, known: KnownEmployer | null, today: string, nowIso: string): Promise<Record<string, unknown>> {
  const title = (item.title ?? "").trim()
  const employer = (item["company.name"] ?? "").trim()
  const place = (item.location ?? "").trim()
  const text = (item.description ?? "").trim()
  const years = yearsMin(text)
  const code = crosswalk(title)
  const dutch = dutchNeeded(text)
  const restricted = restrictedToNationals(text, title)
  const english = isEnglish(text)
  const inNl = inNetherlands(place)
  const applicants = Number(item.applicants)
  const skills = skillsOf(text)

  return {
    id: await idFor(parsed.url, employer, title, place),
    employer,
    employer_display: known?.employer_display ?? employer,
    ats: "linkedin",
    source: "linkedin_user",
    title,
    region: place || "—",
    cat: catOf(code),
    cbs_group: code,
    url: parsed.url,
    ind_sponsor: known?.ind_sponsor ?? false,
    ind_sponsor_name: known?.ind_sponsor_name ?? null,
    industry: known?.industry ?? null,
    years_min: years,
    dutch_required: dutch,
    visa_mention: visaMention(text),
    junior_title: juniorTitle(title),
    degree_asked: degreeAsked(text),
    skills: skills,
    // The line of work, when the title and skills say it with at least 60% certainty, so the fit check for it works from the first day. Null otherwise.
    family: guessFamily(title, skills),
    pay_posted: statedPay(text),
    applicants: Number.isFinite(applicants) && applicants > 0 ? applicants : null,
    applicants_text: item.applicants_text || null,
    valid_through: item.valid_through ? item.valid_through.slice(0, 10) : null,
    seniority: item.seniority_level || null,
    body: text.slice(0, 60000),
    // The reader gives no posting date, so none is claimed: the job shows as just added, not as posted on a day we do not know.
    posted_at: null,
    days_open: null,
    freshness_state: "unknown",
    fetched_at: today,
    english,
    restricted,
    screening: SCREEN.test(text),
    nationality_cond: NATCOND.test(text),
    student_fit: english && !dutch && !restricted && inNl,
    first_seen: today,
    last_seen: today,
    last_checked: nowIso,
    miss_count: 0,
  }
}
