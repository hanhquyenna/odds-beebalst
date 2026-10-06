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

  // Allowing jobs that need Dutch brings the Rabobank controller in; the senior job stays out on level.
  await page.getByRole("button", { name: "Language: English" }).click()
  await page.getByRole("checkbox", { name: "Dutch needed" }).click()
  await expect(page.getByRole("heading", { level: 2, name: `${DEFAULT_VISIBLE + 1} internship, traineeship & entry jobs right now` })).toBeVisible()
  // The list shows ten at a time.
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Show more (1 left)" }).click()
  await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE + 1)
  await expect(jobRows(page).filter({ hasText: "Junior Business Controller" })).toHaveCount(1)
  await expect(jobRows(page).filter({ hasText: "Senior Data Engineer" })).toHaveCount(0)
})

test("opening a job shows its detail, text included", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /Junior Financial Analyst Adyen/ }).click()

  const detail = page.getByRole("dialog")
  await expect(detail.getByRole("heading", { name: "Junior Financial Analyst" })).toBeVisible()
  await expect(detail.getByText("€3.600 – €4.200")).toBeVisible()
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

test("first visit: start, skip LinkedIn, see your jobs, answer the questions and keep them", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "Start" }).click()
  await expect(page.getByRole("heading", { name: "What is your LinkedIn?" })).toBeVisible()
  await page.getByRole("button", { name: "Continue without LinkedIn" }).click()

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
