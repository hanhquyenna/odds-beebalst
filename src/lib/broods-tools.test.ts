import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"

test("the Broods prompt answers sponsorship 'now or in the future' with Yes for non-EU people, even with a permit today", () => {
  const agent = readFileSync("broods/index.ts", "utf8").replace(/\s+/g, " ")
  expect(agent).toContain('"now or in the future"')
  expect(agent).toContain("Yes for every non-EU person, even one who holds a work permit today")
})

test("the Broods agent is allowed every tool the odds-browser MCP server offers (a tool missing from the list never reaches the model)", () => {
  const server = readFileSync("supabase/functions/mcp/drive.ts", "utf8")
  const agent = readFileSync("broods/index.ts", "utf8")
  const offered = [...server.matchAll(/^ {4}name: "([a-z_]+)"/gm)].map((m) => m[1])
  const allowed = [...(agent.match(/allowedTools: \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
  expect(offered.length).toBeGreaterThan(10)
  expect(allowed.filter((t) => !offered.includes(t))).toEqual([]) // nothing allowed that the server does not have
  expect(offered.filter((t) => !allowed.includes(t))).toEqual([]) // nothing offered that the agent cannot use
})
