// Loads each mock ATS fixture on its odds-mock.test host in headless Chromium and prints JS errors and mockStatus().
// Usage (from the odds worktree): bun <this file> <fixtures dir>
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
const browser = await chromium.launch();
for (const file of readdirSync(dir)
  .filter((name) => name.endsWith(".html"))
  .sort()) {
  const platform = file.replace(/\.html$/, "");
  const html = readFileSync(join(dir, file), "utf8");
  const context = await browser.newContext();
  await context.route(`https://${platform}.odds-mock.test/**`, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 160)));
  await page.goto(
    `https://${platform}.odds-mock.test/jobs/data-analyst-intern`,
  );
  await page.waitForTimeout(800);
  const status = await page
    .evaluate(
      () =>
        (window as unknown as { mockStatus?: () => unknown }).mockStatus?.() ??
        "missing",
    )
    .catch((error: Error) => `throws: ${error.message.slice(0, 120)}`);
  const buttons = await page
    .locator("button:visible, [role=button]:visible, a:visible")
    .allInnerTexts()
    .catch(() => []);
  console.log(
    JSON.stringify({
      platform: platform,
      kb: Math.round(html.length / 1024),
      errors: errors,
      status: status,
      buttons: buttons
        .map((b) => b.trim())
        .filter(Boolean)
        .slice(0, 6),
    }),
  );
  await context.close();
}
await browser.close();
