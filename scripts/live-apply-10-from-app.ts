/**
 * Under the signed-in account: open Jobs, click Apply with Odds on N fresh (unsaved) jobs.
 * Headed Chromium + unpacked extension. App button only.
 *
 * Usage: bun scripts/live-apply-10-from-app.ts /tmp/odds-live-session.json
 */
import { chromium, type Page } from "playwright"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const EXTENSION = resolve(process.env.HOME || "", "Downloads/odds-extension")
const APP = process.env.ODDS_APP_URL || "http://localhost:5173"
const N = Number(process.env.LIVE_APPLY_N || 10)
const WAIT_MS = Number(process.env.LIVE_APPLY_WAIT_MS || 22000)

type Session = { access_token: string; refresh_token?: string; expires_at?: number; user?: { id?: string; email?: string } }
type Row = { title: string; appTitle?: string; appMessage?: string; button?: string; bar?: string; url?: string; error?: string }

function loadEnv(): Record<string, string> {
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
  if (!res.ok) throw new Error(`create_extension_key ${res.status}: ${text.slice(0, 160)}`)
  const key = JSON.parse(text)
  if (typeof key !== "string" || !key.startsWith("oddsx_")) throw new Error(`bad key ${text.slice(0, 80)}`)
  return key
}

async function readCard(page: Page) {
  return page.evaluate(() => {
    const title = [...document.querySelectorAll("p")].find((p) =>
      /Sign in|Needs your|Working on|Ready to|Stuck|Captcha|Applications closed|Waiting|Filled/i.test(p.textContent || ""),
    )?.textContent?.trim()
    const message = document.querySelector(".apply-line")?.textContent?.trim()
    const button = [...document.querySelectorAll("button")]
      .map((b) => b.textContent?.trim() || "")
      .find((t) => /Apply with Odds|Open application|Continue|Review|Try again|Filling|Waiting|No desktop/i.test(t))
    return { title, message, button }
  })
}

async function goJobs(app: Page) {
  await app.getByRole("button", { name: "Jobs", exact: true }).click()
  await app.waitForTimeout(1200)
  // Prefer the full list, not only tailored chips.
  const all = app.getByRole("button", { name: /All jobs/i }).first()
  if (await all.count()) await all.click().catch(() => undefined)
  await app.waitForTimeout(800)
}

async function freshJobTitles(app: Page, limit: number): Promise<string[]> {
  return app.evaluate((n) => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const b of document.querySelectorAll("button")) {
      const label = b.getAttribute("aria-label") || ""
      // Unsaved rows expose a sibling "Save …" control.
      const t = (b.textContent || "").replace(/\s+/g, " ").trim()
      if (t.length < 20 || t.length > 140) continue
      if (/^Save |^Not interested|Status of|Remove |Account menu|Filter|Sort|Show more|Edit|Back to/i.test(t)) continue
      if (!/Intern|Student|Stage|Trainee|Graduate|Werkstudent|Assistant|Analyst|Marketing|Finance|Content/i.test(t)) continue
      // Must have a Save button for the same title nearby (fresh / not saved).
      const saveName = `Save ${t.split(/\s{2,}|\d+ days ago|Today|Yesterday/)[0]!.trim()}`.slice(0, 80)
      const hasSave = [...document.querySelectorAll("button")].some((s) => {
        const st = (s.textContent || "").trim()
        return st.startsWith("Save ") && t.startsWith(st.slice(5).split(/\s+/).slice(0, 4).join(" ").slice(0, 20).replace(/Save /, "") ) || (s.getAttribute("aria-label") || "").startsWith("Save ")
      })
      // Simpler: aria-label Save for this job exists as released.
      const short = t.split(/ Amsterdam| Rotterdam| Utrecht| The Hague| Randstad| Netherlands| Katwijk| Sevenum| Gemert|,/)[0]!.trim()
      const saveBtn = [...document.querySelectorAll("button")].find((s) => (s.getAttribute("aria-label") || "") === `Save ${short}` || (s.textContent || "").trim() === `Save ${short}`)
      if (!saveBtn) continue
      if (saveBtn.getAttribute("aria-pressed") === "true") continue
      const key = short.slice(0, 50)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
      if (out.length >= n) break
      void label
      void saveName
      void hasSave
    }
    return out
  }, limit)
}

