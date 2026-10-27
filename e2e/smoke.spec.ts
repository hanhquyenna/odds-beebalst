import { DEFAULT_VISIBLE, FLOW_POSTINGS } from "./fixtures/postings"
import { expect, jobRows, shot, test } from "./mock"

const SEARCH = { name: "Search jobs, companies or places" }

test("landing renders the open jobs from the backend", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { level: 1, name: "ever wondered your interview odds as an international student?" })).toBeVisible()
  await expect(page.getByRole("heading", { level: 2, name: `${DEFAULT_VISIBLE} internship, traineeship & entry jobs right now` })).toBeVisible()
  await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE)
  // Newest first: the job posted yesterday leads.
  await expect(jobRows(page).first()).toContainText("Customer Success Intern")
  await shot(page, "desktop-landing")
})

test("search and filters narrow the list to the matching jobs", async ({ page }) => {
  await page.goto("/")
  const search = page.getByRole("searchbox", SEARCH)

  await search.fill("analyst")
  await expect(jobRows(page)).toHaveCount(2)
  await expect(jobRows(page).filter({ hasText: "Junior Financial Analyst" })).toHaveCount(1)
  await expect(jobRows(page).filter({ hasText: "Data Analyst Intern" })).toHaveCount(1)

  await search.fill("rotterdam")
  await expect(jobRows(page)).toHaveCount(1)
  await expect(jobRows(page)).toContainText("Supply Chain Intern")

  await search.fill("no such job anywhere")
  await expect(jobRows(page)).toHaveCount(0)

  await page.getByRole("button", { name: "Clear the search" }).click()
  await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE)

  // Jobs that need Dutch never reach the list (odds is for international students), and no filter brings them in.
  await expect(page.getByRole("button", { name: /^Language/ })).toHaveCount(0)
  await expect(jobRows(page).filter({ hasText: "Junior Business Controller" })).toHaveCount(0)
  await expect(jobRows(page).filter({ hasText: "Senior Data Engineer" })).toHaveCount(0)
})

test("opening a job shows its detail, text included", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /Junior Financial Analyst Adyen/ }).click()

  const detail = page.getByRole("dialog")
  await expect(detail.getByRole("heading", { name: "Junior Financial Analyst" })).toBeVisible()
  // The stated pay, at the top of the job (the pay card further down repeats it).
  await expect(detail.getByText("€3.600 – €4.200", { exact: true })).toBeVisible()
  // The posting text comes from its own request (postings.body).
  await expect(detail.getByText("help close the books every month")).toBeVisible()
  await shot(page, "desktop-job-detail")
})

test("a shared job link opens the job and survives a reload", async ({ page }) => {
  const post = FLOW_POSTINGS[0]
  await page.goto(`/job/${post.id}`)
  await expect(page.getByRole("heading", { level: 1, name: post.title })).toBeVisible()
  await expect(page.getByRole("link", { name: /^Apply/ })).toHaveAttribute("href", post.url ?? "")

  await page.reload()
  await expect(page).toHaveURL(new RegExp(`/job/${post.id}$`))
  await expect(page.getByRole("heading", { level: 1, name: post.title })).toBeVisible()

  await page.goto("/job/not-a-real-job")
  await expect(page.getByText("This job is not in the list.")).toBeVisible()
})

test("a job has an Overview and a Company tab: the posting first, the company and its people on the second", async ({ page }) => {
  const post = FLOW_POSTINGS[0]
  await page.goto(`/job/${post.id}`)
  const overview = page.getByRole("tab", { name: "Overview" })
  const company = page.getByRole("tab", { name: "Company" })
  await expect(overview).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("heading", { name: "About the job" })).toBeVisible()
  await company.click()
  await expect(company).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("heading", { name: "About the job" })).toHaveCount(0)
  await overview.click()
  await expect(page.getByRole("heading", { name: "About the job" })).toBeVisible()
})

