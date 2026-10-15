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
  /** Where the person found this job (LinkedIn, Indeed, the company's own site...), from the job odds holds. */
  job_source?: string | null
  /** Whether odds's own record shows an application to another job at this employer: true is a known yes, false is "nothing on record" (answered No), absent is unknown. */
  applied_before?: boolean
  /** True when the person has university education on their profile: an adult, for "are you 18 or older". */
  adult?: boolean
  /** True when no job on the person's profile is at this employer: so they cannot be a current employee of it. */
  never_worked_here?: boolean
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

/** The Dutch provinces, in English, and the places people apply from. Forms ask "State/Province" even in the Netherlands. */
const NL_PROVINCE: Record<string, ReadonlyArray<string>> = {
  "North Holland": ["amsterdam", "haarlem", "zaandam", "alkmaar", "hilversum", "amstelveen", "purmerend", "hoorn", "heerhugowaard", "haarlemmermeer", "schiphol", "diemen"],
  "South Holland": ["rotterdam", "the hague", "den haag", "s gravenhage", "leiden", "delft", "dordrecht", "zoetermeer", "gouda", "schiedam", "alphen aan den rijn", "wassenaar"],
  Utrecht: ["utrecht", "amersfoort", "zeist", "nieuwegein", "veenendaal", "houten"],
  "North Brabant": ["eindhoven", "tilburg", "breda", "s hertogenbosch", "den bosch", "helmond", "oss", "veldhoven", "roosendaal", "bergen op zoom"],
  Gelderland: ["nijmegen", "arnhem", "apeldoorn", "ede", "wageningen", "doetinchem", "zutphen"],
  Limburg: ["maastricht", "heerlen", "venlo", "sittard", "geleen", "roermond"],
  Groningen: ["groningen"],
  Overijssel: ["zwolle", "enschede", "deventer", "hengelo", "almelo"],
  Flevoland: ["almere", "lelystad"],
  Friesland: ["leeuwarden", "drachten", "heerenveen"],
  Drenthe: ["assen", "emmen", "hoogeveen"],
  Zeeland: ["middelburg", "vlissingen", "goes"],
}

/** The province a Dutch town is in, or null for a place not listed (nothing is guessed). */
export function nlProvinceOf(city: string): string | null {
  const key = questionKey(city)

  return Object.entries(NL_PROVINCE).find(([, places]) => places.includes(key))?.[0] ?? null
}

const NL_NAME = /^(nl|nld|the netherlands|netherlands|nederland|holland)$/i

/** The country the person lives in: the one they kept, or the last part of their place ("Amsterdam, Netherlands"), or the Netherlands for a Dutch town. */
export function residenceCountry(facts: Facts): string | null {
  const kept = facts.answers?.country?.trim()
  if (kept) return kept
  const parts = (facts.place ?? "").split(",").map((x) => x.trim()).filter(Boolean)
  const last = parts[parts.length - 1]
  if (parts.length > 1 && last) return NL_NAME.test(last) ? "Netherlands" : last
  const city = facts.answers?.city?.trim() || parts[0]

  return city && nlProvinceOf(city) ? "Netherlands" : null
}

/** The province of the person's town, when they live in the Netherlands. */
function residenceProvince(facts: Facts): string | null {
  const country = residenceCountry(facts)
  if (country && !NL_NAME.test(country)) return null
  const city = facts.answers?.city?.trim() || (facts.place ?? "").split(",")[0]?.trim()

  return city ? nlProvinceOf(city) : null
}

/**
 * "Do you want to be considered for other roles too?": the choice that shares least, being considered for this job only. Pure data protection:
 * never the one that lets an employer keep and reuse the person's details. -1 when no option says that.
 */
