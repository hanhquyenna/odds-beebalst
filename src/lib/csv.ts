import type { Row } from "@/lib/types"

/** The separator a file uses: comma, semicolon (Excel in the Netherlands), tab or bar, whichever the first lines hold most of outside quotes. */
export function detectDelimiter(text: string): string {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/).filter((l) => l.trim() !== "").slice(0, 6)
  let best = ","
  let bestScore = 0
  for (const d of [",", ";", "\t", "|"]) {
    const counts = lines.map((l) => {
      let n = 0
      let quoted = false
      for (const ch of l) {
        if (ch === '"') quoted = !quoted
        else if (ch === d && !quoted) n++
      }

      return n
    })
    const score = Math.min(...counts.filter((c) => c > 0), Infinity) * (counts.filter((c) => c > 0).length / Math.max(1, counts.length))
    if (Number.isFinite(score) && score > bestScore) {
      best = d
      bestScore = score
    }
  }

  return best
}

/** Reads a CSV of any kind: comma, semicolon, tab or bar separated, quoted cells, a mark at the start, a notes paragraph above the header row. Blank and repeated column names are made distinct. */
export function parseCsv(text: string): Row[] {
  const delimiter = detectDelimiter(text)
  const out: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const source = text.replace(/^﻿/, "")
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") {
        i++
      }
      row.push(cell)
      cell = ""
      if (row.some((c) => c !== "")) {
        out.push(row)
      }
      row = []
    } else {
      cell += ch
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    out.push(row)
  }
  const found = out.findIndex((r) => r.length > 1)
  const headerAt = found === -1 ? 0 : found
  const seen = new Map<string, number>()
  const header = (out[headerAt] ?? []).map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1
    seen.set(base.toLowerCase(), n)

    return n === 1 ? base : `${base} ${n}`
  })
  const width = header.length > 1 ? 2 : 1

  return out
    .slice(headerAt + 1)
    .filter((r) => r.length >= width)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])))
}
