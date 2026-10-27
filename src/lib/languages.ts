/**
 * Languages other than English and Dutch that a job asks for, read from its title ("Legal Assistant (German-speaking)",
 * "Credit Controller - Spanish & Italian speaking"). Only the title is read: a title that says it is nearly always
 * a real requirement, while a mention in the body can be a plus. Dutch has its own check (dutch_required).
 * Roughly 4% of the jobs we hold need such a language; about a third of those say so in the title.
 */
const LANGUAGES = ["german", "french", "spanish", "italian", "portuguese", "polish", "czech", "greek", "swedish", "norwegian", "danish", "finnish", "turkish", "arabic", "russian", "japanese", "chinese", "mandarin", "korean", "hungarian", "romanian", "bulgarian", "ukrainian", "hebrew", "hindi", "thai", "vietnamese", "indonesian"]
const ONE = `(?:${LANGUAGES.join("|")})`
const LIST = new RegExp(`\\b(${ONE}(?:\\s*(?:&|and|/|,|or)\\s*${ONE})*)[\\s-]*(?:speaking|speaker|speakers|language skills)`, "gi")
const NATIVE = new RegExp(`\\b(?:native|fluent|bilingual)\\s+(?:in\\s+)?(${ONE})\\b`, "gi")

const canonical = (l: string): string => (l === "mandarin" ? "chinese" : l)

/** The languages (lower case, one name each) the title asks for, in the order they appear. */
export function requiredLanguages(title: string): string[] {
  const found: string[] = []
  for (const re of [LIST, NATIVE]) {
    re.lastIndex = 0
    for (let m = re.exec(title); m; m = re.exec(title)) {
      for (const l of m[1].toLowerCase().match(new RegExp(ONE, "g")) ?? []) {
        const c = canonical(l)
        if (!found.includes(c)) found.push(c)
      }
    }
  }

  return found
}

/** Whether a profile's listed languages cover one of the required ones. Languages not listed: unknown, never a no. */
export function hasLanguage(listed: ReadonlyArray<{ Name?: string }>, required: ReadonlyArray<string>): "pass" | "fail" | "unknown" {
  const names = listed.map((l) => canonical((l.Name ?? "").toLowerCase().trim())).filter(Boolean)
  if (names.length === 0) return "unknown"

  // "Spanish & Italian speaking" asks for both, but one is enough to be worth applying for: a person who speaks either is not ruled out.
  return required.some((r) => names.some((n) => n === r || n.startsWith(`${r} `) || n.includes(r))) ? "pass" : "fail"
}
