/**
 * Cuts a posting into the lines that could be requirements, each with the heading it sits under, ready for Jev to tier
 * (scripts/jev-requirements.ts) and for tests. Pure: no network, no clock.
 *
 * Why the heading travels with the line: "Experience with Tableau" means something different under "Requirements" than under
 * "Nice to have", and a model told only the line cannot know. A line that mixes a hard core with a soft clause
 * ("Strong command of English (Dutch is a plus)") is split first, so each piece gets its own tier.
 */
export interface Candidate {
  /** The line, bullet removed, as written. */
  text: string
  /** The nearest heading above it, or null. */
  section: string | null
}

// Headings after which the lines are about the job, the company or the process, not about the person.
const NOT_ABOUT_PERSON = /^(responsibilit|what you.?ll do|what you will do|your role|the role|your day|day[- ]to[- ]day|key responsibilit|main responsibilit|tasks|wat ga je doen|dit ga je doen|wat je gaat doen|about us|about the (company|team)|about [A-Z]|who we are|our (mission|culture|values|story|team)|why join|why you.?ll love|what we offer|we offer|benefits|perks|compensation|salary|wat bieden wij|wat wij jou bieden|our offer|how to apply|application (process|procedure|deadline)|the process|hiring process|next steps|equal opportunit|diversity|privacy|disclaimer|recruitment agenc|na je sollicitatie|over ons)/i

const MIN = 15
const MAX = 300
const MAX_LINES = 90

const stripBullet = (s: string): string => s.replace(/^[\s\-•*·▪◦●–—]+/, "").replace(/^\d{1,2}[.)]\s+/, "").replace(/\s+/g, " ").trim()

const isBulleted = (raw: string): boolean => /^\s*([-•*·▪◦●–—]|\d{1,2}[.)]\s)/.test(raw)

// Phrases that are headings and nothing else, in the words postings use. A short line that is not one of these is a line of content:
// "7+ years of ML engineering experience" is a requirement, not a heading, even with no bullet in front of it.
const HEADING_WORDS =
  /^((minimum|basic|required|preferred|desired|desirable|key|essential|additional|other)\s+)?(requirements?|qualifications?|skills( (&|and) (experience|qualifications?))?|experience( (&|and) (skills|education|qualifications?))?|education( (&|and) experience)?|competenc(e|ies)|knowledge( (&|and) skills)?)(\s+for (the|this) (role|position|job))?$|^(what|who|why|how) (you|we|the|it)\b.{0,50}$|^(you are|you have|you bring|you.?ll bring|about you|your profile|your background|who you are|you.?re the right fit.*|you.?ll be a great fit.*|the things you bring.*|must[- ]haves?|nice[- ]to[- ]haves?|bonus( points)?|pluses|a plus|advantages?|extra points|we.?d love (it )?if.*|nice if you.*|preferred( qualifications?| skills| experience)?|desirable( skills| experience)?|responsibilit(y|ies)|key responsibilit(y|ies)|main (tasks|responsibilit(y|ies))|your role|the role|your mission|about (us|the (company|team|role|position|job))|about [A-Z]\w*|our (offer|mission|culture|values|story|team)|we offer|benefits|perks|compensation|the process|hiring process|how to apply|application process|next steps|equal opportunit.*|diversity.*|join (us|our team)|requirements? (&|and) qualifications?)$/i

