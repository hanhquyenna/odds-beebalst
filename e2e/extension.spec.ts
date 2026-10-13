import { execFileSync } from "node:child_process"
import { createServer, request as httpRequest, type IncomingMessage, type Server } from "node:http"
import { createServer as createTlsServer } from "node:https"
import { chromium, expect, test as base, type BrowserContext } from "@playwright/test"
import { join } from "node:path"
import { mkdtempSync, readFileSync } from "node:fs"
import { FLOW_POSTINGS } from "./fixtures/postings"
import { mockBackend, shot } from "./mock"
import { tmpdir } from "node:os"

/**
 * The odds browser extension, loaded for real into Chromium. LinkedIn and odds.beeblast.co are served from fixtures (odds is the built app on
 * localhost), and odds' backend is a small local fake the extension is pointed at. The pieces under test: the button on a LinkedIn job, what it
 * says for each answer, connecting the extension from the odds page, and the popup.
 */
/** The extension's own API, as the test code running inside its worker or pages sees it. */
declare const chrome: {
  storage: { local: { set(items: Record<string, unknown>): Promise<void>; get(key: string): Promise<Record<string, string | undefined>> } }
  action: { getPopup(options: object): Promise<string> }
  runtime: { getURL(path: string): string; sendMessage(message: unknown, callback: (answer: unknown) => void): void }
}

const EXTENSION = join(import.meta.dirname, "..", "extension")
const SUPABASE = "http://supabase.test"
const KEY = `oddsx_${"ab".repeat(24)}`

const JOB_PAGE = (title: string): string => `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>Job description</p></body></html>`

interface Fake {
  server: Server
  port: number
  /** The adds it was asked for (peeks and pool reads are counted apart). */
  calls: Array<{ auth: string; body: { url?: string; posting?: Record<string, unknown> } }>
  peeks: string[]
  /** The size of each look-up of several jobs at once. */
  batches: number[]
  analyses: string[]
  /** What each analysis was sent: a job page's posting comes with it, a LinkedIn job never. */
  analyzed: Array<{ url?: string; posting?: Record<string, unknown> }>
  answersByUrl: Record<string, Record<string, unknown>>
  analyzeAnswer?: Record<string, unknown>
  addDelays: Record<string, number>
  pools: number
  sessions: number
  answer: Record<string, unknown>
  peek: Record<string, unknown>
  pool: Record<string, unknown>
}

async function fakeOdds(): Promise<Fake> {
  const fake = {
    calls: [],
    peeks: [],
    batches: [],
    analyses: [],
    analyzed: [],
    answersByUrl: {},
    addDelays: {},
    pools: 0,
    sessions: 0,
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
      const body = raw ? (JSON.parse(raw) as { url?: string; urls?: string[]; posting?: Record<string, unknown> }) : {}
      const path = String(req.url).split("?")[0]
      let answer: Record<string, unknown> = fake.answer
      if (path.endsWith("/ext/peek") && body.urls) {
        // Jobs in view are looked up together, as the real route answers them.
        fake.peeks.push(...body.urls)
        fake.batches.push(body.urls.length)
        answer = { results: Object.fromEntries(body.urls.map((u) => [u, fake.answersByUrl[u] ?? fake.peek])) }
      } else if (path.endsWith("/ext/peek")) {
        fake.peeks.push(String(body.url))
        answer = fake.answersByUrl[String(body.url)] ?? fake.peek
      } else if (path.endsWith("/ext/analyze")) {
        fake.analyses.push(String(body.url))
        fake.analyzed.push(body)
        answer = fake.answersByUrl[`analyze ${String(body.url)}`] ?? fake.analyzeAnswer ?? { ...fake.answer, known: true, saved: false }
      } else if (path.endsWith("/ext/session")) {
        fake.sessions++
        answer = { access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001", email: "test.person@example.com" } }
      } else if (path.endsWith("/ext/pool")) {
        fake.pools++
        answer = fake.pool
      } else {
        fake.calls.push({ auth, body })
        answer = fake.answersByUrl[`add ${String(body.url)}`] ?? fake.answer
      }
      const delay = path.endsWith("/ext/add") ? fake.addDelays[String(body.url)] ?? 0 : 0
      setTimeout(() => res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(answer)), delay)
    })
  })
  await new Promise<void>((resolve) => fake.server.listen(0, resolve))
  fake.port = (fake.server.address() as { port: number }).port

  return fake
}

/**
 * odds.beeblast.co on this machine over real HTTPS, answering the way production does: the built app, with the headers that forbid framing. The
 * browser is told to send that host here (host-resolver-rules), so the extension's header rule sees a real response, which a route fake would not give it.
 */
async function oddsSite(): Promise<{ server: Server; port: number }> {
  const dir = mkdtempSync(join(tmpdir(), "odds-tls-"))
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "2", "-subj", "/CN=odds.beeblast.co", "-addext", "subjectAltName=DNS:odds.beeblast.co"], { stdio: "ignore" })
  const server = createTlsServer({ key: readFileSync(join(dir, "k.pem")), cert: readFileSync(join(dir, "c.pem")) }, (req, res) => {
    const up = httpRequest({ host: "localhost", port: 4319, path: req.url, method: req.method, headers: { ...req.headers, host: "localhost:4319" } }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, {
        ...answer.headers,
        "x-frame-options": "DENY",
        "content-security-policy": "default-src 'self'; frame-ancestors 'none'; script-src 'self'; connect-src 'self' http://supabase.test; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:",
      })
      answer.pipe(res)
    })
    up.on("error", () => res.writeHead(502).end())
    req.pipe(up)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))

  return { server, port: (server.address() as { port: number }).port }
}