async function main() {
  const session = JSON.parse(readFileSync(process.argv[2] || "/tmp/odds-live-session.json", "utf8")) as Session
  if (!session.access_token) throw new Error("missing access_token")
  const env = loadEnv()
  const api = env.VITE_SUPABASE_URL!
  const anon = env.VITE_SUPABASE_ANON_KEY!
  console.log(`LIVE×${N} account=${session.user?.email || "?"} app=${APP}`)
  console.log("NOTE: temp desktop key for this Chromium — reconnect daily Chrome Connect after.")

  const key = await createKey(api, anon, session.access_token)
  console.log(`key …${key.slice(-4)}`)

  const userData = mkdtempSync(join(tmpdir(), "odds-live10-"))
  const context = await chromium.launchPersistentContext(userData, {
    channel: "chromium",
    headless: false,
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
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
  await app.reload({ waitUntil: "domcontentloaded" })
  await app.waitForTimeout(2000)
  await goJobs(app)

  let titles = await freshJobTitles(app, N + 6)
  if (titles.length < N) {
    // Fallback: any job row button in All jobs.
    titles = await app.evaluate((n) => {
      const out: string[] = []
      for (const b of document.querySelectorAll("button")) {
        const t = (b.textContent || "").replace(/\s+/g, " ").trim()
        if (t.length < 28 || t.length > 140) continue
        if (/Save |Not interested|Status of|Show more|Filter|Sort|Edit|Account/i.test(t)) continue
        if (!/Intern|Student|Trainee|Graduate|Werkstudent|Assistant|Analyst|Marketing|Finance/i.test(t)) continue
        out.push(t)
        if (out.length >= n) break
      }
      return out
    }, N)
  }
  console.log(`candidates ${titles.length}`)
  if (!titles.length) throw new Error("no fresh job rows found on Jobs")

  const report: Row[] = []
  for (let i = 0; i < Math.min(N, titles.length); i++) {
    const title = titles[i]!
    const row: Row = { title: title.slice(0, 140) }
    console.log(`\n=== ${i + 1}/${N} ${row.title.slice(0, 90)}`)
    try {
      await goJobs(app)
      const short = title.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      await app.getByRole("button", { name: new RegExp(short) }).first().click({ timeout: 20000 })
      await app.waitForTimeout(1200)

      const cancel = app.getByRole("button", { name: "Cancel", exact: true })
      if (await cancel.count()) {
        await cancel.click().catch(() => undefined)
        await app.waitForTimeout(600)
      }

      const applyBtn = app.getByRole("button", { name: /Apply with Odds|Try again/i }).first()
      await expectEnabled(applyBtn)
      const opened = context.waitForEvent("page", { timeout: 28000 }).catch(() => null)
      await applyBtn.click()
      const tab = await opened
      await app.waitForTimeout(WAIT_MS)

      const c = await readCard(app)
      row.appTitle = c.title
      row.appMessage = c.message
      row.button = c.button
      if (tab && !tab.isClosed()) {
        row.url = tab.url()
        row.bar = ((await tab.locator(".odds-apply-bar").first().textContent({ timeout: 3000 }).catch(() => null)) || "")
          .replace(/\s+/g, " ").trim().slice(0, 220)
      }
      console.log(`  ui: ${row.appTitle || "?"} | ${String(row.appMessage || "").slice(0, 110)}`)
      console.log(`  btn: ${row.button || "?"}`)
      console.log(`  bar: ${row.bar || "(none)"}`)
      console.log(`  url: ${row.url || "(none)"}`)
    } catch (e) {
      row.error = e instanceof Error ? e.message : String(e)
      console.log(`  ERROR ${row.error.slice(0, 200)}`)
    }
    report.push(row)
    for (const p of context.pages()) {
      if (p !== app && !p.isClosed()) await p.close().catch(() => undefined)
    }
  }

  const out = "/tmp/live-apply-10-report.json"
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), email: session.user?.email, n: report.length, report }, null, 2))
  const observed = report.filter((r) => r.bar || r.appTitle || r.button).length
  const falseSign = report.filter((r) => /Sign in/i.test(r.appTitle || "") && !/password|Account or login|needs an account/i.test(`${r.bar || ""} ${r.appMessage || ""}`)).length
  console.log(`\nWrote ${out}`)
  console.log(`observed=${observed}/${report.length} falseSignIn=${falseSign} errors=${report.filter((r) => r.error).length}`)
  await context.close().catch(() => undefined)
}

async function expectEnabled(locator: ReturnType<Page["getByRole"]>) {
  await locator.waitFor({ state: "visible", timeout: 15000 })
  const disabled = await locator.isDisabled().catch(() => true)
  if (disabled) throw new Error("Apply button disabled (extension/desktop not ready?)")
}

main().catch((e) => { console.error(e); process.exit(1) })
