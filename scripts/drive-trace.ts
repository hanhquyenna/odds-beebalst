// Trace of Broods drive runs: every command Broods sent the extension, how long it waited and worked, what came back, and how the run ended.
//   bun scripts/drive-trace.ts [minutes=60]        recent runs
//   bun scripts/drive-trace.ts <run-id>            one run in full
import { execFileSync } from "node:child_process"
const arg = process.argv[2] ?? "60"
const q = (sql: string): Array<Record<string, unknown>> => {
  const out = execFileSync("bunx", ["supabase", "db", "query", "--linked", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 120_000 })
  return (JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { rows?: Array<Record<string, unknown>> }).rows ?? []
}
const runs = /^[0-9a-f-]{36}$/.test(arg)
  ? q(`select id, url, status, steps, message, created_at, updated_at from public.drive_runs where id='${arg}'`)
  : q(`select id, url, status, steps, message, created_at, updated_at from public.drive_runs where created_at > now() - interval '${Number(arg) || 60} minutes' order by created_at`)
for (const r of runs) {
  const secs = Math.round((Date.parse(String(r.updated_at)) - Date.parse(String(r.created_at))) / 1000)
  console.log(`\n## ${r.status} · ${r.steps} steps · ${secs}s · ${r.url}\n   ${r.message ?? ""}`)
  const cmds = q(`select tool, round(extract(epoch from (taken_at - created_at))::numeric,1) pickup, round(extract(epoch from (done_at - taken_at))::numeric,1) work, status, left(args::text,140) a, left(coalesce(result::text,''),180) res from public.drive_commands where run_id='${r.id}' order by id`)
  for (const c of cmds) {
    const res = String(c.res ?? "")
    const flag = /"ok": false|"error"/.test(res) ? " ⚠" : ""
    console.log(`   ${String(c.tool).padEnd(10)} pickup ${String(c.pickup ?? "-").padStart(5)}s work ${String(c.work ?? "-").padStart(5)}s ${c.status}${flag}  ${c.a}`)
    if (flag) console.log(`              -> ${res}`)
  }
}
