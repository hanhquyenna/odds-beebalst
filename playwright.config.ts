import { defineConfig, devices } from "@playwright/test"
import { SUPABASE_ORIGIN } from "./e2e/mock"

const PORT = 4319
/** Set to test an app already being served elsewhere (the perf comparison serves an older build this way). */
const EXTERNAL_URL = process.env.E2E_BASE_URL

/** Browser smoke tests: a production build served by `vite preview`, talking to a fake Supabase that e2e/mock.ts answers. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: EXTERNAL_URL ?? `http://localhost:${PORT}`,
    // The service worker would fetch outside page.route; the app works without it.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /phone\.spec\.ts/ },
    { name: "phone", use: { ...devices["iPhone 14"], browserName: "chromium" }, testMatch: /phone\.spec\.ts/ },
  ],
  webServer: EXTERNAL_URL
    ? undefined
    : {
        command: `bun run build && bunx vite preview --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        // Fake values only, so the build can never reach the real project.
        env: { VITE_SUPABASE_URL: SUPABASE_ORIGIN, VITE_SUPABASE_ANON_KEY: "e2e-anon-key" },
      },
})
