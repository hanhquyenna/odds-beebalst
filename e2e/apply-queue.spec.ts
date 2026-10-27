import type { Page } from "@playwright/test"
import { FLOW_POSTINGS } from "./fixtures/postings"
import { expect, shot, test } from "./mock"

type Row = { posting_id: string; state: string; reason: string | null; message: string | null; added_at: string; started_at: string | null; updated_at: string }
const row = (i: number, state: string, reason: string | null = null, message: string | null = null): Row => ({
  posting_id: FLOW_POSTINGS[i].id, state, reason, message, added_at: "2026-10-18T08:00:00Z", started_at: null, updated_at: `2026-10-18T09:0${i}:00Z`,
})

/** A small fake of the queue table and its four functions, so the page can be driven end to end. */
async function fakeQueue(page: Page, start: Row[]): Promise<{ rows: Row[]; calls: Array<{ name: string; body: Record<string, unknown> }> }> {
  const fake = { rows: [...start], calls: [] as Array<{ name: string; body: Record<string, unknown> }> }
  await page.route("**/rest/v1/apply_queue*", (route) => route.fulfill({ json: fake.rows }))
  await page.route("**/rest/v1/rpc/queue_*", (route) => {
    const name = route.request().url().split("/rpc/")[1].split("?")[0]
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
    fake.calls.push({ name, body })
    if (name === "queue_jobs") {
      const ids = body.p_ids as string[]
      for (const id of ids) if (!fake.rows.some((r) => r.posting_id === id)) fake.rows.push({ posting_id: id, state: "waiting", reason: null, message: null, added_at: new Date().toISOString(), started_at: null, updated_at: new Date().toISOString() })
      return route.fulfill({ json: ids.length })
    }
    const id = body.p_id as string
    if (name === "queue_leave") fake.rows = fake.rows.filter((r) => r.posting_id !== id)
    if (name === "queue_sent") fake.rows = fake.rows.map((r) => (r.posting_id === id ? { ...r, state: "sent", reason: null, message: null } : r))
    if (name === "queue_retry") fake.rows = fake.rows.map((r) => (r.posting_id === id ? { ...r, state: "waiting", reason: null, message: null } : r))
    return route.fulfill({ json: null })
  })
  return fake
}

const goTab = (page: Page, name: string): Promise<void> => page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name, exact: true }).click()

