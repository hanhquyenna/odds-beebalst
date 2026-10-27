import industryByEmployer from "@/lib/industries.json"
import type { Posting } from "@/lib/types"

/**
 * One industry per job, named the way LinkedIn names company industries. It is
 * the industry of the employer, not the kind of work: a finance analyst at a
 * software company is in "Software & internet". Banking, financial services,
 * insurance, accounting and consulting are separate industries.
 * industries.json was built from LinkedIn's own industry field. Employers not in it fall back to
 * postings.industry, which scripts/after-new-jobs.sh fills for new jobs.
 */
export const INDUSTRIES = [
  "Banking",
  "Financial services",
  "Insurance",
  "Accounting",
  "Consulting",
  "Legal",
  "Staffing & recruiting",
  "Software & internet",
  "IT services",
  "Telecommunications",
  "Semiconductors",
  "Manufacturing",
  "Health & life sciences",
  "Energy & utilities",
  "Construction",
  "Transport & logistics",
  "Food & consumer goods",
  "Retail & e-commerce",
  "Hospitality & travel",
  "Media & marketing",
  "Education",
  "Government & non-profit",
  "Real estate",
] as const
export type Industry = (typeof INDUSTRIES)[number]

const MAP = industryByEmployer as Record<string, string>

export function industryOf(post: Pick<Posting, "employer" | "industry">): Industry | null {
  const found = MAP[post.employer] ?? post.industry

  return (INDUSTRIES as ReadonlyArray<string>).includes(found) ? (found as Industry) : null
}
