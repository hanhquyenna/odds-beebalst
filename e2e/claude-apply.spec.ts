import { expect, shot, test } from "./mock"

test.describe("signed in: answers for application forms and Claude's message drafts", () => {
  test.use({ signedIn: true })

  test("Autofill keeps the answers forms ask for: Edit, then Save", async ({ page }) => {
    let kept: Record<string, string> = { phone: "+31 6 11111111" }
    await page.route("**/rest/v1/application_answers*", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: kept }) })
      kept = route.request().postDataJSON().data

      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Autofill", exact: true }).click()
    await expect(page.getByRole("heading", { name: "About you", exact: true })).toBeVisible()
    await expect(page.getByText("+31 6 11111111")).toBeVisible()
    await page.getByRole("button", { name: "Edit Pay you expect" }).click()
    const saving = page.waitForRequest((r) => r.url().includes("/rest/v1/application_answers") && r.method() === "POST")
    await page.getByLabel("Pay you expect").fill("EUR 600 a month")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    const body = JSON.parse((await saving).postData() ?? "{}") as { user_id: string; data: Record<string, string> }
    expect(body.data).toEqual({ phone: "+31 6 11111111", expected_salary: "EUR 600 a month" })
    await expect(page.getByText("EUR 600 a month")).toBeVisible()
    await shot(page, "profile-answers")
  })

  test("Home asks what is left before applying, and the setup panel takes the answers one at a time and keeps them", async ({ page }) => {
    let data: Record<string, string> = {}
    await page.route("**/rest/v1/application_answers*", (route) => {
      if (route.request().method() === "POST") data = route.request().postDataJSON().data
      return route.fulfill({ json: route.request().method() === "GET" ? { data } : [] })
    })
    await page.goto("/")
    await expect(page.getByRole("region", { name: "Set up one-click applying" })).toBeVisible()
    await page.getByRole("button", { name: "Continue setup" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Step 1 of 4")).toBeVisible()
    await expect(dialog.getByText("Loading your profile…")).toHaveCount(0)
    await expect(dialog.getByLabel("First name (given names)", { exact: true })).toHaveValue("Test")
    await expect(dialog.getByLabel("Last name (family name)", { exact: true })).toHaveValue("Person")
    await dialog.getByRole("button", { name: "Add role", exact: true }).click()
    await dialog.locator("summary").filter({ hasText: "New role" }).click()
    await dialog.getByLabel("Experience 1: Job title", { exact: true }).fill("Finance Intern")
    await dialog.getByLabel("Experience 1: Company", { exact: true }).fill("Example Company")
    await dialog.getByRole("button", { name: "Add degree", exact: true }).click()
    await dialog.locator("summary").filter({ hasText: "New degree" }).click()
    await dialog.getByLabel("Education 1: School", { exact: true }).fill("Example University")
    await dialog.getByLabel("Education 1: Degree", { exact: true }).fill("BSc Finance")
    await dialog.getByRole("button", { name: "Add skill", exact: true }).click()
    await dialog.getByLabel("Skills 1: Skill", { exact: true }).fill("Excel")
    const profileRequest = page.waitForRequest((r) => r.url().includes("/rest/v1/profiles") && r.method() === "POST")
    for (const [label, value] of [["First name (given names)", "Alex"], ["Last name (family name)", "Tester"], ["Application email", "alex@example.com"], ["Phone number", "+31 6 11111111"]]) await dialog.getByLabel(label, { exact: true }).fill(value)
    await dialog.getByRole("button", { name: "Confirm and Continue" }).click()
    await expect.poll(() => data.first_name).toBe("Alex")
    const profile = (await profileRequest).postDataJSON().data
    expect(profile.firstName).toBe("Alex")
    expect(profile.positions[0].Title).toBe("Finance Intern")
    expect(profile.education[0]["School Name"]).toBe("Example University")
    expect(profile.skills[0].Name).toBe("Excel")
    expect(data.university).toBe("Example University")
    await dialog.getByRole("radio", { name: "Yes, the employer sponsors it" }).click()
    await dialog.getByRole("button", { name: "Save and Continue" }).click()
    await expect.poll(() => data.work_authorization).toBe("I need a work permit; the employer sponsors it")
    await dialog.getByLabel("When you can start", { exact: true }).fill("1 February 2027")
    await dialog.getByLabel("Hours a week", { exact: true }).fill("40")
    await dialog.getByRole("button", { name: "Save and Continue" }).click()
    await dialog.getByRole("radio", { name: "I need to ask them" }).click()
    await dialog.getByRole("button", { name: "Finish setup", exact: true }).click()
    await expect(dialog.getByRole("heading", { name: "Your answers are ready" })).toBeVisible()
    await expect.poll(() => data.start_date).toBe("1 February 2027")
    await page.keyboard.press("Escape")
    const setupCard = page.getByRole("region", { name: "Set up one-click applying" })
    await expect(setupCard.getByRole("button", { name: "Your details: complete", exact: true })).toBeVisible()
    await expect(setupCard.getByRole("button", { name: "Saved answers: complete", exact: true })).toBeVisible()
    await expect(setupCard.getByText("2 / 4", { exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "Continue setup", exact: true }).click()
    await expect(dialog.getByLabel("First name (given names)", { exact: true })).toHaveValue("Alex")
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Autofill", exact: true }).click()
    await expect(page.getByText(/\d+ of \d+ filled/)).toBeVisible()
    await page.getByRole("button", { name: "Edit Phone number" }).click()
    await page.getByLabel("Phone number", { exact: true }).fill("+31 6 22222222")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect.poll(() => data.phone).toBe("+31 6 22222222")
    await shot(page, "quick-setup-editable")
  })

  test("the setup notice on Home hides with its X for this visit and is back the next one, until setup is done", async ({ page, context }) => {
    await page.route("**/rest/v1/application_answers*", (route) => route.fulfill({ json: route.request().method() === "GET" ? { data: {} } : [] }))
    await context.route("**/rest/v1/application_answers*", (route) => route.fulfill({ json: route.request().method() === "GET" ? { data: {} } : [] }))
    await page.goto("/")
    const notice = page.getByRole("region", { name: "Set up one-click applying" })
    await expect(notice).toBeVisible()
    await expect(notice.getByRole("button", { name: "Continue setup" })).toBeVisible()
    await notice.getByRole("button", { name: "Hide for now" }).click()
    await expect(notice).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByRole("region", { name: "Set up one-click applying" })).toHaveCount(0)
    // A new visit (a new tab) shows it again.
    const next = await context.newPage()
    await next.goto("/")
    await expect(next.getByRole("region", { name: "Set up one-click applying" })).toBeVisible()
  })

  test("the Autofill tab holds the answers, what odds learned, Chrome and the CV, and Profile no longer does", async ({ page }) => {
    await page.route("**/rest/v1/application_answers*", (route) => route.fulfill({ json: route.request().method() === "GET" ? { data: { phone: "+31 6 11111111" } } : [] }))
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Autofill", exact: true }).click()
    for (const name of ["About you", "Work and study", "Learned from forms", "Chrome extension", "CV"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
    await expect(page.getByText(/\d+ of \d+ filled/)).toBeVisible()
    await expect(page.getByText("+31 6 11111111")).toBeVisible()
    await page.getByRole("button", { name: "Account menu" }).click()
    await page.getByRole("button", { name: "Profile and settings" }).click()
    await expect(page.getByRole("heading", { name: "Answers", exact: true })).toHaveCount(0)
    await expect(page.getByLabel("Phone number")).toHaveCount(0)
  })

  test("application contact details save independently of the display name and reload on another visit", async ({ page }) => {
    let data: Record<string, string> = {}
    await page.route("**/rest/v1/application_answers*", route => {
      if (route.request().method() === "POST") data = route.request().postDataJSON().data
      return route.fulfill({ json: route.request().method() === "GET" ? { data } : [] })
    })
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Autofill", exact: true }).click()
    for (const [label, value] of [["First name (given names)", "Chi Kien"], ["Last name (family name)", "Phung"], ["Phone number", "+31 6 12345678"]]) {
      await page.getByRole("button", { name: `Edit ${label}` }).click()
      await page.getByLabel(label, { exact: true }).fill(value)
      await page.getByRole("button", { name: "Save", exact: true }).click()
      await expect(page.getByText(value, { exact: true })).toBeVisible()
    }
    await expect.poll(() => data).toEqual({ first_name: "Chi Kien", last_name: "Phung", phone: "+31 6 12345678" })
    await page.reload()
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Autofill", exact: true }).click()
    for (const value of ["Chi Kien", "Phung", "+31 6 12345678"]) await expect(page.getByText(value, { exact: true })).toBeVisible()
  })

  test("personal information is extracted from profile and CV and can be overridden", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Family Given", firstName: "Given Names", lastName: "Family", place: "Amsterdam, Netherlands", cv: "Given Names Family\ncv@example.com | +31 6 12345678", origin: "non_eu", dutch: "basic" })))
    let data: Record<string, string> = {}
    await page.route("**/rest/v1/application_answers*", route => {
      if (route.request().method() === "POST") data = route.request().postDataJSON().data
      return route.fulfill({ json: route.request().method() === "GET" ? { data } : [] })
    })
    await page.goto("/")
    await page.getByRole("navigation", { name: "Your account" }).getByRole("button", { name: "Autofill", exact: true }).click()
    for (const value of ["Given Names", "Family", "cv@example.com", "+31 6 12345678", "Amsterdam"]) await expect(page.getByText(value, { exact: true }).first()).toBeVisible()
    await page.getByRole("button", { name: "Edit Phone number" }).click()
    await page.getByLabel("Phone number", { exact: true }).fill("+44 7123456789")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect.poll(() => data.phone).toBe("+44 7123456789")
  })

  test("a draft Claude wrote for someone on a job can be copied, approved for Claude to send, taken back and marked sent", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const sent: string[] = []
    await page.route("**/rest/v1/outreach_drafts*", async (route) => {
      const req = route.request()
      if (req.method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "d1", person_id: null, posting_id: "e2e-adyen-fin-analyst", to_name: "Cy Newperson", to_url: "https://www.linkedin.com/in/cy", channel: "linkedin_note", subject: null, body: "Hi Cy, I am applying to the finance analyst role and would value your view.", status: "draft", created_at: "2026-10-12T10:00:00Z", sent_at: null, applied_at: null }]) })
      }
      if (req.method() === "PATCH") sent.push(req.postData() ?? "")

      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.goto("/job/e2e-adyen-fin-analyst")
    await page.getByRole("button", { name: "Add someone new" }).click()
    await expect(page.getByText("Messages from Claude")).toBeVisible()
    await expect(page.getByText("Hi Cy, I am applying")).toBeVisible()
    await expect(page.getByRole("link", { name: "Open their page" })).toHaveAttribute("href", "https://www.linkedin.com/in/cy")
    await page.getByRole("button", { name: "Copy", exact: true }).click()
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Hi Cy")
    await shot(page, "outreach-draft")
    await page.getByRole("button", { name: "Let Claude send it" }).click()
    await expect.poll(() => sent.length).toBe(1)
    expect(JSON.parse(sent[0])).toMatchObject({ status: "approved" })
    await expect(page.getByText(/Claude may send it/)).toBeVisible()
    await page.getByRole("button", { name: "Take back" }).click()
    await expect.poll(() => sent.length).toBe(2)
    expect(JSON.parse(sent[1])).toMatchObject({ status: "draft" })
    await page.getByRole("button", { name: "I sent it" }).click()
    await expect.poll(() => sent.length).toBe(3)
    expect(JSON.parse(sent[2])).toMatchObject({ status: "sent" })
    await expect(page.getByRole("button", { name: "I sent it" })).toHaveCount(0)
  })

  test("the Claude page offers the new things in plain words, with the sign-in stop in the apply message", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Account menu" }).click()
    await page.getByRole("button", { name: "Claude", exact: true }).click()
    await expect(page.getByRole("tab", { name: "Make a CV for a job" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Message people there" })).toBeVisible()
    await expect(page.getByText(/If it needs me to sign in or make an account, stop and tell me/)).toBeVisible()
    await page.getByRole("tab", { name: "Message people there" }).click()
    await expect(page.getByText(/write a short, honest message to each one/)).toBeVisible()
    await page.getByRole("tab", { name: "Make a CV for a job" }).click()
    await expect(page.getByText(/Make a CV for .* Keep everything true/)).toBeVisible()
  })
})
