import type { Requirement } from "@/lib/requirements"
import { SKILLS } from "@/lib/skills"

/**
 * The lines of a posting, put into a fixed vocabulary. The reading of the posting (which lines ask for something,
 * and how strongly) is Jev's; what it asks for is then shown the same way on every job: a tool or skill by its one name,
 * experience as years, education as a degree level, a language with a level on a four-step scale, a personal quality
 * from a short list. Nothing is shown in the posting's own sentence, so nothing is cut off, and a line that says
 * something outside this vocabulary is counted, not rewritten.
 */
export interface Standard {
  skills: string[]
  experience: string[]
  education: string[]
  language: string[]
  qualities: string[]
  /** Right to work, where you must be based, travel and on-call: conditions rather than skills. */
  conditions: string[]
  /** Lines that said something outside the vocabulary. They stay in the description. */
  unread: number
}

const DEGREE_NAME = { bachelor: "Bachelor's degree", master: "Master's degree", phd: "PhD" } as const
const DEGREE_ORDER = ["bachelor", "master", "phd"] as const

const LANGUAGES: Array<[string, RegExp]> = [
  // "Dutch GAAP", "Dutch tax law" or "a Dutch university" is a subject, a place or an institution, not a language.
  ["Dutch", /\b(dutch|nederlands)\b(?!\s+(gaap|tax|law|legislation|market|labou?r|accounting|regulat|corporate|universit|school|college|institut|education|degree|diploma|citizen|national|passport|company|compan|entity|entities|bank|office|headquarter|government|authorit|bar\b|association|nationality|residen|address|bank account|work permit|visa))/i],
  ["English", /\b(english|engels)\b/i],
  ["German", /\b(german|duits|deutsch)\b/i],
  ["French", /\b(french|frans)\b/i],
  ["Spanish", /\b(spanish|spaans)\b/i],
  ["Italian", /\bitalian\b/i],
  ["Portuguese", /\bportuguese\b/i],
  ["Polish", /\bpolish\b/i],
  ["Mandarin", /\b(mandarin|chinese)\b/i],
  ["Arabic", /\barabic\b/i],
]
/** Personal qualities a posting asks for, each by one name. Communication and analytical skills are in the skill list. */
const QUALITIES: Array<[string, RegExp]> = [
  ["teamwork", /\b(team ?player|teamwork|collaborat\w*|work(ing)? (well )?(in|with) (a )?teams?)\b/i],
  ["organisation", /\borgani[sz](ed|ation|ational)\b|\bplanning skills\b/i],
  ["attention to detail", /\b(attention to detail|detail[- ]oriented|accura(te|cy)|meticulous)\b/i],
  ["presentation", /\bpresentation skills\b|\bpresent(ing)? (to|clearly)\b/i],
  ["problem solving", /\bproblem[- ]solving\b|\bsolve problems\b/i],
  ["initiative", /\b(proactive|initiative|self[- ]starter|self[- ]motivated|independent(ly)?)\b/i],
  ["flexibility", /\b(flexib\w+|adaptab\w+)\b/i],
  ["time management", /\b(time management|deadlines?|prioriti[sz]\w*)\b/i],
  ["leadership", /\bleadership\b|\blead (a )?teams?\b/i],
  ["creativity", /\bcreativ\w+\b/i],
  ["analytical thinking", /\banalytic\w*|\banaly[sz]e\b|\bstructured thinking\b/i],
  ["communication", /\bcommunicat\w+|\bpresent(ing)? (to|clearly)\b/i],
  ["curiosity", /\b(curious|curiosity|eager to learn|willingness to learn|continuous learning|learning mindset|passion for|enthusias\w+|motivat\w+)\b/i],
  ["hands-on approach", /\bhands[- ]on\b/i],
  ["customer focus", /\bcustomer[- ](focus\w*|oriented|centric)|\bservice[- ]oriented\b/i],
]

