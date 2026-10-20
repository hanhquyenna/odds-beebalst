import type { BrowserContext, Page } from "@playwright/test"
import { FLOW_POSTINGS } from "./fixtures/postings"
import { expect, test } from "./mock"
import type { DriveRun } from "../src/lib/drive-run-state"

test.use({ signedIn: true })

interface MonitorFixture {
  runs: DriveRun[]
  controls: Array<{ p_run: string; p_action: string }>
  historyReads: number
  commandReads: number
  failHistory: boolean
  controlGate?: Promise<void>
}

/** Creates distinct live, blocked, review, stopped, failed, and older-attempt observations. */
function fixture(): MonitorFixture {
  const now = Date.now()
  const runs = ["needs_you", "running", "review", "stopped", "failed"].map((status, index): DriveRun => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    posting_id: FLOW_POSTINGS[index].id,
    url: `https://jobs.example.com/application/${index}`,
    status: status as DriveRun["status"],
    reason: index === 0 ? "questions" : null,
    message: index === 0 ? "What is your availability?" : index === 4 ? "The CV upload failed." : null,
    last_note: index === 1 ? "Uploading your CV." : "Reading the application.",
    steps: 3,
    last_seen_at: new Date(now - 1000).toISOString(),
    updated_at: new Date(now - (index === 4 ? 3 * 86_400_000 : 1000)).toISOString(),
    created_at: new Date(now - (index === 4 ? 3 * 86_400_000 : (index + 1) * 60_000)).toISOString(),
  }))
  runs.push({ ...runs[0], id: "00000000-0000-4000-8000-000000000099", status: "failed", message: "An earlier attempt failed.", created_at: new Date(now - 5 * 86_400_000).toISOString(), updated_at: new Date(now - 5 * 86_400_000).toISOString() })

  return { runs: runs, controls: [], historyReads: 0, commandReads: 0, failHistory: false }
}

/** Serves owner-filtered metadata and acknowledged controls, never employer pages or model endpoints. */
async function installFixture(context: BrowserContext, state: MonitorFixture): Promise<void> {
  await context.addInitScript(() => {
    history.replaceState({ view: "tracker" }, "", "/")
  })
  await context.route("**/rest/v1/drive_runs?**", async (route): Promise<void> => {
    const params = new URL(route.request().url()).searchParams
    const ownerRead = params.has("user_id")
    if (ownerRead && !params.has("posting_id")) state.historyReads += 1
    if (ownerRead && state.failHistory) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "History unavailable" }) })

      return
    }
    let rows = [...state.runs].sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (params.has("posting_id")) rows = rows.filter((run) => `eq.${run.posting_id}` === params.get("posting_id"))
    if (params.has("or")) rows = rows.filter((run) => Date.now() - Date.parse(run.updated_at) < 2 * 60 * 60_000 || run.status === "review")
    const offset = Number(params.get("offset") || 0)
    const limit = Number(params.get("limit") || 50)
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(rows.slice(offset, offset + limit)) })
  })
  await context.route("**/rest/v1/drive_commands?**", async (route): Promise<void> => {
    state.commandReads += 1
    const params = new URL(route.request().url()).searchParams
    expect(params.get("select")).toBe("id,tool,note,status,created_at")
    const rows = [{ id: 3, tool: "upload_cv", status: "done", note: "Uploading your CV.", created_at: new Date().toISOString() }]
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(rows) })
  })
  await context.route("**/rest/v1/rpc/drive_control", async (route): Promise<void> => {
    const body = route.request().postDataJSON() as { p_run: string; p_action: string }
    state.controls.push(body)
    if (state.controlGate) await state.controlGate
    const run = state.runs.find((item) => item.id === body.p_run)
    if (run) { run.status = body.p_action === "stop" ? "stopped" : "running"; run.updated_at = new Date().toISOString(); run.last_note = "Continuing in the same application." }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify("ok") })
  })
  await context.route("**/rest/v1/saved_jobs?**", async (route): Promise<void> => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([{ posting_id: FLOW_POSTINGS[6].id }]) })
  })
  await context.route("**/rest/v1/applications?**", async (route): Promise<void> => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: 7, posting_id: FLOW_POSTINGS[5].id, title: FLOW_POSTINGS[5].title, employer: FLOW_POSTINGS[5].employer_display, fit_tier: "", stage: "interview", logged_at: "2026-10-01T10:00:00Z" }]) })
  })
}

/** Opens the current site's existing Table layout without changing its Board default. */
async function openTracker(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByRole("group", { name: "Layout", exact: true }).getByRole("button", { name: "Table", exact: true }).click()
}

