import { expect, test } from "@playwright/test"

const session = { access_token: "a", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "u1", email: "kien@example.com" } }

test("signed out: the front door is Google sign-in", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible()
})

test("signed in: the stored session shows the account, and signing out returns to the front door", async ({ page }) => {
  await page.addInitScript((stored) => window.localStorage.setItem("careersim.session", JSON.stringify(stored)), session)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "You are signed in" })).toBeVisible()
  await expect(page.getByText("kien@example.com")).toBeVisible()
  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible()
})

test("a failed Google callback says so and offers a way back", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied")
  await expect(page.getByRole("heading", { name: "Sign-in did not finish." })).toBeVisible()
  await expect(page.getByRole("button", { name: "Back to sign in" })).toBeVisible()
})
