#!/usr/bin/env bun
/**
 * Hot-path benchmark for the job lists: share computation, scoring every job, filtering as someone types, and sorting.
 * Inputs are synthetic but shaped like the real pool (2,000 postings by default, real employer names, real skills).
 * Run `bun run bench`; set BENCH_N for more runs or BENCH_POSTINGS for a bigger pool. Not in CI: shared runners are noisy.
 *
 * "warm" reuses the same posting objects run after run (typing, re-sorting); "cold" gives every run fresh copies,
 * as after the pool loads, so per-posting caches start empty.
 */
import { computeShares, standing, NO_WHAT_IF } from "@/lib/engine"
import { applyFilters, DEFAULT_FILTERS, NO_FILTERS, type JobFilters } from "@/lib/filters"
import industryByEmployer from "@/lib/industries.json"
import type { Reference } from "@/lib/jobs"
import { SKILLS } from "@/lib/skills"
import { sortJobs } from "@/lib/sort"
import { DEFAULT_PROFILE, type Band, type Posting, type Profile, type TaxParams } from "@/lib/types"

const RUNS = Number(process.env.BENCH_N ?? 30)
const WARMUP = 5
const POSTINGS = Number(process.env.BENCH_POSTINGS ?? 2000)

const TITLES: ReadonlyArray<string> = [
  "Finance Intern",
  "Junior Data Analyst",
  "Business Analyst Internship",
  "Graduate Programme Finance",
  "Software Engineer",
  "Senior Backend Developer",
  "Marketing Coordinator",
  "Account Manager Benelux",
  "Werkstudent Controlling",
  "Head of Finance",
  "Product Manager",
  "Supply Chain Trainee",
  "Data Engineer (Python, SQL)",
  "Customer Success Associate",
  "HR Business Partner",
  "Tax Advisor Transfer Pricing",
  "Machine Learning Engineer",
  "Junior Accountant",
  "Sales Development Representative",
  "Operations Analyst",
]
const REGIONS: ReadonlyArray<string> = ["Amsterdam, North Holland", "Rotterdam, South Holland", "Utrecht", "Eindhoven, North Brabant", "The Hague", "Remote"]
const FAMILY_NAMES: ReadonlyArray<string> = ["Finance and accounting", "Data and analytics", "Software engineering", "Marketing and communications", "Sales", "Operations and supply chain"]
const LEVEL_VIEWS: ReadonlyArray<NonNullable<Posting["level_view"]>> = ["Internship", "Entry", "Mid", "Senior", "Manager", "Director", "Not stated"]
const CATS: ReadonlyArray<Posting["cat"]> = ["finance_business", "tech", "other"]
const SENIORITY: ReadonlyArray<string | null> = [null, "Internship", "Entry level", "Associate", "Mid-Senior level", null]
const CBS_CODES: ReadonlyArray<string> = ["0411", "0412", "2511", "2512", "1221", "2431"]

// 2026 parameters as stored in tax_params (the same figures as engine.test.ts).
const TAX: TaxParams = {
  box1_brackets: [{ upto: 38883, rate: 0.3575 }, { upto: 78426, rate: 0.3756 }, { above: 78426, rate: 0.495 }],
  general_tax_credit: { max: 3115, phase_out_start: 29736, phase_out_rate: 0.06398, zero_at: 78426 },
  labour_tax_credit: { max: 5685, phase_out_start: 45592, phase_out_rate: 0.0651, zero_at: 132920 },
  ruling_30pct: { min_salary: 48013, min_salary_under30_masters: 36497, rate_2026: 0.3 },
  ind_hsm_thresholds_h2_2026_monthly_excl_holiday: { reduced_orientation_year: 3122, under_30: 4357, age_30_plus: 5942 },
  health_insurance_2026: { average_premium_month: 157 },
}