test("first visit: start, skip the profile, see your jobs, answer the questions and keep them", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Start" }).click()
  await expect(page.getByRole("heading", { name: "See your odds on every job." })).toBeVisible()
  await page.getByRole("button", { name: "Skip for now, just show me jobs" }).click()

  await expect(page.getByText(`${DEFAULT_VISIBLE} jobs`, { exact: true })).toBeVisible()
  await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE)
  await shot(page, "desktop-job-list")

  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("button", { name: "Profile and settings" }).click()
  await page.getByRole("combobox", { name: "Your permit" }).selectOption({ label: "I am an EU or EEA citizen" })
  await page.getByRole("combobox", { name: "Where you grew up" }).selectOption({ label: "Another EU country" })
  await page.getByRole("spinbutton", { name: "Year you were born" }).fill("2001")
  await page.getByRole("combobox", { name: "Dutch" }).selectOption({ label: "Professional (B2 to C1)" })

  // The answers live on this device, so a reload brings them back.
  await page.reload()
  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("button", { name: "Profile and settings" }).click()
  await expect(page.getByRole("combobox", { name: "Your permit" })).toHaveValue("eu")
  await expect(page.getByRole("combobox", { name: "Where you grew up" })).toHaveValue("eu_non_native")
  await expect(page.getByRole("spinbutton", { name: "Year you were born" })).toHaveValue("2001")
  await expect(page.getByRole("combobox", { name: "Dutch" })).toHaveValue("professional")
})

