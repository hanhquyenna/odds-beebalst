#!/usr/bin/env bun
/**
 * Print the Apply platform matrix release checklist and optional @accept / REAL harness commands.
 * Does not run real Broods unless you pass --run-fixtures (local Playwright @accept only).
 *
 *   bun scripts/apply-platform-matrix.ts
 *   bun scripts/apply-platform-matrix.ts --run-fixtures
 */
import { spawnSync } from "node:child_process"

const platforms = [
  { name: "Greenhouse", order: 1, fixture: "greenhouse-basic", real: "REAL: Broods drives greenhouse-dept" },
  { name: "Lever", order: 2, fixture: "lever-location|lever-karl", real: "REAL: Broods drives lever-tomtom" },
  { name: "Ashby", order: 3, fixture: "Ashby button-choice|ashby", real: "REAL: Broods drives ashby-prosus" },
  { name: "Workday", order: 4, fixture: "Workday delayed", real: "REAL: Broods drives workday-signify" },
  { name: "Boards", order: 5, fixture: "OWNERSHIP|Open application tab", real: "REAL: Broods drives (linkedin|indeed|glassdoor)" },
]

console.log("Apply platform matrix (see docs/apply-platform-matrix.md)\n")
for (const p of platforms) {
  console.log(`${p.order}. ${p.name}`)
  console.log(`   fixture grep: ${p.fixture}`)
  console.log(`   real grep:    ${p.real}`)
  console.log(`   gate:         two button-driven passes + artifacts (fill_ms, ui_ms, steps, blocker)\n`)
}

if (process.argv.includes("--run-fixtures")) {
  const r = spawnSync("bunx", ["playwright", "test", "e2e/extension.spec.ts", "--grep", "@accept"], {
    stdio: "inherit",
    env: process.env,
  })
  process.exit(r.status ?? 1)
}
