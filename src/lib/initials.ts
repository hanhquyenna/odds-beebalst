/** Initials and a steady colour for a person with no picture. Pure, so every list and panel draws the same avatar for the same name. */
const CREDENTIALS = new Set(["phd", "mba", "msc", "bsc", "cfa", "cpa", "ra", "rc", "frm", "cams", "cissp", "md", "jr", "sr", "emfc", "ca", "cma", "cia", "pmp", "drs", "dr", "ir", "mr", "ing"])
const PARTICLES = new Set(["van", "de", "der", "den", "ten", "ter", "te", "von", "le", "la", "al", "bin", "ben", "di", "da", "dos", "del", "du", "het", "'t"])

/** Up to two capital letters: the first name and the last family name, skipping particles ("van", "de"), credentials and emoji. "?" when the name has no letters. */
export function initialsOf(name: string): string {
  const head = name.split(/[,/|(•·]/)[0] ?? ""
  const words = head.split(/\s+/).map((w) => w.replace(/[^\p{L}'’-]/gu, "")).filter((w) => /\p{L}/u.test(w))
  if (words.length === 0) return "?"
  const first = words[0]
  const rest = words.slice(1).filter((w) => !CREDENTIALS.has(w.toLowerCase().replace(/[.']/g, "")))
  const family = [...rest].reverse().find((w) => !PARTICLES.has(w.toLowerCase())) ?? rest[rest.length - 1]
  const letter = (w: string): string => (w.match(/\p{L}/u)?.[0] ?? "").toUpperCase()

  return (letter(first) + (family ? letter(family) : "")) || "?"
}

/** A hue 0-359 from the name, the same every time (a small string hash). */
export function hueOf(name: string): number {
  let h = 0
  for (const ch of name.trim().toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0

  return h % 360
}
