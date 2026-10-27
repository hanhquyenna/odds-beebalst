import { SKILL_KIND, extractSkills } from "@/lib/skills"

/**
 * How much a posting insists on a requirement. Must is compulsory, strong is a strong plus,
 * optional is "preferred", nice is "nice to have". Read from the heading it sits under and
 * from cue words in the line itself; Jev's own reading replaces this when the posting has one.
 */
export type Tier = "must" | "strong" | "optional" | "nice"
export const TIERS: Tier[] = ["must", "strong", "optional", "nice"]
export const TIER_LABEL: Record<Tier | "unspecified", string> = { must: "Must have", strong: "Strong plus", optional: "Preferred", nice: "Nice to have", unspecified: "Mentioned" }

export interface Requirement {
  tier: Tier
  text: string
  tools: string[]
  skills: string[]
  years: number | null
  degree: "bachelor" | "master" | "phd" | null
}

/** Headings under which postings list what they ask for, in English and Dutch. */
const ASKS = /^(minimum |basic |preferred |required )?(requirements?|qualifications?|what you('|’)?ll bring|what you bring|what we('|’)?re looking for|what we are looking for|who you are|about you|your profile|you('|’)?re the right fit if|you are the right fit if|must[- ]haves?|required (knowledge|skills)|skills|you have|verder heb je|wat breng je mee|wat je meebrengt|wat vragen wij|jouw profiel|functie-?eisen|eisen)\b/i
/** Headings for the softer parts, in the order they are tried. */
const HEAD_STRONG = /\b(strong(ly)? (preferred|desired|plus|advantage)|highly (preferred|desirable)|big plus|major plus)\b/i
const HEAD_NICE = /\b(nice[- ]to[- ]haves?|bonus( points)?|extra points|would be (nice|great|a bonus)|handig|pre'?s?)\b|^een pre\b/i
const HEAD_OPTIONAL = /\b(preferred|desirable|advantages?|pluses|plus points?|a plus|ideally|optional|beneficial|beschik je ook over|wat is een pre)\b/i
/** The same cues inside a line, and the words that make a line compulsory. */
const LINE_STRONG = /\b(strong(ly)? (plus|preferred|desired|advantage)|highly (preferred|desirable|valued)|big plus|major plus|significant advantage)\b/i
const LINE_NICE = /\b(nice to have|bonus|would be (nice|great|a bonus)|is a bonus|handy|familiarity with|exposure to)\b/i
const LINE_OPTIONAL = /\b(preferred|desirable|an advantage|a plus|is a plus|ideally|optional|beneficial)\b/i
const LINE_MUST = /\b(must|required|mandatory|essential|minimum|need to have|you need)\b/i

function sectionTier(heading: string): Tier | null {
  if (HEAD_STRONG.test(heading)) {
    return "strong"
  }
  if (HEAD_NICE.test(heading)) {
    return "nice"
  }
  if (HEAD_OPTIONAL.test(heading)) {
    return "optional"
  }

  return ASKS.test(heading) ? "must" : null
}

function lineTier(text: string, section: Tier): Tier {
  if (LINE_STRONG.test(text)) {
    return "strong"
  }
  if (LINE_NICE.test(text)) {
    return "nice"
  }
  if (LINE_OPTIONAL.test(text)) {
    return "optional"
  }

  return LINE_MUST.test(text) ? "must" : section
}

/** Headings that end that part. */
const ENDS = /^(join us|apply now|how to apply|application (deadline|process)|equal opportunit|diversity|more jobs|our culture|why join|what we offer|we offer|benefits|wat bieden wij|wat wij jou bieden|wat bieden|responsibilities|what you('|’)?ll do|your role|wat ga je doen|dit ga je doen|wat je gaat doen|about us|about the|over ons|the role|the team|na je sollicitatie|de voordelen|our offer|together with)/i

const YEARS = /(?<![\d.,])(\d{1,2})\s*\+?\s*(?:(?:-|–|to|tot)\s*\d{1,2}\s*)?(?:years?|yrs?|jaar)/i
const WORD_YEARS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien)\s*\+?\s*(?:(?:-|–|to|tot)\s*\w+\s*)?(?:years?|yrs?|jaar)\b/i
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10 }

/** The low end of the years a line asks for: "5+ years", "2 to 5 years", "three years", "3-5 yrs"; null when it names none. A figure like "180 years" is not one. */
export function yearsOf(input: string): number | null {
  // An age is not experience ("at least 18 years old"), "up to two years" is a ceiling, and "or a fresh graduate" is an alternative.
  const text = input
    .replace(/\b\d{1,2}\s*\+?\s*(?:years?|yrs?)[\s-]*(?:old|of age)\b/gi, " ")
    .replace(/\b(?:aged?|age of)\s*\d{1,2}\b/gi, " ")
    .replace(/\b(?:up to|maximum of|max\.?|no more than|less than|under|within the (?:last|past)|not (?:be )?more than)\s+(?:\d{1,2}|\w+)\s*\+?\s*(?:years?|yrs?)\b/gi, " ")
  // "the three years prior to the start", "in the last 5 years", "results not older than two years" are windows, not experience.
  const windowless = text
    .replace(/\b(?:\d{1,2}|\w+)\s+years?\s+(?:prior|before|ago|earlier|old|back)\b/gi, " ")
    .replace(/\b(?:older|newer|more recent)\s+than\s+(?:\d{1,2}|\w+)\s+years?\b/gi, " ")
    .replace(/\b(?:in |within |during |over )?the\s+(?:last|past|previous|preceding)\s+(?:\d{1,2}|\w+)\s+years?\b/gi, " ")
  // A figure about the length of a study ("a degree of minimum three years") is not work experience.
  if (/\b(?:degree|diploma|studies|study|bachelor|programme|program|course)\b/i.test(windowless) && !/\b(?:experience|work(?:ing|ed)?|professional|ervaring|role|position|industry)\b/i.test(windowless)) return null
  if (/\b(?:fresh(?:ly)?[ -]?(?:grad\w*)?|graduates?|entry[- ]level|no (?:prior |previous |work )?experience|without (?:prior )?experience)\b/i.test(windowless) && /\bor\b/i.test(windowless)) return null
  const between = /\bbetween\s+(\d{1,2}|\w+)\s+and\s+(?:\d{1,2}|\w+)\s+(?:years?|yrs?)\b/i.exec(windowless)
  if (between) {
    const lo = /^\d+$/.test(between[1]) ? Number(between[1]) : NUMBER_WORDS[between[1].toLowerCase()]

    return lo === undefined ? null : lo
  }
  const m = YEARS.exec(windowless)
  const w = WORD_YEARS.exec(windowless)
  const pick = m && w ? (m.index <= w.index ? Number(m[1]) : NUMBER_WORDS[w[1].toLowerCase()]) : m ? Number(m[1]) : w ? NUMBER_WORDS[w[1].toLowerCase()] : null

  return pick === null || pick === undefined ? null : pick
}
// Bullets and list numbers ("1." or "2)") come off; a leading "3+ years" does not.
const clean = (line: string): string => line.replace(/^[\s\-•*·▪◦●–—]+/, "").replace(/^\d{1,2}[.)]\s+/, "").replace(/\s+/g, " ").trim()

function read(text: string, section: Tier = "must"): Requirement {
  const found = extractSkills(text)
  const degree = /\b(phd|doctorate)\b/i.test(text) ? "phd" : /\b(master'?s?|msc|mba)\b/i.test(text) ? "master" : /\b(bachelor'?s?|bsc|hbo|wo)\b/i.test(text) ? "bachelor" : null
  const years = yearsOf(text)

  return {
    tier: lineTier(text, section),
    text,
    tools: found.filter((n) => SKILL_KIND[n] === "tool"),
    skills: found.filter((n) => SKILL_KIND[n] === "skill"),
    years,
    degree,
  }
}

/**
 * What the posting asks for, line by line: the lines under its requirements
 * heading. Nothing is made up; when the posting has no such part, the list is
 * empty and the caller falls back to reading the whole text for tools and skills.
 */
export function extractRequirements(body: string): Requirement[] {
  const lines = body.split("\n").map((l) => l.trim())
  const out: Requirement[] = []
  let inside = false
  let section: Tier = "must"
  let taken = 0

  for (const raw of lines) {
    if (raw === "") {
      continue
    }
    const line = raw.replace(/[:.]+$/, "")
    // A heading is not a bullet: a short bulleted line is a requirement, not the start of a new part.
    const bulleted = /^[-•*·▪◦●–—]|^\d{1,2}[.)]\s/.test(raw)
    // A heading is a short line with no sentence in it: "Requirements:", or "Required Qualifications, Capabilities, And Skills" with no colon.
    const shortLine = raw.length < 90 && raw.split(/\s+/).length <= 9
    const heading = !bulleted && ((shortLine && !/[!?]$/.test(raw) && (!raw.endsWith(".") || sectionTier(line) !== null)) || (raw.length < 70 && (raw.endsWith(":") || raw.length < 40)))
    const entered = heading ? sectionTier(line) : null
    if (entered) {
      inside = true
      section = entered
      taken = 0
      continue
    }
    if (inside && heading && ENDS.test(line)) {
      inside = false
      continue
    }
    if (inside && raw.length > 12) {
      const text = clean(raw)
      if (text.length > 12 && text.length <= 240) {
        out.push(read(text, section))
        taken++
      }
      if (taken >= 14) {
        inside = false
      }
    }
  }

  return out
}

/** Every tool and skill the requirements name, or, without a requirements part, the whole posting. */
export function namedSkills(body: string, requirements: Requirement[]): string[] {
  return requirements.length > 0 ? [...new Set(requirements.flatMap((r) => [...r.tools, ...r.skills]))] : extractSkills(body)
}

/** Each tool and skill the requirements name, with the strongest tier any line gives it. */
export function tiersOf(requirements: Requirement[]): Record<string, Tier> {
  const out: Record<string, Tier> = {}
  for (const r of requirements) {
    for (const name of [...r.tools, ...r.skills]) {
      if (out[name] === undefined || TIERS.indexOf(r.tier) < TIERS.indexOf(out[name])) {
        out[name] = r.tier
      }
    }
  }

  return out
}

/** Requirements as Jev read them: its own lines and tiers, with the tools and skills found in each line by the same rules. */
export function fromJev(items: ReadonlyArray<{ text: string; tier: Tier }>): Requirement[] {
  return items.filter((i) => TIERS.includes(i.tier) && i.text).map((i) => ({ ...read(i.text, i.tier), tier: i.tier }))
}

/**
 * The posting's three hard requirements, relaxed where the text only makes them a plus. The data holds
 * "Dutch required", a minimum number of years and a degree as flat facts; when every line that mentions one
 * is a preference or a nice-to-have ("Dutch is a plus"), it is not a requirement, so it is lifted from the gates.
 */
export function relaxedGates(
  post: { dutch_required: boolean; years_min: number | null; degree_asked: "phd" | "master" | "bachelor" | null },
  requirements: Requirement[],
): { dutch_required: boolean; years_min: number | null; degree_asked: "phd" | "master" | "bachelor" | null } {
  const soft = (lines: Requirement[]): boolean => lines.length > 0 && lines.every((r) => r.tier !== "must")

  return {
    dutch_required: post.dutch_required && !soft(requirements.filter((r) => /\b(dutch|nederlands)\b/i.test(r.text))),
    years_min: post.years_min != null && soft(requirements.filter((r) => r.years !== null)) ? null : post.years_min,
    degree_asked: post.degree_asked && soft(requirements.filter((r) => r.degree !== null)) ? null : post.degree_asked,
  }
}
