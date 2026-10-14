// Filling in an application form from what odds knows about the person: which answer goes with which question, and which of a question's
// options that answer is. Pure: no page, no network, so the extension (built into extension/job-sites.js) and the tests use the same rules.
// Nothing is made up: a question odds has no answer for is left for the person, and what they answer is kept for the next form (rememberable).

/** What odds knows about the person for a form. Every part may be missing. */
export interface Facts {
  job_id?: string | null
  job_country?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  place?: string | null
  linkedin?: string | null
  website?: string | null
  /** none | basic | professional | native */
  dutch?: string | null
  /** The standard answers kept on odds (application_answers). */
  answers?: Record<string, string>
  /** The person's own earlier answers, by questionKey. */
  remembered?: Record<string, string>
}

/** How a form asks: a line of text, a number, a longer text, a choice from a list, or yes/no style buttons. */
export type Kind = "text" | "number" | "textarea" | "select" | "radio" | "checkbox"

/** The question as one key: lower case, no punctuation, no "required", a label LinkedIn writes twice ("Email Email") once. */
export function questionKey(label: string): string {
  let t = label.replace(/\s+/g, " ").trim()
  const half = t.length % 2 === 1 ? (t.length - 1) / 2 : -1
  if (half > 0 && t.slice(0, half) === t.slice(half + 1)) t = t.slice(0, half)
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\brequired\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 300)
}

/** Date, education and legal answers cannot silently cross between vacancies. */
export function applicationQuestionKey(label: string, jobId?: string | null): string {
  const key = questionKey(label)
  return jobId && /\b(visa|sponsor\w*|authori[sz]\w*|permit|citizen\w*|enroll\w*|study\w*|studies|student|internship|graduat\w*|start date|available|availability|relocat\w*)\b/.test(key) ? `${key.slice(0, 240)} job ${jobId.slice(0, 50)}` : key
}

/** The label as shown, said once (LinkedIn repeats it for screen readers). */
export function questionText(label: string): string {
  // A form's "required" star is not part of the question.
  const t = label.replace(/\s+/g, " ").replace(/\s*\*+\s*$/, "").trim()
  const half = t.length % 2 === 1 ? (t.length - 1) / 2 : -1

  return (half > 0 && t.slice(0, half) === t.slice(half + 1) ? t.slice(0, half) : t).slice(0, 500)
}

const DUTCH_OPTION: Record<string, RegExp> = { none: /^(none|no|geen)/i, basic: /^(elementary|basic|conversational|beginner|limited)/i, professional: /^(professional|full professional|fluent|good|advanced)/i, native: /^(native|bilingual|moedertaal)/i }

/** The digits of a pay figure ("€ 1.500 a month" -> "1500"), for a number field. */
const digits = (t: string): string => (/\d[\d.,\s]*/.exec(t)?.[0] ?? "").replace(/[.,\s](?=\d{3}\b)/g, "").replace(/[^\d.]/g, "")

/** A phone number without its country code ("+31 6 1234 5678" -> "612345678"), for a field beside a country picker. */
export function nationalNumber(phone: string): string {
  const t = phone.replace(/[^\d+]/g, "")
  return t.startsWith("+") ? t.replace(/^\+(31|32|33|34|39|44|49|1|351|353|36|48|45|46|47|41|43|30|420|421|90|91|84|86|62|60|63|65|66|55|52|27|234|20|7)/, "").replace(/^0/, "") : t.replace(/^0/, "")
}