const test = base.extend<{ context: BrowserContext; fake: Fake; extensionId: string; site: { server: Server; port: number } }>({
  site: async ({ baseURL }, provide) => {
    void baseURL
    const site = await oddsSite()
    await provide(site)
    site.server.close()
  },
  fake: async ({ baseURL }, provide) => {
    void baseURL
    const fake = await fakeOdds()
    await provide(fake)
    fake.server.close()
  },
  context: async ({ fake, site }, provide) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "odds-ext-")), { channel: "chromium", headless: true, ignoreHTTPSErrors: true, args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`, "--allow-running-insecure-content", `--host-resolver-rules=MAP odds.beeblast.co 127.0.0.1:${site.port}`, "--ignore-certificate-errors"] })
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
    // The panel drawn in the page is what most tests look at; one test switches this off and checks the browser's own side panel is asked for instead.
    await worker.evaluate((port) => chrome.storage.local.set({ oddsApi: `http://localhost:${port}`, oddsPanelInPage: true }), fake.port)
    // LinkedIn: a page for any address, so the extension's script runs where it would on the real site.
    await context.route("https://*.linkedin.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: JOB_PAGE("LinkedIn job") }))
    // The odds site is not reached from these tests unless one serves it (see the panel test): anything else gets an empty page.
    await context.route("https://odds.beeblast.co/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>odds</title>" }))
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
  await expect(page.locator("#odds-add")).toBeVisible()
  await page.goto("https://www.linkedin.com/jobs/search/?keywords=finance")
  await expect(page.locator("#odds-add")).toHaveCount(0)
  // LinkedIn opens a job in the same page: the address changes, the page does not reload.
  await page.evaluate(() => history.pushState({}, "", "/jobs/search/?currentJobId=4470863235"))
  await expect(page.locator("#odds-add")).toBeVisible()
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
      body: `<!doctype html><style>.a{height:32px;border-radius:16px;padding:0 16px;font-size:16px}</style><main id="workspace"><div class="top"><div id="row" style="display:flex;gap:8px"><div class="wrap"><button class="a" type="button" aria-label="Easy Apply to this job"><span><span>Easy Apply</span></span></button></div><div class="wrap"><button class="a" type="button" aria-label="Save the job"><span><span>Save</span></span></button></div></div></div><ul><li><button aria-label="Dismiss Marketing Intern job">x</button></li></ul></main>`,
    }),
  )
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470863235/")
  const pill = page.locator("#odds-add")
  await expect(pill).toHaveAttribute("data-where", "inline")
  expect(await pill.evaluate((el) => el.parentElement?.id)).toBe("row")
  // After the Save wrapper, in the same row, not inside it.
  expect(await pill.evaluate((el) => el.previousElementSibling?.querySelector("button")?.getAttribute("aria-label"))).toBe("Save the job")
  // The size of LinkedIn's buttons beside it (a 32px pill), and quiet: an outline, no fill. The row's own gap spaces it.
  expect(await pill.evaluate((el) => getComputedStyle(el).height)).toBe("32px")
  expect(await pill.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("999px")
  expect(await pill.evaluate((el) => getComputedStyle(el).marginLeft)).toBe("0px")
  expect(await pill.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 244, 232)")
  expect(await pill.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgb(244, 205, 167)")
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
  await expect(page.locator("#odds-add")).toHaveAttribute("title", "Connect odds to see your interview chance here")
  expect(fake.calls).toHaveLength(0)

  await connect(context)
  await page.goto(JOB)
  // The chance is there already, from the engine, before the person presses anything; nothing has been saved.
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "idle")
  expect(fake.peeks).toEqual(["https://www.linkedin.com/jobs/view/4470863235/"])
  expect(fake.calls).toHaveLength(0)

  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "done")
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  expect(fake.calls).toHaveLength(1)
  expect(fake.calls[0].body.url).toBe("https://www.linkedin.com/jobs/view/4470863235/")
  // Only the address goes to odds: no page text.
  expect(Object.keys(fake.calls[0].body)).toEqual(["url"])
  // Every press opens this exact job; the cross closes the panel.
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  // The slide takes a moment; the cross is pressed once the panel has settled.
  await page.waitForTimeout(700)
  await page.frameLocator("#odds-panel-frame").locator("#close").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "false")
})

test("with the browser's side panel on, pressing the button opens it at once, and no panel is drawn in the page", async ({ context, fake }) => {
  const worker = context.serviceWorkers()[0]
  await worker.evaluate(() => chrome.storage.local.set({ oddsPanelInPage: false }))
  await connect(context)
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  await page.locator("#odds-add").click()
  await expect(page.locator("html")).toHaveAttribute("data-odds-panel", "side")
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  expect(fake.calls).toHaveLength(1)
  await expect(page.locator("#odds-panel-frame")).toHaveCount(0)
  // Pressing it again, now that the job is kept, shows the side panel again and adds nothing.
  await page.locator("#odds-add").click()
  expect(fake.calls).toHaveLength(1)
  await expect(page.locator("#odds-panel-frame")).toHaveCount(0)
})

test("a job odds does not hold is analyzed without saving, a job already kept shows ✓ with its chance, a closed one says so", async ({ context, fake }) => {
  await connect(context)
  const page = await context.newPage()
  fake.peek = { known: false }
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  expect(fake.analyses).toHaveLength(1)
  expect(fake.calls).toHaveLength(0)
  fake.peek = { known: true, id: "pabc", saved: true, chance_pct: 7.1, needs_profile: false }
  await page.goto("https://www.linkedin.com/jobs/view/4470000001/")
  await expect(page.locator("#odds-add")).toContainText("7.1%")
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "done")
  fake.peek = { known: true, id: "pabc", closed: true }
  await page.goto("https://www.linkedin.com/jobs/view/4470000002/")
  await expect(page.locator("#odds-add")).toHaveAttribute("title", "This job is closed")
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
  await expect(page.locator("#odds-add")).toHaveAttribute("title", "Connect odds to see your interview chance here")
  expect(await worker.evaluate(async () => (await chrome.storage.local.get("oddsKey")).oddsKey ?? null)).toBeNull()
  expect(fake.calls).toHaveLength(0)
})

test("the odds app opens in the panel as production serves it (refusing frames), signed in by the extension, with the job dropped over it", async ({ context, fake }) => {
  fake.answer = { status: "added", saved: true, chance_pct: 4.4, job: { id: "e2e-adyen-fin-analyst", title: "Junior Financial Analyst", company: "Adyen", city: "Amsterdam" } }
  // The backend of the app is the usual fake; odds itself is the real HTTPS site of oddsSite() above, with production's headers (it may not be framed).
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.unroute("https://odds.beeblast.co/**")
  // The extension's own pages, and the odds site over the network, are not part of what the fake routes.
  await context.route(/^chrome-extension:/, (route) => route.continue())
  await context.route("https://odds.beeblast.co/**", (route) => route.continue())
  // LinkedIn's page keeps a strict policy on what it may frame; the extension's panel must still open.
  await context.route("https://www.linkedin.com/jobs/view/**", (route) => route.fulfill({ status: 200, contentType: "text/html", headers: { "content-security-policy": "default-src 'self' 'unsafe-inline'; frame-src 'self'" }, body: JOB_PAGE("LinkedIn job") }))
  await connect(context)
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  await page.locator("#odds-add").click()
  const panel = page.frameLocator("#odds-panel-frame")
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  // The job drops in over the app.
  await expect(panel.locator("#toast .card")).toContainText("Junior Financial Analyst")
  // The app itself loaded in the frame under it (not refused), and was signed in by the extension: it shows the job's page.
  const app = panel.frameLocator("#app")
  await expect(app.getByRole("heading", { name: "Junior Financial Analyst" }).first()).toBeVisible({ timeout: 25000 })
  expect(fake.sessions).toBeGreaterThanOrEqual(1)
  await shot(page, "ext-panel-app")
})

