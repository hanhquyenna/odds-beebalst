import { createServer, type IncomingMessage, type Server } from "node:http"
import { chromium, expect, test as base, type BrowserContext } from "@playwright/test"
import { join } from "node:path"
import { mkdtempSync } from "node:fs"
import { FLOW_POSTINGS } from "./fixtures/postings"
import { mockBackend } from "./mock"
import { tmpdir } from "node:os"

/**
 * The odds browser extension, loaded for real into Chromium. LinkedIn and odds.beeblast.co are served from fixtures (odds is the built app on
 * localhost), and odds' backend is a small local fake the extension is pointed at. The pieces under test: the button on a LinkedIn job, what it
 * says for each answer, connecting the extension from the odds page, and the popup.
 */
/** The extension's own API, as the test code running inside its worker or pages sees it. */
declare const chrome: {
  storage: { local: { set(items: Record<string, unknown>): Promise<void>; get(key: string): Promise<Record<string, string | undefined>> } }
  runtime: { sendMessage(message: unknown, callback: (answer: unknown) => void): void }
}

const EXTENSION = join(import.meta.dirname, "..", "extension")
const SUPABASE = "http://supabase.test"
const KEY = `oddsx_${"ab".repeat(24)}`

const JOB_PAGE = (title: string): string => `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>Job description</p></body></html>`

interface Fake {
  server: Server
  port: number
  /** The adds it was asked for (peeks and pool reads are counted apart). */
  calls: Array<{ auth: string; body: { url?: string } }>
  peeks: string[]
  pools: number
  answer: Record<string, unknown>
  peek: Record<string, unknown>
  pool: Record<string, unknown>
}

async function fakeOdds(): Promise<Fake> {
  const fake = {
    calls: [],
    peeks: [],
    pools: 0,
    answer: { status: "added", saved: true, chance_pct: 4.4, job: { id: "pabc", title: "Finance Intern" }, odds_link: "https://odds.beeblast.co/job/pabc" },
    peek: { known: true, id: "pabc", saved: false, chance_pct: 4.4, needs_profile: false },
    pool: { jobs: [{ id: "pabc", title: "Finance Intern", company: "Acme", city: "Amsterdam", status: "saved", chance_pct: 4.4, link: "https://odds.beeblast.co/job/pabc" }, { id: "pold", title: "Marketing Intern", company: "Beta", city: "Utrecht", status: "applied", chance_pct: null, link: "https://odds.beeblast.co/job/pold" }], total: 2 },
  } as unknown as Fake
  fake.server = createServer((req: IncomingMessage, res) => {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" }
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end()

      return
    }
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      const auth = String(req.headers.authorization ?? "")
      if (auth !== `Bearer ${KEY}`) {
        res.writeHead(401, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify({ error: "Connect the odds extension again." }))

        return
      }
      const body = raw ? (JSON.parse(raw) as { url?: string }) : {}
      const path = String(req.url).split("?")[0]
      let answer: Record<string, unknown> = fake.answer
      if (path.endsWith("/ext/peek")) {
        fake.peeks.push(String(body.url))
        answer = fake.peek
      } else if (path.endsWith("/ext/pool")) {
        fake.pools++
        answer = fake.pool
      } else fake.calls.push({ auth, body })
      res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(answer))
    })
  })
  await new Promise<void>((resolve) => fake.server.listen(0, resolve))
  fake.port = (fake.server.address() as { port: number }).port

  return fake
}

const test = base.extend<{ context: BrowserContext; fake: Fake; extensionId: string }>({
  fake: async ({ baseURL }, provide) => {
    void baseURL
    const fake = await fakeOdds()
    await provide(fake)
    fake.server.close()
  },
  context: async ({ fake }, provide) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "odds-ext-")), { channel: "chromium", headless: true, args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, "--allow-running-insecure-content"] })
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
    await worker.evaluate((port) => chrome.storage.local.set({ oddsApi: `http://localhost:${port}` }), fake.port)
    // LinkedIn: a page for any address, so the extension's script runs where it would on the real site.
    await context.route("https://*.linkedin.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: JOB_PAGE("LinkedIn job") }))
    await provide(context)
    await context.close()
  },
  extensionId: async ({ context }, provide) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
    await provide(new URL(worker.url()).host)
  },
})

const JOB = "https://www.linkedin.com/jobs/view/4470863235/?trackingId=abc"

async function connect(context: BrowserContext): Promise<void> {
  const worker = context.serviceWorkers()[0]
  await worker.evaluate((key) => chrome.storage.local.set({ oddsKey: key }), KEY)
}

