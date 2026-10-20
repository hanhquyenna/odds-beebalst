/**
 * Try Apply under the signed-in account: Jobs → open → Apply with Odds (app button).
 * Headed Chromium + unpacked ~/Downloads/odds-extension (same-window tabs).
 */
import { chromium, type Page } from "@playwright/test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const EXTENSION = resolve(process.env.HOME || "", "Downloads/odds-extension")
const APP = process.env.ODDS_APP_URL || "http://localhost:5173"
const N = Number(process.env.LIVE_APPLY_N || 5)
const WAIT_MS = Number(process.env.LIVE_APPLY_WAIT_MS || 20000)

type Session = { access_token: string; refresh_token?: string; expires_at?: number; user?: { id?: string; email?: string } }
type Row = { title: string; chip?: string; appTitle?: string; bar?: string; url?: string; tracker?: boolean; error?: string }

function env(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
  return out
}

async function createKey(api: string, anon: string, token: string): Promise<string> {
  const res = await fetch(`${api}/rest/v1/rpc/create_extension_key`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`key ${res.status}: ${text.slice(0, 120)}`)
  const key = JSON.parse(text)
  if (typeof key !== "string" || !key.startsWith("oddsx_")) throw new Error("bad key")
  return key
}

async function card(page: Page) {
  return page.evaluate(() => {
    const title = [...document.querySelectorAll("p")].find((p) =>
      /Sign in|Needs your|Working on|Ready to|Stuck|Captcha|Applications closed|Waiting|Filled|Opening/i.test(p.textContent || ""),
    )?.textContent?.trim()
    const message = document.querySelector(".apply-line")?.textContent?.trim()
    const chip = [...document.querySelectorAll("span")].map((s) => s.textContent?.trim() || "").find((t) =>
      /^(Applying…|Captcha|Account|Stuck|Review & send|Closed)$/.test(t),
    )
    return { title, message, chip }
  })
}

async function main() {
  const session = JSON.parse(readFileSync(process.argv[2] || "/tmp/odds-live-session.json", "utf8")) as Session
  const e = env()
  console.log(`TRY×${N} ${session.user?.email || "?"} ext=${EXTENSION}`)
  const key = await createKey(e.VITE_SUPABASE_URL!, e.VITE_SUPABASE_ANON_KEY!, session.access_token)
  console.log(`desktop key …${key.slice(-4)} (reconnect daily Chrome Connect after)`)

  const dir = mkdtempSync(join(tmpdir(), "odds-try-"))
  const context = await chromium.launchPersistentContext(dir, {
    channel: "chromium",
    headless: false,
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 920 },
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  await worker.evaluate(({ api, key }) => chrome.storage.local.set({ oddsApi: api, oddsKey: key, oddsPanelInPage: true }), {
    api: e.VITE_SUPABASE_URL!,
    key,
  })

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
  await app.reload({ waitUntil: "domcontentloaded" })
  await app.waitForTimeout(2000)

  // Ping extension bridge
  const present = await app.evaluate(() => new Promise<string>((resolve) => {
    const on = (ev: MessageEvent) => {
      if (ev.data?.source === "odds-extension" && ev.data?.type === "present") {
        window.removeEventListener("message", on)
        resolve("yes")
      }
    }
    window.addEventListener("message", on)
    window.postMessage({ source: "odds-site", type: "ping" }, location.origin)
    setTimeout(() => { window.removeEventListener("message", on); resolve("no") }, 800)
  }))
  console.log(`extension bridge: ${present}`)
  if (present !== "yes") throw new Error("extension not present on localhost:5173")

  await app.getByRole("button", { name: "Jobs", exact: true }).click()
  await app.waitForTimeout(1500)

  const titles = await app.evaluate((n) => {
    const out: string[] = []
    for (const b of document.querySelectorAll("button")) {
      const t = (b.textContent || "").replace(/\s+/g, " ").trim()
      if (t.length < 28 || t.length > 130) continue
      if (/^Save |Not interested|Show more|Filter|Edit|Account|Status/i.test(t)) continue
      if (!/Intern|Student|Trainee|Graduate|Werkstudent|Marketing|Finance|Analyst/i.test(t)) continue
      out.push(t)
      if (out.length >= n) break
    }
    return out
  }, N + 2)
  console.log(`candidates: ${titles.length}`)

  const report: Row[] = []
  for (let i = 0; i < Math.min(N, titles.length); i++) {
    const title = titles[i]!
    const row: Row = { title: title.slice(0, 120) }
    console.log(`\n=== ${i + 1}/${N} ${row.title.slice(0, 80)}`)
    try {
      await app.getByRole("button", { name: "Jobs", exact: true }).click()
      await app.waitForTimeout(700)
      const re = new RegExp(title.slice(0, 34).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      await app.getByRole("button", { name: re }).first().click({ timeout: 15000 })
      await app.waitForTimeout(1000)

      const apply = app.getByRole("button", { name: /Apply with Odds/i }).first()
      await apply.waitFor({ state: "visible", timeout: 12000 })
      if (await apply.isDisabled()) throw new Error("Apply disabled")

      const beforePages = context.pages().length
      const opened = context.waitForEvent("page", { timeout: 25000 }).catch(() => null)
      await apply.click()
      const tab = await opened
      await app.waitForTimeout(WAIT_MS)

      // Should have jumped to Tracker
      row.tracker = /tracker|Your jobs/i.test(await app.content().catch(() => "")) || (await app.getByRole("button", { name: "Tracker", exact: true }).getAttribute("aria-current")) === "page"
        || await app.getByRole("button", { name: "Tracker", exact: true }).evaluate((el) => el.className.includes("current") || el.getAttribute("data-state") === "active").catch(() => false)

      const c = await card(app)
      row.appTitle = c.title
      row.chip = c.chip
      if (tab && !tab.isClosed()) {
        row.url = tab.url()
        row.bar = ((await tab.locator(".odds-apply-bar").first().textContent({ timeout: 4000 }).catch(() => null)) || "").replace(/\s+/g, " ").trim().slice(0, 200)
        // Same window?
        const sameWin = context.pages().filter((p) => !p.isClosed()).length >= beforePages
        console.log(`  pages=${context.pages().length} (was ${beforePages}) sameBrowser=${sameWin}`)
      }
      console.log(`  trackerJump≈${row.tracker} chip=${row.chip || "—"} ui=${row.appTitle || "—"}`)
      console.log(`  bar=${row.bar || "(none)"}`)
      console.log(`  url=${row.url || "(none)"}`)
    } catch (err) {
      row.error = err instanceof Error ? err.message : String(err)
      console.log(`  ERROR ${row.error.slice(0, 180)}`)
    }
    report.push(row)
    for (const p of context.pages()) {
      if (p !== app && !p.isClosed()) await p.close().catch(() => undefined)
    }
  }

  const out = "/tmp/live-apply-try-report.json"
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), email: session.user?.email, report }, null, 2))
  const ok = report.filter((r) => r.bar || r.appTitle || r.chip).length
  console.log(`\nWrote ${out} ok=${ok}/${report.length}`)
  // Keep window open briefly so Chi can see
  await app.waitForTimeout(3000)
  await context.close().catch(() => undefined)
}

main().catch((e) => { console.error(e); process.exit(1) })