test("odds still refuses to be framed anywhere the panel was not opened: another tab, another page", async ({ context }) => {
  await context.route("https://www.linkedin.com/feed/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><iframe id="x" src="https://odds.beeblast.co/"></iframe>' }))
  await context.route("https://odds.beeblast.co/**", (route) => route.continue())
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/feed/")
  await page.waitForTimeout(2500)
  expect(page.frames().map((f) => f.url()).some((u) => u.startsWith("chrome-error:"))).toBe(true)
})

test("the browser's side panel is set up: the odds page is its page, and it may frame odds like the in-page panel", async ({ context }) => {
  const worker = context.serviceWorkers()[0]
  const state = await worker.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: { sidePanel?: { getOptions(o: object): Promise<{ path?: string }> }; declarativeNetRequest: { getSessionRules(): Promise<Array<{ condition: { tabIds?: number[] } }>> } } }).chrome
    return { path: (await api.sidePanel?.getOptions({}))?.path ?? null, rules: (await api.declarativeNetRequest.getSessionRules()).map((r) => r.condition.tabIds ?? []) }
  })
  expect(state.path).toBe("panel.html")
  // A rule for requests that belong to no tab (the side panel is such a page): no web page can make those.
  expect(state.rules.some((ids) => ids.length === 1 && ids[0] === -1)).toBe(true)
})

test("the popup says whether it is connected, and Disconnect forgets the key", async ({ context, extensionId }) => {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(popup.locator("#line")).toContainText("Connect to see your interview chance")
  await expect(popup.locator("#main")).toHaveText("Connect odds")
  await connect(context)
  await popup.reload()
  await expect(popup.locator("#line")).toContainText("Connected")
  await expect(popup.locator("#line")).toContainText("beside Save")
  await expect(popup.locator("#main")).toHaveText("Open odds in the side panel")
  await expect(popup.locator("#site")).toBeVisible()
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

const LIST_PAGE = `<!doctype html><html><body><main><ul>
<li data-job-id="4470000101"><a href="/jobs/view/4470000101/">Finance Intern</a></li>
<li data-job-id="4470000102"><a href="/jobs/view/4470000102/">Marketing Intern</a></li>
</ul></main></body></html>`

test("job-list percentages open the selected saved job in the real Odds app, without adding another job", async ({ context, fake }) => {
  await connect(context)
  const first = "https://www.linkedin.com/jobs/view/4470000101/"
  const second = "https://www.linkedin.com/jobs/view/4470000102/"
  fake.answersByUrl[first] = { known: true, saved: true, chance_pct: 12.3, job: { id: "e2e-adyen-fin-analyst", title: "Junior Financial Analyst" } }
  fake.answersByUrl[second] = { known: true, saved: true, chance_pct: 7.8, job: { id: FLOW_POSTINGS[1].id, title: FLOW_POSTINGS[1].title } }
  await context.unroute("https://odds.beeblast.co/**")
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.route(/^chrome-extension:/, (route) => route.continue())
  await context.route("https://odds.beeblast.co/**", (route) => route.continue())
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/?keywords=intern")
  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(2)
  await expect(badges.nth(0)).toContainText("12.3%")
  await expect(badges.nth(1)).toContainText("7.8%")
  await badges.nth(0).click()
  const panel = page.frameLocator("#odds-panel-frame")
  const app = panel.frameLocator("#app")
  await expect(app.getByRole("heading", { name: "Junior Financial Analyst", exact: true })).toBeVisible({ timeout: 15000 })
  await badges.nth(1).click()
  await expect(app.getByRole("heading", { name: FLOW_POSTINGS[1].title, exact: true })).toBeVisible({ timeout: 15000 })
  await app.getByRole("button", { name: "← Back", exact: true }).click()
  await expect(app.getByRole("heading", { name: FLOW_POSTINGS[1].title, exact: true })).not.toBeVisible()
  await badges.nth(1).click()
  await expect(app.getByRole("heading", { name: FLOW_POSTINGS[1].title, exact: true })).toBeVisible({ timeout: 15000 })
  expect(fake.calls).toHaveLength(0)
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  await shot(page, "ext-job-list-chances")
})

test("a recycled job card receives the new job's percentage and never opens the previous job", async ({ context, fake }) => {
  await connect(context)
  fake.answersByUrl["https://www.linkedin.com/jobs/view/4470000101/"] = { known: true, saved: true, chance_pct: 12.3, job: { id: "first" } }
  fake.answersByUrl["https://www.linkedin.com/jobs/view/4470000102/"] = { known: true, saved: true, chance_pct: 7.8, job: { id: "second" } }
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/")
  const card = page.locator('[data-job-id="4470000101"]')
  await expect(card.locator(".odds-job-chance")).toContainText("12.3%")
  await card.locator("a").evaluate((link) => link.setAttribute("href", "/jobs/view/4470000103/"))
  fake.answersByUrl["https://www.linkedin.com/jobs/view/4470000103/"] = { known: true, saved: true, chance_pct: 23.4, job: { id: "third" } }
  await expect(card.locator(".odds-job-chance")).toHaveAttribute("data-job-id", "4470000103")
  await expect(card.locator(".odds-job-chance")).toContainText("23.4%")
  await card.locator(".odds-job-chance").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  await expect(page.frameLocator("#odds-panel-frame").locator("#toast .chip")).toContainText("23.4%")
  expect(fake.peeks.filter((url) => url.includes("4470000103"))).toHaveLength(1)
  expect(fake.calls).toHaveLength(0)
})

test("unknown visible jobs get a percentage without saving; clicking saves the clicked URL even after page navigation", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: false }
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/")
  const badge = page.locator('.odds-job-chance[data-job-id="4470000101"]')
  await expect(badge).toContainText("4.4%")
  expect(fake.calls).toHaveLength(0)
  expect(fake.analyses).toContain("https://www.linkedin.com/jobs/view/4470000101/")
  await page.evaluate(() => history.pushState({}, "", "/jobs/search/?currentJobId=4470000999"))
  await badge.click()
  await expect.poll(() => fake.calls.length).toBe(1)
  expect(fake.calls[0].body.url).toBe("https://www.linkedin.com/jobs/view/4470000101/")
  await expect(page.frameLocator("#odds-panel-frame").locator("#toast .card")).toContainText("Finance Intern")
})

test("missing profiles and read limits display explanations instead of made-up percentages", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, needs_profile: true, chance_pct: null }
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/")
  await expect(page.locator(".odds-job-chance").first()).toHaveAttribute("title", "Add your CV in Odds to calculate your chance")
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "limit", message: "Up to 30 new jobs a day." }
  await page.reload()
  await expect(page.locator(".odds-job-chance").first()).toHaveText("—")
  await expect(page.locator(".odds-job-chance").first()).toHaveAttribute("title", "Up to 30 new jobs a day.")
  expect(fake.calls).toHaveLength(0)
})