/** A heading ends in a colon, is one of the phrases above, or is a short line in capitals. A bullet or a sentence never is. */
export function isHeading(raw: string): boolean {
  const t = raw.trim()
  if (t === "" || isBulleted(t)) return false
  if (t.endsWith(":") || t.endsWith("：")) return t.length < 120 && t.split(/\s+/).length <= 14
  if (/[.!?]$/.test(t)) return false
  const bare = t.replace(/[:：]+$/, "").trim()
  if (bare.length < 80 && HEADING_WORDS.test(bare)) return true

  return /^[\p{Lu}\d &/'’,-]{4,60}$/u.test(bare) && /\p{Lu}{2}/u.test(bare) && bare.split(/\s+/).length <= 8
}

// ---------------------------------------------------------------- mixed lines

// A clause that makes what it is about a plus, not a requirement. "preferably" and "ideally" are left alone on purpose:
// they refine a required core ("5+ years, preferably in fintech") and do not make the core optional.
const SOFT =
  /\b(?:(?:is|are|would be|will be|be|considered|seen as|viewed as|as)\s+(?:also\s+)?(?:a|an)\s+(?:big\s+|strong\s+|real\s+|definite\s+|major\s+|clear\s+|nice\s+|great\s+|added\s+)?(?:plus|bonus|advantage|asset)|(?:is|are)\s+advantageous|would be (?:nice|great|beneficial|helpful)|nice[- ]to[- ]haves?|bonus points|extra points)\b/i

const NICE_CUE = /\b(nice[- ]to[- ]haves?|bonus|extra points)\b/i

export interface Piece {
  text: string
  /** null: a hard piece, keeps whatever tier the line has. optional or nice: the piece says it is only a plus. */
  soft: "optional" | "nice" | null
}

const tidy = (s: string): string => s.replace(/\s+/g, " ").replace(/^[\s,;:\-–—]+|[\s,;:.\-–—]+$/g, "").trim()
const softTier = (s: string): "optional" | "nice" => (NICE_CUE.test(s) ? "nice" : "optional")

/**
 * Splits one line into its hard core and its soft clauses. A line with no soft clause comes back whole. Three shapes are split:
 *   "English (Dutch is a plus)"            a bracket that is a soft clause
 *   "Python. Java is a plus. Git."         sentences or ";" parts, the soft one on its own
 *   "English and Chinese, Dutch would be a plus"   a soft clause after the last comma of a part with no other comma
 * "Knowledge of Python, SQL, Java is a plus" is one soft line: the plus covers the whole list.
 */
export function splitSoft(line: string): Piece[] {
  const text = line.trim()
  if (!SOFT.test(text)) return [{ text, soft: null }]

  const pieces: Piece[] = []
  // 1. Brackets that are soft clauses come out.
  const core = text.replace(/\(([^()]*)\)/g, (whole, inner: string) => {
    if (SOFT.test(inner)) {
      pieces.push({ text: tidy(inner), soft: softTier(inner) })

      return " "
    }

    return whole
  })
  // 2. What is left is cut into sentences and ";" parts.
  const parts = core.split(/(?<=[.!?;])\s+(?=[A-Z0-9])|;\s*/).map(tidy).filter(Boolean)
  const hard: Piece[] = []
  for (const part of parts) {
    if (!SOFT.test(part)) {
      hard.push({ text: part, soft: null })
      continue
    }
    // 3. A soft clause after the last comma, when what comes before it has no other comma.
    const at = part.lastIndexOf(", ")
    const before = at > 0 ? part.slice(0, at) : ""
    const after = at > 0 ? part.slice(at + 2) : ""
    if (at > 0 && !before.includes(",") && !SOFT.test(before) && SOFT.test(after) && before.split(/\s+/).length >= 2) {
      hard.push({ text: tidy(before), soft: null })
      pieces.push({ text: tidy(after), soft: softTier(after) })
    } else {
      pieces.push({ text: part, soft: softTier(part) })
    }
  }

  const all = [...hard, ...pieces].filter((p) => p.text.length >= 3)
  // Hard pieces first, in the order they were written, then the soft ones: the core of a requirement reads before its extras.
  return all.length > 0 ? all : [{ text, soft: null }]
}

// ---------------------------------------------------------------- the lines of a posting

/**
 * The lines of a posting that could be requirements, each with its heading. Lines under headings about the job, the company
 * or the process are left out unless the line itself uses a requirement cue, since they are not about the person.
 */
export function candidateLines(body: string): Candidate[] {
  const out: Candidate[] = []
  let section: string | null = null
  let skip = false
  const seen = new Set<string>()
  for (const raw of body.replace(/&amp;/g, "&").split("\n")) {
    if (raw.trim() === "") continue
    if (isHeading(raw)) {
      section = raw.trim().replace(/[:：]+$/, "")
      skip = NOT_ABOUT_PERSON.test(section)
      continue
    }
    const text = stripBullet(raw)
    if (text.length < MIN || text.length > MAX) continue
    if (skip && !/\b(you (have|are|will have|bring|need)|experience|degree|skills?|knowledge|proficien|fluent|required|must|years)\b/i.test(text)) continue
    for (const piece of splitSoft(text)) {
      const key = piece.text.toLowerCase()
      if (piece.text.length < 8 || seen.has(key)) continue
      seen.add(key)
      out.push({ text: piece.text, section })
      if (out.length >= MAX_LINES) return out
    }
  }

  return out
}