const PROFILE: Profile = {
  ...DEFAULT_PROFILE,
  permit: "orientation_year",
  birth: 1999,
  abroad: 20,
  origin: "non_eu",
  dutch: "basic",
  cv: "Financial analyst with IFRS reporting and Excel modelling, SQL and Python for dashboards in Power BI. MSc Finance, Erasmus University Rotterdam. ".repeat(6),
  positions: [
    { Title: "Financial Analyst", "Company Name": "Vietcombank", "Started On": "Mar 2021", "Finished On": "Aug 2023", Description: "Monthly reporting, Excel modelling, IFRS, variance analysis." },
    { Title: "Finance Intern", "Company Name": "Deloitte", "Started On": "Jun 2020", "Finished On": "Dec 2020", Description: "Audit support, reconciliations." },
    { Title: "Data Analyst (part-time)", "Company Name": "Erasmus University", "Started On": "Jan 2024", "Finished On": "", Description: "SQL, Python, Tableau." },
  ],
  education: [
    { "School Name": "Erasmus University Rotterdam", "Degree Name": "MSc Finance", "Start Date": "Sep 2023", "End Date": "Aug 2025" },
    { "School Name": "Foreign Trade University", "Degree Name": "BSc Economics", "Field Of Study": "Economics", "Start Date": "Sep 2017", "End Date": "Jun 2021" },
  ],
  skills: ["Excel", "IFRS", "SQL", "Python", "Power BI"].map((name) => ({ Name: name })),
  languages: [{ Name: "English", Proficiency: "Full professional" }],
  onboarded: true,
}

// Typing "data analyst" one key at a time, then a few ticked boxes.
const TYPING: ReadonlyArray<string> = Array.from("data analyst", (_, i) => "data analyst".slice(0, i + 1))
const FILTER_SETS: ReadonlyArray<JobFilters> = [
  DEFAULT_FILTERS,
  { ...NO_FILTERS, field: ["Finance and accounting", "Data and analytics"] },
  { ...NO_FILTERS, industry: ["Banking", "Consulting"], sponsorOnly: true },
  { ...NO_FILTERS, posted: "week", city: ["Amsterdam"] },
]

interface Row {
  task: string
  median: number
  min: number
}

const employers = Object.keys(industryByEmployer)
const skillNames = Object.keys(SKILLS)
const rows: Row[] = []

for (const [label, fromView] of [["app_jobs view", true], ["table fallback", false]] as const) {
  const pool = makePool(POSTINGS, fromView)
  const ref = makeReference()
  const shares = computeShares(pool)
  const ctx = { reference: ref, shares: shares, profile: PROFILE, referrals: new Set<string>() }
  const fresh = (): Posting[] => pool.map((p) => ({ ...p }))

  rows.push(time(`${label}: computeShares`, () => pool, (posts) => computeShares(posts)))
  rows.push(time(`${label}: standing x all, warm`, () => pool, (posts) => posts.map((p) => standing(p, PROFILE, ref, shares, NO_WHAT_IF))))
  rows.push(time(`${label}: standing x all, cold`, fresh, (posts) => posts.map((p) => standing(p, PROFILE, ref, shares, NO_WHAT_IF))))
  rows.push(time(`${label}: type "data analyst" (12 keys), warm`, () => pool, (posts) => TYPING.map((q) => applyFilters(posts, { ...DEFAULT_FILTERS, query: q }).length)))
  rows.push(time(`${label}: type "data analyst" (12 keys), cold`, fresh, (posts) => TYPING.map((q) => applyFilters(posts, { ...DEFAULT_FILTERS, query: q }).length)))
  rows.push(time(`${label}: 4 filter sets, warm`, () => pool, (posts) => FILTER_SETS.map((f) => applyFilters(posts, f).length)))
  rows.push(time(`${label}: 4 filter sets, cold`, fresh, (posts) => FILTER_SETS.map((f) => applyFilters(posts, f).length)))
  rows.push(time(`${label}: sort by match`, () => pool, (posts) => sortJobs(posts, "match", "desc", ctx)))
  rows.push(time(`${label}: sort by level, warm`, () => pool, (posts) => sortJobs(posts, "level", "desc", ctx)))
  rows.push(time(`${label}: sort by level, cold`, fresh, (posts) => sortJobs(posts, "level", "desc", ctx)))
}

