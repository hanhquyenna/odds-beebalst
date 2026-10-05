import type { Page } from "@playwright/test"
import { expect, jobRows, LARGE_POOL, test } from "./mock"

/** Generous on purpose: CI runners are slow and shared. The numbers printed are the real result. */
const LOAD_BUDGET_MS = 6000
const SEARCH_BUDGET_MS = 400
const LOADS = 5
/** A laptop slowed to roughly a mid-range phone, where the work per keystroke shows. */
const CPU_SLOWDOWN = 4
/** Each one changes the result set, so every input repaints the list. */
const QUERIES: ReadonlyArray<string> = ["kpmg", "rotterdam", "shell", "analyst", "utrecht", "philips", "recruiter", "groningen", "graduate"]

interface Probe {
  start: number
  end: number
  observer: MutationObserver
}

declare global {
  interface Window {
    __firstRowAt?: number
    __probe?: Probe
  }
}

test.use({ pool: "large" })

test(`perf: ${LARGE_POOL} jobs load and search within budget`, async ({ page, context }) => {
  test.setTimeout(120_000)
  const cdp = await context.newCDPSession(page)
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN })
  await page.addInitScript(markFirstRow)

  const loads: number[] = []
  for (let i = 0; i < LOADS; i++) {
    await page.goto("/")
    await expect(jobRows(page).first()).toBeVisible({ timeout: 15_000 })
    loads.push(await page.evaluate((): number => window.__firstRowAt ?? Number.NaN))
  }
  const landingSearch = await searchLatencies(page)

  await page.getByRole("button", { name: "Start" }).click()
  await page.getByRole("button", { name: "Continue without LinkedIn" }).click()
  await expect(jobRows(page).first()).toBeVisible()
  const listSearch = await searchLatencies(page)

  const result = { loadMs: median(loads), landingSearchMs: median(landingSearch), listSearchMs: median(listSearch), samples: { loads: loads, landingSearch: landingSearch, listSearch: listSearch } }
  console.log(`PERF ${JSON.stringify(result)}`)
  test.info().annotations.push({ type: "perf", description: JSON.stringify(result) })

  expect(result.loadMs).toBeLessThan(LOAD_BUDGET_MS)
  expect(result.landingSearchMs).toBeLessThan(SEARCH_BUDGET_MS)
  expect(result.listSearchMs).toBeLessThan(SEARCH_BUDGET_MS)
})

/** Types each query as one input into the search box and returns, per query, the ms from the input to the frame after the list's last change. */
async function searchLatencies(page: Page): Promise<number[]> {
  const search = page.getByRole("searchbox", { name: "Search jobs, companies or places" })
  const samples: number[] = []
  for (const query of QUERIES) {
    await search.focus()
    await page.keyboard.press("ControlOrMeta+A")
    await page.evaluate(armProbe)
    await page.keyboard.insertText(query)
    await page.waitForFunction((): boolean => {
      const probe = window.__probe

      return probe !== undefined && probe.end > 0 && performance.now() - probe.end > 300
    })
    samples.push(await page.evaluate((): number => (window.__probe ? window.__probe.end - window.__probe.start : Number.NaN)))
    // The change timed is the right one: the list now leads with a match.
    await expect(jobRows(page).first()).toContainText(new RegExp(query, "i"))
  }

  return samples
}

/** In the page: records when the first job row appears, in ms since navigation started. */
function markFirstRow(): void {
  const observer = new MutationObserver((): void => {
    if (document.querySelector('[aria-label^="Save "]')) {
      window.__firstRowAt = performance.now()
      observer.disconnect()
    }
  })
  observer.observe(document, { childList: true, subtree: true })
}

/** In the page: times the next input, to the animation frame after the last change to the part of the page holding the list. */
function armProbe(): void {
  window.__probe?.observer.disconnect()
  let scope: HTMLElement | null = document.querySelector<HTMLElement>('[role="searchbox"], input[type="search"]')
  while (scope && !scope.querySelector('[aria-label^="Save "]')) {
    scope = scope.parentElement
  }
  const probe: Probe = {
    start: 0,
    end: 0,
    observer: new MutationObserver((): void => {
      requestAnimationFrame((): void => {
        probe.end = performance.now()
      })
    }),
  }
  window.__probe = probe
  window.addEventListener(
    "input",
    (): void => {
      probe.start = performance.now()
    },
    { capture: true, once: true },
  )
  probe.observer.observe(scope ?? document.body, { childList: true, subtree: true, characterData: true })
}

/** The middle value, the average of the two middle ones for an even count. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)

  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2)
}
