/**
 * A posting sectioned, not edited. Every line of the employer's text is shown as written, under the employer's own heading. The only things done are:
 * the sections are put in one familiar order (about the role, the team, what you'll do, what we're looking for, what we offer, how to apply, the rest),
 * lines the page broke in the middle of a sentence are joined, and bullets become lists. Employers use their own words for the same thing ("Tricks of the
 * trade", "Your superpowers", "Picnic perks"); each is recognised only to decide where its section goes, and is never changed or replaced.
 */

export type SectionKey = "about" | "team" | "duties" | "requirements" | "offer" | "apply" | "company" | "legal" | "other"

export type Block = { kind: "p"; text: string } | { kind: "ul"; items: string[] }

export interface Section {
  /** Which kind of section it is, which only decides its place in the order. */
  key: SectionKey
  /** The employer's own heading, exactly as written. Empty for the opening text, which has none. */
  title: string
  blocks: Block[]
}

export interface ParsedPosting {
  /** Facts the posting states as "Label: value" or as a label line over a value line (duration, hours, location, work schedule), shown together at the top. */
  details: Array<{ label: string; value: string }>
  /** Lines the website around the posting added ("Subscribe", "Save job", the newsletter footer). Not the employer's words; kept here so nothing is lost. */
  page: string[]
  sections: Section[]
  /** More than one standard section was found, so the layout says something. Otherwise the text is shown as plain paragraphs. */
  structured: boolean
}

/** The order sections are shown in. */
export const SECTION_ORDER: ReadonlyArray<SectionKey> = ["about", "team", "duties", "requirements", "offer", "apply", "other", "company", "legal"]