export function privacyChoice(options: ReadonlyArray<string>): number {
  const only = /\b(just|only|solely|merely)\b.*\b(this|the)\b.*\b(job|position|role|vacancy|opening|application)\b|\b(this|the) (job|position|role|vacancy|opening) only\b|\bonly for this\b|\bnot (for )?(any )?(other|future)\b/i

  return options.findIndex((o) => only.test(o))
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** The month and year in a graduation date as the person wrote it ("July 2027", "07/2027", "2027"). */
export function graduationParts(text: string): { month: string | null; year: string | null } {
  const t = text.trim()
  const year = /\b(20\d{2})\b/.exec(t)?.[1] ?? null
  const named = MONTHS.find((m) => new RegExp(`\\b${m.slice(0, 3)}`, "i").test(t))
  const numeric = /\b(0?[1-9]|1[0-2])\s*[/.-]\s*20\d{2}\b/.exec(t)?.[1]

  return { month: named ?? (numeric ? MONTHS[Number(numeric) - 1] : null), year }
}

/** "EUR 600 a month" asked as an annual figure is "EUR 7200 a year" (and the other way round): the unit the form asks for, never the wrong one. */
function salaryFor(raw: string | undefined, key: string): string | null {
  const text = (raw ?? "").trim()
  if (!text) return null
  const amount = Number(digits(text))
  const monthly = /\b(month|monthly|maand|mo)\b|\/\s*m\b/i.test(text)
  const yearly = /\b(year|yearly|annual|annually|annum|jaar|yr)\b|\bp\.?a\.?\b/i.test(text)
  const wantsYear = /\b(annual|annually|per year|yearly|a year|jaarsalaris|per jaar|jaarlijks|total compensation|annuel|annuelle|par an|jahres\w*|jahrlich)\b/.test(key)
  const wantsMonth = /\b(monthly|per month|a month|per maand|maandsalaris|maandelijks|mensuel|mensuelle|par mois|monatlich)\b/.test(key)
  if (!Number.isFinite(amount) || amount <= 0) return text
  const currency = /(€|eur\b|euro)/i.test(text) ? "EUR" : /(\$|usd)/i.test(text) ? "USD" : /(£|gbp)/i.test(text) ? "GBP" : "EUR"
  if (wantsYear && monthly && !yearly) return `${currency} ${amount * 12} a year`
  if (wantsMonth && yearly && !monthly) return `${currency} ${Math.round(amount / 12)} a month`

  return text
}

const DECLINE = /^(decline|prefer not|i (do not|don'?t) wish|i'?d rather not|rather not|choose not|not (to )?(say|disclose|answer)|no answer|pr[eé]f[eè]re(r)? ne pas|je (pr[eé]f[eè]re|ne (souhaite|veux) pas))|\bdecline to (self[- ]identify|answer|state)\b|\bprefer not to (say|answer|disclose)\b|\bne (souhaite|veux) pas (r[eé]pondre|dire|divulguer)\b/i
const DEMOGRAPHIC = /\b(gender|genre|geslacht|geschlecht|race|ethnic\w*|veteran|pronouns?|how old are you|age (group|range|bracket)|lgbt\w*|sexual orientation|transgender|disabilit\w*|health condition|neurodiver\w*|under[- ]represented|caregiving|religio\w*|divulgation volontaire|identit\w* de genre|voluntary (self[- ]?identif|disclosure))\b/i

/** Bot traps ("Leave this field empty if you're human") — never ask the person, always leave empty. */
const TRAP_QUESTION = /leave (this|the|it)\b[^.?]{0,24}\b(empty|blank)|if you.?re (a )?human|(do not|don.?t) (fill|complete|enter)\b[^.?]{0,20}\b(this|here)|honey ?pot|bot ?trap|ignore this (field|input)|for (spam|bots) (only|detection)|(^|[\s_-])(hp|gotcha)([\s_-]|$)/i

export function isTrapQuestion(label: string): boolean {
  return TRAP_QUESTION.test((label || "").replace(/\s+/g, " ").trim())
}

/**
 * Application consent / terms checkboxes Odds always ticks so Next is not blocked
 * (privacy notice, agree to terms, talent community, WhatsApp for applications, certify accuracy).
 * Never demographic or medical self-ID boxes.
 */
export function isConsentCheckbox(label: string): boolean {
  const t = (label || "").replace(/\s+/g, " ").trim()
  if (!t) return false
  if (DEMOGRAPHIC.test(t)) return false
  // LinkedIn Easy Apply: option text is often just "I consent" while the privacy notice sits in a sibling <p>.
  if (/^i (consent|agree)(\.|!)?$/i.test(t) || /^(akkoord|j'accepte|ich stimme zu|acepto)\.?$/i.test(t)) return true
  if (t.length < 8) return false
  // Medical / criminal self-ID stays with the person; workplace drug-free *policy* consents are ticked (not a drug test).
  if (/\b(disabilit\w*|medical|health condition|criminal|conviction|background check)\b/i.test(t) && !/\bprivacy notice\b/i.test(t)) return false
  if (/\b(privacy notice|privacy policy|privacy statement|confidentialit\w*|avis de confidentialit|privacyverklaring|terms (and|&|of)|termes et conditions|voorwaarden|read and agree|agree to|j'?ai lu|you declare|i declare|i (have )?read|acknowledg|talent (pool|community)|future (career )?opportunities|whats?\s*app|keep me (informed|updated)|receive .{0,60}(messages|notifications|updates|communications)|certify that|information .{0,40}(true|accurate|correct)|informations? (sont )?(compl[eè]tes|exactes)|by submitting|processing my data|traitement de (mes|vos) donn|drug[- ]free|sans drogues|zonder drugs)\b/i.test(t)) return true
  return /\b(consent|toestemming|akkoord)\b/i.test(t) && /\b(job application|applications?|recruit|hiring|career|opportunit|privacy|terms|données|gegevens)\b/i.test(t)
}

/** Whether Odds already knows this answer (or the safe default for demographics) — never hand it back to the person. */
export function agentCanAnswer(label: string, facts: Facts, options?: ReadonlyArray<string>): boolean {
  if (isTrapQuestion(label)) return true
  return resolveAgentAnswer(label, facts, options) !== null
}
/** The string Odds would fill for a bounced question, or null when the person must answer. */
export function resolveAgentAnswer(label: string, facts: Facts, options?: ReadonlyArray<string>): string | null {
  // Honeypots: "answered" as empty so they never bounce to the person.
  if (isTrapQuestion(label)) return ""
  const opts = options ?? []
  const text = answerText(label, facts)
  if (text !== null) {
    if (opts.length) {
      let i = chooseOption([...opts], text, label)
      if (i < 0 && isHearQuestion(label)) i = heardChoice(opts, text)
      if (i >= 0) return opts[i] ?? null
    }
    return text
  }
  if (opts.length) {
    const decline = demographicChoice(label, opts, facts)
    if (decline >= 0) return opts[decline] ?? null
    const only = privacyChoice(opts)
    if (only >= 0) return opts[only] ?? null
    const pick = preferenceChoice(label, opts)
    if (pick >= 0) return opts[pick] ?? null
  }
  // Voluntary disclosure / gender handed back as plain text (no options): Prefer not to answer.
  if (DEMOGRAPHIC.test(label) && !/^i answer/i.test((facts.answers?.demographics ?? "").trim())) {
    if (!opts.length) return "Prefer not to answer"
    const decline = opts.findIndex((o) => DECLINE.test(o.trim()))
    if (decline >= 0) return opts[decline] ?? null
  }
  return null
}

/**
 * "If you had to choose, which would you prefer?": a choice between options that does not change a chance (a programming language, an office, a cohort).
 * The first real option is taken. Only for lists; never for questions about the person, eligibility or the law.
 */
export function preferenceChoice(label: string, options: ReadonlyArray<string>): number {
  const key = questionKey(label)
  if (!/\b(prefer|preferred|favou?rite|if you had to choose|which of the following)\b/.test(key)) return -1
  if (/\b(visa|sponsor\w*|authori[sz]\w*|permit|disabilit\w*|gender|race|ethnic\w*|veteran|religio\w*|salary|compensation|relocat\w*|certif\w*|agree|consent)\b/.test(key)) return -1

  return options.findIndex((o) => o.trim() !== "" && !/^(select|choose|selecteer|make a selection|pick|— )/i.test(o.trim()) && !/^[—–-]/.test(o.trim()))
}

/**
 * The questions about gender, age, background and health that many forms put at the end: "Prefer not to say", the option that says so, unless the person
 * said (in Autofill) that they answer them themselves. Never a guess about who someone is: when there is no such option the question is left. -1 when it does not apply.
 */
export function demographicChoice(label: string, options: ReadonlyArray<string>, facts: Facts): number {
  if (/^i answer/i.test((facts.answers?.demographics ?? "").trim()) || !DEMOGRAPHIC.test(label)) return -1

  return options.findIndex((o) => DECLINE.test(o.trim()))
}

const DIAL = /^\+(351|353|420|421|234|31|32|33|34|39|44|49|1|36|48|45|46|47|41|43|30|90|91|84|86|62|60|63|65|66|55|52|27|20|7)/

/** The country code of a phone number kept as "+31 6 1234 5678", as "+31". */
export function dialCodeOf(phone: string | null | undefined): string | null {
  const m = DIAL.exec((phone ?? "").replace(/[^\d+]/g, ""))

  return m ? `+${m[1]}` : null
}

/** Whether a question is "how did you hear about us?" in any of its wordings. */
export function isHearQuestion(label: string): boolean {
  return /\b(how did you (hear|find|learn)|where did you (hear|find|see|learn)|how you (heard|found)|where (did|do) you find this (job|role|vacancy|opening|position)|source of (your )?application|from where did you hear|ou avez vous (trouve|entendu|appris)|comment avez vous (trouve|connu|entendu))\b/.test(questionKey(label))
}

/** Where the person found the job, as one of a list's options; when the list has no such option, the closest honest ones (a job board, the internet, other). -1 when none. */
export function heardChoice(options: ReadonlyArray<string>, source: string | null | undefined): number {
  for (const want of [source ?? "", "LinkedIn", "Job board", "Online job board", "Job site", "Job portal", "Careers website", "Company website", "Website", "Internet", "Social media", "Other"]) {
    if (!want) continue
    const i = chooseOption([...options], want, "How did you hear")
    if (i >= 0) return i
  }

  return -1
}

/** The person's answer to a question, in their words, or null when odds does not know it. Their own earlier answer comes first. */
export function answerText(label: string, facts: Facts): string | null {
  const key = questionKey(label)
  const a = facts.answers ?? {}
  const remembered = facts.remembered?.[applicationQuestionKey(label, facts.job_id)]
  const pick = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : remembered || null)
  if (/\b(value|values|priorities)\b/.test(key) && /\b(role|job|workplace|new position)\b/.test(key) && !/salary|pay|compensation/.test(key)) return pick(a.role_values)
  // A question put as a question ("Have you...", "Are you...") is not a field asking for a value: it is never answered with a URL, a number of hours or a city.
  const asks = /^(have you|has |do you|does |did you|are you|is |can you|could you|would you|will you|were you|was |if you)/.test(key)
  // "If it is not listed, please specify", "If not already based here...": follow-ups to another answer, left for the person.
  if (/^(si oui|wenn ja|if yes)\b/.test(key) || /^if\b.*\b(not listed|another|other|not applicable|not already|you are not|you do not|you don t|specify|provide details|explain)\b/.test(key) && !/\bgraduation\b/.test(key)) return null
  if (/\b(first name|given name|voornaam|prenom|vorname)\b/.test(key)) return pick(a.first_name)
  if (/\b(last name|surname|family name|achternaam|nom de famille|nachname)\b/.test(key)) return pick(a.last_name)
  if (/^(full )?name$/.test(key)) return (a.first_name && a.last_name ? `${a.first_name} ${a.last_name}` : pick(facts.name))
  if (/\b(e ?mail\w*|courriel)\b/.test(key)) return pick(a.email) ?? pick(facts.email)
  // The country code beside a phone number ("Code du pays", "Country code"): the one on the number, else +31 for someone who lives in the Netherlands.
  if (/\b(country|phone|calling|dial|area)\b.*\bcode\b|\bcode du pays\b|\blandcode\b|\bphone prefix\b|\btelefoonvoorvoegsel\b|\bindicatif\b/.test(key)) {
    const code = dialCodeOf(a.phone ?? facts.phone)
    const country = residenceCountry(facts)

    return pick(code ?? (country && NL_NAME.test(country) ? "+31" : null))
  }
  // The country code beside a phone number ("Code du pays", "Country code"): from the number, or +31 for someone in the Netherlands.
  if (/\b(mobile|phone|telephone|telefon\w*|telefoon\w*|mobiel\w*|portable)\b/.test(key) && !/country|landcode|pays/.test(key)) return pick(a.phone) ?? pick(facts.phone)
  // Bosch / Phenom etc. label the field just "LinkedIn" (no "URL"/"profile"). Skip yes/no and "how did you hear".
  if (/\blinkedin\b/.test(key) && !asks && !isHearQuestion(label)) return pick(a.linkedin) ?? pick(facts.linkedin)
  // "Are you currently based in the Netherlands?": yes or no from where the person lives, when the question names a Dutch place.
  if (asks && /\b(based|living|located|residing|reside|live|resident)\b/.test(key) && /\b(netherlands|nederland|holland|amsterdam|rotterdam|utrecht|the hague|den haag|eindhoven|delft|leiden|groningen|breda|tilburg|nijmegen|maastricht|haarlem|almere)\b/.test(key) && !/relocat|willing|open to|office|days?\b|able|travel/.test(key)) {
    const country = residenceCountry(facts)

    return country ? (NL_NAME.test(country) ? "Yes" : "No") : remembered || null
  }
  // Time at the office: a yes or no the person gave once, before "per week" is read as a number of hours.
  if (/\b(hybrid|office|on site|onsite|in person)\b/.test(key) && /\b(days?|week|comfortable|open to|willing|able|confirm|expect|require)\b/.test(key)) return pick(a.onsite_ok)
  if (!asks && /\b(website|portfolio|github|personal site)\b/.test(key)) return pick(a.website)
  if (!asks && /\b(city|ville|stadt|location|where do you live|woonplaats)\b/.test(key) && !/relocat/.test(key)) return pick(a.city) ?? pick(facts.place?.split(",")[0])
  if (/\b(postal code|postcode|zip code|zip)\b/.test(key)) return pick(a.postcode)
  if (/^(street address|address|address line 1|adres|straat)/.test(key)) return pick(a.address)
  if (/^(country|country of residence|land|pays|pays de residence)$/.test(key) || /\b(country|land)\b.*\b(reside|resides|residing|residence|live|living|located)\b|\b(reside|resides|residing|residence|live|living)\b.*\b(country|land)\b/.test(key)) return pick(residenceCountry(facts))
  if (/^(state|province|state province|province state|state or province|provincie|region|state region|province region|etat|etat province|bundesland)$/.test(key)) return pick(residenceProvince(facts))
  if (remembered) return remembered
  // What an international student is asked: school, degree, graduation, whether they are a student, the university's internship agreement.
  if (/\b(internship|stage|placement|work placement)\b.*\b(agreement|contract|overeenkomst)\b|\bstage ?overeenkomst|\b(agreement|overeenkomst)\b.*\b(university|school|college)\b/.test(key)) return pick(a.internship_agreement)
  // The dates of the study (a form's Education block asks start and end month and year): "Study start date month" is how the extension names them.
  if (/^study (start|end) date( month| year)?$/.test(key)) {
    const part = graduationParts(/^study start/.test(key) ? a.study_start ?? "" : a.graduation_date ?? "")
    if (/month$/.test(key)) return pick(part.month)
    if (/year$/.test(key)) return pick(part.year)

    return pick(/^study start/.test(key) ? a.study_start : a.graduation_date)
  }
  // "Current or most recent job title / company", from the latest job on the profile.
  if (/\b(current|most recent|latest|last)\b.*\b(job title|position title|role title|title|position|role)\b/.test(key) && !asks) return pick(a.current_job_title)
  if (/\b(current|most recent|latest|last)\b.*\b(company|employer|organi[sz]ation)\b/.test(key) && !asks) return pick(a.current_company)
  if (/\b(graduat\w*|afstudeer\w*)\b/.test(key)) {
    // "When did you graduate?" is about a degree already finished, not the one still ahead.
    if (/\b(did you graduate|have you graduated|you graduated|graduated from)\b/.test(key)) return null
    const date = a.graduation_date ?? ""
    const part = graduationParts(date)
    if (/\bmonth\b/.test(key)) return pick(part.month)
    if (/\byear\b/.test(key)) return pick(part.year)

    return pick(date)
  }
  if (/\b(current|which|what)\b.*\byear\b.*\b(studies|study|degree|programme|program|education)\b|\byear of (your )?(studies|study|degree|programme|program)\b|\b(jaar van je studie|studiejaar)\b/.test(key)) return pick(a.study_year)
  if (isHearQuestion(label)) return pick(facts.job_source)
  if (/\b(previously|before|already|earlier)\b.*\bappl(ied|y|ication)\b|\bappl(ied|ication)\b.*\b(before|previously|this season|earlier)\b/.test(key)) return facts.applied_before === true ? "Yes" : facts.applied_before === false ? remembered || "No" : remembered || null
  // Student / enrolled / compulsory internship BEFORE "degree" — else "Bachelor's or Master's degree program for the internship" stole the degree field and returned null.
  if (/\b(are you|currently|presently)\b.*\b(student|enrolled|studying)\b|\b(enrolled|enrolment|enrollment|ingeschreven)\b/.test(key)) return pick(a.study_status)
  if (/\b(compulsor\w*|mandatory|required)\b.*\b(internship|stage|placement|part of (your )?(studies|program|programme|academic))\b|\b(internship|stage|placement)\b.*\b(compulsor\w*|mandatory|required part|part of (your )?(studies|program|programme|academic))\b/.test(key)) return pick(a.internship_agreement)
  if (/\b(degree|diploma|level of education|education level|highest level|opleidingsniveau)\b/.test(key) && !/\b(enrolled|enrolment|enrollment|internship|duration|compulsory|mandatory)\b/.test(key)) return pick(a.degree)
  // Basic facts that hold for nearly everyone and never change a chance, answered from what the profile shows or a choice made once in Autofill.
  if (/\b(18|eighteen)\b.*\b(ans|years|jaar|older|plus|ouder|alt)\b|\b(at least|over|above)\b.*\b18\b/.test(key)) return facts.adult ? "Yes" : remembered || null
  if (/\b(current|currently|actuellement|momenteel|derzeit)\b.*\b(employee|employe\w*|employed|in dienst|beschaftigt)\b/.test(key) && !/\b(family|spouse|parent|sibling|relative|famille|membre|familie)\b/.test(key)) return facts.never_worked_here ? "No" : remembered || null
  if (/\b(family|relative|spouse|parent|sibling|membre de votre famille|famille)\b.*\b(employ\w*|work\w*|travaill\w*)\b/.test(key)) return /^no\b/i.test(a.insider ?? "") ? "No" : remembered || null
  if (/\b(non ?compet\w*|non ?concurrence|noncompete|restrictive covenant)\b|\b(patent|patents|brevets?|confidential\w*|proprietary|exclusive information)\b.*\b(agreement|entente|contract|accord|signed|sign)\b|\b(agreement|entente|signed|sign)\b.*\b(patent|patents|brevets?|confidential\w*|proprietary)\b/.test(key)) return /^no\b/i.test(a.prior_agreements ?? "") ? "No" : remembered || null
  if (/\b(field of study|major|study programme|study program|discipline|area of study|opleiding|studierichting)\b/.test(key)) return pick(a.field_of_study)
  if (/\b(university|universiteit|school|college|institution|hogeschool|school name)\b/.test(key) && key.split(" ").length <= 6 && !/\b(high school|year|date|reference|referral|hear|find|about|why)\b/.test(key)) return pick(a.university)
  if (/\b(nationality|nationaliteit|citizenship)\b/.test(key) && key.length <= 90) return pick(a.nationality)
  // Gender from Autofill (the person's own answer, never a guess from a name or photo); empty → the background rule below (Prefer not to say).
  if (/\b(gender|geslacht|geschlecht|genre|sex)\b/.test(key) && !/\b(identity|transgender|pronouns?|orientation|identit)\b/.test(key) && key.length <= 90 && a.gender?.trim()) return a.gender.trim()
  // "Do you hold an EU/EEA passport, or a Dutch student residence permit?"
  if (/\b(eu|eea)\b.*\b(passport|citizen|national|permit)|\b(passport|residence permit|student (visa|permit|residence))\b/.test(key) && !/\b(sponsor|parrainage)\b/.test(key)) {
    const w = a.work_authorization ?? ""
    if (!w) return remembered || null
    if (/^\s*yes\b|\b(eu|eea)\b|\bcitizen\b|\bnational\b|\bpassport\b|\bpermit\b|\bzoekjaar\b|\borientation year\b|\bsearch year\b|\bfree to work\b|\bauthori[sz]ed\b/i.test(w)) return "Yes"
    if (/^\s*no\b|\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w)) return "No"
    return pick(w)
  }
  // "Where are you based? Are you able to relocate?" — both Autofill answers in one text field.
  if (/\b(based|where do you live|where are you)\b/.test(key) && /\brelocat/.test(key)) {
    const place = pick(a.city) ?? pick(facts.place?.split(",")[0]?.trim())
    const reloc = pick(a.relocation)
    if (place && reloc) return `${place}. ${reloc}`
    return place || reloc || remembered || null
  }
  if (/\b(relocat\w*)\b/.test(key)) return pick(a.relocation)
  // Combined "When would you start? What is your notice period?" — never return null when only start_date is set
  // (notice_period-only match used to swallow the field and leave both outlined).
  if (/\bnotice period\b|\bopzegtermijn\b/.test(key) && /\b(start|available|availability|when (can|would) you|able to start|beschikbaar)\b/.test(key)) {
    const start = pick(a.start_date)
    const notice = pick(a.notice_period)
    if (start && notice) return `${start}. Notice period: ${notice}`
    return start || notice || remembered || null
  }
  if (/\bnotice period\b|\bopzegtermijn\b/.test(key)) return pick(a.notice_period)
  if (/\b(start date|when can you start|when would you (be able to )?start|available to start|able to start|availability|earliest start|beschikbaar)\b/.test(key)) return pick(a.start_date)
  if (!asks && (/\bhours\b.*\bweek\b|\bper week\b|\buren\b/.test(key))) return pick(a.hours_per_week)
  if (/\b(salary|compensation|pay|wage|salaris|salaire|gehalt|stipend)\b/.test(key)) return pick(salaryFor(a.expected_salary, key))
  // English "sponsorship" / "visa" and French "parrainage" / "visa d'emploi" (Nécessiterez-vous… un parrainage…).
  if (/\b(sponsor\w*|visa|parrainage)\b/.test(key)) {
    // "If you do require visa sponsorship, please provide details" is for the person to write.
    if (/\b(details|explain|describe|elaborate|please provide|why)\b/.test(key)) return null
    // Only skip when we know the job is outside the Netherlands; missing country still gets an answer (odds is NL-first).
    if (facts.job_country && facts.job_country !== "NL") return null
    if (/\b(orientation year|search year|zoekjaar|highly skilled|kennismigrant|blue card)\b/.test(key)) return null
    const w = a.work_authorization ?? ""
    if (!w) return null
    // "Do you have the right to work without sponsorship?" and "Do you have a valid visa?" ask whether the person is cleared: the answer the other way round.
    if (/\bwithout\b.*\b(sponsor|visa|parrainage)|\b(no|not)\b.*\b(sponsor|visa|parrainage)\w*\b.*\b(needed|required)|\b(valid|current|existing)\b.*\b(visa|work permit|permit)\b/.test(key)) {
      if (/\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w) || /\bno(t)?\b.*\b(allowed|authori[sz]ed|permit)\b/i.test(w)) return "No"
      // Zoekjaar / orientation year: may work in NL without employer sponsorship.
      if (/^\s*yes\b|\b(eu|eea) (citizen|national)|\bfree to work|\ballowed to work|\bauthori[sz]ed\b|\bpermit\b|\b(zoekjaar|orientation year|search year)\b/i.test(w)) return "Yes"

      return null
    }
    // "Do you need sponsorship?" / French parrainage: Yes when they need a permit, No when they already may work.
    if (/\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w) || /\bno(t)?\b.*\b(allowed|authori[sz]ed|permit)\b/i.test(w)) return "Yes"
    if (/^\s*yes\b|\b(eu|eea) (citizen|national)|\bfree to work|\bno (sponsor|visa)\w* (needed|required)|\ballowed to work|\bauthori[sz]ed\b|\bpermit\b|\b(zoekjaar|orientation year|search year)\b/i.test(w)) return "No"
    return null
  }
  if (/\b(authori[sz]ed|legally|right to work|eligible to work|work permit|allowed to work|werkvergunning)\b/.test(key)) {
    // Right-to-work wording is country-specific: only answer when the job is known to be in the Netherlands.
    if (facts.job_id && facts.job_country !== "NL") return null
    const w = a.work_authorization ?? ""
    if (!w) return null
    if (/^\s*no\b|\b(need|require)s?\b.*\b(sponsor|visa|permit)/i.test(w)) return "No"
    return /^\s*yes\b|\b(eu|eea)\b|\ballowed\b|\bauthori[sz]ed\b|\bfree to work\b|\bpermit\b|\b(zoekjaar|orientation year|search year)\b/i.test(w) ? "Yes" : null
  }
  if (asks && /\bnative\b/.test(key) && /\b(dutch|nederlands)\b/.test(key)) {
    const level = (facts.dutch ?? "").toLowerCase()

    return level ? (level === "native" ? "Yes" : "No") : remembered || null
  }
  if (/\bdutch\b|\bnederlands\b/.test(key) && /\b(level|proficiency|speak|fluent|niveau)\b/.test(key)) {
    // "Do you have working proficiency in Dutch?" is yes or no, never the level; with English beside it only a "no" is known.
    if (asks) {
      const level = (facts.dutch ?? "").toLowerCase()
      if (!level) return remembered || null
      const good = level === "professional" || level === "native"
      if (/\benglish\b/.test(key)) return good ? remembered || null : "No"

      return good ? "Yes" : "No"
    }

    return pick(facts.dutch)
  }

  return null
}

const norm = (t: string): string => t.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+]+/g, " ").trim()

