import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { heldFilter, jobLink, linkedinPublicJob, postingFrom, postingFromLinkedIn, postingSent, postingUsable, siteOfHost, textOf } from "../../supabase/functions/_shared/job-sites"

/** A script address, built so the linter does not take the test data for code. */
const SCRIPT_URL = ["javascript", "alert(1)"].join(":")

describe("jobLink", () => {
  test("LinkedIn: every address of one job is the same job, as before", () => {
    const want = { site: "linkedin", ats: "linkedin", id: "4466096458", url: "https://www.linkedin.com/jobs/view/4466096458" }
    expect(jobLink("https://nl.linkedin.com/jobs/view/reservations-agent-intern-at-de-l-europe-amsterdam-4466096458?position=7")).toEqual(want)
    expect(jobLink("https://www.linkedin.com/jobs/search/?keywords=intern&currentJobId=4466096458")).toEqual(want)
    expect(jobLink("https://www.linkedin.com/jobs/view/4466096458/")).toEqual(want)
  })
  test("Indeed: a job page, the job open beside a search, any country site", () => {
    expect(jobLink("https://nl.indeed.com/viewjob?jk=7407e8c28ca1379a&tk=1k4r&from=serp&vjs=3")).toEqual({ site: "indeed", ats: "indeed", id: "7407e8c28ca1379a", url: "https://nl.indeed.com/viewjob?jk=7407e8c28ca1379a" })
    expect(jobLink("https://nl.indeed.com/jobs?q=internship&l=Amsterdam&vjk=7407e8c28ca1379a")?.url).toBe("https://nl.indeed.com/viewjob?jk=7407e8c28ca1379a")
    expect(jobLink("https://indeed.com/viewjob?jk=7407e8c28ca1379a")?.url).toBe("https://www.indeed.com/viewjob?jk=7407e8c28ca1379a")
    expect(jobLink("https://uk.indeed.com/viewjob?jk=7407e8c28ca1379a")?.site).toBe("indeed")
    expect(jobLink("https://nl.indeed.com/jobs?q=internship")).toBeNull()
  })
  test("Glassdoor: a listing with its name, or only its number", () => {
    expect(jobLink("https://www.glassdoor.nl/job-listing/internship-financing-solutions-abn-amro-JV_IC3064478_KO0,30_KE31,39.htm?jl=1009736291581&src=GD")).toEqual({ site: "glassdoor", ats: "glassdoor", id: "1009736291581", url: "https://www.glassdoor.nl/job-listing/internship-financing-solutions-abn-amro-JV_IC3064478_KO0,30_KE31,39.htm?jl=1009736291581" })
    expect(jobLink("https://www.glassdoor.com/Job/amsterdam-jobs-SRCH_IL.0,9.htm?jl=1009736291581")?.url).toBe("https://www.glassdoor.com/job-listing/j.htm?jl=1009736291581")
    expect(jobLink("https://www.glassdoor.nl/Job/amsterdam-internship-jobs-SRCH_IL.0,9_IC3064478_KO10,20.htm")).toBeNull()
  })
  test("Magnet.me and AcademicTransfer", () => {
    expect(jobLink("https://magnet.me/nl-NL/vacature/1075815/engineering-doctorate?utm_source=x")).toEqual({ site: "magnet.me", ats: "magnet.me", id: "1075815", url: "https://magnet.me/nl-NL/vacature/1075815/engineering-doctorate" })
    expect(jobLink("https://magnet.me/en-NL/opportunities/internship")).toBeNull()
    expect(jobLink("https://www.academictransfer.com/en/jobs/364123/phd-position-new-synthetic-methods/")?.url).toBe("https://www.academictransfer.com/en/jobs/364123/phd-position-new-synthetic-methods/")
  })
  test("employer job boards: the job, not its form; a board's list is not a job", () => {
    expect(jobLink("https://job-boards.greenhouse.io/catawiki/jobs/8173192?gh_src=abc")).toMatchObject({ ats: "greenhouse", url: "https://job-boards.greenhouse.io/catawiki/jobs/8173192" })
    expect(jobLink("https://jobs.lever.co/mendix/6107cb02-40af-453a-b3ab-085e89266cf9/apply")?.url).toBe("https://jobs.lever.co/mendix/6107cb02-40af-453a-b3ab-085e89266cf9")
    expect(jobLink("https://jobs.ashbyhq.com/bynder/e95cca59-9f4a-4365-aa16-2fd7df510fec/application")?.url).toBe("https://jobs.ashbyhq.com/bynder/e95cca59-9f4a-4365-aa16-2fd7df510fec")
    expect(jobLink("https://damen.wd3.myworkdayjobs.com/Damen_Careers/job/Gorinchem/Graduation--Automation-of-Sound-level-predictions_JR0017139")?.ats).toBe("workday")
    expect(jobLink("https://fairphone.jobs.personio.de/job/2744552?language=en")?.url).toBe("https://fairphone.jobs.personio.de/job/2744552")
    expect(jobLink("https://jobs.lever.co/mendix")).toBeNull()
    expect(jobLink("https://job-boards.greenhouse.io/catawiki")).toBeNull()
  })
  test("any other page only when asked for (the page must also say it is a job), without its tracking", () => {
    expect(jobLink("https://careers.example.com/vacancies/data-intern?utm_source=linkedin")).toBeNull()
    expect(jobLink("https://careers.example.com/vacancies/data-intern?utm_source=linkedin&jobId=88", true)).toEqual({ site: "web", ats: "other", id: "/vacancies/data-intern?jobId=88", url: "https://careers.example.com/vacancies/data-intern?jobId=88" })
    expect(jobLink("https://careers.example.com/", true)).toBeNull()
  })
  test("never anything that is not https; a look-alike host is not the site it imitates", () => {
    for (const bad of ["", "hello", "http://nl.indeed.com/viewjob?jk=7407e8c28ca1379a", SCRIPT_URL, "https://localhost/jobs/1"]) {
      expect(jobLink(bad, true)).toBeNull()
    }
    for (const fake of ["https://indeed.com.evil.com/viewjob?jk=7407e8c28ca1379a", "https://evilglassdoor.com/job-listing/j.htm?jl=1009736291581"]) {
      expect(jobLink(fake)).toBeNull()
      expect(jobLink(fake, true)?.site).toBe("web")
    }
  })
})