test.describe("the apply queue in the web app", () => {
  test.use({ signedIn: true, viewport: { width: 1440, height: 1000 } })

  test("several jobs are picked in the list and added at once", async ({ page }) => {
    const fake = await fakeQueue(page, [])
    await page.goto("/")
    await goTab(page, "Jobs")
    await page.getByRole("button", { name: "Select jobs" }).click()
    const rows = page.locator("[data-job-row] button")
    await rows.nth(0).click()
    await rows.nth(1).click()
    await expect(page.getByText("2 picked")).toBeVisible()
    await shot(page, "queue-select")
    await page.getByRole("button", { name: "Add 2 to queue" }).click()
    await expect(page.getByText(/2 jobs added to your queue/)).toBeVisible()
    expect(fake.calls.filter((c) => c.name === "queue_jobs")).toHaveLength(1)
    expect((fake.calls[0].body.p_ids as string[]).length).toBe(2)
    // Back to a plain list afterwards, and picked jobs say so.
    await expect(page.getByRole("button", { name: "Select jobs" })).toBeVisible()
  })

  test("a job page has Add to queue next to Apply, and it can be taken back", async ({ page }) => {
    const fake = await fakeQueue(page, [])
    await page.goto("/")
    await goTab(page, "Jobs")
    await page.getByRole("button", { name: /Junior Financial Analyst Adyen/ }).click()
    await page.getByRole("button", { name: "Add to queue" }).click()
    await expect(page.getByRole("button", { name: "In your queue · Remove" })).toBeVisible()
    expect(fake.calls[0]).toMatchObject({ name: "queue_jobs" })
    await page.getByRole("button", { name: "In your queue · Remove" }).click()
    await expect(page.getByRole("button", { name: "Add to queue" })).toBeVisible()
    expect(fake.calls.at(-1)?.name).toBe("queue_leave")
  })

  test("the inbox shows one card per application with one plain reason each", async ({ page }) => {
    const fake = await fakeQueue(page, [
      row(0, "review"),
      row(1, "needs_you", "captcha"),
      row(2, "working"),
      row(3, "failed", "other", "The form would not load."),
      row(4, "waiting"),
    ])
    await page.goto("/")
    await goTab(page, "Tracker")
    const inbox = page.getByRole("region", { name: "Apply queue" })
    // The agent's line first: what Odds is doing now. No report while it still works.
    await expect(inbox.getByRole("heading", { name: "Odds is working on 1 application" })).toBeVisible()
    await expect(inbox.getByRole("region", { name: "Report" })).toHaveCount(0)
    // The stop that needs the person is its own card at the top, with the tab to do it in.
    const needs = inbox.getByRole("region", { name: "Needs you" })
    await expect(needs.getByText(/A check is in the way/)).toBeVisible()
    await expect(needs.getByRole("button", { name: "Go to the tab" })).toBeVisible()
    await expect(inbox.getByText("Security check")).toBeVisible()
    await expect(inbox.getByText("The form would not load.")).toBeVisible()
    await expect(inbox.locator("[data-queue-card]")).toHaveCount(5)
    // Nothing ever offers a Submit.
    await expect(inbox.getByRole("button", { name: /submit/i })).toHaveCount(0)
    await shot(page, "queue-inbox")
    // Mark as sent is only on the form that is at Review, and asks first.
    await expect(inbox.getByRole("button", { name: "Mark as sent" })).toHaveCount(1)
    await inbox.getByRole("button", { name: "Mark as sent" }).click()
    await expect(inbox.getByText("Did you press Submit on the site?")).toBeVisible()
    expect(fake.calls.some((c) => c.name === "queue_sent")).toBe(false)
    await inbox.getByRole("button", { name: "Yes, I sent it" }).click()
    await expect(inbox.locator('[data-queue-state="sent"]')).toHaveCount(1)
    expect(fake.calls.filter((c) => c.name === "queue_sent")).toHaveLength(1)
  })

  test("Review & send asks the extension to focus that application's tab", async ({ page }) => {
    await fakeQueue(page, [row(0, "review")])
    await page.addInitScript(() => {
      ;(window as unknown as { __asked: unknown[] }).__asked = []
      window.addEventListener("message", (e) => { if (e.data?.source === "odds-site" && e.data.type === "prepare-application") (window as unknown as { __asked: unknown[] }).__asked.push(e.data) })
    })
    await page.goto("/")
    await goTab(page, "Tracker")
    await page.getByRole("button", { name: "Review & send" }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __asked: unknown[] }).__asked.length)).toBe(1)
    const asked = await page.evaluate(() => (window as unknown as { __asked: Array<{ reveal: boolean; postingId: string }> }).__asked[0])
    expect(asked.reveal).toBe(true)
    expect(asked.postingId).toBe(FLOW_POSTINGS[0].id)
  })

  test("once Odds has nothing left to do, the report says what came out of the run", async ({ page }) => {
    const recent = (i: number, state: string, reason: string | null = null): Row => ({ ...row(i, state, reason), started_at: new Date(Date.now() - 50 * 60_000).toISOString(), updated_at: new Date(Date.now() - (10 - i) * 60_000).toISOString() })
    await fakeQueue(page, [recent(0, "review"), recent(1, "review"), recent(2, "failed", "closed"), recent(3, "sent")])
    await page.goto("/")
    await goTab(page, "Tracker")
    const inbox = page.getByRole("region", { name: "Apply queue" })
    await expect(inbox.getByRole("heading", { name: "2 of 4 ready to send" })).toBeVisible()
    const report = inbox.getByRole("region", { name: "Report" })
    await expect(report.getByText("Ready to send")).toBeVisible()
    await expect(report.getByText("Skipped (closed or stuck)")).toBeVisible()
    await expect(inbox.getByRole("button", { name: "Review & send" })).toHaveCount(2)
    await expect(inbox.getByRole("region", { name: "Needs you" })).toHaveCount(0)
    await shot(page, "queue-report")
  })

  test("an empty queue shows nothing on the tracker", async ({ page }) => {
    await fakeQueue(page, [])
    await page.goto("/")
    await goTab(page, "Tracker")
    await expect(page.getByRole("region", { name: "Apply queue" })).toHaveCount(0)
  })
})
