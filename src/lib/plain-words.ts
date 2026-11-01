// What the person reads is about their application, never about how Odds is built. Lines that come from the server or the extension
// (some written before these words were settled, some by the form-filling engine itself) pass through here before they are shown: the
// engine's name, its parts and its errors become what a person would say.

const SWAPS: ReadonlyArray<[RegExp, string]> = [
  [/Broods[’']? model is unreachable\.?/gi, "Odds lost its connection."],
  [/The fill stopped\.?/gi, "It stopped partway."],
  [/Odds assist could not move this application forward after assist:?/gi, "Odds could not get further on its own:"],
  [/\bOdds assist\b/gi, "Odds"],
  [/\bBroods[’']s\b/g, "Odds'"],
  [/\bBroods[’']/g, "Odds'"],
  [/\bBroods\b/g, "Odds"],
  [/\bthe agent\b/gi, "Odds"],
  [/\bapplication run\b/gi, "application"],
  [/\bOdds Odds\b/g, "Odds"],
]

/** A line from the server or the extension, in the person's words. */
export function plainWords(text: string): string
export function plainWords(text: string | null | undefined): string | undefined
export function plainWords(text: string | null | undefined): string | undefined {
  if (!text) return text ?? undefined
  return SWAPS.reduce((out, [from, to]) => out.replace(from, to), text)
}