console.log(`bench: ${POSTINGS} postings, median and min of ${RUNS} runs after ${WARMUP} warmup, ms`)
console.log(`${"task".padEnd(52)} ${"median".padStart(9)} ${"min".padStart(9)}`)
for (const r of rows) {
  console.log(`${r.task.padEnd(52)} ${r.median.toFixed(3).padStart(9)} ${r.min.toFixed(3).padStart(9)}`)
}

// Times `run` on what `setup` gives, untimed setup each run; returns the median and the fastest.
function time<T>(task: string, setup: () => T, run: (input: T) => unknown): Row {
  const samples: number[] = []
  for (let i = 0; i < WARMUP + RUNS; i++) {
    const input = setup()
    const start = performance.now()
    run(input)
    const took = performance.now() - start
    if (i >= WARMUP) {
      samples.push(took)
    }
  }
  samples.sort((a, b) => a - b)

  return { task: task, median: samples[Math.floor(samples.length / 2)], min: samples[0] }
}

// A deterministic pool: the app_jobs view sets level_view and mostly family; the table fallback leaves both to the browser.
function makePool(count: number, fromView: boolean): Posting[] {
  const rand = seeded(42)
  const pick = <T,>(list: ReadonlyArray<T>): T => list[Math.floor(rand() * list.length)]

  return Array.from({ length: count }, (_, i): Posting => {
    const daysOpen = Math.floor(rand() * 60)
    const employer = pick(employers)

    return {
      id: `p${i}`,
      title: `${pick(TITLES)}${rand() < 0.3 ? ` - ${pick(REGIONS).split(",")[0]}` : ""}`,
      title_clean: rand() < 0.6 ? pick(TITLES) : null,
      level_jev: rand() < 0.5 ? pick(["internship", "entry", "mid", "senior"]) : null,
      level_conf: rand(),
      level_view: fromView ? pick(LEVEL_VIEWS) : null,
      family: fromView && rand() < 0.7 ? pick(FAMILY_NAMES) : null,
      role_kind: rand() < 0.4 ? pick(["internship", "working_student", "traineeship", "entry_job", "other"] as const) : null,
      industry: null,
      workplace: pick(["hybrid", "remote", "on-site", null]),
      job_type: pick(["full-time", "part-time", null]),
      employer: employer,
      employer_display: employer,
      ats: pick(["greenhouse", "lever", "workday", "linkedin"]),
      source: "crawl",
      region: pick(REGIONS),
      cat: pick(CATS),
      cbs_group: rand() < 0.8 ? pick(CBS_CODES) : null,
      url: `https://example.com/jobs/${i}`,
      ind_sponsor: rand() < 0.5,
      ind_sponsor_name: null,
      years_min: rand() < 0.5 ? Math.floor(rand() * 8) : null,
      dutch_required: rand() < 0.25,
      visa_mention: rand() < 0.1,
      junior_title: rand() < 0.3,
      degree_asked: pick(["phd", "master", "bachelor", null]),
      skills: Array.from({ length: 2 + Math.floor(rand() * 8) }, () => pick(skillNames)),
      pay_posted: rand() < 0.2 ? "€3,000 - €4,000 per month" : null,
      applicants: null,
      applicants_text: null,
      valid_through: null,
      seniority: pick(SENIORITY),
      posted_at: null,
      days_open: daysOpen,
      freshness_state: daysOpen <= 6 ? "fresh" : "active",
      fetched_at: "2026-10-01T00:00:00Z",
    }
  })
}

// Pay bands for the codes the pool uses, with the real tax table.
function makeReference(): Reference {
  const bands: Record<string, Band> = {}
  CBS_CODES.forEach((code, i) => {
    bands[code] = { code: code, label: `Band ${code}`, year: 2024, p25_hourly: 22 + i, p50_hourly: 30 + i, p75_hourly: 40 + i, employees_k: 50, cagr_2013_2024: 0.02, cagr_2019_2024: 0.03 }
  })

  return { bands: bands, ageFactors: { business: { "25-30": 0.85 } }, tax: TAX, transitions: {} }
}

// Mulberry32: the same pool on every run and every commit.
function seeded(seed: number): () => number {
  let a = seed

  return (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