test("siteOfHost knows the job sites and boards, and nothing else", () => {
  expect(siteOfHost("nl.indeed.com")).toBe("indeed")
  expect(siteOfHost("www.glassdoor.co.uk")).toBe("glassdoor")
  expect(siteOfHost("jobs.lever.co")).toBe("lever")
  expect(siteOfHost("www.bbc.co.uk")).toBeNull()
})

test("heldFilter finds jobs that were stored under a longer address by their id", () => {
  expect(heldFilter(jobLink("https://nl.indeed.com/viewjob?jk=7407e8c28ca1379a")!)).toBe("url=like.*indeed.*jk=7407e8c28ca1379a*")
  expect(heldFilter(jobLink("https://www.glassdoor.nl/job-listing/j.htm?jl=1009736291581")!)).toBe("url=like.*glassdoor.*jl=1009736291581*")
  expect(heldFilter(jobLink("https://magnet.me/nl-NL/vacature/1075815")!)).toBe("or=(url.like.*magnet.me/*/1075815/*,url.like.*magnet.me/*/1075815)")
  expect(heldFilter(jobLink("https://www.linkedin.com/jobs/view/4466096458")!)).toBe("url=eq.https%3A%2F%2Fwww.linkedin.com%2Fjobs%2Fview%2F4466096458")
})

describe("postingFrom", () => {
  // As Indeed's job page gives it (October 2026, texts shortened).
  const indeed = {
    "@context": "http://schema.org",
    "@type": "JobPosting",
    datePosted: "2026-03-01T07:35:18.394Z",
    description: "<div><p>Houd jij wel van een uitdaging? Mooi!</p><ul><li>Je werkt in een team</li><li>Je leert veel &amp; snel</li></ul></div>",
    hiringOrganization: { "@type": "Organization", name: "Nederlandse Spoorwegen", logo: "https://d2q79iu7y748jz.cloudfront.net/s/_squarelogo/ns.png" },
    jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressCountry: "NL", addressLocality: "Amsterdam Centrum", addressRegion: "NH", postalCode: "1018 JA" } },
    title: "Meewerkstage AH to go Amsterdam Bijlmer (BOL)",
    validThrough: "2026-12-31T00:00:00Z",
    employmentType: ["INTERN"],
  }
  test("the job, in plain text, the place spelled out the way the table keeps it", () => {
    expect(postingFrom(indeed)).toEqual({
      title: "Meewerkstage AH to go Amsterdam Bijlmer (BOL)",
      company: "Nederlandse Spoorwegen",
      location: "Amsterdam Centrum, North Holland, Netherlands",
      description: "Houd jij wel van een uitdaging? Mooi!\n• Je werkt in een team\n• Je leert veel & snel",
      posted: "2026-03-01T07:35:18.394Z",
      valid: "2026-12-31T00:00:00Z",
      logo: "https://d2q79iu7y748jz.cloudfront.net/s/_squarelogo/ns.png",
      employment: "INTERN",
    })
  })
  test("found inside @graph and arrays, with a type list; remote jobs", () => {
    const remote = { "@type": ["JobPosting"], title: "Data Intern", hiringOrganization: "Acme", jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "NL" }, description: "x" }
    expect(postingFrom({ "@graph": [{ "@type": "WebSite" }, remote] })?.location).toBe("Remote, Netherlands")
    expect(postingFrom([{ "@type": "BreadcrumbList" }, indeed])?.company).toBe("Nederlandse Spoorwegen")
  })
  test("a page that describes no job, or a job without a title or employer", () => {
    expect(postingFrom({ "@type": "ItemList", itemListElement: [] })).toBeNull()
    expect(postingFrom({ "@type": "JobPosting", title: "Intern" })).toBeNull()
    expect(postingFrom(null)).toBeNull()
  })
})

