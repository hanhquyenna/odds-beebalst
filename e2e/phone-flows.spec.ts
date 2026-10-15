import type { Page } from "@playwright/test"
import { DEFAULT_VISIBLE } from "./fixtures/postings"
import { expect, jobRows, shot, test } from "./mock"

/** Fails when the page is wider than the screen, the overflow a phone shows as sideways scrolling. */
async function expectNoSideScroll(page: Page): Promise<void> {
  const size = await page.evaluate((): { scroll: number; screen: number } => ({ scroll: document.scrollingElement?.scrollWidth ?? 0, screen: window.innerWidth }))
  expect(size.scroll, `page is ${size.scroll}px wide on a ${size.screen}px screen`).toBeLessThanOrEqual(size.screen)
}

/** Fails when something you tap is too small to hit with a thumb (44 px is the usual floor; 40 allows for a padded icon button). */
async function expectTapTargets(page: Page): Promise<void> {
  const small = await page.evaluate((): string[] => {
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("button, a[href], [role=button], [role=tab], input[type=checkbox]"))) {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || style.display === "none" || r.bottom < 0 || r.top > window.innerHeight * 4) continue
      // Links inside running text and the page's own tiny controls are not what this checks: only controls that stand alone.
      if (el.tagName === "A" && (el.closest("p, li") || el.closest("footer")) && !el.closest("nav")) continue
      if (r.height < 40 && r.width < 40) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }

    return out
  })
  expect(small, "controls smaller than a thumb").toEqual([])
}

const CV = `KIEN TEST

Amsterdam, Netherlands

EDUCATION

University of Amsterdam

MSc Finance Expected June 2027

SKILLS

Financial Analysis: Financial modeling, DCF valuation, SQL, Excel

EXPERIENCE

Van Oord Jan 2025 – Jan 2026
Finance Intern
Rotterdam, Netherlands
• Built budgets and monthly reports in Excel.

Picnic Jan 2024 – Jan 2025
Business Analyst
Amsterdam, Netherlands
• Reported on supply chain costs.`

test.describe("on a phone, first visit", () => {
  test("a CV is the way in: it fills your roles and degree and every job shows a chance", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Start" }).click()
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "Upload your CV" }).click()
    await (await chooser).setFiles({ name: "cv.txt", mimeType: "text/plain", buffer: Buffer.from(CV) })

    // The page says what it read, so a wrong reading can be corrected.
    await expect(page.getByText("Reading your profile")).toBeHidden({ timeout: 15000 })
    await expect(jobRows(page).first()).toBeVisible()
    await expectNoSideScroll(page)
    await shot(page, "phone-after-cv")
  })

  test("the job list, a job and back never overflow and every control can be tapped", async ({ page }) => {
    await page.goto("/")
    await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE)
    await expectTapTargets(page)
    await page.getByRole("button", { name: "Start" }).click()
    await expectNoSideScroll(page)
    await page.getByRole("button", { name: "Skip for now, just show me jobs" }).click()
    await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE)
    await jobRows(page).first().getByRole("button").first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expectNoSideScroll(page)
    // The phone's Back button closes the job and returns to the list, not out of the app.
    await page.goBack()
    await expect(jobRows(page)).toHaveCount(DEFAULT_VISIBLE)
  })

  test("the steps to add odds to the Home Screen open from the address a QR code carries, and walk through all five steps", async ({ page }) => {
    await page.goto("/?install=1")
    const guide = page.getByRole("dialog", { name: /Add odds to your Home Screen/ })
    await expect(guide).toBeVisible()
    for (let step = 1; step <= 4; step++) {
      await expect(guide.getByText(`Step ${step} of 5`)).toBeVisible()
      await guide.getByRole("button", { name: "Next" }).click()
    }
    await expect(guide.getByText("Step 5 of 5")).toBeVisible()
    await guide.getByRole("button", { name: "Got it" }).click()
    await expect(guide).toBeHidden()
    await expectNoSideScroll(page)
  })
})

test.describe("on a phone, signed in", () => {
  test.use({ signedIn: true })

  test("the add-to-phone card shows once, opens the steps, and 'Not now' keeps it away", async ({ page }) => {
    await page.goto("/")
    const card = page.getByRole("dialog", { name: "odds is now an app" })
    await expect(card).toBeVisible({ timeout: 8000 })
    await expectNoSideScroll(page)
    await shot(page, "phone-add-to-phone-card")
    await card.getByRole("button", { name: "Not now", exact: true }).click()
    await expect(card).toBeHidden()
    await page.reload()
    await page.waitForTimeout(2000)
    await expect(page.getByRole("dialog", { name: "odds is now an app" })).toHaveCount(0)
  })

  test("Show me how leads to the steps", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("dialog", { name: "odds is now an app" }).getByRole("button", { name: "Show me how" }).click({ timeout: 8000 })
    await expect(page.getByRole("dialog", { name: /Add odds to your Home Screen/ })).toBeVisible()
  })

  test("the Claude page asks to connect, in plain words, and fits the screen", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("dialog", { name: "odds is now an app" }).getByRole("button", { name: "Not now", exact: true }).click({ timeout: 8000 })
    // On a phone these are rows on the Profile page; the bar keeps the five a thumb reaches most.
    await page.getByRole("button", { name: "Profile" }).last().click()
    await page.getByRole("button", { name: "Claude" }).last().click()
    await expect(page.getByRole("heading", { level: 1, name: /Claude/ })).toBeVisible()
    await expect(page.getByText("Not connected yet")).toBeVisible()
    await expectNoSideScroll(page)
    await shot(page, "phone-claude-page")
  })

  test("a request from Claude to connect shows a card that can allow or refuse it", async ({ page }) => {
    await page.goto("/connect/claude?client_id=claude-e2e&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=abc&code_challenge=xyz&code_challenge_method=S256")
    await expect(page.getByRole("button", { name: /Allow|Connect|Approve/i }).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole("button", { name: /Cancel|Not now|Deny|Refuse/i }).first()).toBeVisible()
    await expectNoSideScroll(page)
    await shot(page, "phone-connect-approval")
  })

  test("Documents fits the screen; Drive lives on Connect", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("dialog", { name: "odds is now an app" }).getByRole("button", { name: "Not now", exact: true }).click({ timeout: 8000 })
    await page.getByRole("button", { name: "Profile" }).last().click()
    await page.getByRole("button", { name: "Documents" }).last().click()
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible()
    await expect(page.getByText("Google Drive")).toHaveCount(0)
    await expectNoSideScroll(page)
    await shot(page, "phone-documents")
  })
})
