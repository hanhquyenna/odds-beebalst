#!/usr/bin/env bun
/**
 * Hot-path benchmark for the job lists: share computation, scoring every job, filtering as someone types, and sorting.
 * Synthetic pool shaped like the app_jobs view (2,000 postings, real employers and skills), the e2e reference tables.
 * `bun run bench`; BENCH_N sets runs, BENCH_POSTINGS the pool size. CI fails it only past a loose ceiling, since shared runners are noisy.
 * "cold" gives every run fresh posting copies, so per-posting caches start empty, as right after load.
 */
import { AGE_FACTORS, BANDS, TAX, TRANSITIONS } from "../e2e/fixtures/reference"
import { computeShares, standing, NO_WHAT_IF } from "@/lib/engine"
import { EXAMPLE_PROFILE } from "@/lib/example"
import { applyFilters, DEFAULT_FILTERS, NO_FILTERS, type JobFilters } from "@/lib/filters"
import industryByEmployer from "@/lib/industries.json"
import type { Reference } from "@/lib/jobs"
import { SKILLS } from "@/lib/skills"
import { sortJobs } from "@/lib/sort"
import type { Posting, Profile } from "@/lib/types"

const RUNS = Number(process.env.BENCH_N ?? 30)
const WARMUP = 5
const POSTINGS = Number(process.env.BENCH_POSTINGS ?? 2000)
// Sum of the fastest runs, measured 5 Oct 2026 at about 45 ms on a laptop; 4x leaves room for a slow runner, not for a real regression.
const MAX_TOTAL_MIN_MS = 180

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
const CBS_CODES: ReadonlyArray<string> = BANDS.map((b) => b.code)

// The shipped example profile with a longer CV, so scoring reads realistic text.
const PROFILE: Profile = {
  ...EXAMPLE_PROFILE,
  cv: "Financial analyst with IFRS reporting and Excel modelling, SQL and Python for dashboards in Power BI. MSc Finance, Erasmus University Rotterdam. ".repeat(6),
  skills: ["Excel", "IFRS", "SQL", "Python", "Power BI"].map((name) => ({ Name: name })),
}
const REFERENCE: Reference = {
  bands: Object.fromEntries(BANDS.map((band) => [band.code, band])),
  ageFactors: AGE_FACTORS.reduce<Record<string, Record<string, number>>>((all, row) => ({ ...all, [row.sector]: { ...all[row.sector], [row.age_band]: row.factor } }), {}),
  tax: TAX,
  transitions: Object.fromEntries(TRANSITIONS.map((t) => [t.title, t])),
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

const pool = makePool(POSTINGS)
const shares = computeShares(pool)
const ctx = { reference: REFERENCE, shares: shares, profile: PROFILE, referrals: new Set<string>() }
const fresh = (): Posting[] => pool.map((p) => ({ ...p }))
const scoreAll = (posts: Posting[]): unknown => posts.map((p) => standing(p, PROFILE, REFERENCE, shares, NO_WHAT_IF))
const typeAll = (posts: Posting[]): unknown => TYPING.map((q) => applyFilters(posts, { ...DEFAULT_FILTERS, query: q }).length)
const filterAll = (posts: Posting[]): unknown => FILTER_SETS.map((f) => applyFilters(posts, f).length)
const rows: Row[] = [
  time("computeShares", () => pool, computeShares),
  time("standing x all", () => pool, scoreAll),
  time('type "data analyst" (12 keys), warm', () => pool, typeAll),
  time('type "data analyst" (12 keys), cold', fresh, typeAll),
  time("4 filter sets, warm", () => pool, filterAll),
  time("4 filter sets, cold", fresh, filterAll),
  time("sort by match", () => pool, (posts) => sortJobs(posts, "match", "desc", ctx)),
  time("sort by level", () => pool, (posts) => sortJobs(posts, "level", "desc", ctx)),
]

console.log(`bench: ${POSTINGS} postings, median and min of ${RUNS} runs after ${WARMUP} warmup, ms`)
console.log(`${"task".padEnd(52)} ${"median".padStart(9)} ${"min".padStart(9)}`)
for (const r of rows) {
  console.log(`${r.task.padEnd(52)} ${r.median.toFixed(3).padStart(9)} ${r.min.toFixed(3).padStart(9)}`)
}
const total = rows.reduce((sum, r) => sum + r.min, 0)
if (POSTINGS === 2000 && total > MAX_TOTAL_MIN_MS) {
  console.error(`bench: FAIL: fastest runs sum to ${total.toFixed(1)} ms, ceiling is ${MAX_TOTAL_MIN_MS} ms.`)
  process.exit(1)
}
console.log(`bench: ok: fastest runs sum to ${total.toFixed(1)} ms, ceiling ${MAX_TOTAL_MIN_MS} ms.`)

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

// A deterministic pool shaped like the app_jobs view, which sets level_view and mostly family.
function makePool(count: number): Posting[] {
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
      level_view: pick(LEVEL_VIEWS),
      family: rand() < 0.7 ? pick(FAMILY_NAMES) : null,
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