/** Which of a question's options an answer is: the same words, then one starting with it, then yes/no by meaning. -1 when none fits. */
export function chooseOption(options: string[], answer: string, label = ""): number {
  // The Dutch names and the English ones are the same place: Noord-Holland is North Holland, Nederland is the Netherlands.
  const canon = (t: string): string => norm(t).replace(/\bnoord\b/g, "north").replace(/\bzuid\b/g, "south").replace(/\bfryslan\b/g, "friesland").replace(/\bnederland\b/g, "netherlands").replace(/^the netherlands$/, "netherlands").replace(/^pays bas$|^niederlande$/, "netherlands").replace(/^hollande septentrionale$|^nordholland$/, "north holland").replace(/^hollande meridionale$|^sudholland$/, "south holland").replace(/^brabant septentrional$|^nordbrabant$/, "north brabant").replace(/^frise$/, "friesland").replace(/^zelande$/, "zeeland").replace(/^geldre$/, "gelderland")
    // Gender options in any wording: "Man", "Male (he/him)", "Mannelijk" are one choice; "Woman", "Female", "Vrouw" the other.
    .replace(/^(man|male|mannelijk|homme|mannlich|masculin\w*)\b/, "male").replace(/^(woman|female|vrouw|vrouwelijk|femme|weiblich|feminin\w*)\b/, "female")
  const want = canon(answer)
  const opts = options.map(canon)
  // A degree: "MSc Finance" is the option that says Master, whatever else it says ("Master\'s Degree", "Master of Science (MSc)").
  if (/\bdegree\b|\bdiploma\b|\beducation\b/.test(norm(label))) {
    const level = (t: string): string | null => (/\b(phd|doctor\w*)\b/.test(t) ? "phd" : /\b(master\w*|msc|mba|ma|llm)\b/.test(t) ? "master" : /\b(bachelor\w*|bsc|ba|llb)\b/.test(t) ? "bachelor" : /\b(associate|diploma|certificate)\b/.test(t) ? "associate" : null)
    const wanted = level(want)
    const i = wanted ? opts.findIndex((o, n) => options[n] !== undefined && level(o) === wanted) : -1
    if (i >= 0) return i
  }
  const real = (i: number): boolean => !/^(select an option|select|selecteer|choose|kies|kiezen|make a selection|pick one)\b/.test(opts[i]) && opts[i] !== ""
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
  // A year of study kept as "2" or "2nd year" is "Year 2", "2nd year" or "Second year" in a list.
  const nth = /\b([1-6])(st|nd|rd|th)?\b/.exec(want)?.[1]
  if (nth && /\byear\b|\bjaar\b/.test(`${want} ${norm(label)}`)) {
    const ordinal = ["", "first", "second", "third", "fourth", "fifth", "sixth"][Number(nth)]
    const i = opts.findIndex((o, n) => real(n) && (new RegExp(`\\b${nth}(st|nd|rd|th)?\\b`).test(o) || o.includes(ordinal)) && /\byear\b|\bjaar\b/.test(o))
    if (i >= 0) return i
  }
  const yes = /^(yes|ja|true|y|oui|si)\b/.test(want)
  const no = /^(no|nee|false|n|non|nein)\b/.test(want)
  if (yes || no) return opts.findIndex((o, n) => real(n) && (yes ? /^(yes|ja|oui|si)\b/ : /^(no|nee|non|nein)\b/).test(o))
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
