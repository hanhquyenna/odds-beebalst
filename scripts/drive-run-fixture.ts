// Snapshot a drive run into a fixture file. Read-only against the database.
// Usage: bun scripts/drive-run-fixture.ts <run-id>
import { mkdirSync, writeFileSync } from "node:fs"

const runId = process.argv[2] || ""
if (!/^[0-9a-f-]{36}$/i.test(runId)) {
  console.error("Usage: bun scripts/drive-run-fixture.ts <drive_runs id>")
  process.exit(1)
}
const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "")
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Nothing was written.")
  process.exit(1)
}
const headers = { apikey: key, Authorization: `Bearer ${key}` }
const run = (await fetch(`${url}/rest/v1/drive_runs?id=eq.${runId}&select=id,url,status,reason,message`, { headers }).then((res) => res.json()) as Array<Record<string, unknown>>)[0]
if (!run) {
  console.error("Run not found.")
  process.exit(1)
}
const commands = await fetch(`${url}/rest/v1/drive_commands?run_id=eq.${runId}&select=tool,args,result,status&order=created_at.asc&limit=40`, { headers }).then((res) => res.json())
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (!value || typeof value !== "object") return typeof value === "string" ? value.slice(0, 2000) : value
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (/password|answer|base64|email|token|secret|cookie/i.test(key)) continue
    out[key] = scrub(item)
  }
  return out
}
const fixture = { run: scrub(run), commands: scrub(commands), note: "Snapshot for a regression fixture. Personal answers, passwords, and mail are left out." }
mkdirSync("e2e/fixtures/apply-regressions", { recursive: true })
const path = `e2e/fixtures/apply-regressions/${runId}.json`
writeFileSync(path, JSON.stringify(fixture, null, 2))
console.log(`Wrote ${path}`)
