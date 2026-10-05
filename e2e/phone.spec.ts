import type { Page } from "@playwright/test"
import { DEFAULT_VISIBLE, FLOW_POSTINGS } from "./fixtures/postings"
import { expect, jobRows, shot, test } from "./mock"

test("phone: landing, your jobs and a job never scroll sideways", async ({ page }) => {
  await page.goto("/")
  await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE)
  await expectNoSideScroll(page)

  await page.getByRole("button", { name: "Start" }).click()
  await page.getByRole("button", { name: "Continue without LinkedIn" }).click()
  await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE)
  await expectNoSideScroll(page)
  await shot(page, "phone-job-list")

  await page.goto(`/job/${FLOW_POSTINGS[0].id}`)
  await expect(page.getByRole("heading", { level: 1, name: FLOW_POSTINGS[0].title })).toBeVisible()
  await expectNoSideScroll(page)
})

/** Fails when the page is wider than the screen, the overflow a phone shows as sideways scrolling. */
async function expectNoSideScroll(page: Page): Promise<void> {
  const size = await page.evaluate((): { scroll: number; screen: number } => ({ scroll: document.scrollingElement?.scrollWidth ?? 0, screen: window.innerWidth }))

  expect(size.scroll, `page is ${size.scroll}px wide on a ${size.screen}px screen`).toBeLessThanOrEqual(size.screen)
}
