import { useEffect, useState } from "react"
import { Section } from "@/components/Section"
import { ageText } from "@/components/Tag"
import { useData } from "@/lib/data"
import { formatPlace } from "@/lib/format"
import { fetchEmployerFacts, type EmployerFacts } from "@/lib/jobs"
import type { Posting } from "@/lib/types"

/** Other jobs at the same employer, last on the page. Each opens in the same panel. */
export function MoreAtEmployer({ post, onOpenJob }: { post: Posting; onOpenJob?: (post: Posting) => void }): React.JSX.Element | null {
  const data = useData()
  const others = data.postings.filter((p) => p.employer === post.employer && p.id !== post.id)
  if (others.length === 0) return null

  return (
    <Section title={`More jobs at ${post.employer_display}`}>
      <ul className="divide-y-[1.5px] border-y-[1.5px]">
        {others.slice(0, 5).map((p) => (
          <li key={p.id}>
            <button type="button" disabled={!onOpenJob} onClick={() => onOpenJob?.(p)} className="flex w-full cursor-pointer items-baseline justify-between gap-4 py-3 text-left transition-colors duration-150 hover:text-primary disabled:cursor-default">
              <span className="min-w-0 truncate font-medium">{p.title}</span>
              <span className="shrink-0 text-sm text-muted-foreground">{formatPlace(p.region)} · {ageText(p).replace("Posted ", "")}</span>
            </button>
          </li>
        ))}
      </ul>
      {others.length > 5 ? <p className="mt-2 text-sm text-muted-foreground">and {others.length - 5} more</p> : null}
    </Section>
  )
}

function CompanyFact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-t py-2 first:border-t-0"><dt className="font-medium">{label}</dt><dd className="min-w-0 break-words">{children}</dd></div>
}

/** A short employer profile built from the company's scraped page and current job postings. */
export function AboutCompany({ post }: { post: Posting }): React.JSX.Element {
  const data = useData()
  const [facts, setFacts] = useState<EmployerFacts | null>(null)
  useEffect(() => {
    let live = true
    void fetchEmployerFacts(post.employer).then((result) => {
      if (live) setFacts(result)
    })
    return () => { live = false }
  }, [post.employer])

  const jobs = data.postings.filter((p) => p.employer === post.employer && !p.closed_at)
  const withPay = jobs.filter((p) => Boolean(p.pay_posted)).length
  const needingDutch = jobs.filter((p) => p.dutch_required).length
  const cities = [...new Set(jobs.map((p) => formatPlace(p.region).split(",")[0].trim()).filter((city) => city && city !== "Location not stated"))]
  const description = facts?.description?.trim() || null

  return (
    <Section title={`About ${post.employer_display}`}>
      {description ? <p className="leading-relaxed">{description}</p> : null}

      {(facts?.founded_year || facts?.employees || facts?.headquarters || facts?.website) ? (
        <div className="mt-4 rounded-xl border-[1.5px] bg-card px-4 py-2 text-sm">
          {facts?.founded_year ? <CompanyFact label="Founded">{facts.founded_year}</CompanyFact> : null}
          {facts?.employees || facts?.employee_range ? <CompanyFact label="Employees">{facts.employee_range ?? facts.employees?.toLocaleString("en-US")}</CompanyFact> : null}
          {facts?.headquarters ? <CompanyFact label="Headquarters">{facts.headquarters}</CompanyFact> : null}
          {facts?.website ? <CompanyFact label="Website"><a href={facts.website} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{facts.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></CompanyFact> : null}
        </div>
      ) : null}

      {jobs.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-base font-bold tracking-tight">Current job listings</h3>
          <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <li>{jobs.length} open {jobs.length === 1 ? "job" : "jobs"}{cities.length ? ` · ${cities.slice(0, 3).join(", ")}` : ""}</li>
            <li>Pay listed in the job post for {withPay} of {jobs.length}</li>
            <li>Dutch required for {needingDutch} of {jobs.length}</li>
          </ul>
        </div>
      ) : null}
    </Section>
  )
}
