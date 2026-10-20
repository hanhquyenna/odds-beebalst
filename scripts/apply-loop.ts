/**
 * Apply loop test in Odds' own test browser: Chromium with the unpacked extension and its own saved profile (not the person's Chrome).
 * It presses the same "Apply with Odds" button the person presses on each job's page, lets the extension and Broods fill the form
 * (never Submit), and records how each run ends from drive_runs.
 *
 *   bun scripts/apply-loop.ts setup                      # once: sign in to Odds + Connect, LinkedIn, Glassdoor in the window; close it when done
 *   bun scripts/apply-loop.ts run <set.json> <name> [parallel=3]
 *
 * set.json: [{ id, employer, title, ats, url }]. Results: research-data/jobcheck/loop/<name>.json. Needs the Supabase CLI logged in (read-only queries).
 */
import { chromium, type BrowserContext, type Page } from "@playwright/test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const EXTENSION = join(ROOT, "extension")
const PROFILE = join(ROOT, "research-data/jobcheck/profile")
const OUT = join(ROOT, "research-data/jobcheck/loop")
const APP = process.env.ODDS_APP_URL || "http://localhost:5173"
const DONE = new Set(["review", "needs_you", "stuck", "failed", "stopped"])
const RUN_LIMIT_MS = 9 * 60_000

type Job = { id: string; employer: string; title: string; ats: string; url: string }
type Drive = { id: string; status: string; reason: string | null; steps: number; message: string | null; last_note: string | null; url: string; secs: number }

function q<T = Record<string, unknown>>(sql: string): T[] {
  for (let i = 0; i < 3; i++) {
    const p = Bun.spawnSync([join(homedir(), ".local/bin/supabase"), "db", "query", "--linked", "-o", "json", sql], { stderr: "ignore" })
    try {
      return (JSON.parse(p.stdout.toString()).rows ?? []) as T[]
    } catch {
      Bun.sleepSync(2000)
    }
  }
  return []
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

async function open(): Promise<BrowserContext> {
  mkdirSync(PROFILE, { recursive: true })
  return chromium.launchPersistentContext(PROFILE, {
    channel: "chromium",
    headless: false,
    viewport: null,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, "--window-size=1400,900"],
  })
}

async function setup() {
  const ctx = await open()
  const pages = ctx.pages()
  const app = pages[0] ?? (await ctx.newPage())
  await app.goto(APP)
  for (const url of ["https://www.linkedin.com/login", "https://www.glassdoor.nl/index.htm"]) await (await ctx.newPage()).goto(url).catch(() => undefined)
  console.log("Sign in to Odds and press Connect (extension), sign in to LinkedIn and Glassdoor. Close the window when done.")
  await new Promise<void>((r) => ctx.on("close", () => r()))
}

async function connected(ctx: BrowserContext): Promise<boolean> {
  const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker", { timeout: 15_000 }).catch(() => null))
  if (!worker) return false
  return worker.evaluate(async () => Boolean((await chrome.storage.local.get("oddsKey")).oddsKey))
}

async function press(app: Page, job: Job): Promise<string | null> {
  await app.goto(`${APP}/job/${job.id}`, { waitUntil: "domcontentloaded" })
  const button = app.getByRole("button", { name: /^(Apply with Odds|Try again)$/ }).first()
  try {
    await button.waitFor({ state: "visible", timeout: 20_000 })
    for (let i = 0; i < 20 && (await button.isDisabled()); i++) await app.waitForTimeout(500)
    await button.click()
    return null
  } catch (e) {
    return e instanceof Error ? e.message.split("\n")[0]! : String(e)
  }
}

async function run(setPath: string, name: string, parallel: number) {
  const jobs = JSON.parse(readFileSync(setPath, "utf8")) as Job[]
  mkdirSync(OUT, { recursive: true })
  const ctx = await open()
  if (!(await connected(ctx))) {
    console.log("The test browser is not connected to Odds: run `bun scripts/apply-loop.ts setup` first.")
    await ctx.close()
    process.exit(1)
  }
  const app = ctx.pages()[0] ?? (await ctx.newPage())
  const queue = [...jobs]
  const live = new Map<string, { job: Job; t0: string; started: number }>()
  const results: Array<Record<string, unknown>> = []
  const save = () => writeFileSync(join(OUT, `${name}.json`), JSON.stringify(results, null, 1))
  while (queue.length || live.size) {
    while (queue.length && live.size < parallel) {
      const job = queue.shift()!
      const t0 = q<{ t: string }>("select now()::text t")[0]?.t ?? new Date().toISOString()
      const error = await press(app, job)
      console.log(`start ${job.ats.padEnd(14)} ${job.employer.slice(0, 22).padEnd(22)} ${job.title.slice(0, 50)}${error ? `  ! ${error}` : ""}`)
      if (error) {
        results.push({ ...job, end: "no_button", error })
        save()
        continue
      }
      live.set(job.id, { job, t0, started: Date.now() })
    }
    await app.waitForTimeout(15_000)
    for (const [id, l] of live) {
      const d = q<Drive>(`select id, status, reason, steps, message, last_note, url, extract(epoch from (updated_at-created_at))::int secs from drive_runs where posting_id=${lit(id)} and created_at >= ${lit(l.t0)}::timestamptz - interval '5 seconds' order by created_at desc limit 1`)[0]
      const over = Date.now() - l.started > RUN_LIMIT_MS
      if ((d && DONE.has(d.status)) || over) {
        live.delete(id)
        const end = d?.status && DONE.has(d.status) ? d.status : d ? "timeout" : "never_started"
        results.push({ ...l.job, end, drive: d ?? null })
        save()
        console.log(`  -> ${end.padEnd(10)} ${d?.reason ?? ""} ${(d?.message ?? d?.last_note ?? "").slice(0, 160)}`)
        // One job, one tab: close its application tab so the next ones have room.
        for (const p of ctx.pages()) if (p !== app && d?.url && p.url().split("#")[0] === d.url.split("#")[0]) await p.close().catch(() => undefined)
      }
    }
  }
  const tally: Record<string, number> = {}
  for (const r of results) tally[String(r.end)] = (tally[String(r.end)] ?? 0) + 1
  console.log("LOOP_DONE", name, JSON.stringify(tally))
  await ctx.close()
}

const [mode, a, b, c] = process.argv.slice(2)
if (mode === "setup") await setup()
else if (mode === "run" && a && b) await run(a, b, Number(c || 3))
else console.log("usage: bun scripts/apply-loop.ts setup | run <set.json> <name> [parallel]")
