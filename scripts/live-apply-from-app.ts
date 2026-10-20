/**
 * DO NOT use for normal debugging — opens a separate Chromium, not the person's Chrome,
 * and create_extension_key rotates their desktop key (Connect breaks until they reconnect).
 *
 * Live Apply from the Odds app UI (not chrome.runtime inject).
 * Usage: bun scripts/live-apply-from-app.ts /tmp/odds-live-session.json
 */
import { chromium, type Page } from "@playwright/test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const EXTENSION = resolve(process.env.HOME || "", "Downloads/odds-extension")
const APP = process.env.ODDS_APP_URL || "http://localhost:5173"
const N = Number(process.env.LIVE_APPLY_N || 6)
const WAIT_MS = Number(process.env.LIVE_APPLY_WAIT_MS || 28000)

type Session = {
  access_token: string
  refresh_token?: string
  expires_at?: number
  user?: { id?: string }
}

type Row = {
  title: string
  postingId?: string
  appTitle?: string
  appMessage?: string
  bar?: string
  applyUrl?: string
  pages: string[]
  error?: string
}

function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!m) continue
      out[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
  } catch { /* optional */ }
  return out
}

async function createKey(api: string, anon: string, token: string): Promise<string> {
  const res = await fetch(`${api}/rest/v1/rpc/create_extension_key`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: "{}",
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`create_extension_key ${res.status}: ${text.slice(0, 200)}`)
  const key = JSON.parse(text)
  if (typeof key !== "string" || !key.startsWith("oddsx_")) throw new Error(`bad key: ${text.slice(0, 80)}`)
  return key
}

async function readApplyCard(page: Page): Promise<{ title?: string; message?: string; button?: string }> {
  return page.evaluate(() => {
    const card = document.querySelector("[role='status']")?.closest("div")
    const title = card?.querySelector(".font-heading")?.textContent?.trim()
      || [...document.querySelectorAll("p")].find((p) => /Sign in|Needs your|Working on|Ready to|Stuck|Captcha|Applications closed/i.test(p.textContent || ""))?.textContent?.trim()
    const message = card?.querySelector(".apply-line, .text-muted-foreground")?.textContent?.trim()
    const button = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim() || "").find((t) => /Apply with Odds|Open application|Continue|Review|Try again|No desktop/i.test(t))
    return { title, message, button }
  })
}

async function main() {
  const sessionPath = process.argv[2] || "/tmp/odds-live-session.json"
  const session = JSON.parse(readFileSync(sessionPath, "utf8")) as Session
  if (!session.access_token) throw new Error("session dump missing access_token")
  const env = loadEnvLocal()
  const api = env.VITE_SUPABASE_URL
  const anon = env.VITE_SUPABASE_ANON_KEY
  if (!api || !anon) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing in .env.local")

  console.log(`LIVE APPLY FROM APP n=${N} app=${APP} waitMs=${WAIT_MS}`)
  console.log("NOTE: create_extension_key rotates your desktop key — open Connect in Chrome after this run.")
  const key = await createKey(api, anon, session.access_token)
  console.log(`extension key hint …${key.slice(-4)}`)

  const userData = mkdtempSync(join(tmpdir(), "odds-live-"))
  const context = await chromium.launchPersistentContext(userData, {
    channel: "chromium",
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      "--allow-running-insecure-content",
    ],
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  await worker.evaluate(({ api, key }) => chrome.storage.local.set({ oddsApi: api, oddsKey: key, oddsPanelInPage: true }), { api, key })

  const app = await context.newPage()
  await app.goto(APP)
  await app.evaluate((s) => {
    localStorage.setItem("careersim.session", JSON.stringify({
      access_token: s.access_token,
      refresh_token: s.refresh_token || "",
      expires_at: s.expires_at || Math.floor(Date.now() / 1000) + 3600,
      user: s.user || { id: "live" },
    }))
    localStorage.removeItem("odds:apply-activity-v1")
  }, session)
  await app.reload()
  await app.getByRole("button", { name: "Tracker", exact: true }).click()
  await app.waitForTimeout(1500)

  const jobs = await app.evaluate((limit) => {
    const buttons = [...document.querySelectorAll("button")].filter((b) => {
      const t = (b.textContent || "").replace(/\s+/g, " ").trim()
      return t.length > 20 && /Intern|Student|Stage|Trainee|Analyst|Finance|Marketing|Content/i.test(t) && !/Status of|Remove |Account menu|Notifications/.test(t)
    })
    return buttons.slice(0, limit).map((b, i) => ({ i, name: (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) }))
  }, N)

  const report: Row[] = []
  for (const job of jobs) {
    const row: Row = { title: job.name, pages: [] }
    console.log(`\n=== ${job.i + 1}/${jobs.length} ${job.name.slice(0, 80)}`)
    try {
      await app.getByRole("button", { name: "Tracker", exact: true }).click().catch(() => undefined)
      await app.waitForTimeout(400)
      const btn = app.getByRole("button", { name: new RegExp(job.name.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first()
      await btn.click()
      await app.waitForTimeout(800)

      // Cancel a stale run if present so we can start clean from the app button.
      const cancel = app.getByRole("button", { name: "Cancel", exact: true })
      if (await cancel.count()) {
        await cancel.click()
        await app.waitForTimeout(1000)
      }

      const opened = context.waitForEvent("page", { timeout: 20000 }).catch(() => null)
      const applyBtn = app.getByRole("button", { name: /Apply with Odds|Try again|Open application/i }).first()
      await applyBtn.click({ timeout: 10000 })
      const tab = await opened
      await app.waitForTimeout(WAIT_MS)

      const card = await readApplyCard(app)
      row.appTitle = card.title
      row.appMessage = card.message
      row.pages = context.pages().map((p) => p.url()).filter((u) => !u.startsWith(APP) && u !== "about:blank")

      if (tab && !tab.isClosed()) {
        row.applyUrl = tab.url()
        const bar = await tab.locator(".odds-apply-bar").first().textContent({ timeout: 3000 }).catch(() => null)
        row.bar = (bar || "").replace(/\s+/g, " ").trim().slice(0, 220)
        // Never submit — just observe.
      }

      console.log(`  app: ${row.appTitle || "?"} | ${String(row.appMessage || "").slice(0, 100)}`)
      console.log(`  bar: ${row.bar || "(no bar)"}`)
      console.log(`  url: ${row.applyUrl || row.pages[0] || "(none)"}`)
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e)
      console.log(`  ERROR ${row.error}`)
    }
    report.push(row)
    // Close employer tabs so the next Apply is clean; keep the app.
    for (const p of context.pages()) {
      if (p !== app && !p.isClosed()) await p.close().catch(() => undefined)
    }
  }

  const outPath = "/tmp/live-apply-from-app-report.json"
  writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), n: report.length, report }, null, 2))
  console.log(`\nWrote ${outPath}`)
  const falseAccount = report.filter((r) => /Sign in/i.test(r.appTitle || "") && !/password|account/i.test(r.bar || ""))
  console.log(`false Sign-in titles: ${falseAccount.length}`)
  await context.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
