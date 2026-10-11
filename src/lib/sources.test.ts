import { describe, expect, test } from "bun:test"
import { dedupe, jobKey, mergeByView, mergePool, sourceOf } from "@/lib/sources"
import type { Posting } from "@/lib/types"

const post = (o: Partial<Posting>): Posting => ({ id: "x", employer: "e", employer_display: "Medtronic", ats: "workday", title: "Financial Analyst", region: "Heerlen, Limburg, Netherlands", url: "https://x/1", posted_at: "2026-09-30", ...o }) as Posting

describe("sources", () => {
  test("platform names", () => {
    expect(sourceOf({ ats: "linkedin", url: null }).name).toBe("LinkedIn")
    expect(sourceOf({ ats: "magnet.me", url: null }).name).toBe("Magnet.me")
    expect(sourceOf({ ats: "workday", url: null }).name).toBe("Employer site")
    expect(sourceOf({ ats: "greenhouse", url: null }).name).toBe("Employer site")
  })
  test("recognizes supported job boards from their URL when the source field is blank or generic", () => {
    expect(sourceOf({ ats: "", url: "https://nl.indeed.com/viewjob?jk=123" }).name).toBe("Indeed")
    expect(sourceOf({ ats: "other", url: "https://www.glassdoor.com/job-listing/example" }).name).toBe("Glassdoor")
    expect(sourceOf({ ats: null, url: "https://magnet.me/en/opportunity/1/example" }).name).toBe("Magnet.me")
  })
  test("the same job is the same employer, title and city, whatever the platform writes", () => {
    expect(jobKey(post({ region: "Heerlen, NL" }))).toBe(jobKey(post({ region: "Heerlen, Limburg, Netherlands" })))
    expect(jobKey(post({ title: "Financial  Analyst!" }))).toBe(jobKey(post({})))
    expect(jobKey(post({ title: "Senior Financial Analyst" }))).not.toBe(jobKey(post({})))
    expect(jobKey(post({ region: "Eindhoven" }))).not.toBe(jobKey(post({})))
  })
  test("one job on three platforms is one job with three sources, kept as the employer's own posting", () => {
    const { jobs, alias } = dedupe([
      post({ id: "li", ats: "linkedin", url: "https://linkedin/1" }),
      post({ id: "mg", ats: "magnet.me", url: "https://magnet/1" }),
      post({ id: "wd", ats: "workday", url: "https://workday/1" }),
      post({ id: "other", title: "Controller" }),
    ])
    expect(jobs.map((j) => j.id)).toEqual(["wd", "other"].sort((a, b) => ["li", "mg", "wd", "other"].indexOf(a) - ["li", "mg", "wd", "other"].indexOf(b)))
    const kept = jobs.find((j) => j.id === "wd")!
    expect(kept.sources?.map((s) => s.name)).toEqual(["Employer site", "Magnet.me", "LinkedIn"])
    expect(alias.get("li")).toBe("wd")
    expect(alias.get("mg")).toBe("wd")
    expect(alias.has("wd")).toBe(false)
  })
  test("two postings with the same address on one platform count once in the sources", () => {
    const { jobs } = dedupe([post({ id: "a", ats: "greenhouse" }), post({ id: "b", ats: "greenhouse" })])
    expect(jobs).toHaveLength(1)
    expect(jobs[0].sources).toHaveLength(1)
  })
  test("a street or an area after the city, a gender tag, or the city added to the title do not make another job", () => {
    const rabo = (o: Partial<Posting>) => post({ employer_display: "Rabobank", title: "BI Developer", ...o })
    expect(dedupe([rabo({ id: "a", ats: "linkedin", region: "Utrecht, NL" }), rabo({ id: "b", region: "Utrecht Croeselaan 18" })]).jobs).toHaveLength(1)
    expect(dedupe([post({ id: "a", region: "Amsterdam Area, NL" }), post({ id: "b", region: "Amsterdam, NL", ats: "linkedin" })]).jobs).toHaveLength(1)
    expect(dedupe([post({ id: "a", title: "Workday HCM Lead (all genders)" }), post({ id: "b", title: "Workday HCM Lead", ats: "linkedin" })]).jobs).toHaveLength(1)
    expect(dedupe([post({ id: "a", title: "Legal Intern - Amsterdam", region: "Amsterdam, NL", ats: "magnet.me" }), post({ id: "b", title: "Legal Intern", region: "Amsterdam" })]).jobs).toHaveLength(1)
  })
  test("jobs that only look alike stay apart", () => {
    const t = (title: string, id: string, region = "Amsterdam") => post({ id, title, region })
    expect(dedupe([t("Manager, Data", "a"), t("Senior Manager, Data", "b")]).jobs).toHaveLength(2)
    expect(dedupe([t("Graduate Software Engineer (2026)", "a"), t("Graduate Software Engineer (2027)", "b")]).jobs).toHaveLength(2)
    expect(dedupe([t("Analyst Programme: CEO Track", "a"), t("Analyst Programme: COO Track", "b")]).jobs).toHaveLength(2)
    expect(dedupe([t("Analyst", "a", "Amsterdam"), t("Analyst", "b", "Rotterdam")]).jobs).toHaveLength(2)
    expect(dedupe([t("Product Manager", "a"), t("Project Manager", "b")]).jobs).toHaveLength(2)
  })
  test("different jobs are never merged", () => {
    expect(dedupe([post({ id: "a" }), post({ id: "b", employer_display: "Philips" }), post({ id: "c", title: "Data Analyst" })]).jobs).toHaveLength(3)
  })
})

describe("the database's own merge", () => {
  const row = (id: string, kept: string, rank: number, ats: string, url: string) => post({ id, ats, url, kept_id: kept, pick_rank: rank })
  test("the kept posting is the job, the others become aliases, and every platform is listed on it", () => {
    const m = mergeByView([row("a", "a", 1, "workday", "https://w/1"), row("b", "a", 2, "linkedin", "https://l/1"), row("c", "c", 1, "greenhouse", "https://g/1")])!
    expect(m.jobs.map((j) => j.id)).toEqual(["a", "c"])
    expect([...m.alias.entries()]).toEqual([["b", "a"]])
    expect(m.jobs[0].sources?.map((s) => s.ats)).toEqual(["workday", "linkedin"])
  })
  test("rows that do not come from the view are not touched here", () => {
    expect(mergeByView([post({ id: "a" })])).toBeNull()
    expect(mergeByView([])).toBeNull()
  })
  test("mergePool uses the view where it can and the browser's own merge where it cannot", () => {
    expect(mergePool([row("a", "a", 1, "workday", "https://w/1"), row("b", "a", 2, "linkedin", "https://l/1")]).jobs).toHaveLength(1)
    expect(mergePool([post({ id: "a" }), post({ id: "b", employer_display: "Philips" })]).jobs).toHaveLength(2)
  })
})
