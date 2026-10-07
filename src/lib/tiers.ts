/**
 * How well known an employer is, in four tiers, for the interview-chance model (odds-v2.ts).
 *
 * "elite" is a short hand-kept list of employers whose name works as a signal on its own across Europe: bulge-bracket and
 * top European banks, the three strategy houses, the Big 4, the large tech platforms, the Amsterdam trading firms and the
 * Dutch multinationals students apply to most. It is a judgement, kept small on purpose, and the evidence says the name
 * is worth little unless the work was in the same line as the job (Kessler, Low & Sullivan 2019; Nunley et al. 2016).
 * Below it, size decides when it is known (LinkedIn company page counts in employer_facts): 5,000+ staff is "large",
 * 200+ "mid", fewer "small". A name we know nothing about is "unknown" and moves nothing.
 */
export type EmployerTier = "elite" | "large" | "mid" | "small" | "unknown"

/** Names distinctive enough to count wherever they appear in a company name ("Goldman Sachs International", "Deloitte Consulting"). */
const DISTINCT: ReadonlyArray<RegExp> = [
  // Banks and asset managers
  /goldman sachs/, /\bj\.?\s?p\.?\s?morgan|jpmorgan/, /morgan stanley/, /bank of america|merrill lynch/, /citigroup|citibank/, /barclays/, /deutsche bank/,
  /credit suisse/, /bnp paribas/, /\bhsbc\b/, /\blazard\b/, /rothschild/, /evercore/, /blackrock/, /^blackstone\b|blackstone group/, /\bkkr\b/,
  // Strategy and Big 4
  /mckinsey/, /boston consulting group/, /deloitte/, /\bpwc\b|pricewaterhouse/, /ernst (&|and) young/, /\bkpmg\b/,
  // Tech platforms
  /\bgoogle\b|\balphabet inc/, /facebook/, /amazon web services/, /microsoft/, /netflix/, /nvidia/, /openai/, /anthropic/, /spotify/,
  // Amsterdam trading and Dutch names that carry weight
  /optiver/, /flow traders/, /jane street/, /\basml\b/, /\badyen\b/, /booking\.com|booking holdings/, /unilever/, /\bphilips\b/, /abn amro/, /rabobank/, /heineken/,
]
/** Names that are also ordinary words or short letters: they count only as the whole company name ("Shell" yes, "Shell Shock Studios" no). */
const WHOLE = new Set(["shell", "apple", "meta", "meta platforms", "amazon", "bain", "bain & company", "bcg", "ey", "ing", "ing bank", "ing group", "citi", "ubs", "imc", "imc trading", "da vinci", "da vinci derivatives", "citadel", "citadel securities", "stripe", "mollie", "aws"])
/** Legal forms and place words dropped before comparing a whole name. */
const SUFFIX = /\b(n\.?v\.?|b\.?v\.?|plc|ltd|limited|inc|llc|gmbh|ag|s\.?a\.?|corp(oration)?|company|co|holdings?|international|global|europe|emea|nederland|netherlands|the netherlands|uk|us|usa)\b\.?/g

function wholeName(name: string): string {
  return name.replace(/[,()]/g, " ").replace(SUFFIX, " ").replace(/^the\s+/, "").replace(/\s+/g, " ").trim().replace(/\s*(&|and)$/, "")
}

/** The tier of an employer named on a CV or a posting, remembered per name. Size is the LinkedIn employee count when it is known. */
const tierMemo = new Map<string, EmployerTier>()

export function employerTier(name: string | null | undefined, employees?: number | null): EmployerTier {
  const key = `${employees ?? ""}\u0000${name ?? ""}`
  const hit = tierMemo.get(key)
  if (hit) return hit
  const tier = employerTierFresh(name, employees)
  if (tierMemo.size > 50_000) tierMemo.clear()
  tierMemo.set(key, tier)

  return tier
}

function employerTierFresh(name: string | null | undefined, employees?: number | null): EmployerTier {
  // What is in brackets ("formerly Philips Domestic Appliances") describes the name; it is not the name.
  const n = (name ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/&amp;/g, "&").trim()
  if (n && (DISTINCT.some((re) => re.test(n)) || WHOLE.has(wholeName(n)))) return "elite"
  if (typeof employees === "number") {
    if (employees >= 5000) return "large"
    if (employees >= 200) return "mid"
    return "small"
  }

  return "unknown"
}
