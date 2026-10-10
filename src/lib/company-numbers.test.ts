import { describe, expect, test } from "bun:test"
import { companyMoney, companyNews, isoDay, moneyText } from "@/lib/company-numbers"

describe("company money and news", () => {
  test("the newest figure of each kind wins, from either source, each once", () => {
    const db = [
      { kind: "revenue", amount: 60e9, currency: "USD", year: 2024, source: "wikidata" },
      { kind: "revenue", amount: 69.7e9, currency: "USD", year: 2025, source: "wikidata" },
      { kind: "revenue", amount: 69.7e9, currency: "USD", year: 2025, source: "wikidata" },
      { kind: "market_value", amount: 151.6e9, currency: "USD", year: 2025, source: "wikidata" },
    ]
    const m = companyMoney(db, { profit: { amount: 7.7e9, currency: "United States dollar", year: "2025" } })
    expect(m.revenue?.amount).toBe(69.7e9)
    expect(m.profit?.year).toBe(2025)
    expect(m.marketValue?.amount).toBe(151.6e9)
  })
  test("amounts read like a finance page", () => {
    expect(moneyText({ amount: 69.7e9, currency: "USD" })).toBe("$69.7 billion")
    expect(moneyText({ amount: 412e6, currency: "euro" })).toBe("€412 million")
    expect(moneyText({ amount: -3e6, currency: "EUR" })).toBe("-€3 million")
  })
  test("only labelled search headlines, newsroom items always, each once, newest first", () => {
    const out = companyNews(
      [{ title: "Q4 results", url: "https://x.com/q4", site: "Newsroom", date: "2026-10-01" }],
      [
        { title: "Film review", url: "https://n.com/a", date: "20261005", labels: [] },
        { title: "Raises €50m", url: "https://n.com/b", date: "20261003", labels: ["funding"] },
        { title: "Q4 results", url: "https://x.com/q4?utm=1", date: "20261001", labels: ["results"] },
      ],
    )
    expect(out.map((h) => h.title)).toEqual(["Raises €50m", "Q4 results"])
    expect(out[0].date).toBe("2026-10-03")
    expect(isoDay("2026-10-05T10:00:00Z")).toBe("2026-10-05")
  })
})