/** Conditions that go with the job, each by one name. For an international student the first two decide whether to apply at all. */
const CONDITIONS: Array<[string, RegExp]> = [
  ["Right to work in the Netherlands", /\b(eligible|entitled|authori[sz]ed|permitted|right)\b.{0,40}\b(work|live)\b|\bwork (permit|authori[sz]ation)\b|\bwithout (visa )?sponsorship\b|\bnon-?eu (citizen|national)s?\b|\bwerkvergunning\b/i],
  ["Based in the Netherlands", /\b(located|based|living|live|reside|resident|relocat\w*)\b.{0,60}\b(netherlands|nl|amsterdam|utrecht|rotterdam|the hague|eindhoven|delft|holland)\b/i],
  ["Office presence", /\b(\d|one|two|three|four|five)\s+days?\b.{0,40}\b(office|on-?site|in person)\b|\bwork(ing)? (physically )?(from|in) (the |our )?office\b|\bon-?site\b/i],
  ["At least 18 years old", /\b(at least|over|minimum( age)?( of)?|aged?|must be|be) 18\b|\b18 years (old|of age)\b|\b18\+/i],
  ["Currently enrolled as a student", /\b(enrolled|enrol+ed|registered)\b.{0,60}\b(university|college|education\w*|institute|studies|student|school)\b|\bcurrently (studying|a student)\b|\bstudent status\b|\bactive student\b/i],
  ["Travel", /\btravel\w*/i],
  ["On-call duties", /\bon[- ]call\b/i],
]

/** The dictionary's three personal skills are qualities here, so each shows once. */
const SKILL_AS_QUALITY: Record<string, string> = { "communication skills": "communication", "analytical skills": "analytical thinking", "presentation skills": "presentation" }

/** How a name is written on screen: acronyms and brand names as they are, everything else in sentence case. */
const WRITTEN: Record<string, string> = Object.fromEntries(
  [
    "VBA", "SQL", "SAS", "SAP", "CRM", "ERP", "AWS", "GCP", "IFRS", "US GAAP", "Dutch GAAP", "FP&A", "M&A", "KYC/AML", "CPA/ACA/ACCA", "CFA", "NLP", "A/B testing", "ETL", "CI/CD", "REST APIs", "SEO", "SEM", "HRIS", "GDPR", "PHP", "CAD", "PLC",
    "Power BI", "NetSuite", "HubSpot", "SharePoint", "Power Automate", "PowerPoint", "Google Analytics", "JavaScript", "TypeScript", "Node.js", "C++", "C#", ".NET", "Ruby on Rails", "iOS", "dbt", "PyTorch", "TensorFlow", "MATLAB", "PRINCE2", "Six Sigma", "Agile/Scrum",
  ].map((name) => [name.toLowerCase(), name]),
)
export const written = (name: string): string => WRITTEN[name] ?? `${name[0].toUpperCase()}${name.slice(1)}`

/** Years of experience in a line: "5 years" is a minimum, "0-2 years" a range. A person's age is not experience. */
function yearsIn(text: string): { lo: number; hi: number | null } | null {
  if (/\b(\d{2})\s*(\+\s*)?years?\s*(old|of age)\b|\b(at least|over|aged?)\s+\d{2}\b/i.test(text)) {
    return null
  }
  const m = text.match(/\b(\d{1,2})\s*(?:\+\s*)?(?:(?:-|–|to)\s*(\d{1,2})\s*\+?\s*)?(?:years?|yrs?|jaar)\b/i)
  if (!m) {
    return null
  }
  const lo = Number(m[1])
  const hi = m[2] ? Number(m[2]) : null

  return hi !== null && hi > lo ? { lo, hi } : { lo, hi: null }
}

/**
 * The degree levels a line names. "Scrum master", "master data" and "master the tools" are not degrees. "wo" (Dutch university
 * education) names no level, so it only counts as a degree in a relevant field.
 */