test("a saved card opens the native side panel with the exact selection ready even if the panel loads late", async ({ context, fake }) => {
  await connect(context)
  const worker = context.serviceWorkers()[0]
  await worker.evaluate(() => chrome.storage.local.set({ oddsPanelInPage: false }))
  fake.peek = { known: true, saved: true, chance_pct: 8.6, job: { id: "selected-job", title: "Selected job" } }
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/")
  await expect(page.locator(".odds-job-chance").first()).toContainText("8.6%")
  await page.locator(".odds-job-chance").first().click()
  await expect(page.locator("html")).toHaveAttribute("data-odds-panel", "side")
  const panelPage = await context.newPage()
  await panelPage.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`)
  await page.bringToFront()
  const selected = await panelPage.evaluate(() => new Promise((resolve) => chrome.runtime.sendMessage({ type: "panel-ready" }, resolve)))
  expect(selected).toMatchObject({ job: { id: "selected-job", chance_pct: 8.6 } })
  await expect(page.locator("#odds-panel-frame")).toHaveCount(0)
  expect(fake.calls).toHaveLength(0)
})

// LinkedIn's live general-search cards use whole-card anchors and currentJobId,
// with generated classes rather than the classic job-card-container class.
test("general search displays chances on whole-card links immediately, including jobs inserted after SPA navigation", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, saved: true, chance_pct: 12.3, job: { id: "pabc", title: "Finance Intern" } }
  await context.route("https://www.linkedin.com/search/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><main><a href="/jobs/search/?currentJobId=4470000101"><div><p>Finance Intern</p><p>Acme</p><p>Amsterdam</p><button>Save</button></div></a></main>` }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/search/results/all/?keywords=jobs")
  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(1)
  await expect(badges).toContainText("12.3%")
  await page.evaluate(() => {
    history.pushState({}, "", "/search/results/all/?keywords=intern")
    document.querySelector("main")!.insertAdjacentHTML("beforeend", '<a href="/jobs/search/?currentJobId=4470000102"><p>Marketing Intern</p><button>Save</button></a>')
  })
  await expect(badges).toHaveCount(2)
  await expect(badges.nth(1)).toContainText("12.3%")
  expect(fake.calls).toHaveLength(0)
})

test("job badges show only the percentage and fit beside Save without overflowing the card", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, saved: true, chance_pct: 12.3, job: { id: "pabc", title: "Finance Intern" } }
  await context.route("https://www.linkedin.com/search/**", route => route.fulfill({ contentType: "text/html", body: '<main><a style="display:block;width:300px" href="/jobs/search/?currentJobId=4470000101"><p>Finance Intern</p><div style="display:flex;justify-content:flex-end"><button style="height:28px;border-radius:14px">Save</button></div></a></main>' }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/search/results/all/?keywords=jobs")
  const badge = page.locator(".odds-job-chance")
  await expect(badge).toHaveText("12.3%")
  expect(await badge.evaluate(el => el.nextElementSibling?.textContent)).toBe("Save")
  const bounds = await badge.evaluate(el => ({pill:el.getBoundingClientRect().width,card:el.closest("a")!.getBoundingClientRect().width,height:el.getBoundingClientRect().height,save:el.nextElementSibling!.getBoundingClientRect().height}))
  expect(bounds.pill).toBeLessThan(bounds.card)
  // As tall as the Save beside it, and Save keeps its own size (the row does not stretch it to odds).
  expect(bounds.height).toBe(28)
  expect(bounds.save).toBe(28)
})