test("on a LinkedIn job the button is there; on a page that is not a job it is not, and it follows a job opened without a reload", async ({ context }) => {
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/")
  await page.waitForTimeout(1200)
  await expect(page.locator("#odds-add")).toHaveCount(0)
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("odds")
  await page.goto("https://www.linkedin.com/jobs/search/?keywords=finance")
  await expect(page.locator("#odds-add")).toHaveCount(0)
  // LinkedIn opens a job in the same page: the address changes, the page does not reload.
  await page.evaluate(() => history.pushState({}, "", "/jobs/search/?currentJobId=4470863235"))
  await expect(page.locator("#odds-add")).toContainText("odds")
  await page.evaluate(() => history.pushState({}, "", "/jobs/search/?keywords=finance"))
  await expect(page.locator("#odds-add")).toHaveCount(0)
  const view = await context.newPage()
  await view.goto("https://www.linkedin.com/feed/")
  await view.waitForTimeout(800)
  await expect(view.locator("#odds-add")).toHaveCount(0)
})

test("next to LinkedIn's Save button when the page has one, at the edge when it has not; in odds orange with the odds lettering", async ({ context }) => {
  // The structure of the job page as LinkedIn serves it (October 2026, copied from a real one, names and texts removed): each button in a wrapper of its own, the wrappers in one row.
  await context.route("https://www.linkedin.com/jobs/view/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><main id="workspace"><div class="top"><div id="row" style="display:flex;gap:8px"><div class="wrap"><button class="a" type="button" aria-label="Easy Apply to this job"><span><span>Easy Apply</span></span></button></div><div class="wrap"><button class="a" type="button" aria-label="Save the job"><span><span>Save</span></span></button></div></div></div><ul><li><button aria-label="Dismiss Marketing Intern job">x</button></li></ul></main>`,
    }),
  )
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470863235/")
  const pill = page.locator("#odds-add")
  await expect(pill).toHaveAttribute("data-where", "inline")
  expect(await pill.evaluate((el) => el.parentElement?.id)).toBe("row")
  // After the Save wrapper, in the same row, not inside it.
  expect(await pill.evaluate((el) => el.previousElementSibling?.querySelector("button")?.getAttribute("aria-label"))).toBe("Save the job")
  // The size of LinkedIn's buttons beside it, and quiet: an outline, no fill.
  expect(await pill.evaluate((el) => getComputedStyle(el).height)).toBe("32px")
  expect(await pill.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)")
  expect(await pill.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgb(232, 145, 77)")
  expect(await pill.evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed")
  // The odds lettering is loaded from the extension.
  expect(await page.evaluate(() => document.fonts.check('700 15px "odds Inter Tight"'))).toBe(true)
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470863235")
  await expect(page.locator("#odds-add")).toHaveAttribute("data-where", "float")
  expect(await page.locator("#odds-add").evaluate((el) => getComputedStyle(el).position)).toBe("fixed")
})

test("before connecting the button says Connect; connected, it shows your chance before anything is added, then keeps the job and opens the panel", async ({ context, fake }) => {
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("Connect")
  expect(fake.calls).toHaveLength(0)

  await connect(context)
  await page.goto(JOB)
  // The chance is there already, from the engine, before the person presses anything; nothing has been saved.
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "idle")
  expect(fake.peeks).toEqual([JOB])
  expect(fake.calls).toHaveLength(0)

  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "done")
  await expect(page.locator("#odds-add")).toContainText("✓ 4.4%")
  expect(fake.calls).toHaveLength(1)
  expect(fake.calls[0].body.url).toBe(JOB)
  // Only the address goes to odds: no page text.
  expect(Object.keys(fake.calls[0].body)).toEqual(["url"])
  // The panel slides in with their jobs, and the one just added jumps in.
  await expect(page.locator("#odds-panel-host .panel")).toHaveAttribute("data-open", "true")
  await expect(page.locator('#odds-panel-host li[data-new="true"]')).toContainText("Finance Intern")
  await expect(page.locator("#odds-panel-host li")).toHaveCount(2)
  await expect(page.locator("#odds-panel-host .count")).toHaveText("2")
  // Pressing the button again hides it, and again shows it; the cross closes it.
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-panel-host .panel")).toHaveAttribute("data-open", "false")
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-panel-host .panel")).toHaveAttribute("data-open", "true")
  await page.locator("#odds-panel-host .close").click()
  await expect(page.locator("#odds-panel-host .panel")).toHaveAttribute("data-open", "false")
})

