import { describe, expect, test } from "bun:test"
import { factsFromAgentPayload, suggestFromRules } from "../../supabase/functions/_shared/apply-agent-suggest"
import { factsForAgent } from "../../supabase/functions/_shared/apply-agent"

/**
 * Broods / MCP contract: suggest-answers must apply Autofill rules even when the webhook is off.
 * (MCP server merges suggestFromRules before LLM — see mcp/server.ts suggest-answers route.)
 */
describe("MCP suggest-answers rules-first contract", () => {
  test("factsForAgent + suggestFromRules fill start/notice without LLM", () => {
    const factMap = factsForAgent({
      start_date: "1 February 2027",
      notice_period: "2 weeks",
      study_status: "Yes, enrolled",
      internship_agreement: "Yes, compulsory",
    } as Record<string, string>)
    const facts = factsFromAgentPayload(factMap, "job1")
    const answers = suggestFromRules(
      [
        { key: "a", label: "When would you be able to start?", kind: "text" },
        { key: "b", label: "When would you be able to start? What is your notice period?", kind: "text" },
      ],
      facts,
    )
    expect(answers.find((a) => a.key === "a")?.answer).toBe("1 February 2027")
    expect(answers.find((a) => a.key === "b")?.answer).toMatch(/1 February 2027/)
  })

  test("internship Autofill keys stay non-empty when facts are set (never invent when missing)", () => {
    const withFacts = factsFromAgentPayload(factsForAgent({
      start_date: "ASAP",
      notice_period: "immediate",
      internship_agreement: "Yes",
    } as Record<string, string>), "j2")
    const filled = suggestFromRules(
      [{ key: "s", label: "Earliest start date", kind: "text" }],
      withFacts,
    )
    expect(filled.find((a) => a.key === "s")?.answer).toBeTruthy()

    const empty = suggestFromRules(
      [{ key: "s", label: "Earliest start date", kind: "text" }],
      factsFromAgentPayload(factsForAgent({} as Record<string, string>), "j3"),
    )
    expect(empty.find((a) => a.key === "s")).toBeUndefined()
  })
})