test("Tracker keeps saved jobs, application progress, and history in its ordinary table", async ({ context, page }) => {
  const state = fixture()
  await installFixture(context, state)
  await openTracker(page)
  const monitor = page.getByRole("region", { name: "Application activity" })
  await expect(monitor).toBeVisible()
  await expect(monitor.getByText("7 jobs", { exact: true })).toBeVisible()
  await expect(monitor.getByText(FLOW_POSTINGS[6].title, { exact: true })).toBeVisible()
  await expect(monitor.getByRole("row").filter({ hasText: FLOW_POSTINGS[5].title }).getByText("Interview", { exact: true })).toBeVisible()
  await expect(monitor.getByText("The CV upload failed.", { exact: true })).toBeVisible()
  await expect(monitor.getByRole("button", { name: "Activity", exact: true })).toHaveCount(0)
  expect(state.commandReads).toBe(0)
  await page.screenshot({ path: "docs/auto-apply-review/responsive-review/implemented-a-desktop.png", fullPage: false })
  const row = monitor.getByRole("row").filter({ hasText: FLOW_POSTINGS[0].title })
  await row.getByRole("button", { name: FLOW_POSTINGS[0].title, exact: false }).click()
  const drawer = page.getByRole("dialog")
  const history = drawer.locator("details").filter({ hasText: "Application history" }).first()
  await history.locator("details").first().locator("summary").click()
  await expect(history.getByText("Response received", { exact: true })).toBeVisible()
  expect(state.commandReads).toBe(1)
  await drawer.getByRole("button", { name: "Close", exact: true }).click()
  const manual = monitor.getByRole("row").filter({ hasText: FLOW_POSTINGS[5].title })
  await manual.getByRole("button", { name: "View job", exact: true }).click()
  await expect(drawer.getByText("Application logged", { exact: false })).toBeVisible()
  await expect(drawer.getByText("No browser assistance recorded for this job.", { exact: true })).toBeVisible()
  await drawer.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByRole("group", { name: "Layout", exact: true }).getByRole("button", { name: "Board", exact: true }).click()
  await expect(monitor).toHaveCount(0)
  await page.getByRole("group", { name: "Layout", exact: true }).getByRole("button", { name: "Table", exact: true }).click()
  await expect(monitor).toBeVisible()
  expect(state.commandReads).toBe(1)
})

test("Stop and Continue target the selected run and wait for acknowledgement", async ({ context, page }) => {
  const state = fixture()
  let acknowledge = (): void => undefined
  state.controlGate = new Promise<void>((resolve) => { acknowledge = resolve })
  await installFixture(context, state)
  await openTracker(page)
  const monitor = page.getByRole("region", { name: "Application activity" })
  const row = monitor.getByRole("row").filter({ hasText: FLOW_POSTINGS[1].title })
  await row.getByRole("button", { name: "Stop", exact: true }).click()
  try {
    await expect(row.getByRole("button", { name: "Stop", exact: true })).toBeDisabled()
    await expect(row.getByText("Filling form", { exact: true })).toBeVisible()
    const inBounds = await row.evaluate((element) => {
      const bounds = element.getBoundingClientRect()

      return [...element.querySelectorAll("button")].every((button) => button.getBoundingClientRect().right <= bounds.right + 1)
    })
    expect(inBounds).toBe(true)
  } finally { acknowledge() }
  await expect(row.getByText("Paused", { exact: true })).toBeVisible()
  expect(state.controls).toEqual([{ p_run: state.runs[1].id, p_action: "stop" }])
  await row.getByRole("button", { name: "Continue", exact: true }).click()
  await expect(row.getByText("Filling form", { exact: true })).toBeVisible()
  expect(state.controls[1]).toEqual({ p_run: state.runs[1].id, p_action: "continue" })
  expect(state.runs[0].status).toBe("needs_you")
})