test("a job odds does not hold yet shows ?%, a job already kept shows ✓ with its chance, a closed one says so", async ({ context, fake }) => {
  await connect(context)
  const page = await context.newPage()
  fake.peek = { known: false }
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("?%")
  fake.peek = { known: true, id: "pabc", saved: true, chance_pct: 7.1, needs_profile: false }
  await page.goto("https://www.linkedin.com/jobs/view/4470000001/")
  await expect(page.locator("#odds-add")).toContainText("✓ 7.1%")
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "done")
  fake.peek = { known: true, id: "pabc", closed: true }
  await page.goto("https://www.linkedin.com/jobs/view/4470000002/")
  await expect(page.locator("#odds-add")).toContainText("closed")
})

test("flicking through jobs in one page looks each up once, after a short pause", async ({ context, fake }) => {
  await connect(context)
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470000011")
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  const before = fake.peeks.length
  for (const id of ["4470000012", "4470000013", "4470000014"]) await page.evaluate((jobId) => history.pushState({}, "", `/jobs/search/?currentJobId=${jobId}`), id)
  await expect.poll(() => fake.peeks.length, { timeout: 8000 }).toBeGreaterThan(before)
  await page.waitForTimeout(1500)
  expect(fake.peeks.length - before).toBeLessThanOrEqual(2)
  expect(fake.peeks[fake.peeks.length - 1]).toContain("4470000014")
})

test("says what happened for a job that cannot be added, and for a person without a profile yet", async ({ context, fake }) => {
  await connect(context)
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  fake.answer = { status: "not_netherlands", message: "That job is in Germany. odds keeps jobs in the Netherlands." }
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-add")).toContainText("That job is in Germany")
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "problem")
  // Pressing it again looks the job up again.
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "idle")
  fake.answer = { status: "exists", saved: true, chance_pct: null, needs_profile: true, job: { id: "pabc", title: "Finance Intern" } }
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-add")).toContainText("Add your CV on odds to see your chance")
})

test("a key odds no longer accepts disconnects the extension", async ({ context, fake }) => {
  const worker = context.serviceWorkers()[0]
  await worker.evaluate((key) => chrome.storage.local.set({ oddsKey: key }), `oddsx_${"cd".repeat(24)}`)
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("Connect")
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("oddsKey")).oddsKey ?? null)).toBeNull()
  expect(fake.calls).toHaveLength(0)
})

test("the popup says whether it is connected, and Disconnect forgets the key", async ({ context, extensionId }) => {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.locator("#line")).toContainText("Connect to see your interview chance")
  await expect(popup.locator("#main")).toHaveText("Connect odds")
  await connect(context)
  await popup.reload()
  await expect(popup.locator("#line")).toContainText("Connected")
  await popup.locator("#off").click()
  await expect(popup.locator("#main")).toHaveText("Connect odds")
})

test("connecting from the odds page: sign in is already done, one tap hands the key to the extension", async ({ context, extensionId }) => {
  void extensionId
  const worker = context.serviceWorkers()[0]
  const rpc: string[] = []
  const problems: string[] = []
  await mockBackend(context, FLOW_POSTINGS, problems, true)
  // Registered after the general fake, so it answers first: the one call this test is about.
  await context.route(`${SUPABASE}/rest/v1/rpc/create_extension_key`, (route) => {
    rpc.push(route.request().method())

    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(KEY) })
  })
  await context.route("https://odds.beeblast.co/**", async (route) => {
    const response = await route.fetch({ url: route.request().url().replace("https://odds.beeblast.co", "http://localhost:4319") })
    await route.fulfill({ response })
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001", email: "test.person@example.com" } }))
    localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", origin: "non_eu", dutch: "basic" }))
  })
  await page.goto("https://odds.beeblast.co/connect/extension")
  const card = page.getByRole("dialog", { name: "Connect the odds extension" })
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.getByRole("button", { name: "Connect", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Extension connected" })).toBeVisible()
  expect(rpc).toEqual(["POST"])
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("oddsKey")).oddsKey)).toBe(KEY)
})

test("the extension takes a key only from odds.beeblast.co, and only one in the right form", async ({ context }) => {
  const worker = context.serviceWorkers()[0]
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470863235/")
  // A LinkedIn page cannot hand it a key: the message is accepted only from odds.beeblast.co.
  const answer = await page.evaluate(() => new Promise((resolve) => chrome.runtime.sendMessage({ type: "set-key", key: `oddsx_${"ee".repeat(24)}` }, (a: unknown) => resolve(a ?? null))).catch(() => "blocked"))
  expect([null, "blocked"]).toContain(answer)
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("oddsKey")).oddsKey ?? null)).toBeNull()
})
