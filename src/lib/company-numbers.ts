/**
 * The money and news a job's company section shows, put together from the two places they are kept: the database
 * (employer_money and employer_news, through job_company) and the per-company files (public/companies, from Wikidata,
 * GLEIF and Google News). Pure, so it is tested without either.
 */

export interface Amount {
  amount: number
  currency: string | null
  year: number | null
  source: string
}

export interface Headline {
  title: string
  url: string | null
  site: string | null
  date: string | null
  /** What the headline is about, when it was labelled: funding, layoffs, results... */
  labels: string[]
}

interface DbMoney {
  kind: string
  amount: number
  currency: string | null
  year: number | null
  source: string | null
}

interface FileMoney {
  amount: number
  currency?: string | null
  year?: string | null
}

const KIND: Record<string, "revenue" | "profit" | "marketValue"> = { revenue: "revenue", net_profit: "profit", profit: "profit", market_value: "marketValue" }

/** Revenue, profit and market value, the newest of each from either source. */
export function companyMoney(db: ReadonlyArray<DbMoney>, ...files: Array<{ revenue?: FileMoney; profit?: FileMoney; marketValue?: FileMoney } | null | undefined>): Partial<Record<"revenue" | "profit" | "marketValue", Amount>> {
  const out: Partial<Record<"revenue" | "profit" | "marketValue", Amount>> = {}
  const offer = (kind: "revenue" | "profit" | "marketValue", a: Amount): void => {
    const now = out[kind]
    if (!now || (a.year ?? 0) > (now.year ?? 0)) out[kind] = a
  }
  for (const m of db) {
    const kind = KIND[m.kind]
    if (kind && Number.isFinite(m.amount)) offer(kind, { amount: m.amount, currency: m.currency, year: m.year, source: m.source && m.source.toLowerCase() !== "wikidata" ? m.source : "Wikidata" })
  }
  for (const file of files) {
    for (const kind of ["revenue", "profit", "marketValue"] as const) {
      const m = file?.[kind]
      if (m && Number.isFinite(m.amount)) offer(kind, { amount: m.amount, currency: m.currency ?? null, year: m.year ? Number(String(m.year).slice(0, 4)) : null, source: "Wikidata" })
    }
  }

  return out
}

const SYMBOL: Record<string, string> = { usd: "$", "united states dollar": "$", eur: "€", euro: "€", gbp: "£", "pound sterling": "£", chf: "CHF ", "swiss franc": "CHF ", jpy: "¥", "japanese yen": "¥", sek: "SEK ", "swedish krona": "SEK ", dkk: "DKK ", "danish krone": "DKK ", nok: "NOK ", "norwegian krone": "NOK ", cny: "CN¥", renminbi: "CN¥" }

/** "$69.7 billion", "€412 million", "-€3 million". */
export function moneyText(a: Pick<Amount, "amount" | "currency">): string {
  const sym = a.currency ? (SYMBOL[a.currency.toLowerCase()] ?? `${a.currency} `) : ""
  const abs = Math.abs(a.amount)
  const sign = a.amount < 0 ? "-" : ""
  const v = abs >= 1e9 ? `${(abs / 1e9).toFixed(1)} billion` : abs >= 1e6 ? `${Math.round(abs / 1e6)} million` : Math.round(abs).toLocaleString("en-US")

  return `${sign}${sym}${v}`
}

/** "20261005" or "2026-10-05T..." -> "2026-10-05". */
export function isoDay(d: string | null): string | null {
  if (!d) return null
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(d)

  return m ? `${m[1]}-${m[2]}-${m[3]}` : d
}

const key = (h: { title: string; url: string | null }): string => (h.url ?? "").replace(/[?#].*$/, "") || h.title.toLowerCase().replace(/\W+/g, " ").trim()

/** Headlines from both sources, each once, newest first. */
export function companyNews(db: ReadonlyArray<{ title: string; url: string | null; site: string | null; date: string | null }>, file: ReadonlyArray<{ title: string; url: string; site?: string; date?: string; labels?: string[] }> | null | undefined): Headline[] {
  const seen = new Map<string, Headline>()
  // From the news search only what was labelled as business news (results, funding, hiring, layoffs...): the rest is mostly noise, like film reviews for Netflix.
  for (const n of file ?? []) {
    if ((n.labels ?? []).length === 0) continue
    seen.set(key({ title: n.title, url: n.url }), { title: n.title, url: n.url, site: n.site ?? null, date: isoDay(n.date ?? null), labels: n.labels ?? [] })
  }
  for (const n of db) {
    const k = key(n)
    if (!seen.has(k)) seen.set(k, { title: n.title, url: n.url, site: n.site, date: isoDay(n.date), labels: [] })
  }

  return [...seen.values()].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
}
