import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import { test } from "./mock"
import { FLOW_POSTINGS } from "./fixtures/postings"

/**
 * Apply from the job on the Jobs page when this browser has no Odds extension. The page asks to connect Chrome first (nothing starts without it); what a
 * desktop already started or stopped on its own is still shown, and its buttons still work.
 */
test.use({ signedIn: true })

const RUN = "a1111111-1111-4111-8111-111111111111"

/** The job on the Jobs page, where Auto apply and what it is doing live. */
async function openJob(page: Page): Promise<void> {
  await page.goto("/")
  await page.getByRole("button", { name: "Jobs" }).last().click()
  await page.getByRole("button", { name: /Junior Financial Analyst Adyen/ }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Junior Financial Analyst" })).toBeVisible()
}

test("a preparation already queued for the desktop shows its progress, then the review step, and can be cancelled without a Submit control", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const post = FLOW_POSTINGS[0]
  const state: { run: Record<string, unknown> } = { run: { id: RUN, posting_id: post.id, status: "queued", message: "Waiting for your desktop." } }
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: [state.run] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test-desktop" }] }))
  await context.route("**/rest/v1/rpc/cancel_application", route => {
    state.run = { ...state.run, status: "cancelled", message: "Cancelled." }
    return route.fulfill({ status: 204 })
  })
  await openJob(page)
  await expect(page.getByRole("button", { name: "Waiting for Chrome" })).toBeVisible()
  await expect(page.getByRole("status").filter({ hasText: /Connecting to Chrome|Working on your application/ })).toBeVisible()
  state.run = { ...state.run, status: "ready", message: "Filled in. Review and submit on your desktop." }
  await expect(page.getByRole("status").filter({ hasText: "Ready for your review" })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole("button", { name: /^Submit/ })).toHaveCount(0)
  await page.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Ready for your review" })).toHaveCount(0)
})

test("with no Chrome extension, the page says to connect Chrome first and starts nothing", async ({ page, context }) => {
  let requests = 0
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: [] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [] }))
  await context.route("**/rest/v1/rpc/request_application", route => { requests++; return route.fulfill({ json: null }) })
  await openJob(page)
  await expect(page.getByText("Install and Connect Odds for Chrome once")).toBeVisible()
  await page.getByRole("button", { name: "Connect Odds in Chrome" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  expect(requests).toBe(0)
})

test("a closed-job result is shown instead of offering another preparation", async ({ page, context }) => {
  const post = FLOW_POSTINGS[0]
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: [{ id: RUN, posting_id: post.id, status: "failed", message: "LinkedIn says this job is no longer accepting applications. No application was submitted." }] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test" }] }))
  await openJob(page)
  await expect(page.getByText("Job closed", { exact: true })).toBeVisible()
  await expect(page.getByText("Sorry — this job is no longer accepting applications.", { exact: false })).toBeVisible()
  await expect(page.getByRole("button", { name: /Try again|Connect Odds in Chrome|Apply with Odds|Open application tab/ })).toHaveCount(0)
})

test("an expired preparation shows its message once and lets the person try again", async ({ page, context }) => {
  const post = FLOW_POSTINGS[0]
  const message = "Preparation expired. Your open application remains on your desktop."
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: [{ id: RUN, posting_id: post.id, status: "failed", message }] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test" }] }))
  await openJob(page)
  await expect(page.getByText(message, { exact: true })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled()
})

test("application questions can be answered in the job panel and saved for the waiting desktop", async ({ page, context }) => {
  const post = FLOW_POSTINGS[0]
  const question = "Which team would you like to join first?"
  let sent: unknown = null
  await context.route("**/rest/v1/application_prompts?**", route => route.fulfill({ json: [{ posting_id: post.id, updated_at: new Date().toISOString(), questions: [{ key: "team " + post.id, label: question, kind: "radio", options: ["Finance", "Data"] }] }] }))
  await context.route("**/rest/v1/rpc/answer_application_questions", route => { sent = route.request().postDataJSON(); return route.fulfill({ status: 204 }) })
  await openJob(page)
  await page.getByRole("radiogroup", { name: question }).getByRole("radio", { name: "Finance" }).click()
  await page.getByRole("button", { name: "Save and continue" }).click()
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible()
  expect(sent).toEqual({ p_posting_id: post.id, p_answers: { ["team " + post.id]: "Finance" } })
})

test("an application that needs the person shows its tab button instead of requesting a new one", async ({ page, context }) => {
  const post = FLOW_POSTINGS[0]
  let requested = 0
  const run = { id: RUN, posting_id: post.id, status: "needs_input", message: "Complete verification in Chrome." }
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: [run] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test" }] }))
  await context.route("**/rest/v1/rpc/request_application", route => { requested++; return route.fulfill({ json: run }) })
  await openJob(page)
  await expect(page.getByRole("button", { name: "Open application tab" }).last()).toBeVisible()
  expect(requested).toBe(0)
})
