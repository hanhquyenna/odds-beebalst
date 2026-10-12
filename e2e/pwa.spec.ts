import { expect, test } from "./mock"

/** What a phone needs to add odds to its Home Screen: a manifest that parses, icons that exist, the address it opens, and a background script. */
test("the app can be added to a phone: manifest, icons, iPhone manifest, touch icon and background script", async ({ request }) => {
  const html = await (await request.get("/")).text()
  expect(html).toContain('name="viewport"')
  expect(html).toContain("viewport-fit=cover")
  expect(html).toContain('name="apple-mobile-web-app-capable"')
  expect(html).toMatch(/rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/)
  expect(html).toContain('name="theme-color"')

  const manifest = (await (await request.get("/manifest.webmanifest")).json()) as { name: string; short_name: string; display: string; start_url: string; scope: string; id: string; icons: Array<{ src: string; sizes: string; type: string; purpose?: string }> }
  expect(manifest).toMatchObject({ name: "odds", short_name: "odds", display: "standalone", scope: "/" })
  expect(manifest.start_url.startsWith("/")).toBe(true)
  const sizes = manifest.icons.map((i) => i.sizes)
  expect(sizes).toContain("192x192")
  expect(sizes).toContain("512x512")
  for (const icon of manifest.icons) {
    const r = await request.get(icon.src)
    expect(r.status(), icon.src).toBe(200)
    expect(r.headers()["content-type"], icon.src).toContain("image/png")
  }
  expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true)

  // iPhones get a manifest with no start address, so the Home Screen app opens the address it was added from (it carries the one-time sign-in code).
  const ios = (await (await request.get("/manifest-ios.webmanifest")).json()) as { start_url?: string; display: string }
  expect(ios.start_url).toBeUndefined()
  expect(ios.display).toBe("standalone")
  expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200)

  const sw = await request.get("/sw.js")
  expect(sw.status()).toBe(200)
  expect(sw.headers()["content-type"]).toMatch(/javascript/)
  expect(await sw.text()).toContain("push")
})

test("an unknown address still opens the app (a link someone shares or a Home Screen icon never lands on an error page)", async ({ page }) => {
  const response = await page.goto("/job/some-job-we-do-not-have")
  expect(response?.status()).toBe(200)
  await expect(page.locator("#root")).not.toBeEmpty()
})