test.describe("history failure and recovery", () => {
  test.use({ allowedConsoleErrors: ["Failed to load resource: the server responded with a status of 400 (Bad Request)"] })

  test("Tracker recovers history after reload and reports a history-read failure truthfully", async ({ context, page }) => {
  const state = fixture()
  state.failHistory = true
  await installFixture(context, state)
  await openTracker(page)
  const monitor = page.getByRole("region", { name: "Application activity" })
  await expect(monitor.getByRole("alert")).toContainText("Could not load application activity")
  state.failHistory = false
  await monitor.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(monitor.getByText("The CV upload failed.", { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole("group", { name: "Layout", exact: true }).getByRole("button", { name: "Table", exact: true }).click()
  await expect(monitor.getByText("The CV upload failed.", { exact: true })).toBeVisible()
  expect(state.commandReads).toBe(0)
})

})

test("phone Tracker keeps monitoring and controls in the existing responsive list", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state = fixture()
  await installFixture(context, state)
  await openTracker(page)
  const monitor = page.getByRole("region", { name: "Application activity" })
  await expect(monitor).toBeVisible()
  await expect(monitor.getByRole("table")).toHaveCount(0)
  await expect(monitor.getByRole("listitem")).toHaveCount(7)
  await page.screenshot({ path: "docs/auto-apply-review/responsive-review/implemented-a-phone.png", fullPage: false })
  const row = monitor.getByRole("listitem").filter({ hasText: FLOW_POSTINGS[1].title })
  await row.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(row.getByText("Paused", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

})

for (const width of [320, 768, 820, 1024]) {
  test(`Tracker controls fit their visible frame at ${width}px`, async ({ context, page }) => {
    await page.setViewportSize({ width: width, height: 900 })
    const state = fixture()
    await installFixture(context, state)
    await openTracker(page)
    const monitor = page.getByRole("region", { name: "Application activity" })
    await expect(monitor.getByText("7 jobs", { exact: true })).toBeVisible()
    const clipped = await monitor.evaluate((element) => {
      const bounds = element.getBoundingClientRect()

      return [...element.querySelectorAll("button")].filter((button) => {
        const box = button.getBoundingClientRect()

        return box.width > 0 && box.height > 0 && (box.left < Math.max(0, bounds.left) - 1 || box.right > Math.min(innerWidth, bounds.right) + 1)
      }).map((button) => button.textContent?.trim())
    })
    expect(clipped).toEqual([])
    const wrapped = await monitor.locator(".application-actions").evaluateAll((groups) => groups.filter((group) => group.getBoundingClientRect().width > 0).some((group) => new Set([...group.children].map((child) => child.getBoundingClientRect().top)).size > 1))
    expect(wrapped).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `docs/auto-apply-review/responsive-review/implemented-${width}.png`, fullPage: false })
  })
}

test("Tracker sorting, property choices and status colors stay usable", async ({ context, page }) => {
  const state = fixture()
  await installFixture(context, state)
  await openTracker(page)
  const monitor = page.getByRole("region", { name: "Application activity" })
  const ready = monitor.getByRole("row").filter({ hasText: FLOW_POSTINGS[2].title }).getByText("Ready to review", { exact: true })
  const attention = monitor.getByRole("row").filter({ hasText: FLOW_POSTINGS[0].title }).getByText("Your answers", { exact: true })
  const failure = monitor.getByRole("row").filter({ hasText: FLOW_POSTINGS[4].title }).getByText("Needs attention", { exact: true })
  const colors = await Promise.all([ready, attention, failure].map((locator) => locator.evaluate((element) => getComputedStyle(element).color)))
  expect(new Set(colors).size).toBe(3)
  await monitor.getByRole("button", { name: "Sort by Job", exact: true }).click()
  const titles = await monitor.locator("tbody .application-name-cell button").allTextContents()
  const expected = [...FLOW_POSTINGS.slice(0, 7)].sort((a, b) => a.title.localeCompare(b.title)).map((post) => `${post.title}${post.employer_display}`)
  expect(titles).toEqual(expected)
  await monitor.getByRole("button", { name: "Properties", exact: true }).click()
  await page.getByRole("button", { name: "Activity", exact: true, pressed: true }).click()
  await page.keyboard.press("Escape")
  await expect(monitor.getByRole("columnheader", { name: "Sort by Activity", exact: true })).toHaveCount(0)
  await monitor.getByRole("button", { name: "Properties", exact: true }).click()
  await page.getByRole("button", { name: "Activity", exact: true, pressed: false }).click()
  await page.keyboard.press("Escape")
  await expect(monitor.getByRole("columnheader", { name: "Sort by Activity", exact: true })).toBeVisible()
  await monitor.getByRole("button", { name: "More job actions", exact: true }).click()
  await expect(page.getByRole("button", { name: "New view", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Refresh activity", exact: true })).toBeVisible()
  expect(state.commandReads).toBe(0)
})

test("Tracker keeps activity filters and optional columns inside the existing controls", async ({ context, page }) => {
  const state = fixture()
  await installFixture(context, state)
  await openTracker(page)
  const monitor = page.getByRole("region", { name: "Application activity" })
  await expect(monitor.getByText("7 jobs", { exact: true })).toBeVisible()
  await monitor.getByRole("button", { name: "Properties", exact: true }).click()
  await page.getByRole("button", { name: "Pay", exact: true, pressed: false }).click()
  await page.keyboard.press("Escape")
  await expect(monitor.getByRole("columnheader", { name: "Sort by Pay", exact: true })).toBeVisible()
  await page.setViewportSize({ width: 820, height: 900 })
  await expect(monitor.getByRole("table")).toHaveCount(0)
  const clipped = await monitor.evaluate((element) => {
    const bounds = element.getBoundingClientRect()

    return [...element.querySelectorAll("button, input, select")].some((control) => {
      const box = control.getBoundingClientRect()

      return box.width > 0 && box.height > 0 && (box.left < bounds.left - 1 || box.right > bounds.right + 1)
    })
  })
  expect(clipped).toBe(false)
  await monitor.getByRole("button", { name: /^Filter/ }).click()
  await page.getByRole("button", { name: "Activity: All activity", exact: true }).click()
  await page.getByRole("checkbox", { name: "Ready to review", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(monitor.getByText("1 job", { exact: true })).toBeVisible()
  await expect(monitor.getByRole("listitem")).toHaveCount(1)
  await page.getByRole("button", { name: "Activity: Ready to review", exact: true }).click()
  await page.getByRole("button", { name: "Clear", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(monitor.getByText("7 jobs", { exact: true })).toBeVisible()
  expect(state.commandReads).toBe(0)
})
