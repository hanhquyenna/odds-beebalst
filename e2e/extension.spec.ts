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
  prompts: Array<{ key: string; label: string; kind: string; options?: string[] }>
  remembered: Record<string, string>
  server: Server
  port: number
  remoteTask?: { id: string; url: string; status: string }
  remoteTasks?: Array<{ id: string; url: string; status: string }>
  reports: Array<{ status?: string; message?: string }>
  /** The adds it was asked for (peeks and pool reads are counted apart). */
  calls: Array<{ auth: string; body: { url?: string; posting?: Record<string, unknown> } }>
  peeks: string[]
  /** The size of each look-up of several jobs at once. */
  batches: number[]
  /** What a form is filled in from (/ext/apply-kit), the answers the person gave that were kept, the jobs marked applied. */
  kit: Record<string, unknown>
  kept: Array<{ question: string; answer: string }>
  applied: string[]
  analyses: string[]
  /** What each analysis was sent: a job page's posting comes with it, a LinkedIn job never. */
  analyzed: Array<{ url?: string; posting?: Record<string, unknown> }>
  answersByUrl: Record<string, Record<string, unknown>>
  analyzeAnswer?: Record<string, unknown>
  addDelays: Record<string, number>
  /** How long look-ups take to answer. */
  peekDelay: number
  pools: number
  sessions: number
  answer: Record<string, unknown>
  peek: Record<string, unknown>
  pool: Record<string, unknown>
}