test("settled badges do not rewrite DOM during scroll events or unrelated page updates", async ({ context }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/search/**", route => route.fulfill({ contentType: "text/html", body: '<main><a href="/jobs/search/?currentJobId=4470000101"><p>Finance Intern</p><button>Save</button></a><span id="unrelated">Notification</span></main>' }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/search/results/all/?keywords=jobs")
  await expect(page.locator(".odds-job-chance")).toHaveText("4.4%")
  const writes = await page.evaluate(async () => {
    let count = 0
    const observer = new MutationObserver(changes => { count += changes.filter(c => (c.target as Element).closest?.(".odds-job-chance")).length })
    observer.observe(document.documentElement, {subtree:true,childList:true,attributes:true})
    for (let i=0;i<100;i++) {
      window.dispatchEvent(new Event("scroll"))
      document.querySelector("#unrelated")!.textContent = String(i)
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
    observer.disconnect()
    return count
  })
  expect(writes).toBe(0)
})

test("recent percentages survive page reload without another backend lookup", async ({ context, fake }) => {
  await connect(context)
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  const reads = fake.peeks.length
  await page.reload()
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  expect(fake.peeks.length).toBe(reads)
})

test("connected toolbar opens directly instead of showing a popup menu", async ({ context }) => {
  const worker = context.serviceWorkers()[0]
  await expect.poll(() => worker.evaluate(() => chrome.action.getPopup({}))).toMatch(/\/popup\.html$/)
  await connect(context)
  await expect.poll(() => worker.evaluate(() => chrome.action.getPopup({}))).toBe("")
  await worker.evaluate(() => chrome.storage.local.set({ oddsKey: null }))
  await expect.poll(() => worker.evaluate(() => chrome.action.getPopup({}))).toMatch(/\/popup\.html$/)
})


test("classic LinkedIn search inside preload gets list badges and a selected percentage beside Save", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, saved: true, chance_pct: 4.4, job: { id: "pabc" } }
  await context.route("https://www.linkedin.com/preload/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><main><ul><li data-job-id="4470000101"><div class="job-card-container__title"><a class="job-card-container__link" href="/jobs/view/4470000101/">Finance Intern</a></div></li><li data-job-id="4470000102"><a class="job-card-container__link" href="/jobs/view/4470000102/">Marketing Intern</a></li></ul><section class="jobs-search__job-details"><h1><a href="/jobs/view/4470000101/">Finance Intern</a></h1><div><button>Apply</button><button class="jobs-save-button">Save Finance Intern at Acme</button></div></section></main>` }))
  await context.route("https://www.linkedin.com/jobs/search/**", route => route.fulfill({ contentType: "text/html", body: '<iframe style="width:100%;height:700px" src="https://www.linkedin.com/preload/?_bprMode=vanilla"></iframe>' }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470000101")
  const frame = page.frameLocator('iframe[src*="/preload/"]')
  await expect(frame.locator(".odds-job-chance")).toHaveCount(2)
  await expect(frame.locator(".odds-job-chance").nth(0)).toHaveText("4.4%")
  await expect(frame.locator("#odds-add")).toHaveText("4.4%")
  await expect(frame.locator("#odds-add")).toHaveAttribute("data-where", "inline")
  await expect(page.locator("#odds-add")).toHaveCount(0)
  await frame.locator("h1 a").evaluate(e => e.setAttribute("href", "/jobs/view/4470000102/"))
  await expect.poll(() => fake.peeks.includes("https://www.linkedin.com/jobs/view/4470000102/")).toBe(true)
})

// ---- Other job sites. Their pages are built the way each site built them in October 2026 (structure, sizes and labels copied from the real pages,
// texts made up). The real sites are checked by hand in the real browser (extension/README.md).

const ABOUT = "We are looking for a motivated intern to join our international team in Amsterdam. You will work in English with analysts and engineers, and learn how we build products."
/** A job page's schema.org JobPosting, as job sites give it to search engines. */
const ldJob = (title: string, company: string, city: string, region = "NH"): string =>
  `<script type="application/ld+json">${JSON.stringify({ "@context": "http://schema.org", "@type": "JobPosting", title, datePosted: "2026-10-01T08:00:00Z", description: `<p>${ABOUT}</p><ul><li>Python</li><li>SQL</li></ul>`, hiringOrganization: { "@type": "Organization", name: company }, jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "NL", addressLocality: city, addressRegion: region } } })}</script>`

const INDEED_JOBS: Record<string, [string, string]> = { aaaaaaaaaaaaaaa1: ["Data Intern", "Acme"], aaaaaaaaaaaaaaa2: ["Finance Intern", "Beta"] }
/**
 * nl.indeed.com's search: cards with their bookmark in a narrow box pinned to the card's corner (long titles run up to it) and a row of 24px chips
 * (pay, Stage, Fulltime); the open job beside the list with a row of 44px rounded-square buttons.
 */
const INDEED_SEARCH = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px Arial;margin:0}#list{width:470px;float:left}
.job_seen_beacon{position:relative;border:1px solid #ccc;border-radius:8px;margin:8px;padding:16px 64px 16px 16px;height:120px}
.ctaContainer{position:absolute;top:10px;right:0;width:44px}button.bookmark{width:28px;height:44px;border:0;background:none;padding:0}
ul.metadataContainer{display:flex;gap:4px;list-style:none;padding:0;margin:8px 0}ul.metadataContainer li{height:24px;border-radius:8px;background:#f3f2f1;font-size:12px;padding:0 8px;display:flex;align-items:center}
#jobsearch-ViewjobPaneWrapper{margin-left:500px;padding:16px}.row{display:flex;gap:16px;align-items:center}
.row button{height:44px;border-radius:12px;border:0;background:#f3f2f1;font-size:16px}.apply{padding:0 16px}.icon{width:44px}
</style></head><body><div id="list">${Object.entries(INDEED_JOBS)
  .map(([jk, [title, company]]) => `<div class="job_seen_beacon"><h2><a class="jcs-JobTitle" data-jk="${jk}" href="/pagead/clk?mo=r&ad=${jk}">${title}</a></h2><div class="company_location"><span data-testid="company-name">${company}</span></div><div class="jobMetaDataGroup"><ul class="heading6 tapItem-gutter metadataContainer"><li data-testid="attribute_snippet_testid">€ 600 per maand</li><li data-testid="attribute_snippet_testid">Stage</li></ul></div><div class="ctaContainer"><button class="bookmark" aria-label="Save job Toggle">♡</button></div></div>`)
  .join("")}</div><div id="jobsearch-ViewjobPaneWrapper"><h2 data-testid="jobsearch-JobInfoHeader-title">Data Intern</h2><div class="row"><div><button class="apply">Solliciteer op website van werkgever</button></div><div><button class="icon" aria-label="Vacature opslaan">♡</button></div><div><button class="icon" aria-label="Vacature delen">↗</button></div></div></div></body></html>`

async function indeed(context: BrowserContext): Promise<void> {
  await context.route("https://nl.indeed.com/jobs**", (route) => route.fulfill({ contentType: "text/html", body: INDEED_SEARCH }))
  await context.route("https://nl.indeed.com/viewjob**", (route) => {
    const jk = new URL(route.request().url()).searchParams.get("jk") ?? ""
    const [title, company] = INDEED_JOBS[jk] ?? ["", ""]

    return route.fulfill({ contentType: "text/html", body: `<!doctype html><title>${title}</title>${ldJob(title, company, "Amsterdam")}<h1>${title}</h1>` })
  })
}
const INDEED_FIRST = "https://nl.indeed.com/viewjob?jk=aaaaaaaaaaaaaaa1"

test("Indeed: beside the open job's 'Vacature opslaan', the same 44px rounded square; on every card the first of its chips, their size, clear of the title", async ({ context, fake }) => {
  await connect(context)
  await indeed(context)
  fake.peek = { known: true, id: "pind", saved: false, chance_pct: 9.1, needs_profile: false }
  const page = await context.newPage()
  await page.goto("https://nl.indeed.com/jobs?q=internship&l=Amsterdam&vjk=aaaaaaaaaaaaaaa1")
  const pill = page.locator("#odds-add")
  await expect(pill).toContainText("9.1%")
  await expect(pill).toHaveAttribute("data-where", "inline")
  expect(await pill.evaluate((el) => el.previousElementSibling?.querySelector("button")?.getAttribute("aria-label"))).toBe("Vacature opslaan")
  expect(await pill.evaluate((el) => [getComputedStyle(el).height, getComputedStyle(el).borderTopLeftRadius, getComputedStyle(el).marginLeft])).toEqual(["44px", "12px", "0px"])
  expect(fake.peeks).toContain(INDEED_FIRST)

  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(2)
  await expect(badges.nth(0)).toContainText("9.1%")
  for (const badge of await badges.all()) {
    const fit = await badge.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const chip = el.nextElementSibling!
      const title = el.closest(".job_seen_beacon")!.querySelector("h2")!.getBoundingClientRect()
      const style = getComputedStyle(el)

      return { row: el.parentElement!.matches("ul.metadataContainer") && el.parentElement!.firstElementChild === el, chip: chip.textContent, size: [box.height, style.borderTopLeftRadius, style.fontSize], chipSize: [chip.getBoundingClientRect().height, getComputedStyle(chip).borderTopLeftRadius], gap: Math.round(chip.getBoundingClientRect().left - box.right), clear: box.top >= title.bottom }
    })
    expect(fit.row).toBe(true)
    expect(fit.chip).toBe("€ 600 per maand")
    expect(fit.size).toEqual([24, "8px", "12px"])
    expect(fit.chipSize).toEqual([24, "8px"])
    // Indeed's own gap between chips, no margin of its own.
    expect(fit.gap).toBe(4)
    expect(fit.clear).toBe(true)
  }
  await shot(page, "ext-indeed")
})

test("Indeed: a job odds does not hold is read from its own Indeed page and kept for everyone, so its percentage shows without a press", async ({ context, fake }) => {
  await connect(context)
  await indeed(context)
  fake.peek = { known: false }
  fake.answersByUrl[`analyze ${INDEED_FIRST}`] = { status: "added", known: true, saved: false, chance_pct: 6.2, job: { id: "pind1", title: "Data Intern" } }
  fake.answersByUrl["analyze https://nl.indeed.com/viewjob?jk=aaaaaaaaaaaaaaa2"] = { status: "added", known: true, saved: false, chance_pct: 3.4, job: { id: "pind2", title: "Finance Intern" } }
  const page = await context.newPage()
  await page.goto("https://nl.indeed.com/jobs?q=internship&vjk=aaaaaaaaaaaaaaa1")
  await expect(page.locator("#odds-add")).toContainText("6.2%")
  await expect(page.locator(".odds-job-chance").nth(1)).toContainText("3.4%")
  const sent = fake.analyzed.find((a) => a.url === INDEED_FIRST)
  expect(sent?.posting).toMatchObject({ title: "Data Intern", company: "Acme", location: "Amsterdam, North Holland, Netherlands", posted: "2026-10-01T08:00:00Z" })
  expect(String(sent?.posting?.description)).toContain("international team")
  // Nothing was kept for the person by looking.
  expect(fake.calls).toHaveLength(0)
})

test("Indeed: pressing the button keeps the job, sending it as its page shows it; a job that cannot be read first shows ?%", async ({ context, fake }) => {
  await connect(context)
  await indeed(context)
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "unreadable", message: "odds could not read that job page." }
  fake.answer = { status: "added", saved: true, chance_pct: 6.2, job: { id: "pind1", title: "Data Intern" } }
  const page = await context.newPage()
  await page.goto("https://nl.indeed.com/jobs?q=internship&vjk=aaaaaaaaaaaaaaa1")
  await expect(page.locator("#odds-add")).toHaveText("?%")
  await expect(page.locator("#odds-add")).toHaveAttribute("title", /does not have this job yet/)
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "done")
  await expect(page.locator("#odds-add")).toContainText("6.2%")
  expect(fake.calls).toHaveLength(1)
  expect(fake.calls[0].body.url).toBe(INDEED_FIRST)
  expect(fake.calls[0].body.posting).toMatchObject({ title: "Data Intern", company: "Acme" })
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
})

const GLASSDOOR_JOBS: Record<string, { title: string; company: string; rating: string; place: string; href: string }> = {
  "1009000000001": { title: "Data Intern", company: "Acme", rating: "3,9", place: "Amsterdam", href: "https://www.glassdoor.nl/job-listing/data-intern-acme-JV_IC3064478_KO0,11_KE12,16.htm?jl=1009000000001" },
  "1009000000002": { title: "Finance Intern", company: "Beta", rating: "4,1", place: "Utrecht", href: "https://www.glassdoor.nl/job-listing/finance-intern-beta-JV_IC3064478_KO0,14_KE15,19.htm?jl=1009000000002" },
}
/** glassdoor.nl's search: cards with a 40px Save pinned to their corner; pressing a card opens its job beside the list without leaving the page. */
const GLASSDOOR_SEARCH = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px Arial;margin:0}ul{width:440px;float:left;list-style:none;padding:0}
li[data-test=jobListing]{position:relative;border:1px solid #ddd;border-radius:12px;margin:8px;padding:16px 60px 16px 16px;height:110px}
.saveBox{position:absolute;top:8px;right:8px;display:flex}[data-test=save-job]{width:40px;height:40px;border-radius:8px;border:0;background:none}
#detail{margin-left:470px;padding:16px}header [data-test=save-job]{border:1px solid #00060c}.buttons{display:flex}
.apply{height:40px;border-radius:8px;background:#00060c;color:#fff;padding:0 16px;margin-right:8px}
</style></head><body><ul>${Object.entries(GLASSDOOR_JOBS)
  .map(([id, j]) => `<li data-test="jobListing" data-jobid="${id}"><div><a data-test="job-title" href="${j.href}">${j.title}</a><div>${j.company}</div><div class="JobCard_jobDescriptionSnippet" data-test="descSnippet">A short snippet of ${j.title}, as the card shows it.</div></div><div class="saveBox"><button data-test="save-job" aria-label="Opslaan">♡</button></div></li>`)
  .join("")}</ul><div id="detail"><header data-test="job-details-header"><div><a class="EmployerProfile_employerName">Acme3,9</a><h1 id="jd-job-title-1009000000001">Data Intern</h1><div data-test="location">Amsterdam</div></div><div class="buttons"><div><button class="apply" data-test="applyButton">Solliciteren</button></div><div class="JobDetails_applySaveButtonPosition"><button data-test="save-job" aria-label="Opslaan">♡</button></div></div></header><div class="JobDetails_jobDescription__x">Data Intern. ${ABOUT}</div></div>
<script>
const jobs = ${JSON.stringify(GLASSDOOR_JOBS)}
for (const li of document.querySelectorAll("[data-test=jobListing]")) li.addEventListener("click", (event) => {
  event.preventDefault()
  // Glassdoor draws the open job a moment after the press.
  setTimeout(() => {
    const job = jobs[li.dataset.jobid]
    const h1 = document.querySelector("h1")
    h1.id = "jd-job-title-" + li.dataset.jobid
    h1.textContent = job.title
    document.querySelector(".EmployerProfile_employerName").textContent = job.company + job.rating
    document.querySelector("[data-test=location]").textContent = job.place
    document.querySelector(".JobDetails_jobDescription__x").textContent = job.title + ". " + ${JSON.stringify(ABOUT)}
  }, 300)
})
</script></body></html>`
const GLASSDOOR_SECOND = "https://www.glassdoor.nl/job-listing/finance-intern-beta-JV_IC3064478_KO0,14_KE15,19.htm?jl=1009000000002"

/** Glassdoor's /graph, answering a list of jobView questions as Glassdoor's own page asks them. */
async function glassdoorGraph(context: BrowserContext, asked: number[][]): Promise<void> {
  await context.route("https://www.glassdoor.nl/graph", async (route) => {
    const questions = JSON.parse(route.request().postData() ?? "[]") as Array<{ variables: { jl: number } }>
    asked.push(questions.map((q) => q.variables.jl))
    const answers = questions.map(({ variables: { jl } }) => {
      const job = GLASSDOOR_JOBS[String(jl)]

      return { data: { jobview: job ? { job: { listingId: jl, jobTitleText: job.title, description: `<p>${job.title}. ${ABOUT}</p>` }, header: { employer: { name: `${job.company} B.V.` }, employerNameFromSearch: job.company, locationName: job.place, ageInDays: 3, expired: false } } : null } }
    })

    return route.fulfill({ contentType: "application/json", body: JSON.stringify(answers) })
  })
}

test("Glassdoor: the open job's button matches its outlined 40px Save; every job in the list gets its percentage, read from Glassdoor's /graph together, without opening anything", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.glassdoor.nl/Job/**", (route) => route.fulfill({ contentType: "text/html", body: GLASSDOOR_SEARCH }))
  // Glassdoor's own job pages stop scripts at a "humans only" check: the extension must not need them.
  const blocked: string[] = []
  await context.route("https://www.glassdoor.nl/job-listing/**", (route) => {
    blocked.push(route.request().url())

    return route.fulfill({ status: 403, contentType: "text/html", body: "<title>Just a moment...</title><h1>Humans only</h1>" })
  })
  const asked: number[][] = []
  await glassdoorGraph(context, asked)
  fake.answersByUrl["https://www.glassdoor.nl/job-listing/j.htm?jl=1009000000001"] = { known: true, id: "pgd1", saved: false, chance_pct: 5.5 }
  fake.answersByUrl["https://www.glassdoor.nl/job-listing/data-intern-acme-JV_IC3064478_KO0,11_KE12,16.htm?jl=1009000000001"] = { known: true, id: "pgd1", saved: false, chance_pct: 5.5 }
  fake.peek = { known: false }
  fake.answersByUrl[`analyze ${GLASSDOOR_SECOND}`] = { status: "added", known: true, saved: false, chance_pct: 3.3, job: { id: "pgd2", title: "Finance Intern" } }
  const page = await context.newPage()
  await page.goto("https://www.glassdoor.nl/Job/amsterdam-internship-jobs-SRCH_IL.0,9_IC3064478_KO10,20.htm")
  const pill = page.locator("#odds-add")
  await expect(pill).toContainText("5.5%")
  expect(await pill.evaluate((el) => [getComputedStyle(el).height, getComputedStyle(el).borderTopLeftRadius, el.previousElementSibling?.querySelector("[data-test=save-job]") !== null])).toEqual(["40px", "8px", true])

  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(2)
  await expect(badges.nth(0)).toContainText("5.5%")
  // No ?%: the job odds did not hold was read and kept for everyone, and its chance is there without a press.
  await expect(badges.nth(1)).toHaveText("3.3%")
  expect(await badges.nth(1).evaluate((el) => el.getBoundingClientRect().height)).toBe(32)
  expect(asked.flat()).toContain(1009000000002)
  const sent = fake.analyzed.find((a) => a.url === GLASSDOOR_SECOND)
  expect(sent?.posting).toMatchObject({ title: "Finance Intern", company: "Beta B.V.", location: "Utrecht, Netherlands" })
  expect(String(sent?.posting?.posted)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(String(sent?.posting?.description)).toContain("international team")
  // Nothing was opened or clicked: the open job is still the first, the page is the same, Glassdoor's job pages were never asked for.
  await expect(page.locator("h1")).toHaveText("Data Intern")
  expect(page.url()).toContain("/Job/amsterdam-internship-jobs")
  expect(blocked).toHaveLength(0)
  expect(fake.calls).toHaveLength(0)

  // Pressing it keeps it for the person and opens it in odds.
  fake.answersByUrl[`add ${GLASSDOOR_SECOND}`] = { status: "exists", saved: true, chance_pct: 3.3, job: { id: "pgd2", title: "Finance Intern" } }
  await badges.nth(1).click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  await expect.poll(() => fake.calls.length).toBe(1)
  expect(fake.calls[0].body.url).toBe(GLASSDOOR_SECOND)
  await shot(page, "ext-glassdoor")
})

const MAGNET_JOB = "https://magnet.me/nl-NL/vacature/1075815/data-intern"
/**
 * A Magnet.me job page: the job for search engines in its head; in a column beside the text, full-width "Solliciteren op website" over "Liken"
 * (Magnet's way of keeping a job), 45px tall, 12px apart; related jobs below.
 */
const MAGNET_PAGE = `<!doctype html><html><head><meta charset="utf-8">${ldJob("Data Intern", "TU Delft", "Delft", "ZH")}<style>body{font:15px Arial;margin:0}.page{display:flex;gap:40px;padding:24px}.text{width:620px}.side{width:279px}.side button{display:block;width:279px;height:45px;border-radius:6px;font-size:16px;border:1px solid #ff5c51}.side .like{margin-top:12px}</style></head><body><main><div class="page"><div class="text"><div><div><h1>Data Intern</h1></div></div><p>${ABOUT}</p></div><div class="side"><div><button class="apply">Solliciteren op website</button><div class="like"><button>Liken</button></div></div></div></div><section><h2>Vergelijkbare vacatures</h2><ul><li class="tile"><a href="/nl-NL/vacature/1086286/finance-trainee">Finance Trainee</a><p>Beta</p></li></ul></section></main></body></html>`

test("Magnet.me and any job page that says what it is: the button beside its Save, the job read from the page itself, related jobs badged", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://magnet.me/**", (route) =>
    route.fulfill({ contentType: "text/html", body: route.request().url().includes("1086286") ? `<!doctype html>${ldJob("Finance Trainee", "Beta", "Utrecht", "UT")}<h1>Finance Trainee</h1>` : MAGNET_PAGE }),
  )
  fake.peek = { known: false }
  fake.answersByUrl[`analyze ${MAGNET_JOB}`] = { status: "added", known: true, saved: false, chance_pct: 11.5, job: { id: "pmag", title: "Data Intern" } }
  fake.answersByUrl["analyze https://magnet.me/nl-NL/vacature/1086286/finance-trainee"] = { status: "added", known: true, saved: false, chance_pct: 2.2, job: { id: "pmag2", title: "Finance Trainee" } }
  const page = await context.newPage()
  await page.goto(`${MAGNET_JOB}?utm_source=newsletter`)
  const pill = page.locator("#odds-add")
  await expect(pill).toContainText("11.5%")
  // One more full-width row under Like, as tall, as round and as far below it as Like is below Apply.
  await expect(pill).toHaveAttribute("data-where", "stack")
  expect(await pill.evaluate((el) => {
    const like = el.previousElementSibling!.getBoundingClientRect()
    const box = el.getBoundingClientRect()

    return [el.previousElementSibling!.textContent, box.width, box.height, getComputedStyle(el).borderTopLeftRadius, Math.round(box.top - like.bottom), box.left === like.left]
  })).toEqual(["Liken", 279, 45, "6px", 12, true])
  expect(fake.analyzed.find((a) => a.url === MAGNET_JOB)?.posting).toMatchObject({ title: "Data Intern", company: "TU Delft", location: "Delft, South Holland, Netherlands" })
  await expect(page.locator(".tile .odds-job-chance")).toContainText("2.2%")
  expect(fake.analyzed.find((a) => a.url === "https://magnet.me/nl-NL/vacature/1086286/finance-trainee")?.posting).toMatchObject({ company: "Beta" })
})

test("an employer's own job page anywhere gets the button; its other pages, and pages that are not jobs, get nothing and ask odds nothing", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "added", known: true, saved: false, chance_pct: 14, job: { id: "pweb", title: "Strategy Intern" } }
  await context.route("https://careers.example-employer.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: route.request().url().includes("/jobs/") ? `<!doctype html>${ldJob("Strategy Intern", "Example Employer", "Rotterdam", "ZH")}<h1>Strategy Intern</h1><p>${ABOUT}</p>` : "<!doctype html><h1>About us</h1><p>We make things.</p>" }),
  )
  await context.route("https://news.example.org/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><h1>News</h1><a href="${INDEED_FIRST}">An Indeed job</a><a href="https://www.linkedin.com/jobs/view/4470863235/">A LinkedIn job</a>` }))
  const page = await context.newPage()
  await page.goto("https://careers.example-employer.com/about")
  await page.goto("https://news.example.org/today")
  await page.waitForTimeout(1500)
  await expect(page.locator("#odds-add, .odds-job-chance")).toHaveCount(0)
  expect(fake.peeks).toHaveLength(0)

  await page.goto("https://careers.example-employer.com/jobs/strategy-intern?utm_campaign=x")
  const pill = page.locator("#odds-add")
  await expect(pill).toContainText("14%")
  // No Save or Apply beside its title: it waits at the edge of the page.
  await expect(pill).toHaveAttribute("data-where", "float")
  expect(fake.analyzed[0]).toMatchObject({ url: "https://careers.example-employer.com/jobs/strategy-intern", posting: { title: "Strategy Intern", company: "Example Employer" } })
})

/** LinkedIn's search as it is drawn in October 2026: each card with a row of 32px round buttons at its corner (Dismiss ✕), the open job with Apply and Save, which reads "Saved" once the job is kept. */
const LINKEDIN_SEARCH = (saved: boolean): string => `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px Arial;margin:0}.list{width:500px;float:left}li{list-style:none}.job-card-container{display:flex;position:relative;padding:12px;border-bottom:1px solid #ddd}
.job-card-list__actions-container{display:flex;gap:4px;margin-left:auto}.job-card-list__actions-container button{width:32px;height:32px;border-radius:999px;border:0}
.artdeco-entity-lockup__title{display:block;overflow:hidden;max-height:40px}.jobs-search__job-details{margin-left:520px}.btns{display:flex}.btns button{height:40px;border-radius:999px;padding:0 16px;font-size:16px}
</style></head><body><main><ul class="list">${["4470000201", "4470000202", "4470000203"].map((id, i) => `<li data-occludable-job-id="${id}"><div class="display-flex job-card-container"><div><div class="artdeco-entity-lockup__title"><a class="job-card-container__link" href="/jobs/view/${id}/?trk=x">${["Growth Hacker Intern Ecommerce", "Marketing Automation Intern", "Market Development Intern with a very long title that LinkedIn cuts after two lines"][i]}</a></div><div>Company ${i}</div></div><div class="job-card-list__actions-container"><div><button aria-label="Dismiss job">✕</button></div></div></div></li>`).join("")}</ul>
<section class="jobs-search__job-details"><h1><a href="/jobs/view/4470000203/">Market Development Intern</a></h1><div class="btns" style="gap:8px"><div><button class="jobs-apply-button">Apply</button></div><div><button class="jobs-save-button" aria-label="${saved ? "Saved, Market Development Intern" : "Save Market Development Intern"}">${saved ? "Saved" : "Save"}</button></div></div></section></main></body></html>`

/** LinkedIn's public page of one job, the one its guest job pages load. */
const LINKEDIN_PUBLIC = (title: string): string => `<section class="top-card-layout"><h2 class="top-card-layout__title font-sans topcard__title">${title}</h2><a class="topcard__org-name-link topcard__flavor--black-link" href="https://nl.linkedin.com/company/acme">  Acme  </a><span class="topcard__flavor topcard__flavor--bullet">Amsterdam, North Holland, Netherlands</span><figcaption class="num-applicants__caption">Be among the first 25 applicants</figcaption><div class="show-more-less-html__markup">${ABOUT}<ul><li>Marketing</li></ul></div><h3 class="description__job-criteria-subheader">Seniority level</h3><span class="description__job-criteria-text">Internship</span></section>`

test("LinkedIn search: every card's badge is the first of its 32px round buttons, the jobs in view are looked up together, and the open job's button sits beside Saved", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LINKEDIN_SEARCH(true) }))
  fake.peek = { known: true, id: "pli", saved: false, chance_pct: 4.5 }
  fake.answersByUrl["https://www.linkedin.com/jobs/view/4470000203/"] = { known: true, id: "pli3", saved: true, chance_pct: 9.2 }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470000203")
  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(3)
  for (const badge of await badges.all()) await expect(badge).toContainText("%")
  // One look-up for the three cards, not one each.
  expect(fake.batches).toContain(3)
  for (const badge of await badges.all()) {
    const fit = await badge.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const x = el.parentElement!.querySelector("button[aria-label^=Dismiss]")!.getBoundingClientRect()

      return { first: el.parentElement!.matches(".job-card-list__actions-container") && el.parentElement!.firstElementChild === el, height: box.height, corners: getComputedStyle(el).borderTopLeftRadius, gap: Math.round(x.left - box.right), middle: Math.abs(box.top + box.height / 2 - (x.top + x.height / 2)) }
    })
    expect(fit).toEqual({ first: true, height: 32, corners: "999px", gap: 4, middle: 0 })
  }
  // The job is saved on LinkedIn: its button reads "Saved", and odds is still beside it, not floating at the edge.
  const pill = page.locator("#odds-add")
  await expect(pill).toContainText("9.2%")
  await expect(pill).toHaveAttribute("data-where", "inline")
  expect(await pill.evaluate((el) => [el.previousElementSibling?.querySelector("button")?.textContent, getComputedStyle(el).height])).toEqual(["Saved", "40px"])
  await shot(page, "ext-linkedin-search")
})