test.describe("signed-in account", () => {
  test.use({ signedIn: true })

  test("the job page labels department contacts accurately and never infers hiring responsibility", async ({ page }) => {
    const post = FLOW_POSTINGS[0]
    await page.route("**/functions/v1/jobs/people", (route) =>
      route.fulfill({
        json: {
          people: [
            { name: "Dana Analyst", headline: "Financial Analyst", place: "Amsterdam", url: "https://www.linkedin.com/in/dana-analyst", photo: "", about: "", positions: [] },
            { name: "Sanne de Vries", headline: "Finance Manager", place: "Amsterdam", url: "https://www.linkedin.com/in/sanne-de-vries", photo: "", about: "", positions: [] },
          ],
          searched: true,
          more: false,
          widened: [],
        },
      }),
    )
    await page.goto(`/job/${post.id}`)
    await page.getByRole("tab", { name: "People" }).click()
    const people = page.getByRole("heading", { name: "People", exact: true })
    await expect(people).toBeVisible()
    const managers = page.getByRole("region", { name: "Department leads", exact: true })
    await expect(managers.getByText("Sanne de Vries")).toBeVisible()
    await expect(managers.getByText("Finance Manager")).toBeVisible()
    await expect(page.getByRole("region", { name: "Hiring managers", exact: true })).toHaveCount(0)
    await expect(page.getByText("Suggested department contacts. Hiring responsibility for this vacancy has not been confirmed.")).toBeVisible()
    // Department leads come before the other groups.
    const order = await page.locator("section[aria-label='Hiring managers'], section[aria-label='Department leads'], section[aria-label='Same team'], section[aria-label='Same department'], section[aria-label='Other']").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))
    expect(order[0]).toBe("Department leads")
    // Adding a department contact puts them on this job's list, where their stage is changed in place.
    await managers.getByRole("button", { name: "Add Sanne de Vries to your People" }).click()
    const stage = managers.getByLabel("Where you are with Sanne de Vries")
    await expect(stage).toHaveValue("To contact")
    await stage.selectOption("Contacted")
    await expect(stage).toHaveValue("Contacted")
  })

  test("the top of Home opens to numbers worked out from the applications: no reply, first reply, longest wait, how far they get", async ({ page }) => {
    const day = (ago: number): string => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10)
    const rows = [
      { id: 1, posting_id: FLOW_POSTINGS[0].id, fit_tier: "mid", stage: "applied", logged_at: day(19) },
      { id: 2, posting_id: FLOW_POSTINGS[1].id, fit_tier: "mid", stage: "interview", logged_at: day(30) },
      { id: 3, posting_id: FLOW_POSTINGS[2].id, fit_tier: "mid", stage: "no_reply", logged_at: day(40) },
      { id: 4, posting_id: FLOW_POSTINGS[3].id, fit_tier: "mid", stage: "rejected", logged_at: day(35) },
    ]
    await page.route("**/rest/v1/applications*", (route) => route.fulfill({ json: route.request().method() === "GET" ? rows : [] }))
    await page.route("**/rest/v1/chance_snapshots*", (route) =>
      route.fulfill({ json: [{ applied_on: day(30), outcome: "interview", outcome_on: day(24) }, { applied_on: day(35), outcome: "rejected", outcome_on: day(25) }] }),
    )
    await page.goto("/")
    await page.getByRole("button", { name: "Show your chances" }).click()
    const insights = page.getByRole("region", { name: "How it is going" })
    await insights.getByRole("combobox", { name: "Insights time frame" }).click()
    await page.getByRole("option", { name: "Last 8 weeks", exact: true }).click()
    await expect(insights.getByText("33%")).toBeVisible()
    await expect(insights.getByText("no reply", { exact: true })).toBeVisible()
    await expect(insights.getByText("8 days")).toBeVisible()
    await expect(insights.getByText("19 days")).toBeVisible()
    await expect(insights.getByRole("img", { name: /Applications sent by day/ })).toBeVisible()
  })

  test("Insights filters both application totals and the chart by calendar period", async ({ page }) => {
    const today = new Date()
    const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) - 1)
    const date = (day: Date): string => `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`
    const old = new Date(today.getFullYear(), today.getMonth(), today.getDate()-20)
    const rows = [today, sunday, old].map((day, index) => ({ id:index+1, posting_id:FLOW_POSTINGS[index].id, stage:"applied", logged_at:date(day), fit_tier:"mid" }))
    await page.route("**/rest/v1/applications*", (route) => route.fulfill({ json: rows }))
    await page.goto("/")
    await page.getByRole("button", { name: "Show your chances" }).click()
    const insights = page.getByRole("region", { name: "How it is going" })
    const total = async (): Promise<number> => ((await insights.getByRole("img", { name: /Applications sent by day/ }).getAttribute("aria-label")) ?? "").split(": ")[1].split(", ").reduce((sum, n) => sum + Number(n), 0)
    await expect.poll(total).toBe(2)
    for (const [label, count] of [["This week", "1"], ["Last week", "1"], ["Last 8 weeks", "3"], ["Last 2 weeks", "2"]]) {
      await insights.getByRole("combobox", { name: "Insights time frame" }).click()
      await page.getByRole("option", { name: label, exact: true }).click()
      await expect.poll(total).toBe(Number(count))
      await expect(insights.getByRole("combobox", { name: "Insights time frame" })).toContainText(label)
    }
    await shot(page, "insights-periods")
  })

  test("the top bar holds Jobs, Tracker, Documents, Autofill and People; Connect is in the account menu; Home shows what is due and opens the job", async ({ page }) => {
    const day = (ago: number): string => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10)
    await page.route("**/rest/v1/applications*", (route) => route.fulfill({ json: route.request().method() === "GET" ? [{ id: 1, posting_id: FLOW_POSTINGS[0].id, fit_tier: "mid", stage: "applied", logged_at: day(12) }] : [] }))
    await page.goto("/")
    // Home is the dashboard: no switch between three things, only what is waiting.
    await expect(page.getByRole("tablist", { name: "Show" })).toHaveCount(0)
    const due = page.getByRole("region", { name: "Follow up" })
    await expect(due).toBeVisible()
    await expect(due.getByText(FLOW_POSTINGS[0].title)).toBeVisible()
    await expect(due.getByText(/Overdue by 5 days/)).toBeVisible()
    const nav = page.getByRole("navigation", { name: "Your account" })
    await expect(nav.getByRole("button")).toHaveText(["Jobs", "Tracker", "Documents", "Autofill", "People"])
    await nav.getByRole("button", { name: "Tracker", exact: true }).click()
    await expect(page.getByRole("tabpanel", { name: /^Applied, 1 jobs$/ })).toBeVisible()
    await expect(page.getByText(FLOW_POSTINGS[0].title).first()).toBeVisible()
    await page.getByRole("button", { name: "Account menu" }).click()
    await page.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Connect", exact: true })).toBeVisible()
    await expect(page.getByText("Google Drive", { exact: true })).toBeVisible()
    await expect(page.getByText("Gmail", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("Odds for Chrome", { exact: true }).first()).toBeVisible()
    // A job picked on the tracker opens on the Jobs page.
    await nav.getByRole("button", { name: "Tracker", exact: true }).click()
    await page.getByRole("button", { name: new RegExp(FLOW_POSTINGS[0].title) }).first().click()
    await expect(page.getByRole("heading", { level: 1, name: FLOW_POSTINGS[0].title })).toBeVisible()
  })

  test("opening manual entry keeps the CSV uploader open", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Tracker", exact: true }).click()
    await page.getByRole("button", { name: "Import a CSV" }).click()
    await expect(page.getByRole("heading", { name: "Upload a list" })).toBeVisible()

    await page.getByRole("button", { name: "Add a job manually" }).click()
    await expect(page.getByRole("heading", { name: "Upload a list" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Add a job manually" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible()
  })
})

