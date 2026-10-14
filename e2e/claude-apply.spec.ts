import { expect, shot, test } from "./mock"

test.describe("signed in: answers for application forms and Claude's message drafts", () => {
  test.use({ signedIn: true })

  test("the profile keeps the answers forms ask for, saved when a box is left", async ({ page }) => {
    await page.route("**/rest/v1/application_answers*", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { phone: "+31 6 11111111" } }) })

      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    })
    await page.goto("/")
    await page.getByRole("button", { name: /Profile/ }).last().click()
    await expect(page.getByRole("heading", { name: "Personal information" })).toBeVisible()
    await expect(page.getByLabel("Phone number")).toHaveValue("+31 6 11111111")
    const saving = page.waitForRequest((r) => r.url().includes("/rest/v1/application_answers") && r.method() === "POST")
    await page.getByLabel("Pay you expect").fill("EUR 600 a month")
    await page.getByLabel("Pay you expect").blur()
    const body = JSON.parse((await saving).postData() ?? "{}") as { user_id: string; data: Record<string, string> }
    expect(body.data).toEqual({ phone: "+31 6 11111111", expected_salary: "EUR 600 a month" })
    await expect(page.getByText("Saved", { exact: true })).toBeVisible()
    await shot(page, "profile-answers")
  })

  test("application contact details save independently of the display name and reload on another visit", async ({ page }) => {
    let data: Record<string, string> = {}
    await page.route("**/rest/v1/application_answers*", route => {
      if (route.request().method() === "POST") data = route.request().postDataJSON().data
      return route.fulfill({ json: route.request().method() === "GET" ? { data } : [] })
    })
    await page.goto("/")
    await page.getByRole("button", { name: /Profile/ }).last().click()
    await page.getByLabel("First name (given names)", { exact: true }).fill("Chi Kien")
    await page.getByLabel("First name (given names)", { exact: true }).blur()
    await expect.poll(() => data.first_name).toBe("Chi Kien")
    await page.getByLabel("Last name (family name)", { exact: true }).fill("Phung")
    await page.getByLabel("Last name (family name)", { exact: true }).blur()
    await page.getByLabel("Phone number", { exact: true }).fill("+31 6 12345678")
    await page.getByLabel("Phone number", { exact: true }).blur()
    await expect.poll(() => data).toEqual({ first_name: "Chi Kien", last_name: "Phung", phone: "+31 6 12345678" })
    await page.reload()
    await expect(page.getByLabel("First name (given names)", { exact: true })).toHaveValue("Chi Kien")
    await expect(page.getByLabel("Last name (family name)", { exact: true })).toHaveValue("Phung")
    await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue("+31 6 12345678")
  })

  test("personal information is extracted from profile and CV and can be overridden", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Family Given", firstName: "Given Names", lastName: "Family", place: "Amsterdam, Netherlands", cv: "Given Names Family\ncv@example.com | +31 6 12345678", origin: "non_eu", dutch: "basic" })))
    let data: Record<string, string> = {}
    await page.route("**/rest/v1/application_answers*", route => {
      if (route.request().method() === "POST") data = route.request().postDataJSON().data
      return route.fulfill({ json: route.request().method() === "GET" ? { data } : [] })
    })
    await page.goto("/")
    await page.getByRole("button", { name: /Profile/ }).last().click()
    await expect(page.getByRole("heading", { name: "Personal information" })).toBeVisible()
    await expect(page.getByLabel("First name (given names)", { exact: true })).toHaveValue("Given Names")
    await expect(page.getByLabel("Last name (family name)", { exact: true })).toHaveValue("Family")
    await expect(page.getByLabel("Application email", { exact: true })).toHaveValue("cv@example.com")
    await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue("+31 6 12345678")
    await expect(page.getByLabel("City", { exact: true })).toHaveValue("Amsterdam")
    await page.getByLabel("Phone number", { exact: true }).fill("+44 7123456789")
    await page.getByLabel("Phone number", { exact: true }).blur()
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
    await page.getByRole("button", { name: "Claude" }).last().click()
    await expect(page.getByRole("tab", { name: "Make a CV for a job" })).toBeVisible()
    await expect(page.getByRole("tab", { name: "Message people there" })).toBeVisible()
    await expect(page.getByText(/If it needs me to sign in or make an account, stop and tell me/)).toBeVisible()
    await page.getByRole("tab", { name: "Message people there" }).click()
    await expect(page.getByText(/write a short, honest message to each one/)).toBeVisible()
    await page.getByRole("tab", { name: "Make a CV for a job" }).click()
    await expect(page.getByText(/Make a CV for .* Keep everything true/)).toBeVisible()
  })
})
