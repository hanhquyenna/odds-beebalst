import { describe, expect, test } from "bun:test"
import { compressRoute, routeHint, routeKey, routeStoreKey } from "../../supabase/functions/_shared/site-routes"

describe("route templates", () => {
  test("each page gets its platform's route", () => {
    expect(routeKey("https://job-boards.eu.greenhouse.io/imc/jobs/1")).toBe("greenhouse")
    expect(routeKey("https://jobs.eu.lever.co/tomtom/abc")).toBe("lever")
    expect(routeKey("https://philips.wd3.myworkdayjobs.com/x")).toBe("workday")
    expect(routeKey("https://magnet.me/en/opportunity/1")).toBe("magnet.me")
    expect(routeKey("https://www.glassdoor.nl/job-listing/x")).toBe("glassdoor")
    expect(routeKey("https://careers.example.com/job")).toBeNull()
  })

  test("the first route that reached review is the guide from the next run, until it fails more than it works", () => {
    const route = ["read_page", "click apply for this job", "fill"]
    expect(routeHint("lever", { route, successes: 0, failures: 0, avgSteps: 4 })?.source).toBe("template")
    const once = routeHint("lever", { route, successes: 1, failures: 0, avgSteps: 4.2 })
    expect(once?.source).toBe("learned")
    expect(once?.proven).toBe(1)
    expect(once?.budget).toBe(5)
    expect(once?.quirks.length).toBeGreaterThan(0)
    expect(routeHint("lever", { route, successes: 1, failures: 2, avgSteps: 6 })?.source).toBe("template")
  })

  test("an employer's own career site learns its own route", () => {
    expect(routeStoreKey("https://jobs.tonyschocolonely.com/o/intern/c/new")).toBe("host:jobs.tonyschocolonely.com")
    expect(routeStoreKey("https://boards.greenhouse.io/x")).toBe("greenhouse")
    expect(routeHint("host:jobs.tonyschocolonely.com", null, null)).toBeNull()
    expect(routeHint("host:jobs.tonyschocolonely.com", { route: ["read_page", "fill"], successes: 1, failures: 0, avgSteps: 3 }, null)?.source).toBe("learned")
  })

  test("a route keeps only step kinds and canonical buttons, never what was typed", () => {
    const route = compressRoute([
      { tool: "read_page" },
      { tool: "click", args: { id: "b2" } },
      { tool: "read_page", args: { after_action: true } },
      { tool: "fill", args: { fields: [{ id: "f1", value: "kien@example.com" }] } },
      { tool: "fill", args: {} },
      { tool: "click", args: { id: "b9" } },
    ], (id) => (id === "b2" ? "Apply for this job" : "Kien Phung profile"))
    expect(route).toEqual(["read_page", "click apply for this job", "fill", "click"])
    expect(JSON.stringify(route)).not.toContain("kien")
  })
})