test("the long-read pages load, from a link and from the address bar", async ({ page }) => {
  const pages: ReadonlyArray<[string, string]> = [
    ["/how-it-works", "From a long list to the jobs that fit."],
    ["/about", "A clearer way through a hard job search."],
    ["/privacy", "Plain privacy."],
    ["/terms", "Plain terms."],
    ["/research", "the numbers behind the odds."],
  ]
  for (const [path, heading] of pages) {
    await page.goto(path)
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible()
  }

  await page.goto("/")
  await page.getByRole("navigation", { name: "odds information" }).getByRole("button", { name: "About" }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.getByRole("heading", { level: 1, name: "A clearer way through a hard job search." })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole("heading", { level: 1, name: "ever wondered your interview odds as an international student?" })).toBeVisible()
})

test("a return visit shows the jobs from the last visit before the backend answers", async ({ page }) => {
  await page.goto("/")
  await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE)
  // The pool is kept in IndexedDB once it has loaded.
  await expect.poll(() => page.evaluate(keptPool)).toBe(true)

  // The second visit's job list request is held until the kept list is on screen.
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let asked = false
  await page.route("**/rest/v1/app_jobs*", async (route): Promise<void> => {
    asked = true
    await held
    await route.fallback()
  })
  await page.reload()
  await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE)
  expect(asked).toBe(true)
  release()
  await expect(jobRows(page).first()).toContainText("Customer Success Intern")
})

/** Whether the app has kept the job pool in its IndexedDB cache. Runs in the page, and never creates the database itself. */
async function keptPool(): Promise<boolean> {
  const dbs = await indexedDB.databases()
  if (!dbs.some((d) => d.name === "odds-cache")) {
    return false
  }

  return new Promise((resolve) => {
    const open = indexedDB.open("odds-cache")
    open.onerror = (): void => resolve(false)
    open.onsuccess = (): void => {
      const get = open.result.transaction("kv", "readonly").objectStore("kv").get("pool")
      get.onsuccess = (): void => resolve(get.result !== undefined)
      get.onerror = (): void => resolve(false)
    }
  })
}

test("Claude sending someone to connect: sign in first, and the address goes back to the front page", async ({ page }) => {
  const challenge = "0123456789012345678901234567890123456789012"
  await page.goto(`/connect/claude?client_id=abc&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&state=s&code_challenge=${challenge}&code_challenge_method=S256`)

  const dialog = page.getByRole("dialog", { name: "Sign in to connect Claude" })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Continue with Google" })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})