function degreesIn(text: string): Array<(typeof DEGREE_ORDER)[number]> {
  const out: Array<(typeof DEGREE_ORDER)[number]> = []
  if (/\b(bachelor['’]?s?|bsc|b\.sc|hbo)\b/i.test(text)) {
    out.push("bachelor")
  }
  if (/(?<!scrum |post-|grand |web )\bmaster['’]?s?\b(?!\s+(data|them|it|this|that|the|complex|new|multiple|various|a|an|java|skills)\b)|\b(msc|m\.sc|mba)\b/i.test(text)) {
    out.push("master")
  }
  if (/\b(ph\.?d|doctorate|doctoral)\b/i.test(text)) {
    out.push("phd")
  }

  return out
}

/** The languages a line names. The tier already says how much the posting insists, so no level is added. */
function languagesIn(text: string): string[] {
  return LANGUAGES.filter(([, re]) => re.test(text)).map(([name]) => name)
}

/** Each tier's lines, standardised. */
export function standardise(lines: ReadonlyArray<Requirement>): Standard {
  const skills = new Set<string>()
  const qualities = new Set<string>()
  const conditions = new Set<string>()
  const languages = new Set<string>()
  const degrees = new Set<string>()
  let years: { lo: number; hi: number | null } | null = null
  let experienceWord = false
  let degreeWord = false
  let unread = 0

  for (const r of lines) {
    let read = false
    for (const name of [...r.tools, ...r.skills]) {
      if (SKILL_AS_QUALITY[name]) {
        qualities.add(SKILL_AS_QUALITY[name])
      } else {
        skills.add(name)
      }
      read = true
    }
    const y = yearsIn(r.text)
    if (y) {
      // The strictest line wins: the highest starting point, and a range over a bare minimum when they tie.
      if (!years || y.lo > years.lo || (y.lo === years.lo && y.hi !== null)) {
        years = y
      }
      read = true
    }
    const levels = degreesIn(r.text)
    if (levels.length > 0) {
      // "Bachelor's or Master's" asks for the lower of the two.
      degrees.add(DEGREE_ORDER.find((d) => levels.includes(d)) as string)
      read = true
    } else if (/\b(degree|diploma|studies|opleiding|university education|academic education|wo|college)\b/i.test(r.text)) {
      degreeWord = true
      read = true
    }
    if (!y && /\b(experience|ervaring|track record)\b/i.test(r.text)) {
      experienceWord = true
      read = true
    }
    for (const name of languagesIn(r.text)) {
      languages.add(name)
      read = true
    }
    for (const [name, re] of QUALITIES) {
      if (re.test(r.text)) {
        qualities.add(name)
        read = true
      }
    }
    // Internships state how long and how many hours: "a minimum of 6 months", "32 hours per week".
    const months = r.text.match(/\b(\d{1,2})\s*(?:\+\s*)?months?\b/i)
    if (months && /\b(minimum|at least|duration|commit|period|internship|months? (internship|placement))\b/i.test(r.text)) {
      conditions.add(`${months[1]} months`)
      read = true
    }
    const hours = r.text.match(/\b(\d{2})\s*(?:-\s*\d{2}\s*)?(?:hours|hrs|uur)\b.{0,20}\b(week|wk|per week|a week)\b/i)
    if (hours) {
      conditions.add(`${hours[1]} hours a week`)
      read = true
    }
    for (const [name, re] of CONDITIONS) {
      if (re.test(r.text)) {
        conditions.add(name)
        read = true
      }
    }
    if (!read) {
      unread++
    }
  }

  const lowest = DEGREE_ORDER.find((d) => degrees.has(d))

  return {
    skills: Object.keys(SKILLS).filter((name) => skills.has(name)).map(written),
    experience: years ? [years.hi !== null ? `${years.lo}–${years.hi} years` : years.lo > 0 ? `${years.lo}+ years` : "Relevant experience"] : experienceWord ? ["Relevant experience"] : [],
    education: lowest ? [DEGREE_NAME[lowest]] : degreeWord ? ["A degree in a relevant field"] : [],
    language: LANGUAGES.map(([name]) => name).filter((name) => languages.has(name)),
    qualities: QUALITIES.map(([name]) => name).filter((name) => qualities.has(name)).map(written),
    conditions: [...CONDITIONS.map(([name]) => name).filter((name) => conditions.has(name)), ...[...conditions].filter((c) => !CONDITIONS.some(([name]) => name === c))],
    unread,
  }
}

/** The tiers of a posting, strongest first, each thing shown once: under the strongest tier that asks for it. */
export function standardTiers(requirements: ReadonlyArray<Requirement>, order: ReadonlyArray<Requirement["tier"]>): Array<{ tier: Requirement["tier"]; std: Standard }> {
  const shown = new Set<string>()

  return order
    .map((tier) => {
      const std = standardise(requirements.filter((r) => r.tier === tier))
      for (const key of ["skills", "experience", "education", "language", "qualities", "conditions"] as const) {
        std[key] = std[key].filter((item) => !shown.has(`${key}:${item}`))
        std[key].forEach((item) => shown.add(`${key}:${item}`))
      }

      return { tier, std }
    })
    .filter(({ std }) => std.skills.length + std.experience.length + std.education.length + std.language.length + std.qualities.length + std.conditions.length > 0)
}

/** Skills a posting names without saying how much it insists, written the standard way: the dictionary's order, qualities after skills. */
export function standardNames(names: ReadonlyArray<string>): string[] {
  const have = new Set(names)
  const skills = Object.keys(SKILLS).filter((n) => have.has(n) && !SKILL_AS_QUALITY[n]).map(written)
  const qualities = [...new Set(Object.keys(SKILL_AS_QUALITY).filter((n) => have.has(n)).map((n) => written(SKILL_AS_QUALITY[n])))]

  return [...skills, ...qualities]
}
