import { FLOW_POSTINGS } from "./fixtures/postings"
import { expect, shot, test } from "./mock"

test.describe("the signed-in web app", () => {
  test.use({ signedIn: true, viewport: { width: 1440, height: 1000 } })

  test("the top bar holds the mascot, the odds name and the five places", async ({ page }) => {
    await page.goto("/")
    const nav = page.getByRole("navigation", { name: "Your account" })
    for (const name of ["Jobs", "Tracker", "Documents", "Autofill", "People"]) await expect(nav.getByRole("button", { name: name, exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "odds, home" })).toBeVisible()
    await shot(page, "web-home")
  })

  test("people page", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "People", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Add a person" })).toBeVisible()
    await shot(page, "web-people")
  })

  test("jobs: a list on the left, the job on the right, four tabs", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Jobs", exact: true }).click()
    await page.getByRole("button", { name: /Junior Financial Analyst Adyen/ }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Junior Financial Analyst" })).toBeVisible()
    await shot(page, "web-job")
    for (const tab of ["Company", "People", "Documents", "Overview"]) {
      await page.getByRole("tab", { name: tab }).click()
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true")
      await shot(page, `web-job-${tab.toLowerCase()}`)
    }
  })

  test("tracker: five columns with the saved and applied jobs, a view switch", async ({ page }) => {
    const day = (ago: number): string => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10)
    await page.route("**/rest/v1/applications*", (route) => route.fulfill({ json: route.request().method() === "GET" ? [{ id: 1, posting_id: FLOW_POSTINGS[0].id, fit_tier: "mid", stage: "applied", logged_at: day(12) }, { id: 2, posting_id: FLOW_POSTINGS[1].id, fit_tier: "mid", stage: "interview", logged_at: day(3) }] : [] }))
    await page.route("**/rest/v1/saved_jobs*", (route) => route.fulfill({ json: route.request().method() === "GET" ? [{ posting_id: FLOW_POSTINGS[2].id }, { posting_id: FLOW_POSTINGS[3].id }] : [] }))
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Tracker", exact: true }).click()
    for (const col of ["Saved", "Applied", "Interview", "Offer", "Closed"]) await expect(page.getByRole("tabpanel", { name: new RegExp(`^${col}, `) })).toBeVisible()
    await expect(page.getByRole("group", { name: "Layout" }).getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true")
    await shot(page, "web-tracker")
    await page.getByRole("group", { name: "Layout" }).getByRole("button", { name: "Table" }).click()
    await shot(page, "web-tracker-table")
    await page.getByRole("group", { name: "Layout" }).getByRole("button", { name: "Calendar" }).click()
    await shot(page, "web-tracker-calendar")
  })

  test("documents: the CV and cover letter shelves and the preview", async ({ page }) => {
    const row = (id: string, kind: string, name: string, main: boolean): Record<string, unknown> => ({ id, kind, name, file_name: `${name}.pdf`, mime: "application/pdf", size_bytes: 1000, body: "Recruitment and communication, Excel, SQL. Intern at Adyen.", is_main: main, created_at: "2026-10-12T10:00:00Z", drive_file_id: null })
    await page.route("**/rest/v1/documents*", (route) => route.fulfill({ json: route.request().method() === "GET" ? [row("d1", "cv", "Kien Phung FIN", true), row("d2", "cv", "Kien Phung HR", false), row("d3", "cover_letter", "Cover letter Tony", false)] : [] }))
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Documents", exact: true }).click()
    await expect(page.getByRole("heading", { name: "CVs" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Cover letters" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Make main" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled()
    await shot(page, "web-documents")
  })

  test("autofill: the ring, the answers with Edit, Chrome", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Autofill", exact: true }).click()
    await expect(page.getByText(/\d+ of \d+ filled/)).toBeVisible()
    await page.getByRole("button", { name: "Edit Phone number" }).click()
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Cancel" }).click()
    await shot(page, "web-autofill")
  })

  test("with a profile: the top five match your preferences, the chance is a ring, keywords are pills", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", origin: "non_eu", dutch: "basic", cv: "Finance intern. Excel and SQL. Financial modelling.", positions: [{ Title: "Finance Intern", "Company Name": "Example" }], education: [{ "School Name": "University of Amsterdam", "Degree Name": "BSc", "Field Of Study": "Economics", "End Date": "2026" }], skills: [{ Name: "Excel" }, { Name: "SQL" }] })))
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Jobs", exact: true }).click()
    await expect(page.getByRole("region", { name: "Match your preferences" })).toBeVisible()
    await expect(page.getByRole("region", { name: "Match your preferences" }).getByRole("button", { name: "Preferences" })).toBeVisible()
    await page.getByRole("button", { name: /Junior Financial Analyst Adyen/ }).click()
    await expect(page.getByRole("region", { name: "Interview chance" })).toBeVisible()
    await expect(page.getByText("Already in your CV")).toBeVisible()
    await shot(page, "web-job-profile")
  })

  test("Tailor my CV with AI: what changed, what is not on the CV, saved as a new CV on the job", async ({ page }) => {
    const body = "KIEN PHUNG\nFinance intern. Excel and SQL. Financial modelling.\nEXPERIENCE\nExample Corp 2025\nFinance Intern\n• Built reports in Excel and SQL for the finance team"
    await page.addInitScript(() => localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", email: "t@example.com", origin: "non_eu", dutch: "basic", cv: "Finance intern. Excel.", positions: [{ Title: "Finance Intern", "Company Name": "Example" }], education: [{ "School Name": "University of Amsterdam", "Degree Name": "BSc", "Field Of Study": "Economics", "End Date": "2026" }], skills: [{ Name: "Excel" }] })))
    const row = { id: "11111111-1111-4111-8111-111111111111", kind: "cv", name: "My CV", file_name: "My CV.pdf", mime: "application/pdf", size_bytes: 1000, body, is_main: true, created_at: "2026-10-12T10:00:00Z", drive_file_id: null }
    await page.route("**/rest/v1/documents*", (route) => route.fulfill({ json: route.request().method() === "GET" ? [row] : [] }))
    let asked: Record<string, unknown> | null = null
    const bullet = { part: "Finance Intern, Example Corp", kind: "reworded", before: "Built reports in Excel and SQL for the finance team", after: "Built finance team reports in Excel" }
    await page.route("**/functions/v1/tailor/draft", async (route) => {
      asked = route.request().postDataJSON()
      await route.fulfill({
        json: {
          kind: "cv",
          result: {
            cv: { name: "Kien Phung", contact: { email: "t@example.com" }, experience: [{ title: "Finance Intern", company: "Example Corp", start: "2025", bullets: [bullet.after] }], education: [], skills: [{ label: "Tools", items: ["Excel"] }], projects: [], languages: [] },
            changes: [bullet, { part: "Skills", kind: "unchanged", before: "SQL", after: "Excel" }],
            counts: { added: 0, reworded: 1, unchanged: 1, left_out: 0 },
            added_keywords: ["Excel"],
            missing: [{ name: "sql", label: "SQL", tier: "must" }, { name: "financial modelling", label: "Financial modelling", tier: "must" }],
            kept_original: [],
          },
        },
      })
    })
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Jobs", exact: true }).click()
    await page.getByRole("button", { name: /Junior Financial Analyst Adyen/ }).first().click()
    await page.getByRole("button", { name: "Tailor my CV with AI" }).click()
    await expect(page.getByLabel("Your tailored CV")).toBeVisible()
    await expect(page.getByText("Not on your CV: add it only if it is true")).toBeVisible()
    await expect(page.getByText("+ SQL")).toBeVisible()
    await expect(page.getByText("0 added · 1 reworded · 1 unchanged")).toBeVisible()
    await expect(page.getByText("Built finance team reports in Excel", { exact: true })).toBeVisible()
    // The request carries the job's keywords with their tiers, and the CV to work from (the main CV: nothing is attached to this job yet).
    expect((asked as { document_id?: string } | null)?.document_id).toBe(row.id)
    const wanted = JSON.stringify((asked as { wanted?: unknown } | null)?.wanted)
    expect(wanted).toContain("sql")
    await shot(page, "web-job-tailor")
    await page.getByRole("button", { name: "Discard" }).click()
    await expect(page.getByRole("button", { name: "Tailor my CV with AI" })).toBeVisible()
  })
})

test.describe("the signed-in web app on a phone-sized screen", () => {
  test.use({ signedIn: true, viewport: { width: 390, height: 844 } })

  test("the list and the job take turns, and nothing scrolls sideways", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Jobs" }).last().click()
    await shot(page, "web-phone-jobs")
    await page.getByRole("button", { name: /Junior Financial Analyst Adyen/ }).click()
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible()
    await shot(page, "web-phone-job")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole("button", { name: "All jobs" }).click()
    await expect(page.getByRole("button", { name: /Junior Financial Analyst Adyen/ })).toBeVisible()
  })
})
