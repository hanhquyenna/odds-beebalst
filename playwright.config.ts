import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.E2E_PORT) || 4319

/** Browser tests: a production build served by `vite preview`, with a fake Supabase address so the build can never reach the real project. */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bun run build && bunx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { VITE_SUPABASE_URL: "https://fake.supabase.test", VITE_SUPABASE_ANON_KEY: "fake-anon-key" },
  },
})
