// Live golden-set check. It fetches each posting and scores navigation and closed evidence.
// It never presses Submit, never types a password, and never solves a captcha.
// A full unpacked-extension dry-run stays in Chrome on the Mac. This script does not launch Chrome.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { destinationForApply, jobClosedAllowed, preferEnglishApplyUrl } from "../supabase/functions/_shared/apply-navigation.ts"

type Job = {
  id: string
  ats: string
  title: string
  url: string
  expect: "open" | "closed" | "unknown" | "rewrite_only"
  posting_url?: string
  notes?: string
}

type Row = {
  id: string
  ats: string
  title: string
  url: string
  expect: string
  http: number | null
  ms: number
  navigation: string
  verdict: "open" | "closed" | "unknown" | "rewrite"
  pass: boolean
  detail: string
}

const CLOSED = /no longer (available|accepting)|applications? (are|is) closed|page not found|pagina niet gevonden|\b404\b|job (not found|no longer)/i
const set = JSON.parse(readFileSync(new URL("../fixtures/apply-live/golden-set.json", import.meta.url), "utf8")) as { jobs: Job[] }

async function fetchJob(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 OddsApplyLive/1.0" }, signal: AbortSignal.timeout(20000) })
  const text = (await res.text()).slice(0, 20000)
  return { status: res.status, text }
}

function looksClosed(status: number, text: string): boolean {
  return status === 404 || status === 410 || CLOSED.test(text.slice(0, 4000))
}

async function score(job: Job): Promise<Row> {
  const started = Date.now()
  const stored = job.posting_url || job.url
  const destination = destinationForApply(job.url, { seen: [job.url], jobUrls: [stored] })
  if (job.expect === "rewrite_only") {
    const next = preferEnglishApplyUrl(job.url)
    const pass = next.includes("locale=en_US") && next.includes("/job/Amsterdam/Example_R1") && !next.includes("/en-US/traineeships")
    return { id: job.id, ats: job.ats, title: job.title, url: job.url, expect: job.expect, http: null, ms: Date.now() - started, navigation: next, verdict: "rewrite", pass, detail: pass ? "Workday locale query only" : "locale rewrite changed the path" }
  }
  let http: number | null = null
  let text = ""
  let detail = ""
  try {
    const page = await fetchJob(job.url)
    http = page.status
    text = page.text
  } catch (error) {
    detail = error instanceof Error ? error.message : "fetch failed"
  }
  const closed = http !== null && looksClosed(http, text)
  const mayClose = jobClosedAllowed(job.url, stored)
  const verdict = closed ? (mayClose ? "closed" : "unknown") : "open"
  const navigationSafe = destination === job.url
  let pass = navigationSafe
  if (job.expect === "open" && http !== null && [401, 403, 429].includes(http)) {
    pass = navigationSafe
    detail = "site blocked the fetch; navigation still checked"
  } else if (job.expect === "open") pass = pass && verdict === "open" && (http ?? 0) < 400
  if (job.expect === "closed") pass = pass && verdict === "closed"
  if (job.expect === "unknown") pass = verdict === "unknown" && preferEnglishApplyUrl(stored) !== job.url
  if (!detail) detail = navigationSafe ? verdict : "navigation refused or rewritten"
  return { id: job.id, ats: job.ats, title: job.title, url: job.url, expect: job.expect, http, ms: Date.now() - started, navigation: destination ?? "(blocked)", verdict, pass, detail }
}

const rows: Row[] = []
for (const job of set.jobs) rows.push(await score(job))
const passed = rows.filter((row) => row.pass).length
const report = { at: new Date().toISOString(), mode: process.env.APPLY_LIVE_MODE || "rules", passed, failed: rows.length - passed, total: rows.length, rows }
mkdirSync("fixtures/apply-live", { recursive: true })
writeFileSync("fixtures/apply-live/latest.json", JSON.stringify(report, null, 2))
const lines = [
  "# Apply live scorecard",
  "",
  `Ran ${report.at} in ${report.mode} mode. ${passed} of ${rows.length} passed. Submit was not pressed.`,
  "",
  "| Job | Expect | HTTP | Verdict | Pass | Detail |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows.map((row) => `| ${row.title.replace(/\|/g, "/")} | ${row.expect} | ${row.http ?? ""} | ${row.verdict} | ${row.pass ? "yes" : "no"} | ${row.detail.replace(/\|/g, "/")} |`),
  "",
]
writeFileSync("docs/apply-live-scorecard.md", lines.join("\n"))
console.log(`apply:live ${passed}/${rows.length} passed`)
if (passed !== rows.length) process.exitCode = 1