test("LinkedIn: a job odds does not hold is read from LinkedIn's public page of it in the browser (free, no Apify), so its percentage shows without a press", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LINKEDIN_SEARCH(false) }))
  const publicReads: string[] = []
  await context.route("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/**", (route) => {
    const id = route.request().url().split("/").pop()!
    publicReads.push(id)

    return route.fulfill({ contentType: "text/html", body: LINKEDIN_PUBLIC(`Job ${id}`) })
  })
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "added", known: true, saved: false, chance_pct: 6.6, job: { id: "pnew", title: "Job" } }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470000203")
  const badges = page.locator(".odds-job-chance")
  await expect(badges).toHaveCount(3)
  for (const badge of await badges.all()) await expect(badge).toHaveText("6.6%")
  await expect(page.locator("#odds-add")).toContainText("6.6%")
  expect(new Set(publicReads)).toEqual(new Set(["4470000201", "4470000202", "4470000203"]))
  // Each was sent as LinkedIn's public page shows it; odds pays for nothing.
  const sent = fake.analyzed.find((a) => a.url === "https://www.linkedin.com/jobs/view/4470000201/")
  expect(sent?.posting).toMatchObject({ title: "Job 4470000201", company: "Acme", location: "Amsterdam, North Holland, Netherlands", applicants: "Be among the first 25 applicants", seniority: "Internship" })
  expect(fake.analyzed.every((a) => a.posting)).toBe(true)
  expect(fake.calls).toHaveLength(0)
})
