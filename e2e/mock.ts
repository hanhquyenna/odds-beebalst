import { test as base, expect, type BrowserContext, type Locator, type Page, type Route } from "@playwright/test"
import type { Posting } from "../src/lib/types"
import { BODIES, FLOW_POSTINGS } from "./fixtures/postings"
import { AGE_FACTORS, BANDS, TAX, TRANSITIONS } from "./fixtures/reference"

/** The fake backend the build points at (playwright.config.ts builds with it). Nothing real is ever reached. */
export const SUPABASE_ORIGIN = "http://supabase.test"

/** A 1x1 transparent PNG, served for company logos hosted elsewhere. */
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64")

/** Public tables the app reads that have no rows in these fixtures: answered with an empty list, like PostgREST does. */
const EMPTY_TABLES: ReadonlySet<string> = new Set(["applications", "employer_about", "employer_culture", "employer_facts", "employer_glassdoor_pay", "employer_headcount", "employer_hiring", "employer_money", "employer_news", "employer_teams", "profiles", "documents", "job_documents", "drive_links", "mcp_keys", "saved_jobs", "chance_snapshots", "push_devices", "application_answers", "application_runs", "application_prompts", "application_questions", "application_desktops", "outreach_drafts"])

/** Functions the job page calls about its employer: these fixtures know nothing about any employer, as for one we have no data on. */
const EMPTY_RPCS: ReadonlySet<string> = new Set(["rpc/job_company", "rpc/company_research"])

interface Fixtures {
  /** Installs the fake backend and fails the test on any console error, page error or request that reaches the outside. */
  backend: void
  /** Starts as a signed-in person who has finished the first questions (a made-up session; the fake backend answers for them). */
  signedIn: boolean
}

type Row = Record<string, unknown>

/** The test every spec uses: the real build, a mocked Supabase, and a strict guard on errors and stray requests. */
export const test = base.extend<Fixtures>({
  signedIn: [false, { option: true }],
  backend: [
    async ({ context, page, signedIn }, use): Promise<void> => {
      const problems: string[] = []
      if (signedIn) {
        await context.addInitScript((session) => {
          window.localStorage.setItem("careersim.session", JSON.stringify(session))
          window.localStorage.setItem("careersim.profile", JSON.stringify({ onboarded: true, name: "Test Person", origin: "non_eu", dutch: "basic" }))
        }, { access_token: "e2e-token", refresh_token: "e2e-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "00000000-0000-4000-8000-000000000001", email: "test.person@example.com" } })
      }
      await mockBackend(context, FLOW_POSTINGS, problems, signedIn)
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
export async function mockBackend(context: BrowserContext, postings: Posting[], problems: string[], signedIn: boolean): Promise<void> {
  const sorted = [...postings].sort((a, b) => a.id.localeCompare(b.id))
  await context.route("**/*", async (route: Route): Promise<void> => {
    const url = new URL(route.request().url())
    if (url.origin === SUPABASE_ORIGIN) {
      await serveSupabase(route, url, sorted, problems, signedIn)

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
async function serveSupabase(route: Route, url: URL, postings: Posting[], problems: string[], signedIn: boolean): Promise<void> {
  const request = route.request()
  // A signed-in person's app also asks the account functions (reading the profile, phone links): they answer with nothing to say.
  if ((signedIn || url.pathname.startsWith("/functions/v1/account")) && url.pathname.startsWith("/functions/v1/")) {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.pathname.endsWith("/profile/read") ? { items: [], pending: 0 } : {}) })

    return
  }
  if (signedIn && request.method() !== "GET" && url.pathname.startsWith("/rest/v1/") && !EMPTY_RPCS.has(url.pathname.slice("/rest/v1/".length))) {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" })

    return
  }
  const table = url.pathname.startsWith("/rest/v1/") ? url.pathname.slice("/rest/v1/".length) : null
  if (table !== null && request.method() === "POST" && EMPTY_RPCS.has(table)) {
    await route.fulfill({ status: 200, contentType: "application/json", body: "null" })

    return
  }
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
    return postingsRows(params.get("select") ?? "", id, postings)
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

/** The postings table: one posting's text or requirements on the detail page. */
function postingsRows(select: string, id: string | null, postings: Posting[]): Row[] {
  if (id === null) {
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