async function fakeOdds(): Promise<Fake> {
  const fake = {
    calls: [],
    reports: [],
    prompts: [],
    remembered: {},
    peeks: [],
    batches: [],
    kit: {},
    kept: [],
    applied: [],
    analyses: [],
    analyzed: [],
    answersByUrl: {},
    addDelays: {},
    peekDelay: 0,
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
      const body = raw ? (JSON.parse(raw) as { url?: string; urls?: string[]; posting?: Record<string, unknown>; id?: string; ids?: string[]; status?: string; message?: string; questions?: Fake["prompts"] }) : {}
      const path = String(req.url).split("?")[0]
      let answer: Record<string, unknown> = fake.answer
      if (path.endsWith("/ext/application-poll")) {
        const tasks = fake.remoteTasks || (fake.remoteTask ? [fake.remoteTask] : [])
        answer = { task: tasks.find(t => t.status === "filling" && !body.ids?.includes(t.id)) || null, runs: tasks.filter(t => body.ids?.includes(t.id)).map(t => ({ id: t.id, status: t.status })) }
      } else if (path.endsWith("/ext/application-resume")) {
        answer = { run: fake.remoteTask && ["filling", "needs_input", "ready"].includes(fake.remoteTask.status) ? { id: fake.remoteTask.id } : null }
      } else if (path.endsWith("/ext/application-report")) {
        fake.reports.push({ status: body.status, message: body.message })
        const task = fake.remoteTasks?.find(t => t.id === body.id) || fake.remoteTask
        if (task && body.status) task.status = body.status
        answer = { status: "ok" }
      } else if (path.endsWith("/ext/peek") && body.urls) {
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
      } else if (path.endsWith("/ext/apply-kit")) {
        answer = { ...fake.kit }
      } else if (path.endsWith("/ext/application-questions")) {
        fake.prompts = body.questions || []
        answer = { status: "ok" }
      } else if (path.endsWith("/ext/answers") && req.method === "GET") {
        answer = { remembered: fake.remembered }
      } else if (path.endsWith("/ext/answers")) {
        fake.kept.push(...((body as { questions?: Array<{ question: string; answer: string }> }).questions ?? []))
        answer = { saved: 1 }
      } else if (path.endsWith("/ext/applied")) {
        fake.applied.push(String(body.url))
        answer = { status: "applied", id: "papplied" }
      } else if (path.endsWith("/ext/pool")) {
        fake.pools++
        answer = fake.pool
      } else {
        fake.calls.push({ auth, body })
        answer = fake.answersByUrl[`add ${String(body.url)}`] ?? fake.answer
      }
      // The person's CV file, as the real route sends it.
      if (path.endsWith("/ext/file")) {
        res.writeHead(200, { ...cors, "Content-Type": "application/pdf", "X-File-Name": "Kien_Data_CV.pdf", "Access-Control-Expose-Headers": "X-File-Name" }).end("%PDF-1.4 odds test CV")

        return
      }
      const delay = path.endsWith("/ext/add") ? fake.addDelays[String(body.url)] ?? 0 : path.endsWith("/ext/peek") ? fake.peekDelay : 0
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

test("next to LinkedIn's Save button when the page has one, at the edge when it has not; drawn like odds' own chips, in the odds lettering", async ({ context }) => {
  await connect(context)
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
  // The size of LinkedIn's buttons beside it (a 32px pill), and drawn like the app's chips: white, a 1.5px line, ink lettering. The row's own gap spaces it.
  expect(await pill.evaluate((el) => getComputedStyle(el).height)).toBe("32px")
  expect(await pill.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("999px")
  expect(await pill.evaluate((el) => getComputedStyle(el).marginLeft)).toBe("0px")
  expect(await pill.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)")
  expect(await pill.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe("rgb(163, 157, 149)")
  expect(await pill.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(22, 21, 19)")
  expect(await pill.evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed")
  // The odds lettering is loaded from the extension.
  await page.evaluate(() => document.fonts.load('700 15px "odds Inter Tight"'))
  expect(await page.evaluate(() => document.fonts.check('700 15px "odds Inter Tight"'))).toBe(true)
  await page.goto("https://www.linkedin.com/jobs/search/?currentJobId=4470863235")
  await expect(page.locator("#odds-add")).toHaveAttribute("data-where", "float")
  expect(await page.locator("#odds-add").evaluate((el) => getComputedStyle(el).position)).toBe("fixed")
})

test("before connecting the button says Connect; connected, it shows your chance before anything is saved, then opens the job without saving", async ({ context, fake }) => {
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
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "idle")
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  expect(fake.calls).toHaveLength(0)
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
  expect(fake.calls).toHaveLength(0)
  await expect(page.locator("#odds-panel-frame")).toHaveCount(0)
  // Pressing it again, now that the job is kept, shows the side panel again and adds nothing.
  await page.locator("#odds-add").click()
  expect(fake.calls).toHaveLength(0)
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

test("a failed read is explained in the panel without saving; a missing CV is explained on the badge", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "limit", message: "Up to 30 new jobs a day." }
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "problem")
  await page.locator("#odds-add").click()
  await expect(page.frameLocator("#odds-panel-frame").locator("#note")).toContainText("Up to 30 new jobs a day.")
  expect(fake.calls).toHaveLength(0)
  fake.peek = { known: true, id: "pabc", saved: false, chance_pct: null, needs_profile: true }
  await page.goto("https://www.linkedin.com/jobs/view/4470000222/")
  await expect(page.locator("#odds-add")).toHaveAttribute("title", /Import your LinkedIn profile or add a CV/)
  await expect(page.locator("#odds-add")).toHaveText("Add CV")
  const opened = context.waitForEvent("page")
  await page.locator("#odds-add").click()
  await expect(await opened).toHaveURL("https://odds.beeblast.co/profile")
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
  fake.peek = { known: true, saved: false, chance_pct: 4.4, job: { id: "e2e-adyen-fin-analyst", title: "Junior Financial Analyst" } }
  await connect(context)
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("4.4%")
  await page.locator("#odds-add").click()
  const panel = page.frameLocator("#odds-panel-frame")
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  // The job drops in over the app.
  await expect(panel.locator("#note")).not.toBeVisible()
  // The app itself loaded in the frame under it (not refused), and was signed in by the extension: it shows the job's page.
  const app = panel.frameLocator("#app")
  await expect(app.getByRole("heading", { name: "Junior Financial Analyst" }).first()).toBeVisible({ timeout: 25000 })
  expect(fake.sessions).toBeGreaterThanOrEqual(1)
  await shot(page, "ext-panel-app")
  // Each application opens in a new tab, preserving the job and any existing forms.
  await context.route("https://jobs.example.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>Apply</h1>" }))
  const openedApplication = context.waitForEvent("page")
  await app.getByRole("button", { name: /Apply with Odds/ }).click()
  const application = await openedApplication
  await application.waitForURL("https://jobs.example.com/e2e-adyen-fin-analyst", { timeout: 10000 })
  expect(page.url()).toBe(JOB)
  expect(page.isClosed()).toBe(false)
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

test("job-list percentages open the selected unsaved job in the real Odds app, without adding another job", async ({ context, fake }) => {
  await connect(context)
  const first = "https://www.linkedin.com/jobs/view/4470000101/"
  const second = "https://www.linkedin.com/jobs/view/4470000102/"
  fake.answersByUrl[first] = { known: true, saved: false, chance_pct: 12.3, job: { id: "e2e-adyen-fin-analyst", title: "Junior Financial Analyst" } }
  fake.answersByUrl[second] = { known: true, saved: false, chance_pct: 7.8, job: { id: FLOW_POSTINGS[1].id, title: FLOW_POSTINGS[1].title } }
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
  const openedAt = await page.frameLocator("#odds-panel-frame").frameLocator("#app").locator("body").evaluate(e => e.ownerDocument.defaultView!.performance.timeOrigin)
  await badges.nth(1).click()
  await expect(app.getByRole("heading", { name: FLOW_POSTINGS[1].title, exact: true })).toBeVisible({ timeout: 15000 })
  expect(await app.locator("body").evaluate(e => e.ownerDocument.defaultView!.performance.timeOrigin)).toBe(openedAt)
  expect(fake.pools).toBe(0)
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
  fake.answersByUrl["https://www.linkedin.com/jobs/view/4470000103/"] = { known: true, saved: true, chance_pct: 23.4, job: { id: "third", title: "Third job" } }
  await expect(card.locator(".odds-job-chance")).toHaveAttribute("data-job-id", "4470000103")
  await expect(card.locator(".odds-job-chance")).toContainText("23.4%")
  await card.locator(".odds-job-chance").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  await expect(page.frameLocator("#odds-panel-frame").locator("#note")).toContainText("Third job")
  expect(fake.peeks.filter((url) => url.includes("4470000103"))).toHaveLength(1)
  expect(fake.calls).toHaveLength(0)
})

test("unknown visible jobs are enriched without saving; clicking views the clicked job after page navigation", async ({ context, fake }) => {
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
  expect(fake.calls).toHaveLength(0)
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
})

test("missing profiles and read limits display explanations instead of made-up percentages", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, needs_profile: true, chance_pct: null }
  await context.route("https://www.linkedin.com/jobs/search/**", (route) => route.fulfill({ contentType: "text/html", body: LIST_PAGE }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/search/")
  await expect(page.locator(".odds-job-chance").first()).toHaveAttribute("title", "Import your LinkedIn profile or add a CV in Odds to calculate your interview chance")
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "limit", message: "Up to 30 new jobs a day." }
  await page.reload()
  await expect(page.locator(".odds-job-chance").first()).toHaveText("Retry")
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

test("Indeed: pressing the button keeps the job, sending it as its page shows it; a job that cannot be read first says Check and a click retries reading without saving", async ({ context, fake }) => {
  await connect(context)
  await indeed(context)
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "unreadable", message: "odds could not read that job page." }
  fake.answer = { status: "added", saved: true, chance_pct: 6.2, job: { id: "pind1", title: "Data Intern" } }
  const page = await context.newPage()
  await page.goto("https://nl.indeed.com/jobs?q=internship&vjk=aaaaaaaaaaaaaaa1")
  await expect(page.locator("#odds-add")).toHaveText("Check")
  await expect(page.locator("#odds-add")).toHaveAttribute("title", /does not have this job yet/)
  fake.analyzeAnswer = { status: "added", saved: false, chance_pct: 6.2, job: { id: "pind1", title: "Data Intern" } }
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "idle")
  await expect(page.locator("#odds-add")).toContainText("6.2%")
  expect(fake.calls).toHaveLength(0)
  expect(fake.analyzed.some(a => a.url === INDEED_FIRST && a.posting?.company === "Acme")).toBe(true)
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

  // Pressing it views the enriched job without saving it.
  fake.answersByUrl[`add ${GLASSDOOR_SECOND}`] = { status: "exists", saved: true, chance_pct: 3.3, job: { id: "pgd2", title: "Finance Intern" } }
  await badges.nth(1).click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true")
  expect(fake.calls).toHaveLength(0)
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

/**
 * LinkedIn's Easy Apply as it is built in October 2026: a modal (data-test-modal-id="easy-apply-modal") with one step at a time, each question in
 * a data-test-form-element, "Continue to next step", then "Review your application", then "Submit application" (data-live-test-easy-apply-submit-button),
 * and "Your application was sent" when it is sent. LinkedIn fills email and the phone's country itself.
 */
const EASY_APPLY = `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
<section class="jobs-search__job-details"><h1><a href="/jobs/view/4470000301/">Data Intern</a></h1><div style="display:flex;gap:8px"><div><button id="jobs-apply-button-id" aria-label="Easy Apply to Data Intern at Acme">Easy Apply</button></div><div><button class="jobs-save-button">Save</button></div></div></section>
</main><script>
const steps = [
  { title: "Contact info", html: \`
    <div data-test-form-element><label for="email">Email Email</label><select id="email" required><option>Select an option</option><option selected>kien@example.com</option></select></div>
    <div data-test-form-element><label for="cc">Phone country code Phone country code</label><select id="cc"><option>Select an option</option><option selected>Netherlands (+31)</option></select></div>
    <div data-test-form-element><label for="phone">Mobile phone number</label><input id="phone" type="text" required></div>\` },
  { title: "Resume", html: \`
    <input type="radio" name="cv" id="jobsDocumentCardToggle-1" aria-label="Deselect resume Kien_Old_CV.pdf" checked>
    <input type="radio" name="cv" id="jobsDocumentCardToggle-2" aria-label="Select resume Kien_Data_CV.pdf">\` },
  { title: "Additional Questions", html: \`
    <div data-test-form-element><label for="dutch">What is your level of proficiency in Dutch? What is your level of proficiency in Dutch?</label><select id="dutch"><option>Select an option</option><option>None</option><option>Conversational</option><option>Professional</option><option>Native or bilingual</option></select></div>
    <div data-test-form-element><fieldset><legend><span data-test-form-builder-radio-button-form-component__title>Will you now or in the future require visa sponsorship?</span></legend><input type="radio" name="sp" id="sp-yes"><label for="sp-yes">Yes</label><input type="radio" name="sp" id="sp-no"><label for="sp-no">No</label></fieldset></div>
    <div data-test-form-element><label for="sql">How many years of work experience do you have with SQL?</label><input id="sql" type="text" class="numeric"></div>\` },
  { title: "Review your application", html: "<p>Review</p>" },
]
let at = 0
window.submits = 0
window.seen = {}
function draw() {
  const modal = document.querySelector("[data-test-modal-id=easy-apply-modal]")
  const last = at === steps.length - 1
  modal.querySelector(".artdeco-modal__content").innerHTML = "<h3>" + steps[at].title + "</h3>" + steps[at].html
  modal.querySelector(".buttons").innerHTML = last ? '<button data-live-test-easy-apply-submit-button aria-label="Submit application">Submit application</button>' : '<button data-easy-apply-next-button aria-label="' + (at === steps.length - 2 ? "Review your application" : "Continue to next step") + '">Next</button>'
}
document.addEventListener("click", (event) => {
  const b = event.target.closest("button")
  if (!b) return
  if (b.id === "jobs-apply-button-id") {
    document.body.insertAdjacentHTML("beforeend", '<div data-test-modal-id="easy-apply-modal" role="dialog"><div class="artdeco-modal__content"></div><div class="buttons"></div></div>')
    draw()
  }
  if (b.hasAttribute("data-easy-apply-next-button")) {
    for (const el of document.querySelectorAll("[data-test-modal-id=easy-apply-modal] input, [data-test-modal-id=easy-apply-modal] select")) window.seen[el.id] = el.type === "radio" ? el.checked : el.value
    setTimeout(() => { at++; draw() }, 150)
  }
  if (b.hasAttribute("data-live-test-easy-apply-submit-button")) {
    window.submits++
    document.querySelector("[data-test-modal-id=easy-apply-modal]").remove()
    document.body.insertAdjacentHTML("beforeend", '<div role="dialog">Your application was sent to Acme!</div>')
  }
})
</script></body></html>`

test("Easy Apply with odds: filled in from odds, the job's own CV chosen, a new question kept once answered, stopped before Submit, marked applied when sent", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000301/**", (route) => route.fulfill({ contentType: "text/html", body: EASY_APPLY }))
  fake.peek = { known: true, id: "papply", saved: true, chance_pct: 8.8 }
  fake.kit = {
    job_id: "papply",
    facts: { name: "Kien Phung", email: "kien@example.com", phone: "+31 6 1234 5678", place: "Amsterdam, Netherlands", dutch: "basic", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} },
    cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true },
  }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000301/")
  await page.locator("#jobs-apply-button-id").click()
  const modal = page.locator("[data-test-modal-id=easy-apply-modal]")
  // Step 1 and 2 are complete once odds has filled them in: it goes on by itself, to the questions.
  await expect(modal.locator("h3")).toHaveText("Additional Questions", { timeout: 10000 })
  expect(await page.evaluate(() => (window as unknown as { seen: Record<string, unknown> }).seen)).toMatchObject({ phone: "612345678", "jobsDocumentCardToggle-2": true, "jobsDocumentCardToggle-1": false })
  // What odds knows is answered; what it does not is marked and left for the person.
  await expect(modal.locator("#dutch")).toHaveValue("Conversational")
  await expect(modal.locator("#sp-no")).toBeChecked()
  await expect(modal.locator(".odds-apply-bar")).toContainText("Answer the marked question")
  await expect(modal.locator("[data-test-form-element].odds-ask")).toHaveCount(1)
  await expect(modal.locator("[data-test-form-element].odds-ask label")).toContainText("SQL")
  await modal.locator("#sql").fill("3")
  await modal.getByRole("button", { name: "Review your application" }).click()
  // The person's own answer is kept for the next form.
  await expect.poll(() => fake.kept).toEqual([{ question: "How many years of work experience do you have with SQL?", answer: "3" }])
  // At the review odds stops: Submit is the person's.
  await expect(modal.locator(".odds-apply-bar")).toContainText("press Submit yourself", { timeout: 8000 })
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { submits: number }).submits)).toBe(0)
  await shot(page, "ext-easy-apply")
  await modal.getByRole("button", { name: "Submit application" }).click()
  await expect.poll(() => fake.applied, { timeout: 8000 }).toEqual(["https://www.linkedin.com/jobs/view/4470000301/"])
})

/** Opens a page as "odds apply" in the panel would: the background is told this tab applies to `job`, and the page is loaded again. */
async function applyFrom(context: BrowserContext, page: import("@playwright/test").Page, job: string): Promise<void> {
  const worker = context.serviceWorkers()[0]
  await worker.evaluate(async ([url, job]) => {
    const api = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<Array<{ id: number; url?: string }>> } } }).chrome
    const tabs = await api.tabs.query({})
    const tab = tabs.find((t) => t.url === url) ?? tabs[tabs.length - 1]
    await (globalThis as unknown as { setIntent(id: number, it: object): Promise<void> }).setIntent(tab.id, { job, at: Date.now() })
  }, [page.url(), job])
  await page.reload()
}

/** An employer's application form as Greenhouse and Lever draw it: labelled fields, a CV upload, a select, a free-text question, Submit. */
const EMPLOYER_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Data Intern</h1>
<form id="application" onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <label for="first_name">First Name *</label><input id="first_name" name="first_name" required>
  <label for="last_name">Last Name *</label><input id="last_name" name="last_name" required>
  <label for="email">Email *</label><input id="email" type="email" required>
  <label for="phone">Phone</label><input id="phone" type="tel">
  <label for="resume">Resume/CV *</label><input id="resume" type="file" required>
  <label for="li">LinkedIn Profile</label><input id="li" name="urls[LinkedIn]">
  <label for="auth">Are you legally authorized to work in the Netherlands? *</label><select id="auth" required><option>Please select</option><option>Yes</option><option>No</option></select>
  <label for="sql">How many years of experience do you have with SQL? *</label><input id="sql" required>
  <label for="why">Why do you want to work at Acme?</label><textarea id="why"></textarea>
  <button type="submit">Submit application</button>
</form></main></body></html>`

test("odds apply on an employer's own form: filled in from odds, the CV uploaded, the unknown question outlined and kept once answered, never sent by odds", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://boards.example-ats.com/acme/jobs/123**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = { job_id: "pemp", facts: { name: "Kien Phung", email: "kien@example.com", linkedin: "https://www.linkedin.com/in/kien", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true } }
  const page = await context.newPage()
  await page.goto("https://boards.example-ats.com/acme/jobs/123")
  // Not opened to apply: odds does nothing to a form.
  await page.waitForTimeout(1500)
  await expect(page.locator("#first_name")).toHaveValue("")
  await applyFrom(context, page, "https://boards.example-ats.com/acme/jobs/123")
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  await expect(page.locator("#last_name")).toHaveValue("Phung")
  await expect(page.locator("#email")).toHaveValue("kien@example.com")
  await expect(page.locator("#phone")).toHaveValue("+31 6 1234 5678")
  await expect(page.locator("#li")).toHaveValue("https://www.linkedin.com/in/kien")
  await expect(page.locator("#auth")).toHaveValue("Yes")
  await expect.poll(() => page.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? "")).toBe("Kien_Data_CV.pdf")
  // Odds does not answer what it does not know, nor write the person's motivation.
  await expect(page.locator("#why")).toHaveValue("")
  await expect(page.locator(".odds-ask")).toHaveCount(1)
  await expect(page.locator(".odds-apply-bar")).toContainText("outlined question")
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  await page.locator("#sql").fill("3")
  await page.getByRole("button", { name: "Submit application" }).click()
  await expect.poll(() => fake.kept).toEqual([{ question: "How many years of experience do you have with SQL?", answer: "3" }])
  await shot(page, "ext-employer-form")
})

test("odds apply on a LinkedIn job: Easy Apply is pressed by odds and filled in, the rest as when the person presses it", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000301/**", (route) => route.fulfill({ contentType: "text/html", body: EASY_APPLY }))
  fake.peek = { known: true, id: "papply", saved: true, chance_pct: 8.8 }
  fake.kit = { job_id: "papply", facts: { name: "Kien Phung", email: "kien@example.com", dutch: "basic", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: { "how many years of work experience do you have with sql": "3" } }, cv: null }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000301/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000301")
  const modal = page.locator("[data-test-modal-id=easy-apply-modal]")
  // Everything known (the SQL years remembered from an earlier form): odds goes all the way to the review, and stops there.
  await expect(modal.locator(".odds-apply-bar")).toContainText("press Submit yourself", { timeout: 12000 })
  expect(await page.evaluate(() => (window as unknown as { submits: number }).submits)).toBe(0)
  // Back on the job later, it is not started again.
  await page.reload()
  await page.waitForTimeout(2500)
  await expect(modal).toHaveCount(0)
})

/** LinkedIn's newer job page as it is drawn since autumn 2026 (hashed classes, captured from the real page): the job's chips link to the job
 *  itself, Apply and Save are plain buttons named by aria-label, Easy Apply is a <dialog> whose questions are named on the field or the choice. */
const NEW_LINKEDIN = (apply: string): string => `<!doctype html><html><head><meta charset="utf-8"></head><body><main>
<h1>Data Intern</h1><p>Acme · Amsterdam</p>
<div class="chips"><a href="https://www.linkedin.com/jobs/view/4470000302/" style="display:inline-block;padding:6px 12px;border:1px solid #333;border-radius:999px">On-site</a>
<a href="https://www.linkedin.com/jobs/view/4470000302/" style="display:inline-block;padding:6px 12px;border:1px solid #333;border-radius:999px">Full-time</a></div>
<div class="row" style="display:flex;gap:8px;margin-top:12px"><button class="hcb1" aria-label="${apply}" style="height:40px;border-radius:999px;padding:0 16px;background:#0a66c2;color:#fff;border:0">${apply.startsWith("Easy") ? "Easy Apply" : "Apply"}</button><button class="hcb1" aria-label="Save the job" style="height:40px;border-radius:999px;padding:0 16px">Save</button></div>
</main>
<script>
const steps = [
  { title: "Contact info", html: \`<div><label for="_r_1">Email address*</label><select id="_r_1" required><option></option><option>kien@example.com</option></select></div>
    <div><label for="_r_2">Phone country code*</label><select id="_r_2" required><option></option><option value="nl">Netherlands (+31)</option></select></div>
    <div><label for="_r_3">Mobile phone number*</label><input id="_r_3" type="tel" required></div>\` },
  { title: "Resume", html: \`<fieldset role="radiogroup"><div role="radio" aria-label="Kien_Old_CV.pdf"><input id="_r_4" type="radio" name="cv" checked><label for="_r_4"></label></div>
    <div role="radio" aria-label="Kien_Data_CV.pdf"><input id="_r_5" type="radio" name="cv"><label for="_r_5"></label></div></fieldset>\` },
  { title: "Additional Questions", html: \`<div><label for="_r_6">What is your level of proficiency in Dutch?*</label><select id="_r_6" required><option>Select an option</option><option>None</option><option>Conversational</option><option>Professional</option></select></div>
    <fieldset role="radiogroup"><div><div role="radio" aria-label="Will you now or in the future require visa sponsorship?"><input id="_r_7" type="radio" name="sp"><label for="_r_7"></label><p>Yes</p></div>
    <div role="radio" aria-label="Will you now or in the future require visa sponsorship?"><input id="_r_8" type="radio" name="sp"><label for="_r_8"></label><p>No</p></div></div></fieldset>
    <div><p>Hoeveel jaar werk je al met SQL? *</p><div><div><input id="_r_9" required aria-label="Hoeveel jaar werk je al met SQL? " type="text"></div><div><p>0/20</p></div></div></div>\` },
  { title: "Review your application", html: "<p>Review</p>" },
]
let at = 0
window.submits = 0
window.seen = {}
function draw() {
  const d = document.querySelector("dialog[data-testid=dialog]")
  const last = at === steps.length - 1
  d.querySelector(".body").innerHTML = "<h3>" + steps[at].title + "</h3>" + steps[at].html
  d.querySelector(".buttons").innerHTML = '<button aria-label="Dismiss">x</button>' + (last ? "<button>Submit application</button>" : at === steps.length - 2 ? "<button>Review</button>" : "<button>Next</button>")
}
document.addEventListener("click", (event) => {
  const b = event.target.closest("button")
  if (!b) return
  const label = (b.getAttribute("aria-label") || b.innerText).trim()
  if (label === "Easy Apply to this job") {
    document.body.insertAdjacentHTML("beforeend", '<dialog data-testid="dialog" aria-labelledby="dialog-header"><header><h2 id="dialog-header">Apply to Acme</h2></header><div class="body"></div><div class="buttons"></div></dialog>')
    document.querySelector("dialog").showModal()
    draw()
  }
  if (label === "Apply on company website") window.pressedOffsite = true
  if (label === "Next" || label === "Review") {
    for (const el of document.querySelectorAll("dialog input, dialog select")) window.seen[el.id] = el.type === "radio" ? el.checked : el.value
    setTimeout(() => { at++; draw() }, 150)
  }
  if (label === "Submit application") window.submits++
})
</script><iframe src="https://www.linkedin.com/preload/?_bprMode=vanilla" style="opacity:0;z-index:-1;position:absolute;top:0;width:100vw;height:100vh"></iframe></body></html>`

test("LinkedIn's newer job page: no badge on the job's own chips, and odds apply presses Easy Apply and fills its dialog in, stopping before Submit", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000302/**", (route) => route.fulfill({ contentType: "text/html", body: NEW_LINKEDIN("Easy Apply to this job") }))
  fake.peek = { known: true, id: "pnew", saved: true, chance_pct: 14.1 }
  fake.kit = { job_id: "pnew", facts: { name: "Kien Phung", email: "kien@example.com", dutch: "basic", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true } }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000302/")
  // One button, beside Save; none on "On-site" or "Full-time".
  await expect(page.locator("#odds-add")).toContainText("14.1%")
  await page.waitForTimeout(800)
  await expect(page.locator(".odds-job-chance")).toHaveCount(0)
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  const dialog = page.locator("dialog[data-testid=dialog]")
  await expect(dialog.locator("h3")).toHaveText("Additional Questions", { timeout: 12000 })
  expect(await page.evaluate(() => (window as unknown as { seen: Record<string, unknown> }).seen)).toMatchObject({ _r_3: "612345678", _r_5: true, _r_4: false })
  await expect(dialog.locator("#_r_6")).toHaveValue("Conversational")
  await expect(dialog.locator("#_r_8")).toBeChecked()
  // The question named only on its field is outlined, by its words.
  await expect(dialog.locator(".odds-apply-bar")).toContainText("Answer the marked question")
  await expect(dialog.locator(".odds-ask")).toHaveCount(1)
  await expect(dialog.locator(".odds-ask")).toContainText("SQL")
  await dialog.locator("#_r_9").fill("3")
  await dialog.getByRole("button", { name: "Review" }).click()
  await expect.poll(() => fake.kept).toEqual([{ question: "Hoeveel jaar werk je al met SQL?", answer: "3" }])
  await expect(dialog.locator(".odds-apply-bar")).toContainText("press Submit yourself", { timeout: 8000 })
  await page.waitForTimeout(1200)
  expect(await page.evaluate(() => (window as unknown as { submits: number }).submits)).toBe(0)
  await shot(page, "ext-easy-apply-new")
})

test("odds apply on a LinkedIn job applied for on the employer's site: their form opens in the same tab and is filled in there", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000302/**", (route) => route.fulfill({ contentType: "text/html", body: NEW_LINKEDIN("Apply on company website") }))
  await context.route("https://www.linkedin.com/voyager/api/jobs/jobPostings/4470000302", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ applyMethod: { "com.linkedin.voyager.jobs.OffsiteApply": { companyApplyUrl: "https://boards.example-ats.com/acme/jobs/123" } } }) }))
  await context.route("https://boards.example-ats.com/acme/jobs/123**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  await context.addCookies([{ name: "JSESSIONID", value: '"ajax:123"', domain: ".www.linkedin.com", path: "/" }])
  fake.peek = { known: true, id: "pnew", saved: true, chance_pct: 14.1 }
  fake.kit = { job_id: "pnew", facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: null }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000302/")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  await expect(page).toHaveURL("https://boards.example-ats.com/acme/jobs/123", { timeout: 12000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  await expect(page.locator("#auth")).toHaveValue("Yes")
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
})

test("clicking a loading percentage shows a pending job immediately and never starts a save request", async ({ context, fake }) => {
  await connect(context)
  fake.peekDelay = 1800
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toHaveAttribute("data-state", "busy")
  await page.locator("#odds-add").click()
  await expect(page.locator("#odds-panel-frame")).toHaveAttribute("data-open", "true", { timeout: 1500 })
  await expect(page.frameLocator("#odds-panel-frame").locator("#note")).toContainText("Reading the full job")
  await expect(page.locator("#odds-add")).toContainText("4.4%", { timeout: 6000 })
  expect(fake.calls).toHaveLength(0)
  expect(fake.peeks).toHaveLength(1)
})


test("phone preparation is opt-in, opens one dedicated desktop tab, reports readiness, never submits, and cancels", async ({ context, fake }) => {
  await connect(context)
  fake.remoteTask = { id: "a1111111-1111-4111-8111-111111111111", url: "https://careers.example.org/apply/finance", status: "filling" }
  fake.kit = { facts: { name: "Test Person", email: "test@example.com", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<form onsubmit="window.sent=true;return false"><label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label><button type="submit">Submit application</button></form><script>window.sent=false</script>' }))
  const worker = context.serviceWorkers()[0]
  const before = context.pages().length
  await worker.evaluate("pollApplications()")
  expect(context.pages()).toHaveLength(before)
  const opened = context.waitForEvent("page")
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const application = await opened
  await application.waitForURL(fake.remoteTask.url)
  await expect(application.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person", { timeout: 15000 })
  await expect(application.getByRole("textbox", { name: "Email" })).toHaveValue("test@example.com")
  await expect.poll(() => fake.reports.some(r => r.status === "ready")).toBe(true)
  expect(await application.evaluate("window.sent")).toBe(false)
  const pages = context.pages().length
  await worker.evaluate("pollApplications()")
  await worker.evaluate("pollApplications()")
  expect(context.pages()).toHaveLength(pages)
  fake.remoteTask.status = "cancelled"
  await worker.evaluate("pollApplications()")
  await expect.poll(() => application.isClosed()).toBe(true)
})

test("phone to desktop end-to-end: request, autofill, progress on phone, and disconnect preserves the filled tab", async ({ context, fake }) => {
  await connect(context)
  const post = FLOW_POSTINGS[0]
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.unroute("https://odds.beeblast.co/**")
  await context.route(/^chrome-extension:/, route => route.continue())
  await context.route("https://odds.beeblast.co/**", route => route.continue())
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: fake.remoteTask ? [{ ...fake.remoteTask, posting_id: post.id, message: fake.reports.at(-1)?.message || "Waiting for your desktop." }] : [] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test" }] }))
  await context.route("**/rest/v1/rpc/request_application", route => {
    fake.remoteTask = { id: "b1111111-1111-4111-8111-111111111111", url: "https://careers.example.org/apply", status: "filling" }
    return route.fulfill({ json: { ...fake.remoteTask, posting_id: post.id, message: "Waiting for your desktop." } })
  })
  fake.kit = { facts: { name: "Test Person", email: "test@example.com", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<form><label>Full name<input name="name" required></label><label>Describe your most relevant project<input name="project" required></label><button type="submit">Submit application</button></form>' }))
  const phone = await context.newPage()
  await phone.setViewportSize({ width: 390, height: 844 })
  await phone.goto(`http://localhost:4319/job/${post.id}`)
  await phone.getByRole("button", { name: "Apply with Odds" }).click()
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const desktop = await opened
  await expect(desktop.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person", { timeout: 10000 })
  await expect(desktop.getByRole("textbox", { name: "Describe your most relevant project" })).toHaveValue("")
  await expect.poll(() => fake.reports.some(r => r.status === "needs_input")).toBe(true)
  await expect(phone.getByRole("status").filter({ hasText: "outlined question" })).toBeVisible({ timeout: 10000 })
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: false }))
  expect(desktop.isClosed()).toBe(false)
  await expect.poll(() => fake.remoteTask?.status).toBe("failed")
})

test("phone preparation pauses at a login form without filling or submitting credentials", async ({ context, fake }) => {
  await connect(context)
  fake.remoteTask = { id: "c1111111-1111-4111-8111-111111111111", url: "https://careers.example.org/signin", status: "filling" }
  fake.kit = { facts: { name: "Test Person", email: "test@example.com", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<title>Sign in</title><h1>Sign in</h1><form><label>Email<input name="email" type="email"></label><label>Password<input type="password"></label><button>Sign in</button></form>' }))
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const page = await opened
  await expect.poll(() => fake.reports.some(r => r.status === "needs_input")).toBe(true)
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("")
  await expect(page.locator('input[type="password"]')).toHaveValue("")
  await expect(page.locator(".odds-apply-bar")).toContainText("Complete the login or verification on your desktop")
})

test("a real employer form with sibling labels, example placeholders and nested CV upload fills correctly without touching its honeypot or consent", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Kien Phung", email: "kien@example.com", answers: { first_name: "Kien", last_name: "Phung" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555" } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: `<h1>Sales intern</h1><form onsubmit="window.sent=true;return false">
    <div><label>First name <span>*</span></label><input placeholder="Lotte" autocomplete="given-name"></div>
    <div><label>Last name *</label><input placeholder="de Vries" autocomplete="family-name"></div>
    <div><label>Email *</label><input type="email" placeholder="name@example.com"></div>
    <div><label>CV *</label><div><label>Upload file<input type="file" style="display:none" accept=".pdf"></label></div></div>
    <input name="company_url" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">
    <button type="button" role="checkbox" aria-checked="false">I agree to processing my data</button><button type="submit">Send application</button></form><script>window.sent=false</script>` }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/apply")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  await expect(page.getByPlaceholder("Lotte")).toHaveValue("Kien")
  await expect(page.getByPlaceholder("de Vries")).toHaveValue("Phung")
  await expect(page.getByPlaceholder("name@example.com")).toHaveValue("kien@example.com")
  await expect.poll(() => page.locator('input[type="file"]').evaluate((e: HTMLInputElement) => e.files?.length)).toBe(1)
  await expect(page.locator('[name="company_url"]')).toHaveValue("")
  await expect(page.getByRole("checkbox")).toHaveAttribute("aria-checked", "false")
  await expect(page.locator(".odds-apply-bar")).toContainText("confirm the consent yourself")
  expect(await page.evaluate("window.sent")).toBe(false)
})