test("textOf keeps paragraphs and list items apart and reads entities", () => {
  expect(textOf("<p>One&nbsp;two</p><p>Three &#8364;5 &#x2013; &euro;</p><script>x()</script>")).toBe("One two\nThree €5 – €")
})

describe("postingSent: a job a browser hands over is taken only as plain text", () => {
  const ok = { title: "Data Intern", company: "Acme", location: "Amsterdam, Netherlands", description: "We are looking for a data intern who will help our team with analysis, dashboards and reporting for six months, in English, in Amsterdam.", posted: "2026-10-01", valid: null, logo: "https://logo.example/a.png", employment: null }
  test("a usable posting comes through, other fields dropped", () => {
    expect(postingSent({ ...ok, extra: "<script>" })).toEqual({ ...ok, applicants: null, seniority: null, closed: false })
  })
  test("anything else is refused or cleaned", () => {
    expect(postingSent({ ...ok, title: ["Data Intern"] })).toBeNull()
    expect(postingSent({ ...ok, description: "too short" })).toBeNull()
    expect(postingSent("text")).toBeNull()
    expect(postingSent({ ...ok, logo: SCRIPT_URL, posted: "yesterday" })).toMatchObject({ logo: null, posted: null })
    expect(postingSent({ ...ok, title: "Data\u0000 Intern\u0007" })?.title).toBe("Data Intern")
  })
  test("postingUsable needs a real description", () => {
    expect(postingUsable(ok)).toBe(true)
    expect(postingUsable({ ...ok, company: "" })).toBe(false)
  })
})

test("the extension's copy of these rules is built from this file (run scripts/build-extension.sh)", () => {
  const dir = mkdtempSync(join(tmpdir(), "odds-sites-"))
  execFileSync("bun", ["build", "scripts/extension-sites.ts", "--format=iife", "--target=browser", "--outfile", join(dir, "job-sites.js")], { cwd: join(import.meta.dirname, "..", ".."), stdio: "ignore" })
  const built = readFileSync(join(import.meta.dirname, "..", "..", "extension", "job-sites.js"), "utf8")
  expect(built.slice(built.indexOf("\n") + 1).trim()).toBe(readFileSync(join(dir, "job-sites.js"), "utf8").trim())
})

test("a LinkedIn job from LinkedIn's public page of it, as scripts/pull-linkedin-public.ts reads it", () => {
  // Shortened from https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4477915770 (October 2026).
  const html = `<section class="top-card-layout"><h2 class="top-card-layout__title font-sans text-lg topcard__title">Meta &amp; Google Ads Specialist</h2>
    <a class="topcard__org-name-link topcard__flavor--black-link" href="https://nl.linkedin.com/company/huzzle">\n  Huzzle.com\n </a>
    <span class="topcard__flavor topcard__flavor--bullet">\n EMEA\n </span><figcaption class="num-applicants__caption">Over 200 applicants</figcaption></section>
    <div class="show-more-less-html__markup">We are looking for a specialist <strong>to run</strong> our paid campaigns.<br><br>You work with the growth team in English and report to the head of marketing.</div>
    <h3 class="description__job-criteria-subheader">Seniority level</h3><span class="description__job-criteria-text">Entry level</span>
    <h3 class="description__job-criteria-subheader">Employment type</h3><span class="description__job-criteria-text">Internship</span>`
  expect(postingFromLinkedIn(html)).toEqual({ title: "Meta & Google Ads Specialist", company: "Huzzle.com", location: "EMEA", description: "We are looking for a specialist to run our paid campaigns.\nYou work with the growth team in English and report to the head of marketing.", posted: null, valid: null, logo: null, employment: "Internship", applicants: "Over 200 applicants", seniority: "Entry level", closed: false })
  expect(postingFromLinkedIn('<div class="closed-job">No longer accepting applications</div><h2 class="topcard__title">X</h2><a class="topcard__org-name-link">Y</a>')?.closed).toBe(true)
  expect(postingFromLinkedIn("<html>sign in</html>")).toBeNull()
  expect(linkedinPublicJob("4477915770")).toBe("https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4477915770")
})