const norm = (s: string): string => s.toLowerCase().replace(/[’‘´`]/g, "'").replace(/\s+/g, " ").trim()

// Each heading, as employers write it, filed under one key. Tested in this order, so "what you'll do" is never mistaken for "what you bring".
const HEADINGS: Array<[SectionKey, RegExp]> = [
  ["legal", /^((our )?(commitment to )?(equal opportunit(y|ies)( employer| statement)?|equal opportunity (at|statement).*|diversity( (&|and) inclusion|,? equity (&|and) inclusion)?( commitment| statement)?|our diversity (&|and) inclusion commitment|inclusion( (&|and) diversity)?|diversity statement|inclusion and diversity|privacy( (&|and|notice|statement|policy).*)?|data protection|privacy and ai guidelines|important notice.*|notice to (agencies|recruiters)|recruitment agencies|disclaimer|accessibility|reasonable adjustments))$/],
  ["apply", /^(how to apply|how to apply\?|application process|next steps|(our |the )?(hiring|recruitment|selection|interview|application) (process|procedure)|apply|interested\?|solliciteren|hoe solliciteer je|application|procedure|what happens next)$/],
  ["offer", /^(what we (offer|provide|give)\b.*|what you(?:'ll| will)? (get|receive)\b.*|we offer( you)?|this is what we offer you|what's in it for you|what you get|our offer|benefits( and perks| (&|and) perks)?|your benefits and perks|perks|\w+ perks|compensation( and benefits)?|salary( and benefits)?|conditions of employment|terms of employment|why you'll love working (with us|at \w+)|what you can expect from us|why join (us|\w+)|everything we'll do for you|attractive package|stay healthy|what you'll get|what you will get|in addition,? (we offer|you'll receive|you will receive)|some perks of joining \w+|perks (&|and) benefits|our benefits|our commitment to your wellbeing|what you can expect|wat bieden wij( jou)?|wij bieden( jou)?|arbeidsvoorwaarden|the package)$/],
  ["duties", /^(what you(?:'ll| will)? (do|be doing|work on|own)\b.*|what you'll do|what you will do|what you'll be doing|what you will be doing|what will you do|what you do|what you'll work on|what you'll own|your (tasks|responsibilities|mission|impact|day|day-to-day|assignment|job|work)|your responsibilities include|(key |main )?responsibilities|(key )?duties|main tasks|tasks|tricks of the trade|the impact you'll make|the impact you will have|your core responsibilities|about your tasks|in this role,? you'll have the opportunity to|your impact|your key responsibilities(?: will be| include)?|your responsibilities will include|what success looks like|what you would be doing|what you would do|how you'll make an impact|in this role|day[- ]to[- ]day|wat ga je doen|je taken|jouw taken|werkzaamheden|de functie|what does the job involve)$/],
  ["requirements", /^(what you(?:'ll| will)? (bring|have|need)\b.*|what we(?:'re| are)? looking for\b.*|what we expect\b.*|what we need\b.*|what we're looking for|what we are looking for|who we(?:'re| are) looking for|who you are|what you bring|what you'll bring|what you need|what you have|you have|about you|your profile|your superpowers|the skills and knowledge you'll bring|(job |minimum |essential |preferred |basic |other )?(requirements|qualifications)( you need to meet)?|requirements and qualifications|must[- ]haves?|nice[- ]to[- ]haves?|nice to have|skills( and experience)?|experience( and skills)?|education|you have the following skills|we expect you to have|our requirements|profile|your skills and experience|your qualifications and skills|skills and qualifications|what you would bring|we believe you have|key competencies we value|what we expect from you|professional attributes|languages|what we look for|skills (&|and) qualifications|academic requirements|your talents|what you'll need|you're the right fit if|you are the right fit if|what makes you a (great|good) fit|who we seek|knowledge,? skills,? (&|and) abilities|personally|professionally|additionally,? we are looking for.*|ideal candidate|the ideal candidate|we expect|what makes you|wat vragen wij|jouw profiel|wie ben jij|to be suitable for the internship, you|to be suitable, you)$/],
  ["team", /^(about the team|the team|your team|meet the team|our team|about your team|who you(?:'|’)ll work with|our team (&|and) culture)$/],
  ["company", /^(about us|about the company|about our company|about the organi[sz]ation|about the firm|who we are|our company|company (overview|profile|description)|our story|our mission|our (core )?values|over ons|over het bedrijf|over de organisatie|wie zijn wij)$/],
  ["about", /^(job description|(about|more about) (the |this )?(role|job|position|internship|opportunity|traineeship|assignment|vacancy)|the (role|job|opportunity|position|internship|assignment|vacancy)|role (overview|description|summary)|position (summary|overview)|overview|summary|in a nutshell|introduction|your role|what is it about\??|what's it about\??|the challenge|you (&|and) your role|in short|at a glance|what to expect|vacancy|about this position|your role in our shared journey|functie|de vacature|about this (role|job))$/],
]

/** "Label: value" lines that state a fact about the job. */
const DETAIL = /^(job title|duration|type|job type|employment type|contract(?: type)?|hours(?: per week)?|weekly presence|working hours|location\(s\)|location|salary|start(?: date)?|deadline|closing date|full[- ]time|part[- ]time|level|department|team|language|reference|job id)\s*[:\-–]\s*(.{1,90})$/i

/** Lines the website adds around a posting, on their own. */
const CHROME = /^(subscribe|save( job)?|apply now|view all( jobs)?|share( this job)?|report this job|easy apply|back to (the )?(jobs|vacancies|overview)|[a-z ]+ logo|follow us|show more|show less|see more|see less|sign up for our newsletter|find jobs|post a job|faqs?|newsletter|similar jobs)$/i
/** A label that sits on its own line with its value on the next (Workday and similar pages). */
const LABEL = /^(job title|location\(s\)|primary location|other locations?|work schedule|environmental conditions|job category|job details|grade|salary \(pay basis\)|employment type|job type|contract type|business unit|requisition (id|number)|req id|job id|posting date|closing date|hours per week|work location|work arrangement|travel)$/i

const BULLET = /^\s*(?:[-–—•·▪●‣◦*]|\d{1,2}[.)])\s+/
// Emoji and pictograph clutter at the start of a line ("💪 Stay healthy").
const LEADING_SYMBOLS = /^[\s\p{Extended_Pictographic}\p{Emoji_Presentation}️‍▶►✔✓✅➡→★☆]+/u

const wordsOf = (s: string): number => s.split(/\s+/).filter(Boolean).length

function headingText(line: string): string {
  return line.replace(LEADING_SYMBOLS, "").replace(/[:：\-–—\s]+$/, "").trim()
}

/** The key a heading belongs to, or null when the line is not a known heading. */
function classify(heading: string, employer: string): SectionKey | null {
  const h = norm(heading)
  for (const [key, rx] of HEADINGS) {
    if (rx.test(h)) return key
  }
  // "About <Name>" is the company; "About the role / the team / you" are handled by the table above.
  const named = /^about (.{2,50})$/.exec(h)
  if (named) {
    const what = named[1]
    if (what === "you") return "requirements"
    if (/\b(role|job|position|internship|traineeship|assignment|vacancy|opportunity|project|programme|program|department|function)\b/.test(what)) return "about"
    if (/\bteam\b/.test(what)) return "team"
    if (wordsOf(what) <= 4) return "company"
  }

  return null
}

/** Lines of one stretch of text, joined into paragraphs and lists. */
function toBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  let items: string[] = []
  const flushPara = (): void => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join(" ").replace(/\s+([,.;:!?])/g, "$1").replace(/\s{2,}/g, " ").trim() })
      para = []
    }
  }
  const flushList = (): void => {
    if (items.length) {
      blocks.push({ kind: "ul", items })
      items = []
    }
  }
  // A run of short lines with no sentence ends is a list that lost its bullets ("Fresh lunch, coffee, and snacks").
  const run: string[] = []
  const flushRun = (): void => {
    if (run.length >= 3 && run.every((l) => l.length <= 170 && !/[.!?:]$/.test(l) && /^[A-Z0-9(€“"]/.test(l))) {
      flushPara()
      flushList()
      items.push(...run)
      flushList()
    } else {
      for (const l of run) addText(l)
    }
    run.length = 0
  }
  const addText = (l: string): void => {
    const last = para[para.length - 1]
    // A line that continues the last one (it did not end a sentence, or it starts lower case) belongs to the same paragraph.
    if (last && (!/[.!?:]$/.test(last) || /^[a-z,;)]/.test(l))) {
      para.push(l)
    } else {
      flushPara()
      para.push(l)
    }
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushRun()
      flushPara()
      flushList()
      continue
    }
    if (BULLET.test(line)) {
      flushRun()
      flushPara()
      items.push(line.replace(BULLET, "").trim())
      continue
    }
    // A line right under a bullet that starts in lower case is the rest of that bullet.
    if (items.length && /^[a-z(]/.test(line)) {
      items[items.length - 1] += ` ${line}`
      continue
    }
    flushList()
    run.push(line)
  }
  flushRun()
  flushPara()
  flushList()

  return blocks
}

/** Sentence ends that are not sentence ends. */
const ABBREV = /\b(e\.g|i\.e|etc|vs|approx|incl|ca|dr|mr|mrs|ms|prof|no|st|inc|ltd|co|jr|sr)\./gi

function sentences(text: string): string[] {
  const guarded = text.replace(ABBREV, (m) => m.replace(/\./g, "\u0001")).replace(/\b([A-Z])\./g, "$1\u0001")

  return guarded.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/).map((x) => x.replace(/\u0001/g, "."))
}

/** Sentences glued together with no space ("activities.Assess"), outside addresses and links. */
function unglue(text: string): string {
  return text
    .split(/(\s+)/)
    .map((tok) => (/[@/]|www\.|\.(com|nl|org|net|io|eu|app)\b/i.test(tok) ? tok : tok.replace(/([a-z]{3}[.!?])([A-Z][a-z]{2})/g, "$1\u0002$2")))
    .join("")
}

/**
 * Makes long or crammed paragraphs readable without changing a word: sentences run together are separated, a list written inline (with " · ", bullet marks or
 * semicolons) becomes a list, and a long paragraph is broken at sentence ends into paragraphs of a few sentences.
 */
function refine(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const block of blocks) {
    if (block.kind === "ul") {
      out.push(block)
      continue
    }
    const text = unglue(block.text)
    const glued = text.split("\u0002")
    // Sentences glued together many times over: it was a list whose items lost their separators.
    if (glued.length >= 4) {
      out.push({ kind: "ul", items: glued.map((x) => x.trim()).filter(Boolean) })
      continue
    }
    for (const part of glued) {
      const t = part.trim()
      if (!t) continue
      // " · " or bullet marks inside a line: a list.
      const dots = t.split(/\s+[•·▪●‣◦]\s+/)
      if (dots.length >= 2) {
        const lead = dots[0].includes(":") && dots[0].length < 160 ? dots.shift() : null
        if (lead) out.push({ kind: "p", text: lead })
        out.push({ kind: "ul", items: dots.map((x) => x.trim()).filter(Boolean) })
        continue
      }
      // Items separated by semicolons: a list (any words before the first colon stay as a lead-in line).
      const semis = t.split(/;\s+/)
      if (semis.length >= 4 && semis.every((x) => x.length >= 15)) {
        const colon = /^(.{10,200}?:)\s+(.*)$/.exec(semis[0])
        if (colon) {
          out.push({ kind: "p", text: colon[1] })
          semis[0] = colon[2]
        }
        out.push({ kind: "ul", items: semis.map((x) => x.trim()) })
        continue
      }
      // A wall of text: paragraphs of a few sentences.
      if (t.length > 700) {
        let cur = ""
        for (const sentence of sentences(t)) {
          if (cur && cur.length + sentence.length > 520) {
            out.push({ kind: "p", text: cur })
            cur = sentence
          } else {
            cur = cur ? `${cur} ${sentence}` : sentence
          }
        }
        if (cur) out.push({ kind: "p", text: cur })
        continue
      }
      out.push({ kind: "p", text: t })
    }
  }

  return out
}

/** Written like a heading: capitals on most of its words, or all capitals ("Essential Duties & Responsibilities", "KEY ACHIEVEMENTS"). */
function titleCase(line: string): boolean {
  const small = new Set(["and", "or", "of", "the", "a", "an", "to", "in", "for", "with", "at", "on", "&", "you", "your", "our", "we", "is", "are", "be", "by", "from", "as"])
  const words = line.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w))
  const big = words.filter((w) => !small.has(w.toLowerCase()))
  if (big.length === 0 || !/^[A-Z0-9]/.test(line)) return false

  return big.filter((w) => /^[A-Z0-9(]/.test(w)).length / big.length >= 0.5
}

/** The length of the next line that has anything in it. */
const nextLength = (lines: string[], i: number): number => lines.slice(i + 1).find((l) => l.trim())?.trim().length ?? 0

/** Whether real text (a line of some length, or a list) follows line `i` after no more than two short lines. */
function substantialAhead(lines: string[], i: number): boolean {
  let shorts = 0
  for (const raw of lines.slice(i + 1)) {
    const l = raw.trim()
    if (!l) continue
    if (l.length >= 40 || BULLET.test(l)) return true
    shorts++
    if (shorts > 2) return false
  }

  return false
}

/** Where the website's own footer starts: "Apply now" or "Employer information" followed, further down, by its "About AcademicTransfer" block. -1 when there is none. */
function footerStart(lines: string[]): number {
  const about = lines.findIndex((l) => /^about academictransfer$/i.test(l.trim()))
  if (about < 0) return -1
  for (let i = about; i >= Math.max(0, about - 60); i--) {
    if (/^(apply now|employer information)$/i.test(lines[i].trim())) {
      // The first of them, so "Apply now / 11 days remaining / Save / Employer information" all go together.
      let first = i
      while (first > 0 && /^(apply now|employer information|\d+ days? remaining|save|save job|)$/i.test(lines[first - 1].trim())) first--

      return first
    }
  }

  return -1
}

/** `text` is the posting with markup already removed (stripMarkup). Every line of it ends up in the result, as written. */
export function parsePosting(text: string, employer = ""): ParsedPosting {
  const all = text.replace(/\r/g, "").split("\n")
  const cut = footerStart(all)
  const lines = cut >= 0 ? all.slice(0, cut) : all
  const page: string[] = cut >= 0 ? all.slice(cut).map((l) => l.trim()).filter(Boolean) : []
  const details: ParsedPosting["details"] = []
  // The text before the first heading has no heading of its own.
  const found: Array<{ key: SectionKey; title: string; lines: string[] }> = [{ key: "about", title: "", lines: [] }]

  for (let i = 0; i < lines.length; i++) {
    const plain = lines[i].trim()
    if (!plain) {
      found[found.length - 1].lines.push("")
      continue
    }
    if (CHROME.test(plain)) {
      page.push(plain)
      continue
    }
    // The line as matched: without emoji or a closing colon. The line as shown is always the one posted.
    const clean = headingText(plain)
    const detail = DETAIL.exec(plain.replace(LEADING_SYMBOLS, ""))
    if (detail && !BULLET.test(plain)) {
      details.push({ label: detail[1].replace(/^\w/, (c) => c.toUpperCase()), value: detail[2].trim() })
      continue
    }
    // "Work Schedule" over "Standard (Mon-Fri)": a label with its value on the next line.
    if (LABEL.test(clean)) {
      const j = lines.findIndex((l, k) => k > i && l.trim())
      if (j > i && lines[j].trim().length <= 100 && !LABEL.test(headingText(lines[j])) && !classify(headingText(lines[j]), employer)) {
        details.push({ label: clean, value: lines[j].trim() })
        for (let k = i + 1; k <= j; k++) lines[k] = ""
        continue
      }
    }
    const short = clean.length >= 2 && clean.length <= 70 && wordsOf(clean) <= 9 && !/[.!?;,]$/.test(clean) && !BULLET.test(plain)
    // "About the team - GameDistribution": the part before the dash is what is recognised; the whole line is the heading.
    const lead = clean.split(/\s+[-–—|:]\s+/)[0]
    const key = short ? classify(clean, employer) ?? (lead !== clean ? classify(lead, employer) : null) : null
    if (key) {
      found.push({ key, title: plain.replace(/[:：\s]+$/, ""), lines: [] })
      continue
    }
    // An unknown short line with a blank line before and after, in capitals or title case, is a heading of the employer's own ...
    const before = i === 0 || !lines[i - 1].trim()
    const after = i + 1 < lines.length && !lines[i + 1].trim()
    // ... and real text follows it soon (within two short lines), so a list of skills ("Test Equipment", "Procurement", "Simulations") is not read as headings.
    if (short && before && after && substantialAhead(lines, i) && wordsOf(clean) <= 7 && !clean.includes(",") && (titleCase(clean) || (wordsOf(clean) <= 5 && /^[A-Z0-9]/.test(clean) && nextLength(lines, i) >= 80))) {
      found.push({ key: "other", title: plain.replace(/[:：\s]+$/, ""), lines: [] })
      continue
    }
    found[found.length - 1].lines.push(plain)
  }

  // A heading the employer wrote stays, even with nothing under it ("Your profile" over "Qualifications"): it is shown as a bold line.
  const sections: Section[] = found.map((f) => ({ key: f.key, title: f.title, blocks: refine(toBlocks(f.lines)) })).filter((s) => s.title !== "" || s.blocks.length > 0)
  const ordered = SECTION_ORDER.flatMap((key) => sections.filter((s) => s.key === key))
  const standard = new Set(ordered.filter((s) => s.blocks.length > 0 && s.key !== "other" && s.key !== "company" && s.key !== "legal").map((s) => s.key))

  return { details, page, sections: ordered, structured: standard.size >= 2 }
}