test("an enriched job outside the loaded pool opens from one row without saving, with CV selection and apply available", async ({ context, fake }) => {
  await connect(context)
  await context.addInitScript(() => localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", origin: "non_eu", dutch: "basic" })))
  await context.addInitScript(() => localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", origin: "non_eu", dutch: "basic" })))
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  const post = { ...FLOW_POSTINGS[0], id: "just-enriched-job", title: "Newly read Finance Intern" }
  fake.peek = { known: false }
  fake.analyzeAnswer = { status: "added", known: true, saved: false, chance_pct: 8.1, job: { id: post.id, title: post.title } }
  await mockBackend(context, FLOW_POSTINGS.slice(1), [], true)
  await context.unroute("https://odds.beeblast.co/**")
  await context.route(/^chrome-extension:/, route => route.continue())
  await context.route("https://odds.beeblast.co/**", route => route.continue())
  await context.route("**/rest/v1/postings?**", route => route.fulfill({ json: [post] }))
  await context.route("**/rest/v1/employer_glassdoor_pay?**", route => route.fulfill({ json: [{ employer: post.employer, position: post.title, reports: 17, pay_min: 2500, pay_max: 3500, unit: "month", read_on: "2026-10-14" }] }))
  await context.route("https://www.linkedin.com/jobs/view/**", route => route.fulfill({ contentType: "text/html", body: JOB_PAGE("New job") }))
  const page = await context.newPage()
  await page.goto(JOB)
  await expect(page.locator("#odds-add")).toContainText("8.1%")
  await page.locator("#odds-add").click()
  const app = page.frameLocator("#odds-panel-frame").frameLocator("#app")
  await expect(app.getByRole("heading", { name: post.title, exact: true })).toBeVisible({ timeout: 15000 })
  await expect(app.getByRole("button", { name: "Save this job", exact: true })).toBeVisible()
  await expect(app.getByRole("button", { name: "Apply with Odds", exact: true })).toBeVisible()
  await expect(app.getByLabel("Choose a cv from your library", { exact: true })).toBeVisible()
  expect(fake.calls).toHaveLength(0)
  expect(fake.analyses).toHaveLength(1)
})

test("Apply with Odds in the desktop website starts the installed extension directly, acknowledges, fills a new tab and leaves the app open", async ({ context, fake }) => {
  await connect(context)
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.unroute("https://odds.beeblast.co/**")
  await context.route(/^chrome-extension:/, route => route.continue())
  await context.route("https://odds.beeblast.co/**", route => route.continue())
  await context.route("https://jobs.example.com/**", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>First name *<input name="first_name" required></label><label>Phone<input name="phone"></label><button type="submit">Send application</button></form>' }))
  fake.kit = { facts: { name: "Example User", answers: { first_name: "Given Names", last_name: "Family", phone: "+31 6 12345678" }, remembered: {} } }
  const app = await context.newPage()
  await app.goto(`https://odds.beeblast.co/job/${FLOW_POSTINGS[0].id}`)
  const opened = context.waitForEvent("page")
  await app.getByRole("button", { name: "Apply with Odds", exact: true }).click()
  const application = await opened
  await expect(application.getByRole("textbox", { name: "First name" })).toHaveValue("Given Names", { timeout: 10000 })
  await expect(application.getByRole("textbox", { name: "Phone" })).toHaveValue("+31 6 12345678")
  expect(app.url()).toContain("odds.beeblast.co/job/")
  const pageCount = context.pages().length
  await app.getByRole("button", { name: "Apply with Odds", exact: true }).click()
  await expect(application.getByRole("textbox", { name: "First name" })).toHaveValue("Given Names")
  expect(context.pages()).toHaveLength(pageCount)
  expect(application.isClosed()).toBe(false)
  await expect(application.getByRole("textbox", { name: "Phone" })).toHaveValue("+31 6 12345678")
  expect(fake.calls).toHaveLength(0)
})

for (const [name, form] of [
  ["Greenhouse", '<div class="field"><label for="n">First name *</label><input id="n" required></div>'],
  ["Lever", '<div class="application-question"><div class="application-label">First name *</div><input required></div>'],
  ["Ashby", '<div class="ashby-application-form-field"><label>First name *</label><input required></div>'],
  ["Workday", '<div data-automation-id="formField-firstName"><label>First name *</label><input data-automation-id="firstName" required></div>'],
  ["Personio", '<div class="form-group"><label for="n">First name *</label><input id="n" required></div>'],
  ["Recruitee", '<div class="field"><input aria-label="First name" required></div>'],
  ["Teamtailor", '<label>First name *<input required></label>'],
  ["SmartRecruiters", '<div class="form-group"><label id="n-label">First name *</label><input aria-labelledby="n-label" required></div>'],
] as const) {
  test(`autofill compatibility: ${name} field markup is filled and verified`, async ({ context, fake }) => {
    await connect(context)
    fake.kit = { facts: { email: "test@example.com", answers: { first_name: "Chi Kien", last_name: "Phung", phone: "+31 6 12345678" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555" } }
    await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: `<h1>Application</h1><form>${form}<label>Last name<input name="family" required></label><label>Email<input type="email" required></label><label>Phone<input type="tel" required></label><label>CV<input type="file" required></label><button type="submit">Send application</button></form>` }))
    const page = await context.newPage()
    await page.goto("https://careers.example.org/apply")
    await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
    await expect(page.locator("form input").first()).toHaveValue("Chi Kien")
    await expect(page.getByLabel("Last name")).toHaveValue("Phung")
    await expect(page.getByLabel("Email")).toHaveValue("test@example.com")
    await expect(page.getByLabel("Phone")).toHaveValue("+31 6 12345678")
    await expect.poll(() => page.locator('input[type="file"]').evaluate((e: HTMLInputElement) => e.files?.length)).toBe(1)
    await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "done")
  })
}

test("a website rejecting a filled value or CV never reports ready", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { answers: { first_name: "Chi Kien" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555" } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>First name *<input required oninput="this.value=\'\'"></label><label>CV *<input type="file" required onchange="this.setAttribute(\'aria-invalid\',\'true\')"></label><button>Send application</button></form>' }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/apply")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask")
  await expect(page.locator(".odds-apply-bar")).not.toHaveAttribute("data-state", "done")
  await expect(page.locator('input[type="file"]')).toHaveAttribute("aria-invalid", "true")
})

test("an unsupported required custom dropdown pauses instead of reporting success", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { answers: { first_name: "Chi Kien" }, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>First name<input></label><div role="combobox" aria-required="true">Choose a country</div><button>Send application</button></form>' }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/apply")
  await applyFrom(context, page, "https://www.linkedin.com/jobs/view/4470000302")
  await expect(page.locator(".odds-apply-bar")).toHaveAttribute("data-state", "ask")
})


test("Indeed listing search fields never count as a filled application; employer Apply opens and fills the actual form", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", email: "test@example.com", answers: {}, remembered: {} } }
  await context.route("https://nl.indeed.com/viewjob?jk=listing-test", route => route.fulfill({ contentType: "text/html", body: `<h1>Management Intern</h1><form action="/jobs"><label>Wat<input id="text-input-what" value="intern"></label><label>Waar<input id="text-input-where" value="Utrecht"></label><button>Zoeken</button></form><a href="https://careers.example.org/actual-application">Solliciteer op website van werkgever</a>` }))
  await context.route("https://careers.example.org/actual-application", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>Full name<input name="full_name" required></label><label>Email<input type="email" required></label><button type="submit">Submit application</button></form>' }))
  const page = await context.newPage()
  await page.goto("https://nl.indeed.com/viewjob?jk=listing-test")
  await applyFrom(context, page, page.url())
  await expect(page).toHaveURL("https://careers.example.org/actual-application", { timeout: 10000 })
  await expect(page.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue("test@example.com")
  await expect(page.locator(".odds-apply-bar")).toContainText("Check everything")
})


test("a newsletter interstitial is skipped without filling or subscribing before the actual application", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", email: "test@example.com", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/newsletter", route => route.fulfill({ contentType: "text/html", body: `<h1>Management Intern</h1><div id="newsletter-modal"><label>Email<input type="email"></label><button onclick="window.subscribed=true">Verder gaan</button><button onclick="location.href='/application'">Verder gaan zonder in te vullen</button></div>` }))
  await context.route("https://careers.example.org/application", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>Full name<input name="full_name" required></label><button type="submit">Submit</button></form>' }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/newsletter")
  await applyFrom(context, page, page.url())
  await expect(page).toHaveURL("https://careers.example.org/application", { timeout: 10000 })
  await expect(page.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
})


test("required radio groups on Cornerstone are outlined when their answer is unknown", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/radio", route => route.fulfill({ contentType: "text/html", body: `<h1>Application</h1><form><label>Full name<input name="full_name"></label><p id="q">Is this internship mandatory or elective?</p><div role="radiogroup" aria-required="true" aria-labelledby="q"><label><input type="radio" name="curriculum">Mandatory</label><label><input type="radio" name="curriculum">Elective</label></div></form>` }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/radio")
  await applyFrom(context, page, page.url())
  await expect(page.getByRole("radiogroup")).toHaveClass(/odds-ask/)
  await expect(page.locator(".odds-apply-bar")).toContainText("outlined question")
  await expect(page.getByRole("radio").first()).not.toBeChecked()
})


