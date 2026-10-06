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

const ELITE: ReadonlyArray<RegExp> = [
  // Banks and asset managers
  /goldman sachs/, /j\.?\s?p\.?\s?morgan|jpmorgan/, /morgan stanley/, /bank of america|merrill lynch/, /\bciti(group|bank)?\b/, /barclays/, /deutsche bank/,
  /\bubs\b/, /credit suisse/, /bnp paribas/, /hsbc/, /lazard/, /rothschild/, /evercore/, /blackrock/, /blackstone/, /\bkkr\b/,
  // Strategy and Big 4
  /mckinsey/, /boston consulting|\bbcg\b/, /\bbain\b/, /deloitte/, /pwc|pricewaterhouse/, /\bey\b|ernst & young|ernst and young/, /kpmg/,
  // Tech platforms
  /\bgoogle\b|alphabet/, /\bmeta\b|facebook/, /amazon|\baws\b/, /\bapple\b/, /microsoft/, /netflix/, /nvidia/, /openai/, /anthropic/, /stripe/, /spotify/,
  // Amsterdam trading and Dutch names that carry weight
  /optiver/, /\bimc\b/, /flow traders/, /\bda vinci\b/, /jane street/, /citadel/, /\basml\b/, /adyen/, /booking\.com|booking holdings/, /\bshell\b/,
  /unilever/, /philips/, /\bing\b|ing bank|ing group/, /abn amro/, /rabobank/, /heineken/, /\bmollie\b/,
]

/** The tier of an employer named on a CV or a posting. Size is the LinkedIn employee count when it is known. */
export function employerTier(name: string | null | undefined, employees?: number | null): EmployerTier {
  const n = (name ?? "").toLowerCase().trim()
  if (n && ELITE.some((re) => re.test(n))) return "elite"
  if (typeof employees === "number") {
    if (employees >= 5000) return "large"
    if (employees >= 200) return "mid"
    return "small"
  }

  return "unknown"
}
