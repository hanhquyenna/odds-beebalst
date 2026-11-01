import type { Page } from "@playwright/test"
import { FLOW_POSTINGS } from "./fixtures/postings"
import { expect, shot, test } from "./mock"

type Row = { posting_id: string; state: string; reason: string | null; message: string | null; tries: number; added_at: string; started_at: string | null; updated_at: string }
const row = (i: number, state: string, reason: string | null = null, message: string | null = null): Row => ({
  posting_id: FLOW_POSTINGS[i].id, state, reason, message, tries: 0, added_at: `2026-11-01T08:0${i}:00Z`, started_at: null, updated_at: `2026-11-01T09:0${i}:00Z`,
})

/** A small fake of the queue table and its functions, so the page can be driven end to end. */
async function fakeQueue(page: Page, start: Row[]): Promise<{ rows: Row[]; calls: Array<{ name: string; body: Record<string, unknown> }> }> {
  const fake = { rows: [...start], calls: [] as Array<{ name: string; body: Record<string, unknown> }> }
  await page.route("**/rest/v1/apply_queue*", (route) => route.fulfill({ json: fake.rows }))
  await page.route("**/rest/v1/rpc/queue_*", (route) => {
    const name = route.request().url().split("/rpc/")[1].split("?")[0]
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
    fake.calls.push({ name, body })
    const id = body.p_id as string
    if (name === "queue_leave") fake.rows = fake.rows.flatMap((r) => (r.posting_id !== id ? [r] : r.state === "waiting" ? [] : [{ ...r, state: "skipped" }]))
    if (name === "queue_sent") fake.rows = fake.rows.map((r) => (r.posting_id === id ? { ...r, state: "sent", reason: null, message: null } : r))
    if (name === "queue_retry") fake.rows = fake.rows.map((r) => (r.posting_id === id ? { ...r, state: "waiting", reason: null, message: null } : r))
    return route.fulfill({ json: null })
  })
  return fake
}

const openApplications = (page: Page): Promise<void> => page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Applications", exact: true }).click()

test.describe("Applications: the one page for what Odds is doing", () => {
  test.use({ signedIn: true, viewport: { width: 1440, height: 1000 } })

  test("every job pressed Apply on, needs-you first, with one next step each and nothing that submits", async ({ page }) => {
    const fake = await fakeQueue(page, [
      row(0, "review"),
      row(1, "needs_you", "captcha"),
      row(2, "working"),
      row(3, "waiting"),
      row(4, "sent"),
    ])
    await page.goto("/")
    await openApplications(page)
    await expect(page.getByRole("heading", { name: "Odds is working on 1 application" })).toBeVisible()
    await expect(page.getByText("In your Chrome · 1 up next")).toBeVisible()
    // The one thing that needs the person, on top.
    const banner = page.getByRole("region", { name: "Needs you now" })
    await expect(banner.getByText(/A check is in the way/)).toBeVisible()
    await expect(banner.getByRole("button", { name: "Go to the tab" })).toBeVisible()
    const list = page.getByRole("region", { name: "Your applications" })
    await expect(list.locator("[data-queue-row]")).toHaveCount(5)
    // Needs you, then ready, then working, then up next, then done.
    expect(await list.locator("[data-queue-row]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-queue-row")))).toEqual(["needs_you", "review", "working", "waiting", "sent"])
    await expect(list.getByText("1st in line", { exact: false })).toBeVisible()
    await expect(list.getByRole("button", { name: "Review & send" })).toBeVisible()
    await expect(page.getByRole("button", { name: /submit/i })).toHaveCount(0)
    await shot(page, "applications-page")
    // Filters.
    await list.getByRole("button", { name: "Done 1" }).click()
    await expect(list.locator("[data-queue-row]")).toHaveCount(1)
    await list.getByRole("button", { name: "All 5" }).click()
    // "I sent it" asks first, then moves the job to Sent.
    await list.locator('[data-queue-row="review"]').getByRole("button", { name: "I sent it" }).click()
    await expect(page.getByText("Did you press Submit on the site?")).toBeVisible()
    expect(fake.calls.some((c) => c.name === "queue_sent")).toBe(false)
    await page.getByRole("button", { name: "Yes, I sent it" }).click()
    await expect(list.locator('[data-queue-row="sent"]')).toHaveCount(2)
    // An up-next job is removed outright; a stopped one is skipped and stays under Done, where it can be tried again.
    await list.locator('[data-queue-row="waiting"]').getByRole("button", { name: "Remove" }).click()
    await expect(list.locator("[data-queue-row]")).toHaveCount(4)
    await list.locator('[data-queue-row="needs_you"]').getByRole("button", { name: "Skip" }).click()
    await expect(list.locator('[data-queue-row="skipped"]')).toHaveCount(1)
    await list.locator('[data-queue-row="skipped"]').getByRole("button", { name: "Try again" }).click()
    await expect(list.locator('[data-queue-row="waiting"]')).toHaveCount(1)
    expect(fake.calls.map((c) => c.name)).toEqual(["queue_sent", "queue_leave", "queue_leave", "queue_retry"])
  })

  test("Go to the tab asks Odds in Chrome to show that application's tab", async ({ page }) => {
    await fakeQueue(page, [row(0, "needs_you", "account")])
    await page.addInitScript(() => {
      ;(window as unknown as { __asked: unknown[] }).__asked = []
      window.addEventListener("message", (e) => { if (e.data?.source === "odds-site" && e.data.type === "prepare-application") (window as unknown as { __asked: unknown[] }).__asked.push(e.data) })
    })
    await page.goto("/")
    await openApplications(page)
    await page.getByRole("region", { name: "Your applications" }).getByRole("button", { name: "Go to the tab" }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __asked: unknown[] }).__asked.length)).toBe(1)
    const asked = await page.evaluate(() => (window as unknown as { __asked: Array<{ reveal: boolean; postingId: string }> }).__asked[0])
    expect(asked).toMatchObject({ reveal: true, postingId: FLOW_POSTINGS[0].id })
  })

  test("an empty queue says how to fill it", async ({ page }) => {
    await fakeQueue(page, [])
    await page.goto("/")
    await openApplications(page)
    await expect(page.getByText("Nothing in your queue yet")).toBeVisible()
    await page.getByRole("button", { name: "Find jobs" }).click()
    await expect(page.locator("[data-job-row]").first()).toBeVisible()
  })
})