/** The person's answer to a question, in their words, or null when odds does not know it. Their own earlier answer comes first. */
export function answerText(label: string, facts: Facts): string | null {
  const key = questionKey(label)
  const a = facts.answers ?? {}
  const remembered = facts.remembered?.[applicationQuestionKey(label, facts.job_id)]
  const pick = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : remembered || null)
  if (/\b(first name|given name|voornaam)\b/.test(key)) return pick(a.first_name)
  if (/\b(last name|surname|family name|achternaam)\b/.test(key)) return pick(a.last_name)
  if (/^(full )?name$/.test(key)) return (a.first_name && a.last_name ? `${a.first_name} ${a.last_name}` : pick(facts.name))
  if (/\b(e ?mail\w*)\b/.test(key)) return pick(a.email) ?? pick(facts.email)
  if (/\b(mobile|phone|telephone|telefoon\w*|mobiel\w*)\b/.test(key) && !/country|landcode/.test(key)) return pick(a.phone) ?? pick(facts.phone)
  if (/\blinkedin\b/.test(key) && /\b(url|profile|link)\b/.test(key)) return pick(a.linkedin) ?? pick(facts.linkedin)
  if (/\b(website|portfolio|github|personal site)\b/.test(key)) return pick(a.website)
  if (/\b(city|location|where do you live|woonplaats)\b/.test(key) && !/relocat/.test(key)) return pick(a.city) ?? pick(facts.place?.split(",")[0])
  if (/\b(postal code|postcode|zip code|zip)\b/.test(key)) return pick(a.postcode)
  if (/^(street address|address|address line 1|adres|straat)/.test(key)) return pick(a.address)
  if (/^(country|country of residence|land)$/.test(key)) return pick(a.country)
  if (remembered) return remembered
  // What an international student is asked: school, degree, graduation, whether they are a student, the university's internship agreement.
  if (/\b(internship|stage|placement|work placement)\b.*\b(agreement|contract|overeenkomst)\b|\bstage ?overeenkomst|\b(agreement|overeenkomst)\b.*\b(university|school|college)\b/.test(key)) return pick(a.internship_agreement)
  if (/\b(graduat\w*|afstudeer\w*)\b/.test(key)) return pick(a.graduation_date)
  if (/\b(are you|currently|presently)\b.*\b(student|enrolled|studying)\b|\b(enrolled|enrolment|enrollment|ingeschreven)\b/.test(key)) return pick(a.study_status)
  if (/\b(field of study|major|study programme|study program|discipline|area of study|opleiding|studierichting)\b/.test(key)) return pick(a.field_of_study)
  if (/\b(degree|diploma|level of education|education level|highest level|opleidingsniveau)\b/.test(key)) return pick(a.degree)
  if (/\b(university|universiteit|school|college|institution|hogeschool|school name)\b/.test(key) && key.split(" ").length <= 6 && !/\b(high school|year|date|reference|referral|hear|find|about|why)\b/.test(key)) return pick(a.university)
  if (/\b(nationality|nationaliteit|citizenship)\b/.test(key)) return pick(a.nationality)
  if (/\b(relocat\w*)\b/.test(key)) return pick(a.relocation)
  if (/\bnotice period\b|\bopzegtermijn\b/.test(key)) return pick(a.notice_period)
  if (/\b(start date|when can you start|available to start|availability|earliest start|beschikbaar)\b/.test(key)) return pick(a.start_date)
  if (/\bhours\b.*\bweek\b|\bper week\b|\buren\b/.test(key)) return pick(a.hours_per_week)
  if (/\b(salary|compensation|pay|wage|salaris|stipend)\b/.test(key)) return pick(a.expected_salary)
  if (/\b(sponsor\w*|visa)\b/.test(key)) {
    if (facts.job_id && facts.job_country !== "NL") return null
    const w = a.work_authorization ?? ""
    if (!w) return null
    // "Do you need sponsorship?" is the opposite of "Are you allowed to work?": answered only when the kept answer says which.
    if (/\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w) || /\bno(t)?\b.*\b(allowed|authori[sz]ed|permit)\b/i.test(w)) return "Yes"
    if (/^\s*yes\b|\b(eu|eea) (citizen|national)|\bfree to work|\bno (sponsor|visa)\w* (needed|required)|\ballowed to work|\bauthori[sz]ed\b/i.test(w)) return "No"
    return null
  }
  if (/\b(authori[sz]ed|legally|right to work|eligible to work|work permit|allowed to work|werkvergunning)\b/.test(key)) {
    if (facts.job_id && facts.job_country !== "NL") return null
    const w = a.work_authorization ?? ""
    if (!w) return null
    if (/^\s*no\b|\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w)) return "No"
    return /^\s*yes\b|\b(eu|eea)\b|\ballowed\b|\bauthori[sz]ed\b|\bfree to work\b|\bpermit\b/i.test(w) ? "Yes" : null
  }
  if (/\bdutch\b|\bnederlands\b/.test(key) && /\b(level|proficiency|speak|fluent|niveau)\b/.test(key)) return pick(facts.dutch)

  return null
}

const norm = (t: string): string => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+]+/g, " ").trim()

/** Which of a question's options an answer is: the same words, then one starting with it, then yes/no by meaning. -1 when none fits. */
export function chooseOption(options: string[], answer: string, label = ""): number {
  const want = norm(answer)
  const opts = options.map(norm)
  const real = (i: number): boolean => !/^(select an option|select|selecteer|choose|kies|kiezen)\b/.test(opts[i]) && opts[i] !== ""
  if (!want) return -1
  // A Dutch level asked as a list of levels.
  if (/\b(dutch|nederlands)\b/i.test(label) && DUTCH_OPTION[want]) {
    const i = options.findIndex((o, n) => real(n) && DUTCH_OPTION[want].test(o.trim()))
    if (i >= 0) return i
  }
  for (const test of [(o: string) => o === want, (o: string) => o.startsWith(want) || want.startsWith(o), (o: string) => o.includes(want)]) {
    const i = opts.findIndex((o, n) => real(n) && test(o))
    if (i >= 0) return i
  }
  const yes = /^(yes|ja|true|y)\b/.test(want)
  const no = /^(no|nee|false|n)\b/.test(want)
  if (yes || no) return opts.findIndex((o, n) => real(n) && (yes ? /^(yes|ja)\b/ : /^(no|nee)\b/).test(o))
  // A number among ranges ("0-1 years", "2-4 years", "5+ years").
  const n = Number(digits(answer))
  if (answer.trim() && Number.isFinite(n)) {
    return options.findIndex((o, i) => {
      if (!real(i)) return false
      const r = /(\d+)\s*(?:-|–|to|tot)\s*(\d+)/.exec(o)
      if (r) return n >= Number(r[1]) && n <= Number(r[2])
      const plus = /(\d+)\s*\+/.exec(o)
      return plus ? n >= Number(plus[1]) : false
    })
  }

  return -1
}

/** The value to put in a field of this kind for an answer: digits for a number, the national part of a phone number beside a country picker. */
export function valueFor(kind: Kind, label: string, answer: string, besideCountry = false): string {
  if (kind === "number") return digits(answer)
  if (besideCountry && /\b(mobile|phone|telephone|telefoon\w*|mobiel\w*)\b/i.test(label)) return nationalNumber(answer)

  return answer
}