test("two phone requests prepare independent tabs without finishing the first; cancellation affects only its own tab", async ({ context, fake }) => {
  await connect(context)
  fake.remoteTasks = [
    { id: "a1111111-1111-4111-8111-111111111111", url: "https://careers.example.org/first", status: "filling" },
    { id: "b1111111-1111-4111-8111-111111111111", url: "https://careers.example.org/second", status: "filling" },
  ]
  fake.kit = { facts: { name: "Test Person", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><form><label>Full name<input name="full_name" required></label><label>Unknown question<input name="unknown" required></label><button type="submit">Submit</button></form>' }))
  const worker = context.serviceWorkers()[0]
  const firstOpened = context.waitForEvent("page")
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const first = await firstOpened
  await expect(first.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
  const secondOpened = context.waitForEvent("page")
  await worker.evaluate("pollApplications()")
  const second = await secondOpened
  await expect(second.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
  expect(first.isClosed()).toBe(false)
  await expect(first.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
  const count = context.pages().length
  await worker.evaluate("pollApplications()")
  expect(context.pages()).toHaveLength(count)
  fake.remoteTasks[0].status = "cancelled"
  await worker.evaluate("pollApplications()")
  await expect.poll(() => first.isClosed()).toBe(true)
  expect(second.isClosed()).toBe(false)
  await expect(second.getByRole("textbox", { name: "Full name" })).toHaveValue("Test Person")
})

test("benchmark percentage paint and score latency", async ({ context, fake }) => {
  await connect(context)
  fake.peek = { known: true, saved: false, chance_pct: 8.8, job: { id: "benchmark-job" } }
  await context.addInitScript(() => {
    const timings = { button: null as number | null, score: null as number | null }
    ;(window as unknown as { oddsTimings: typeof timings }).oddsTimings = timings
    new MutationObserver(() => {
      const button = document.getElementById("odds-add")
      if (!button) return
      if (timings.button === null) timings.button = performance.now()
      if (timings.score === null && button.textContent?.includes("8.8%")) timings.score = performance.now()
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
  const page = await context.newPage()
  const samples: Array<Record<string, unknown>> = []
  for (const latency of [0, 400]) {
    fake.peekDelay = latency
    for (let i = 0; i < 5; i++) {
      const id = 4470000800 + latency + i
      await page.goto(`https://www.linkedin.com/jobs/view/${id}/`)
      await expect(page.locator("#odds-add")).toContainText("8.8%")
      const cold = await page.evaluate(() => (window as unknown as { oddsTimings: { button: number; score: number } }).oddsTimings)
      const before = fake.peeks.length
      await page.reload()
      await expect(page.locator("#odds-add")).toContainText("8.8%")
      const warm = await page.evaluate(() => (window as unknown as { oddsTimings: { button: number; score: number } }).oddsTimings)
      expect(fake.peeks.length).toBe(before)
      samples.push({ latency_ms: latency, cold, warm })
    }
  }
})


test("a closed LinkedIn job reports the real blocker instead of leaving a phone request in progress", async ({ context, fake }) => {
  await connect(context)
  fake.remoteTask = { id: "e1111111-1111-4111-8111-111111111111", url: "https://www.linkedin.com/jobs/view/4470891508/", status: "filling" }
  await context.route("https://www.linkedin.com/jobs/view/4470891508/**", route => route.fulfill({ contentType: "text/html", body: '<main><h1>Investment Banking Internship</h1><span>No longer accepting applications</span></main>' }))
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const page = await opened
  await expect(page.locator(".odds-apply-bar")).toContainText("no longer accepting applications")
  await expect.poll(() => fake.reports.some(r => r.status === "failed" && r.message?.includes("no longer accepting"))).toBe(true)
  const active = await worker.evaluate("chrome.tabs.query({ active: true }).then(tabs => tabs[0].id)")
  const tracked = await worker.evaluate("chrome.storage.session.get('oddsApplicationRuns').then(v => v.oddsApplicationRuns['e1111111-1111-4111-8111-111111111111'].tabId)")
  expect(active).toBe(tracked)
  expect(await worker.evaluate("chrome.alarms.get('odds-applications').then(alarm => alarm.periodInMinutes)")).toBe(0.5)
})


test("LinkedIn’s lazy CV uploader captures the input outside the dialog and uploads the Odds CV without a native picker", async ({ context, fake }) => {
  await connect(context)
  fake.remoteTask = { id: "f1111111-1111-4111-8111-111111111111", url: "https://www.linkedin.com/jobs/view/4470286772/", status: "needs_input" }
  fake.kit = { facts: { name: "Test Person", answers: {}, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", file_name: "Kien_Data_CV.pdf" } }
  const html = `<h1>Finance Assistant</h1><dialog data-testid="dialog" open><h2>Apply to KUS</h2><h3>Resume</h3><fieldset role="radiogroup"><div role="radio" aria-label="Old_CV.pdf"><input type="radio" name="cv" checked></div></fieldset><button id="upload">Upload resume</button><button id="next">Next</button></dialog><script>
  window.pickerOpened=false; window.uploaded="";
  document.querySelector('#upload').onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='.pdf';input.hidden=true;input.onchange=()=>{window.uploaded=input.files[0].name; document.querySelector('fieldset').innerHTML='<div role="radio" aria-label="'+window.uploaded+'"><input type="radio" name="cv" checked></div>'};document.body.append(input);input.addEventListener('click',e=>{if(!e.defaultPrevented)window.pickerOpened=true}); input.click()};
  document.querySelector('#next').onclick=()=>{document.querySelector('dialog').innerHTML='<h2>Apply to KUS</h2><h3>Review</h3><button type="submit">Submit</button>'};
  </script>`
  await context.route("https://www.linkedin.com/jobs/view/4470286772/**", route => route.fulfill({ contentType: "text/html", body: html }))
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470286772/")
  await expect(page.locator('dialog h3')).toHaveText("Review", { timeout: 10000 })
  expect(await page.evaluate("window.uploaded")).toBe("Kien_Data_CV.pdf")
  expect(await page.evaluate("window.pickerOpened")).toBe(false)
  await expect.poll(() => fake.reports.some(r => r.status === "ready")).toBe(true)
  await expect(page.locator('.odds-apply-bar')).toContainText("press Submit yourself")
})

test("one click opens one tab; repeated clicks focus its filled application", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", answers: {}, remembered: {} } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: '<form><label>Full name<input required></label><button type="submit">Submit</button></form>' }))
  const worker = context.serviceWorkers()[0]
  const opened = context.waitForEvent("page")
  await worker.evaluate("openApplication('https://careers.example.org/application')")
  const application = await opened
  await expect(application.getByLabel("Full name")).toHaveValue("Test Person")
  const count = context.pages().length
  const result = await worker.evaluate("Promise.all([openApplication('https://careers.example.org/application'),openApplication('https://careers.example.org/application')])")
  expect(result).toEqual([{ ok: true, resumed: true }, { ok: true, resumed: true }])
  expect(context.pages()).toHaveLength(count)
  await expect(application.getByLabel("Full name")).toHaveValue("Test Person")
})

test("one-click learning loop: phone answers an employer question, desktop advances and uploads CV, answer appears in Profile", async ({ context, fake }) => {
  await connect(context)
  const post = FLOW_POSTINGS[0]
  await context.addInitScript(() => localStorage.setItem("careersim.session", JSON.stringify({ access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001" } })))
  await context.addInitScript(() => localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", origin: "non_eu", dutch: "basic" })))
  await mockBackend(context, FLOW_POSTINGS, [], true)
  await context.route("**/rest/v1/application_prompts?**", route => route.fulfill({ json: [{ posting_id: post.id, updated_at: new Date().toISOString(), questions: fake.prompts }] }))
  const saved: Array<{ question_key: string; question: string; answer: string }> = []
  await context.route("**/rest/v1/application_questions?**", route => route.fulfill({ json: saved }))
  await context.route("**/rest/v1/rpc/answer_application_questions", route => {
    const body = route.request().postDataJSON()
    expect(body.p_posting_id).toBe(post.id)
    for (const [key, answer] of Object.entries(body.p_answers as Record<string, string>)) {
      const prompt = fake.prompts.find(q => q.key === key)
      expect(prompt).toBeDefined()
      fake.remembered[key] = answer
      saved.push({ question_key: key, question: prompt!.label, answer })
    }
    return route.fulfill({ status: 204 })
  })
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test" }] }))
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: fake.remoteTask ? [{ ...fake.remoteTask, posting_id: post.id, message: fake.reports.at(-1)?.message || "Waiting for your desktop." }] : [] }))
  await context.route("**/rest/v1/rpc/request_application", route => {
    fake.remoteTask = { id: "b2222222-1111-4111-8111-111111111111", url: "https://careers.example.org/learning-loop", status: "filling" }
    return route.fulfill({ json: { ...fake.remoteTask, posting_id: post.id, message: "Waiting for your desktop." } })
  })
  fake.kit = { job_id: post.id, facts: { job_id: post.id, name: "Test Person", answers: {}, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien Data CV", file_name: "Kien_Data_CV.pdf" } }
  await context.route("https://careers.example.org/**", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><h1>Application</h1><div role="dialog" id="cookie-banner"><p>Cookies</p><button onclick="window.rejected=true;this.parentElement.remove()">Reject all</button><button onclick="window.accepted=true">Accept all</button></div><form id="form"><label>Full name<input required></label><fieldset><legend>Will you remain enrolled throughout this internship?</legend><input type="radio" id="yes" name="study" required><label for="yes">Yes</label><input type="radio" id="no" name="study"><label for="no">No</label></fieldset><button type="button" onclick="window.enrolled=document.querySelector('#yes').checked;document.querySelector('#form').innerHTML='<label>CV<input type=file required></label><button type=submit>Submit application</button>'">Next</button></form><script>window.sent=false;document.addEventListener('submit',e=>{e.preventDefault();window.sent=true})</script>` }))
  const phone = await context.newPage()
  await phone.setViewportSize({ width: 390, height: 844 })
  await phone.goto(`http://localhost:4319/job/${post.id}`)
  const worker = context.serviceWorkers()[0]
  await worker.evaluate(() => chrome.storage.local.set({ oddsPhoneControl: true }))
  const opened = context.waitForEvent("page")
  await phone.getByRole("button", { name: "Apply with Odds" }).click()
  await worker.evaluate("pollApplications()")
  const desktop = await opened
  await expect(desktop.getByLabel("Full name")).toHaveValue("Test Person", { timeout: 10000 })
  await phone.getByLabel("Will you remain enrolled throughout this internship?").selectOption("Yes", { timeout: 15000 })
  await phone.getByRole("button", { name: "Save and continue" }).click()
  await expect(desktop.getByLabel("CV")).toHaveCount(1, { timeout: 15000 })
  await expect.poll(() => desktop.getByLabel("CV").evaluate((e: HTMLInputElement) => e.files?.[0]?.name)).toBe("Kien_Data_CV.pdf")
  expect(await desktop.evaluate("window.enrolled")).toBe(true)
  expect(await desktop.evaluate("window.rejected")).toBe(true)
  expect(await desktop.evaluate("window.accepted")).not.toBe(true)
  expect(await desktop.evaluate("window.sent")).toBe(false)
  await expect.poll(() => fake.reports.at(-1)?.status).toBe("ready")
  await phone.goto("http://localhost:4319/")
  await phone.getByRole("button", { name: /Autofill/ }).last().click()
  await expect(phone.getByRole("heading", { name: "Learned from forms", exact: true })).toBeVisible()
  await expect(phone.getByLabel("Will you remain enrolled throughout this internship?")).toHaveValue("Yes")
  expect(saved[0].question_key).toContain(` job ${post.id}`)
})

test("LinkedIn accepts a saved remote answer and automatically reaches review without Submit", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://www.linkedin.com/jobs/view/4470000301/**", route => route.fulfill({ contentType: "text/html", body: EASY_APPLY }))
  fake.kit = { facts: { name: "Test Person", phone: "+31 6 12345678", dutch: "basic", answers: { work_authorization: "Yes, EU citizen" }, remembered: {} } }
  const page = await context.newPage()
  await page.goto("https://www.linkedin.com/jobs/view/4470000301/")
  await page.locator("#jobs-apply-button-id").click()
  await expect(page.locator("#sql")).toBeVisible({ timeout: 10000 })
  await expect.poll(() => fake.prompts.some(q => q.label.includes("SQL"))).toBe(true)
  const question = fake.prompts.find(q => q.label.includes("SQL"))!
  fake.remembered[question.key] = "3"
  await expect(page.locator('[data-test-modal-id=easy-apply-modal] h3')).toHaveText("Review your application", { timeout: 10000 })
  expect(await page.evaluate("window.submits")).toBe(0)
  expect((await page.evaluate("window.seen") as Record<string, unknown>).sql).toBe("3")
})

test("an employer's embedded Greenhouse form fills inside its frame and uploads CV without submitting", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", email: "person@example.com", answers: {}, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Main CV", file_name: "Kien_Data_CV.pdf" } }
  await context.route("https://careers.example.org/embedded", route => route.fulfill({ contentType: "text/html", body: '<h1>Application</h1><iframe title="Application form" style="width:600px;height:700px" src="https://boards.greenhouse.io/embed/job_app?token=12345"></iframe>' }))
  await context.route("https://boards.greenhouse.io/**", route => route.fulfill({ contentType: "text/html", body: '<form><label>Full name<input required></label><label>Email<input type="email" required></label><label>CV<input type="file" required></label><button type="submit">Submit application</button></form><script>window.submitted=false;document.addEventListener("submit", e=>{e.preventDefault();window.submitted=true})</script>' }))
  const page = await context.newPage()
  await page.goto("https://careers.example.org/embedded")
  await applyFrom(context, page, "https://careers.example.org/embedded")
  const frame = page.frameLocator('iframe[title="Application form"]')
  await expect(frame.getByLabel("Full name")).toHaveValue("Test Person")
  await expect(frame.getByLabel("Email")).toHaveValue("person@example.com")
  await expect.poll(() => frame.getByLabel("CV").evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toBe("Kien_Data_CV.pdf")
  await expect(frame.locator(".odds-apply-bar")).toContainText("send it yourself")
  expect(await page.frames()[1].evaluate("window.submitted")).toBe(false)
})

test("a SuccessFactors listing's Apply inside a form opens its login instead of waiting on the listing", async ({ context, fake }) => {
  await connect(context)
  fake.kit = { facts: { name: "Test Person", answers: {}, remembered: {} } }
  await context.route("https://career2.successfactors.eu/listing/**", route => route.fulfill({ contentType: "text/html", body: '<h1>Portfolio Strategy Intern</h1><form><input type="hidden" name="jobId" value="2838"><button type="button" onclick="location.href=\'/signin\'">Apply</button></form>' }))
  await context.route("https://career2.successfactors.eu/signin", route => route.fulfill({ contentType: "text/html", body: '<title>Sign in</title><h1>Sign in</h1><form><label>Password<input type="password"></label><button>Sign in</button></form>' }))
  const page = await context.newPage()
  await page.goto("https://career2.successfactors.eu/listing/2838")
  await applyFrom(context, page, "https://career2.successfactors.eu/listing/2838")
  await expect(page).toHaveURL("https://career2.successfactors.eu/signin", { timeout: 10000 })
  await expect(page.locator(".odds-apply-bar")).toContainText("Complete the login")
  await expect(page.getByLabel("Password")).toHaveValue("")
})

const PORTAL_KIT = { job_id: "pportal", facts: { name: "Kien Phung", email: "kien@example.com", linkedin: "https://www.linkedin.com/in/kien", answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1234 5678", work_authorization: "Yes, EU citizen" }, remembered: {} }, cv: { id: "11111111-2222-3333-4444-555555555555", name: "Kien_Data_CV", file_name: "Kien_Data_CV.pdf", for_this_job: true } }

/** Greenhouse's job-boards form: a question answered from a searchable dropdown (react-select: a combobox input, a listbox drawn when opened). */
const GREENHOUSE_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Data Intern</h1>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <label for="first_name">First Name*</label><input id="first_name" required>
  <label for="last_name">Last Name*</label><input id="last_name" required>
  <label for="email">Email*</label><input id="email" type="email" required>
  <label for="resume">Resume/CV*</label><input id="resume" type="file" required>
  <div class="select__container"><label id="auth-l" for="q1">Are you legally authorized to work in the Netherlands?*</label>
    <div class="select__control"><div class="select__value-container"><div class="select__single-value" id="auth-v"></div><input id="q1" role="combobox" aria-required="true" aria-controls="menu1" aria-labelledby="auth-l"></div></div>
    <div id="menu1" role="listbox" hidden><div role="option">Yes</div><div role="option">No</div></div></div>
  <button type="submit">Submit application</button>
</form></main>
<script>
const input = document.getElementById("q1"), menu = document.getElementById("menu1")
input.addEventListener("mousedown", () => { menu.hidden = false })
input.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") menu.hidden = false; if (e.key === "Escape") menu.hidden = true })
for (const o of menu.children) o.addEventListener("mousedown", () => { document.getElementById("auth-v").textContent = o.textContent; menu.hidden = true })
</script></body></html>`

/** Lever's form: one Full name field, every label wrapping its field. */
const LEVER_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Data Intern</h1>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <label><div class="application-label">Resume/CV <span>✱</span></div><div class="application-field"><input type="file" name="resume" required></div></label>
  <label><div class="application-label">Full name <span>✱</span></div><div class="application-field"><input name="name" required></div></label>
  <label><div class="application-label">Email <span>✱</span></div><div class="application-field"><input name="email" type="email" required></div></label>
  <label><div class="application-label">Phone</div><div class="application-field"><input name="phone"></div></label>
  <label><div class="application-label">LinkedIn URL</div><div class="application-field"><input name="urls[LinkedIn]"></div></label>
  <button type="submit">Submit application</button>
</form></main></body></html>`

/** Ashby's form: system fields, and Yes/No drawn as two buttons (the chosen one gets an _active_ class). */
const ASHBY_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Data Intern</h1>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <div><label for="_systemfield_name">Name</label><input id="_systemfield_name" name="_systemfield_name" required></div>
  <div><label for="_systemfield_email">Email</label><input id="_systemfield_email" type="email" required></div>
  <div><label for="_systemfield_resume">Resume</label><input id="_systemfield_resume" type="file" required></div>
  <div class="entry"><label class="_heading_1x">Are you legally authorized to work in the Netherlands? *</label><div class="yesno" id="auth"><button type="button" class="_option_1x">Yes</button><button type="button" class="_option_1x">No</button></div></div>
  <div class="entry"><label class="_heading_1x">Do you hold a driving licence? *</label><div class="yesno" id="drive"><button type="button" class="_option_1x">Yes</button><button type="button" class="_option_1x">No</button></div></div>
  <button type="submit">Submit Application</button>
</form></main>
<script>
for (const g of document.querySelectorAll(".yesno")) for (const b of g.children) b.addEventListener("click", () => { for (const o of g.children) o.classList.remove("_active_1x"); b.classList.add("_active_1x") })
</script></body></html>`

test("odds apply on Greenhouse: the searchable dropdown is opened and the option chosen, the CV uploaded, nothing sent", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://job-boards.greenhouse.io/acme/jobs/1**", (route) => route.fulfill({ contentType: "text/html", body: GREENHOUSE_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://job-boards.greenhouse.io/acme/jobs/1")
  await applyFrom(context, page, "https://job-boards.greenhouse.io/acme/jobs/1")
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  await expect(page.locator("#auth-v")).toHaveText("Yes", { timeout: 8000 })
  await expect.poll(() => page.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? "")).toBe("Kien_Data_CV.pdf")
  await expect(page.locator(".odds-apply-bar")).toContainText("Check everything", { timeout: 10000 })
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  await shot(page, "ext-greenhouse")
})

test("odds apply on Lever: the single Full name field, wrapped labels and the CV, nothing sent", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://jobs.lever.co/acme/1**", (route) => route.fulfill({ contentType: "text/html", body: LEVER_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://jobs.lever.co/acme/1")
  await applyFrom(context, page, "https://jobs.lever.co/acme/1")
  await expect(page.locator("input[name=name]")).toHaveValue("Kien Phung", { timeout: 8000 })
  await expect(page.locator("input[name=email]")).toHaveValue("kien@example.com")
  await expect(page.locator("input[name=phone]")).toHaveValue("+31 6 1234 5678")
  await expect(page.locator("input[name='urls[LinkedIn]']")).toHaveValue("https://www.linkedin.com/in/kien")
  await expect.poll(() => page.locator("input[name=resume]").evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? "")).toBe("Kien_Data_CV.pdf")
  await expect(page.locator(".odds-apply-bar")).toContainText("Check everything", { timeout: 10000 })
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  await shot(page, "ext-lever")
})

test("odds apply on Ashby: Yes/No buttons are pressed from the profile, an unknown one is outlined, sent to Odds to answer, and filled in once answered there", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://jobs.ashbyhq.com/acme/1**", (route) => route.fulfill({ contentType: "text/html", body: ASHBY_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://jobs.ashbyhq.com/acme/1")
  await applyFrom(context, page, "https://jobs.ashbyhq.com/acme/1")
  await expect(page.locator("#_systemfield_name")).toHaveValue("Kien Phung", { timeout: 8000 })
  await expect(page.locator("#auth button", { hasText: "Yes" })).toHaveClass(/_active_/, { timeout: 8000 })
  // What odds cannot know is not guessed: outlined, and offered in Odds to answer.
  await expect(page.locator("#drive button._active_1x")).toHaveCount(0)
  await expect(page.locator(".odds-ask")).toHaveCount(1)
  await expect.poll(() => fake.prompts.map((q) => (q as { label: string }).label)).toEqual(["Do you hold a driving licence?"])
  const key = (fake.prompts[0] as { key: string }).key
  // The answer given in Odds comes back, is pressed in the form, and the outline goes.
  fake.remembered = { [key]: "No" }
  await page.evaluate(() => (globalThis as unknown as { chrome?: unknown }).chrome)
  await context.serviceWorkers()[0].evaluate(async () => {
    const api = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<Array<{ id: number }>>; sendMessage(id: number, m: object): Promise<unknown> } } }).chrome
    for (const tab of await api.tabs.query({})) await api.tabs.sendMessage(tab.id, { type: "application-continue" }).catch(() => undefined)
  })
  await expect(page.locator("#drive button", { hasText: "No" })).toHaveClass(/_active_/, { timeout: 10000 })
  await expect(page.locator(".odds-ask")).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  await shot(page, "ext-ashby")
})

test("the panel can ask how a job's application is going: nothing, then what its tab last said", async ({ context, fake, extensionId }) => {
  await connect(context)
  await context.route("https://boards.example-ats.com/acme/jobs/55**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = PORTAL_KIT
  const job = "https://boards.example-ats.com/acme/jobs/55"
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const status = (): Promise<{ state: { status: string; message: string } | null }> => popup.evaluate((url) => new Promise((resolve) => (globalThis as unknown as { chrome: { runtime: { sendMessage(m: object, cb: (a: never) => void): void } } }).chrome.runtime.sendMessage({ type: "application-status", url }, resolve)), job)
  expect((await status()).state).toBeNull()
  const page = await context.newPage()
  await page.goto(job)
  await applyFrom(context, page, job)
  await expect.poll(async () => (await status()).state?.status, { timeout: 10000 }).toBe("needs_input")
  expect((await status()).state?.message).toContain("outlined question")
  // The tab closing ends it: a closed application is not reported as going on.
  await page.close()
  await expect.poll(async () => (await status()).state, { timeout: 5000 }).toBeNull()
})

/** A form in steps, as Workday draws it: Next shows the next step; the last step has Submit, which odds never presses. */
const STEPS_FORM = `<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1 id="h">My Information</h1>
<form onsubmit="event.preventDefault(); window.sent = (window.sent || 0) + 1">
  <div id="s1"><label for="first_name">First Name *</label><input id="first_name" required><label for="last_name">Last Name *</label><input id="last_name" required><label for="email">Email *</label><input id="email" type="email" required></div>
  <div id="s2" hidden><label for="phone">Phone *</label><input id="phone" required><label for="sql">How many years of experience do you have with SQL? *</label><input id="sql" required></div>
  <div id="s3" hidden><p>Review your application</p></div>
  <button type="button" id="next" data-step="1">Next</button>
  <button type="submit" id="submit" hidden>Submit</button>
</form></main>
<script>
const steps = ["My Information", "My Experience", "Review"]
let at = 1
window.advanced = 0
document.getElementById("next").addEventListener("click", () => {
  window.advanced++
  document.getElementById("s" + at).hidden = true
  at++
  document.getElementById("s" + at).hidden = false
  document.getElementById("h").textContent = steps[at - 1]
  if (at === 3) { document.getElementById("next").hidden = true; document.getElementById("submit").hidden = false }
})
</script></body></html>`

test("odds apply goes through the complete steps by itself, stops at a question it cannot answer, continues once it is answered, and stops at the end without sending", async ({ context, fake }) => {
  await connect(context)
  await context.route("https://careers.example-ats.com/acme/jobs/9**", (route) => route.fulfill({ contentType: "text/html", body: STEPS_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://careers.example-ats.com/acme/jobs/9")
  await applyFrom(context, page, "https://careers.example-ats.com/acme/jobs/9")
  // Step 1 is complete from the profile: odds goes on to step 2 by itself.
  await expect(page.locator("#h")).toHaveText("My Experience", { timeout: 15000 })
  await expect(page.locator("#phone")).toHaveValue("+31 6 1234 5678", { timeout: 8000 })
  // The SQL question is the person's: odds waits there, and does not press Next.
  await expect(page.locator(".odds-ask")).toHaveCount(1)
  await page.waitForTimeout(3000)
  await expect(page.locator("#h")).toHaveText("My Experience")
  await page.locator("#sql").fill("3")
  await expect(page.locator("#h")).toHaveText("Review", { timeout: 15000 })
  // The end: Submit is the person's.
  await expect(page.locator(".odds-apply-bar")).toContainText("Check everything", { timeout: 10000 })
  await page.waitForTimeout(2500)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { advanced: number }).advanced)).toBe(2)
  await shot(page, "ext-steps")
})

test("an application sent on an employer's site marks the job applied in odds, from the site's own thank-you, and only then", async ({ context, fake }) => {
  await connect(context)
  const form = EMPLOYER_FORM.replace('window.sent = (window.sent || 0) + 1', `window.sent = (window.sent || 0) + 1; document.querySelector('main').innerHTML = '<h1>Thank you for applying!</h1><p>Your application has been submitted.</p>'`)
  await context.route("https://boards.example-ats.com/acme/jobs/77**", (route) => route.fulfill({ contentType: "text/html", body: form }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://boards.example-ats.com/acme/jobs/77")
  await applyFrom(context, page, "https://boards.example-ats.com/acme/jobs/77")
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 8000 })
  await page.locator("#sql").fill("3")
  await page.waitForTimeout(1500)
  // Filled in, not sent: nothing is marked.
  expect(fake.applied).toEqual([])
  await page.getByRole("button", { name: "Submit application" }).click()
  await expect.poll(() => fake.applied, { timeout: 8000 }).toEqual(["https://boards.example-ats.com/acme/jobs/77"])
  await expect(page.locator(".odds-apply-bar")).toContainText("marked this job as applied")
})

const BANNERS: ReadonlyArray<[string, string, string]> = [
  ["OneTrust", `<div id="onetrust-banner-sdk" style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:12px"><p>We use cookies to improve your experience.</p><button id="onetrust-pc-btn-handler">Cookie Settings</button><button id="onetrust-reject-all-handler" onclick="window.rejected=true;document.getElementById('onetrust-banner-sdk').remove()">Reject All</button><button id="onetrust-accept-btn-handler" onclick="window.accepted=true">Accept All Cookies</button></div>`, "rejected"],
  ["Cookiebot", `<div id="CybotCookiebotDialog" style="position:fixed;inset:20% 20%;background:#fff;padding:16px"><p>This website uses cookies.</p><button>Customize</button><button onclick="window.rejected=true;this.parentElement.remove()">Use necessary cookies only</button><button onclick="window.accepted=true">Allow all</button></div>`, "rejected"],
  ["a Dutch banner", `<div class="cookie-melding" style="position:fixed;bottom:0;left:0;right:0;background:#fff"><p>Wij gebruiken cookies voor een betere website.</p><button onclick="window.accepted=true">Accepteren</button><button onclick="window.rejected=true;this.parentElement.remove()">Alleen noodzakelijke cookies</button></div>`, "rejected"],
  ["a banner drawn in a shadow root", `<div id="usercentrics-root"></div><script>const r=document.getElementById("usercentrics-root").attachShadow({mode:"open"});r.innerHTML='<div style="position:fixed;bottom:0;background:#fff"><p>We use cookies</p><button id="d">Deny</button><button id="a">Accept All</button></div>';r.getElementById("d").onclick=()=>{window.rejected=true;r.innerHTML=""};r.getElementById("a").onclick=()=>{window.accepted=true}</script>`, "rejected"],
  ["a banner that only offers Accept and a close button", `<div role="dialog" style="position:fixed;bottom:0;background:#fff"><p>Cookies make this site work.</p><button onclick="window.accepted=true">Accept</button><button aria-label="Close" onclick="window.rejected=true;this.parentElement.remove()">×</button></div>`, "rejected"],
]

for (const [name, banner, flag] of BANNERS) {
  test(`odds apply gets past ${name}: it never accepts, the banner goes, and the form is filled in`, async ({ context, fake }) => {
    await connect(context)
    await context.route("https://careers.example-ats.com/acme/jobs/31**", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM.replace("<main>", `${banner}<main>`) }))
    fake.kit = PORTAL_KIT
    const page = await context.newPage()
    await page.goto("https://careers.example-ats.com/acme/jobs/31")
    await applyFrom(context, page, "https://careers.example-ats.com/acme/jobs/31")
    await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 10000 })
    await expect.poll(() => page.evaluate((f) => Boolean((window as unknown as Record<string, boolean>)[f]), flag), { timeout: 8000 }).toBe(true)
    expect(await page.evaluate(() => Boolean((window as unknown as { accepted?: boolean }).accepted))).toBe(false)
  })
}

test("a consent box inside the application form is not a cookie banner: odds leaves its buttons alone", async ({ context, fake }) => {
  await connect(context)
  const form = EMPLOYER_FORM.replace("<button type=\"submit\">", `<div class="consent-box"><p>I consent to the processing of my privacy data.</p><button type="button" onclick="window.declined=true">Decline</button></div><button type="submit">`)
  await context.route("https://careers.example-ats.com/acme/jobs/32**", (route) => route.fulfill({ contentType: "text/html", body: form }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://careers.example-ats.com/acme/jobs/32")
  await applyFrom(context, page, "https://careers.example-ats.com/acme/jobs/32")
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 10000 })
  await page.waitForTimeout(2500)
  expect(await page.evaluate(() => Boolean((window as unknown as { declined?: boolean }).declined))).toBe(false)
})

test("one click on an employer's listing: the cookie banner is declined, Apply now is pressed, and the next page's form is filled in, never sent", async ({ context, fake }) => {
  await connect(context)
  const listing = `<!doctype html><div id="onetrust-banner-sdk" style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:12px"><p>We use cookies.</p><button onclick="window.accepted=true">Accept All</button><button onclick="window.rejected=true;document.getElementById('onetrust-banner-sdk').remove()">Reject All</button></div><main><h1>Junior Data Analyst</h1><p>Amsterdam. Join our data team.</p><a class="btn" href="/acme/jobs/41/apply">Apply now</a></main>`
  await context.route("https://careers.example-ats.com/acme/jobs/41", (route) => route.fulfill({ contentType: "text/html", body: listing }))
  await context.route("https://careers.example-ats.com/acme/jobs/41/apply", (route) => route.fulfill({ contentType: "text/html", body: EMPLOYER_FORM }))
  fake.kit = PORTAL_KIT
  const page = await context.newPage()
  await page.goto("https://careers.example-ats.com/acme/jobs/41")
  await applyFrom(context, page, "https://careers.example-ats.com/acme/jobs/41")
  await expect(page).toHaveURL(/\/apply$/, { timeout: 15000 })
  await expect(page.locator("#first_name")).toHaveValue("Kien", { timeout: 10000 })
  await expect.poll(() => page.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.[0]?.name ?? "")).toBe("Kien_Data_CV.pdf")
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as unknown as { sent?: number }).sent ?? 0)).toBe(0)
})
