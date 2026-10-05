/** The kinds of line illustration a report can place as a figure. */
const ART_KINDS = ["funnel", "stairs", "door", "scales", "compass", "bridge", "map", "receipt", "lens", "thread", "clock", "seed"] as const
export type ArtKind = (typeof ART_KINDS)[number]

/**
 * One piece of a section. Text may use **bold** and {ref:id} (replaced by
 * "Table 2" or "Figure 3" from the block with that id) and numbered citations
 * like [4] or [2, 7] that point into the report's reference list.
 */
export type Block =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "table"; id?: string; caption: string; head: string[]; rows: string[][]; note?: string }
  | { type: "bars"; id?: string; caption: string; unit: string; items: Array<{ label: string; value: number }>; note?: string }
  | { type: "ranges"; id?: string; caption: string; unit: string; max: number; items: Array<{ label: string; low: number; high: number }>; note?: string }
  | { type: "art"; id?: string; kind: ArtKind; caption: string }
  /** Words to send, set apart and copyable on hover. */
  | { type: "message"; title: string; text: string; note?: string }

interface Section {
  /** Numbered automatically: 1, 2, 3 ... */
  heading: string
  blocks: Block[]
}

/** One research report. Every report has this same shape and the same order of parts. */
export interface Report {
  slug: string
  /** Report number, 1 to 8. */
  order: number
  title: string
  subtitle: string
  category: "Odds" | "Pay" | "Permits" | "Careers" | "Method"
  minutes: number
  /** The one figure from the report that says most, shown large in the index. Taken from the findings, never new. */
  headline: { figure: string; line: string }
  /** Which part of odds this report stands behind, in a few words. */
  feeds: string
  /** The drawing shown beside the title in the index and above the report. */
  art: ArtKind
  /** 120 to 200 words. */
  abstract: string
  /** 4 to 6 short findings, each one sentence with its figure and citation. */
  findings: string[]
  sections: Section[]
  /** Numbered from 1 in the order listed; cited in the text as [1]. Full bibliographic entries. */
  references: string[]
}
