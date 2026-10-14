import { expect } from "@playwright/test"
import { test } from "./mock"
import { FLOW_POSTINGS } from "./fixtures/postings"

test.use({ signedIn: true })
test("phone can queue one preparation, see progress, and cancel without a Submit control", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const state: { run: Record<string, unknown> | null } = { run: null }
  let requests = 0
  const post = FLOW_POSTINGS[0]
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: state.run ? [state.run] : [] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test-desktop" }] }))
  await context.route("**/rest/v1/rpc/request_application", route => {
    requests++
    expect(route.request().postDataJSON()).toEqual({ p_posting_id: post.id })
    state.run = { id: "a1111111-1111-4111-8111-111111111111", posting_id: post.id, status: "queued", message: "Waiting for your desktop." }
    return route.fulfill({ json: state.run })
  })
  await context.route("**/rest/v1/rpc/cancel_application", route => {
    if (state.run) state.run.status = "cancelled"
    return route.fulfill({ status: 204 })
  })
  await page.goto(`/job/${post.id}`)
  await page.getByRole("button", { name: "Apply with Odds" }).click()
  await expect(page.getByRole("button", { name: "Waiting for Chrome" })).toBeDisabled()
  expect(requests).toBe(1)
  await expect(page.getByRole("status").filter({ hasText: "Waiting for your desktop" })).toBeVisible()
  state.run = { ...state.run, status: "ready", message: "Filled in. Review and submit on your desktop." }
  await expect(page.getByRole("status").filter({ hasText: "Review and submit" })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole("button", { name: /^Submit/ })).toHaveCount(0)
  await page.getByRole("button", { name: "Cancel preparation" }).click()
  await expect(page.getByRole("button", { name: "Apply with Odds" })).toBeEnabled()
  await expect(page.getByRole("status").filter({ hasText: "Preparation cancelled" })).toBeVisible()
})


test("an offline desktop is explained and cannot silently accept another preparation", async ({ page, context }) => {
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: [] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [] }))
  await page.goto(`/job/${FLOW_POSTINGS[0].id}`)
  await expect(page.getByRole("button", { name: "No desktop connected" })).toBeDisabled()
  await expect(page.getByRole("status").filter({ hasText: "enable phone control" })).toBeVisible()
})


test("a closed-job result is shown instead of offering another silent preparation", async ({ page, context }) => {
  const post = FLOW_POSTINGS[0]
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: [{ id: "a1111111-1111-4111-8111-111111111111", posting_id: post.id, status: "failed", message: "LinkedIn says this job is no longer accepting applications. No application was submitted." }] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test" }] }))
  await page.goto(`/job/${post.id}`)
  await expect(page.getByRole("button", { name: "Applications closed" })).toBeDisabled()
  await expect(page.getByRole("alert")).toContainText("no longer accepting applications")
})

test("expired preparations show one message and let the user try again", async ({ page, context }) => {
  const post = FLOW_POSTINGS[0]
  const message = "Preparation expired. Your open application remains on your desktop."
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: [{ id: "a1111111-1111-4111-8111-111111111111", posting_id: post.id, status: "failed", message }] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test" }] }))
  await page.goto(`/job/${post.id}`)
  await expect(page.getByText(message, { exact: true })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Apply with Odds" })).toBeEnabled()
})

test("application questions can be answered in the job panel and saved for the waiting desktop", async ({ page, context }) => {
  const post = FLOW_POSTINGS[0]
  let sent: unknown = null
  await context.route("**/rest/v1/application_prompts?**", route => route.fulfill({ json: [{ posting_id: post.id, updated_at: new Date().toISOString(), questions: [{ key: "enrolled job " + post.id, label: "Will you remain enrolled throughout this internship?", kind: "radio", options: ["Yes", "No"] }] }] }))
  await context.route("**/rest/v1/rpc/answer_application_questions", route => { sent = route.request().postDataJSON(); return route.fulfill({ status: 204 }) })
  await page.goto(`/job/${post.id}`)
  await page.getByLabel("Will you remain enrolled throughout this internship?").selectOption("Yes")
  await page.getByRole("button", { name: "Save and continue" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Answers saved" })).toBeVisible()
  expect(sent).toEqual({ p_posting_id: post.id, p_answers: { ["enrolled job " + post.id]: "Yes" } })
  await expect(page.getByRole("button", { name: "Ask Claude to apply" })).toHaveCount(0)
})

test("Continue returns to an active application rather than requesting a new one", async ({ page, context }) => {
  const post = FLOW_POSTINGS[0]
  let continued = 0
  let requested = 0
  const run = { id: "a1111111-1111-4111-8111-111111111111", posting_id: post.id, status: "needs_input", message: "Complete verification in Chrome." }
  await context.route("**/rest/v1/application_runs?**", route => route.fulfill({ json: [run] }))
  await context.route("**/rest/v1/application_desktops?**", route => route.fulfill({ json: [{ device_id: "test" }] }))
  await context.route("**/rest/v1/rpc/continue_application", route => { continued++; expect(route.request().postDataJSON()).toEqual({ p_posting_id: post.id }); return route.fulfill({ json: run }) })
  await context.route("**/rest/v1/rpc/request_application", route => { requested++; return route.fulfill({ json: run }) })
  await page.goto(`/job/${post.id}`)
  await page.getByRole("button", { name: "Continue application", exact: true }).click()
  await expect.poll(() => continued).toBe(1)
  expect(requested).toBe(0)
})
