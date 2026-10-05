import { test as base, expect, type BrowserContext, type Locator, type Page, type Route } from "@playwright/test"
import type { Posting } from "../src/lib/types"
import { BODIES, FLOW_POSTINGS } from "./fixtures/postings"
import { AGE_FACTORS, BANDS, TAX, TRANSITIONS } from "./fixtures/reference"

/** The fake backend the build points at (playwright.config.ts builds with it). Nothing real is ever reached. */
export const SUPABASE_ORIGIN = "http://supabase.test"

/** A 1x1 transparent PNG, served for company logos hosted elsewhere. */
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64")

/** Public tables the app reads that have no rows in these fixtures: answered with an empty list, like PostgREST does. */
const EMPTY_TABLES: ReadonlySet<string> = new Set(["applications", "employer_about", "employer_culture", "employer_facts", "employer_headcount", "employer_hiring", "employer_money", "employer_news", "employer_teams", "profiles"])

interface Fixtures {
  /** Installs the fake backend and fails the test on any console error, page error or request that reaches the outside. */
  backend: void
}

type Row = Record<string, unknown>

/** The test every spec uses: the real build, a mocked Supabase, and a strict guard on errors and stray requests. */
export const test = base.extend<Fixtures>({
  backend: [
    async ({ context, page }, use): Promise<void> => {
      const problems: string[] = []
      await mockBackend(context, FLOW_POSTINGS, problems)
      watchPage(page, problems)
      await use()
      expect(problems, "console errors, page errors or un-mocked requests").toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Saves a full-page screenshot when E2E_SHOTS names a folder, for a person to look at. Does nothing in CI. */
export async function shot(page: Page, name: string): Promise<void> {
  const folder = process.env.E2E_SHOTS
  if (folder) {
    await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true })
  }
}

/** The job rows of whichever list is on screen: each row carries its own save button. */
export function jobRows(page: Page): Locator {
  return page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /^Save / }) })
}

/** Routes every request of the context: Supabase to fixtures, logos to a pixel, the app itself through, anything else is a failure. */
async function mockBackend(context: BrowserContext, postings: Posting[], problems: string[]): Promise<void> {
  const sorted = [...postings].sort((a, b) => a.id.localeCompare(b.id))
  await context.route("**/*", async (route: Route): Promise<void> => {
    const url = new URL(route.request().url())
    if (url.origin === SUPABASE_ORIGIN) {
      await serveSupabase(route, url, sorted, problems)

      return
    }
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      await route.fallback()

      return
    }
    if (route.request().resourceType() === "image") {
      await route.fulfill({ status: 200, contentType: "image/png", body: PIXEL })

      return
    }
    problems.push(`un-mocked request: ${route.request().method()} ${url.href}`)
    await route.abort()
  })
}

/** Answers PostgREST reads from the fixtures. Edge functions and auth are not called by these flows, so any call is reported. */
async function serveSupabase(route: Route, url: URL, postings: Posting[], problems: string[]): Promise<void> {
  const request = route.request()
  const table = url.pathname.startsWith("/rest/v1/") ? url.pathname.slice("/rest/v1/".length) : null
  const rows = table !== null && request.method() === "GET" ? rowsFor(table, url, postings) : null
  if (rows === null) {
    problems.push(`un-mocked Supabase call: ${request.method()} ${url.pathname}${url.search}`)
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST205", message: "not mocked" }) })

    return
  }
  // .single() asks for one object; anything else gets the array.
  const single = (request.headers()["accept"] ?? "").includes("application/vnd.pgrst.object+json")
  if (single && rows.length !== 1) {
    await route.fulfill({ status: 406, contentType: "application/json", body: JSON.stringify({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }) })

    return
  }

  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? rows[0] : rows) })
}

/** The rows a GET on one table returns, or null for a table the fixtures do not know. */
function rowsFor(table: string, url: URL, postings: Posting[]): Row[] | null {
  const params = url.searchParams
  const offset = Number(params.get("offset") ?? 0)
  const limit = params.has("limit") ? Number(params.get("limit")) : Number.POSITIVE_INFINITY
  const id = params.get("id")?.replace(/^eq\./, "") ?? null
  if (table === "app_jobs") {
    return postings.slice(offset, offset + limit) as unknown as Row[]
  }
  if (table === "postings") {
    return postingsRows(params.get("select") ?? "", id, params.has("or"), postings)
  }
  if (table === "cbs_bands") {
    return BANDS as unknown as Row[]
  }
  if (table === "cbs_age_factors") {
    return AGE_FACTORS
  }
  if (table === "tax_params") {
    return [{ params: TAX }]
  }
  if (table === "transitions") {
    return TRANSITIONS as unknown as Row[]
  }

  return EMPTY_TABLES.has(table) ? [] : null
}

/** The postings table: one posting's text or requirements on the detail page, and no matches for the text-signal searches. */
function postingsRows(select: string, id: string | null, textSearch: boolean, postings: Posting[]): Row[] {
  if (textSearch || id === null) {
    return []
  }
  if (!postings.some((p) => p.id === id)) {
    return []
  }
  if (select === "body") {
    return [{ body: BODIES[id] ?? "" }]
  }

  return [{ requirements: null }]
}

/** Collects console errors and uncaught exceptions as problems. */
function watchPage(page: Page, problems: string[]): void {
  page.on("console", (message): void => {
    if (message.type() === "error") {
      problems.push(`console error: ${message.text()}`)
    }
  })
  page.on("pageerror", (error): void => {
    problems.push(`page error: ${error.message}`)
  })
}
