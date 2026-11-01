import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { companyFile } from "@/lib/company-profile"

describe("company files", () => {
  test("the file name is FNV-1a of the employer, the same hash the export writes", () => {
    // Known values from research-data/companies/07_export_app.py fnv().
    expect(companyFile("")).toBe("/companies/c/811c9dc5.json")
    expect(companyFile("a")).toBe("/companies/c/e40c292c.json")
  })
  test("every company in the index has its own file", () => {
    const { companies } = JSON.parse(readFileSync("public/companies/index.json", "utf8")) as { companies: Record<string, unknown> }
    const keys = Object.keys(companies)
    expect(keys.length).toBeGreaterThan(500)
    for (const k of keys) expect(existsSync(`public${companyFile(k)}`)).toBe(true)
  })
})
