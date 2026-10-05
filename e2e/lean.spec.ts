import { readFileSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { expect, jobRows, test } from "./mock"

// Measured 5 Oct 2026 (279 kB) + about 5%. Counts every script and stylesheet the landing page really fetches, lazy chunks included.
const MAX_LANDING_GZIP_KB = 293

test("landing stays lean: under budget, no function calls, the job drawer waits for a click", async ({ page }) => {
  const assets: string[] = []
  const functions: string[] = []
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith("/assets/") && /\.(js|css)$/.test(path)) assets.push(path)
    if (path.includes("/functions/v1/")) functions.push(path)
  })

  await page.goto("/")
  await expect(jobRows(page).first()).toBeVisible()
  await page.waitForLoadState("networkidle")

  const gzipKb = [...new Set(assets)].reduce((sum, path) => sum + gzipSync(readFileSync(`dist${path}`)).length / 1024, 0)
  console.log(`landing: ${new Set(assets).size} files, ${gzipKb.toFixed(1)} kB gzip`)
  expect(gzipKb).toBeLessThanOrEqual(MAX_LANDING_GZIP_KB)
  expect(functions).toEqual([])
  expect(assets.some((path) => path.includes("/JobDetail-"))).toBe(false)
})
