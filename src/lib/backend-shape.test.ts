import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"

const FUNCTIONS = new URL("../../supabase/functions/", import.meta.url)
const CONFIG = new URL("../../supabase/config.toml", import.meta.url)

describe("backend shape", () => {
  test("three Edge Functions, each set up in config.toml and nothing else", () => {
    const folders = readdirSync(FUNCTIONS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => entry.name)
      .sort()
    const configured = [...readFileSync(CONFIG, "utf8").matchAll(/^\[functions\.([\w-]+)\]/gm)].map((match) => String(match[1])).sort()

    expect(folders).toEqual(["account", "jobs", "profile"])
    expect(configured).toEqual(folders)
  })
})
