import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const applyAgent = readFileSync(new URL("../../supabase/functions/apply-agent/index.ts", import.meta.url), "utf8")
const broodsDoc = readFileSync(new URL("../../docs/BROODS-APPLY.md", import.meta.url), "utf8")
const envExample = readFileSync(new URL("../../.env.example", import.meta.url), "utf8")
const deployScript = readFileSync(new URL("../../scripts/set-apply-broods-secrets.sh", import.meta.url), "utf8")

describe("apply ladder", () => {
  test("apply decisions do not call OpenAI, Anthropic, or a mini model", () => {
    expect(applyAgent).not.toContain("api.openai.com")
    expect(applyAgent).not.toContain("api.anthropic.com")
    expect(applyAgent).not.toContain("gpt-4o-mini")
    expect(applyAgent).not.toContain("cheapJsonChat")
    expect(applyAgent).not.toContain("APPLY_AGENT_MODEL")
    expect(applyAgent).toContain("broodsBestPick")
    expect(applyAgent).toContain("broodsFillGaps")
  })

  test("the documented ladder is rules, then Broods, then a person", () => {
    expect(broodsDoc).not.toContain("gpt-4o-mini")
    expect(broodsDoc).toContain("cx/gpt-6-luna")
    expect(broodsDoc).toContain("apply-stuck")
    expect(broodsDoc).toContain("apply-roam")
    expect(envExample).not.toContain("APPLY_AGENT_MODEL=")
    expect(envExample).not.toContain("prefer OpenAI mini")
    expect(deployScript).not.toContain("OPENAI_API_KEY")
  })
})
