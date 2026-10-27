/**
 * Month names as people write them on a CV, in the languages the students here write in. Only the first three letters matter;
 * accents are ignored. One table, used by the date reader of the engine and the CV parser, so a date means the same everywhere.
 */
const TABLE: Record<number, string[]> = {
  0: ["jan", "ene", "gen", "oca"],
  1: ["feb", "fev", "sub"],
  2: ["mar", "mrt", "mor", "mrz"],
  3: ["apr", "abr", "avr", "nis"],
  4: ["may", "mei", "mai", "mag"],
  5: ["jun", "giu", "haz"],
  6: ["jul", "tem", "lug"],
  7: ["aug", "ago", "aou", "agu"],
  8: ["sep", "set", "eyl"],
  9: ["oct", "okt", "out", "ott", "eki"],
  10: ["nov", "kas"],
  11: ["dec", "dez", "dic", "ara"],
}

const BY_WORD = new Map<string, number>(Object.entries(TABLE).flatMap(([i, words]) => words.map((w): [string, number] => [w, Number(i)])))

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/** Every three-letter month prefix we know, for building a pattern. */
const MONTH_PREFIXES: string[] = [...BY_WORD.keys(), "jui"]

/** A pattern (source) for one month word with an optional full ending and dot: "Mar", "March", "Dez.", "Sept", "Şubat". */
export const MONTH_PATTERN = `(?:${MONTH_PREFIXES.join("|")})[\\p{L}]{0,8}\\.?`

/** 0 for January to 11 for December, or null when the word is not a month. */
export function monthIndex(word: string): number | null {
  const folded = fold(word.replace(/\./g, ""))
  // French juin (June) and juillet (July) start with the same three letters.
  if (folded.startsWith("juil")) return 6
  if (folded.startsWith("juin")) return 5
  const i = BY_WORD.get(folded.slice(0, 3))

  return i === undefined ? null : i
}
