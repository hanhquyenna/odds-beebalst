import { useEffect, useMemo } from "react"
import { ArrowRightIcon } from "@/components/icons"
import { CompanyLogo } from "@/components/CompanyMark"
import { useData } from "@/lib/data"
import { FACTORS } from "@/lib/engine"
import { ResearchPage } from "@/components/Research"
import type { StaticPage } from "@/lib/pages"

interface Props {
  onBack: () => void
  onOpenPage?: (page: StaticPage) => void
}

function Shell({ children, onBack, title }: Props & { children: React.ReactNode; title: string }): React.JSX.Element {
  useEffect(() => {
    const old = document.title
    document.title = `${title} · odds`

    return () => {
      document.title = old
    }
  }, [title])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8">
      <button type="button" onClick={onBack} className="w-fit cursor-pointer text-sm font-medium text-primary">
        ← Back to jobs
      </button>
      <div className="-mx-5 rounded-xl px-5 py-10 sm:-mx-8 sm:px-8">
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">{title}</h1>
      </div>
      {children}
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="max-w-3xl">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <div className="mt-3 space-y-4 text-lg leading-8 text-muted-foreground">{children}</div>
    </section>
  )
}

function NextLink({ page, label, onOpenPage }: { page: StaticPage; label: string; onOpenPage?: (page: StaticPage) => void }): React.JSX.Element {
  return (
    <button type="button" onClick={() => onOpenPage?.(page)} className="inline-flex w-fit cursor-pointer items-center gap-2 font-medium text-primary">
      {label} <ArrowRightIcon className="size-4" aria-hidden="true" />
    </button>
  )
}

export function AboutPage({ onBack, onOpenPage }: Props): React.JSX.Element {
  const data = useData()

  return (
    <Shell onBack={onBack} title="A clearer way through a hard job search.">
      <div className="space-y-12">
        <Block title="What it is">
          <p>
            odds is for people looking for work in the Netherlands who did not grow up here, and for international graduates in particular. For
            each job it puts next to the posting the things that decide whether it is realistic: what it pays, what you keep after tax, whether it clears your
            permit threshold, whether you meet its hard requirements, and what your chances look like.
          </p>
        </Block>
        <Block title="What it is not">
          <p>
            It is an early version. The jobs are a snapshot taken on {data.collected}. The chance of an interview is an estimate until enough real
            applications have been logged to measure it. Some job titles cannot yet be matched to a pay figure. Wherever something is missing, the page says so
            instead of filling the gap.
          </p>
        </Block>
        <NextLink page="how-it-works" label="See how it works" onOpenPage={onOpenPage} />
      </div>
    </Shell>
  )
}

export function HowItWorksPage({ onBack, onOpenPage }: Props): React.JSX.Element {
  const steps: ReadonlyArray<readonly [string, string]> = [
    ["Tell us about you", "Your permit, where you grew up, your birth year, how many months you lived abroad before your job, and your Dutch. Add your LinkedIn export or CV if you want your experience checked too."],
    ["See the jobs", "Filter by industry, level and language. Jobs that clear every hard requirement come first; jobs missing just one follow under their own heading."],
    ["Open one", "Everything about the posting is open to anyone. With your answers you also see whether you clear it, your chance of an interview, what you would keep after tax and whether it clears your permit."],
    ["Try a change", "Learn Dutch, finish a master's, get a referral: the page shows how much each one moves your estimate and where that number comes from."],
    ["Log what happens", "Mark where you applied and how it went. Your results are how the estimate can become a measured number."],
  ]

  return (
    <Shell onBack={onBack} title="From a long list to the jobs that fit.">
      <ol className="grid gap-4 sm:grid-cols-2">
        {steps.map(([title, text], at) => (
          <li key={title} className="rounded-xl border-[1.5px] bg-card p-6">
            <span className="text-sm font-semibold text-brand">Step {at + 1}</span>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
      <Block title="What to trust, and how much">
        <p>
          <span className="font-semibold text-foreground">Certain.</span> Law and registers: net income, permit thresholds, the 30% ruling rule, sponsor status, what a
          posting says and what your answers say.
        </p>
        <p>
          <span className="font-semibold text-foreground">Real, but about groups.</span> Pay by occupation and age, pay growth, where people go next, how international
          graduates fare. They describe everyone in an occupation, not you and not one employer.
        </p>
        <p>
          <span className="font-semibold text-foreground">An estimate.</span> The chance of an interview. It is shown as a range with every step listed, and it is
          labelled an estimate on the page.
        </p>
      </Block>
      <NextLink page="technology" label="How the estimate is made" onOpenPage={onOpenPage} />
    </Shell>
  )
}

export function NetworkPage({ onBack, onOpenPage }: Props): React.JSX.Element {
  const data = useData()
  const employers = useMemo(() => {
    const counts = new Map<string, { name: string; employer: string; count: number }>()
    for (const post of data.postings) {
      const seen = counts.get(post.employer)
      if (seen) {
        seen.count += 1
      } else {
        counts.set(post.employer, { name: post.employer_display, employer: post.employer, count: 1 })
      }
    }

    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 24)
  }, [data.postings])

  return (
    <Shell onBack={onBack} title="Who is hiring, in their own words.">
      <Block title="Where the jobs come from">
        <p>
          We read the career sites employers run themselves, and LinkedIn&apos;s public job listings. Each job links back to the original posting. These are the
          employers with the most open jobs in the list right now.
        </p>
      </Block>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {employers.map((employer) => (
          <li key={employer.employer} className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-20 w-full items-center justify-center">
              <CompanyLogo employer={employer.employer} name={employer.name} size={72} wide={2} />
            </div>
            <div className="max-w-full truncate font-semibold tracking-tight">{employer.name}</div>
            <div className="-mt-1 text-sm text-muted-foreground">
              {employer.count} {employer.count === 1 ? "job" : "jobs"}
            </div>
          </li>
        ))}
      </ul>
      <NextLink page="sources" label="See all our sources" onOpenPage={onOpenPage} />
    </Shell>
  )
}

export function TechnologyPage({ onBack, onOpenPage }: Props): React.JSX.Element {
  const rows: ReadonlyArray<readonly [string, string, string, string]> = [
    ["Starting point, low end", `${(FACTORS.base.tech.low.value * 100).toFixed(1)}–${(FACTORS.base.finance_business.low.value * 100).toFixed(1)}%`, "Ashby 2026 and SmartRecruiters 2025: 1 hire per 170 (business) or 254 (technical) applications, 81% of offers accepted, 3.25 interviews per offer", "Recruiting software, not Dutch"],
    ["Starting point, high end", `${(FACTORS.base.tech.high.value * 100).toFixed(1)}–${(FACTORS.base.finance_business.high.value * 100).toFixed(1)}%`, "Ashby Q1 2026: 4.7% of applications to business roles and 3.6% to technical roles reach an interview", "Recruiting software, not Dutch"],
    ["Applicant from abroad", `×${FACTORS.originAll} (×${FACTORS.originGraduate} for graduate jobs)`, "Thijssen et al. 2021 and SCP 2010: identical CVs sent to real Dutch vacancies", "Dutch experiments"],
    ["Experience mostly outside the EU", `×${FACTORS.foreignExperience}`, "Mathematica audit study, counted in the low end only", "Not Dutch"],
    ["An internship on your profile", `×${FACTORS.internship}`, "Baert et al. 2021", "Belgian experiment"],
    ["A tailored application", `×${FACTORS.tailored}`, "ResumeGo 2020, counted in the high end only", "US vendor test, weakest"],
    ["A referral", `×${FACTORS.referral}`, "Ashby 2026", "Recruiting software, global"],
  ]

  return (
    <Shell onBack={onBack} title="How the chance of an interview is worked out.">
      <Block title="Fixed rules, official figures, printed steps">
        <p>
          Nothing here is guessed by a model. Fixed rules read each posting. Official figures do the pay, tax and permit maths. The chance of an interview is a
          starting rate multiplied by effects that researchers measured, and every line of it is shown on the job page.
        </p>
      </Block>
      <div className="overflow-x-auto rounded-xl border-[1.5px] bg-card">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b-[1.5px] text-sm font-medium text-muted-foreground">
              <th className="p-4">Step</th>
              <th className="p-4">Value</th>
              <th className="p-4">Where it comes from</th>
              <th className="p-4">How strong</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([step, value, source, strength]) => (
              <tr key={step} className="border-b-[1.5px] align-top last:border-b-0">
                <td className="p-4 font-medium">{step}</td>
                <td className="p-4 tabular-nums">{value}</td>
                <td className="p-4 text-muted-foreground">{source}</td>
                <td className="p-4 text-muted-foreground">{strength}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Block title="Where it is weak">
        <p>
          The two starting rates come from recruiting software in other countries and disagree with each other by more than a factor of two, so the estimate is
          a range. Overlapping effects count once in the low end. Weak evidence counts only in the high end. Skills are shown but not multiplied, because no study
          has measured their effect. No Dutch rate for a specific job exists yet. Logged applications are how that changes.
        </p>
        <p>The estimate is per application. Sending twenty similar ones raises the chance of at least one interview, but by less than the arithmetic suggests, because your applications share the same CV, permit and Dutch level.</p>
      </Block>
      <NextLink page="sources" label="See the sources" onOpenPage={onOpenPage} />
    </Shell>
  )
}

const sourcesList = (collected: string): ReadonlyArray<readonly [string, string, string]> => [
  ["CBS StatLine 86355NED", "Gross hourly wage, 25th, 50th and 75th percentile, by occupation, 2013 to 2025", "Pay and pay growth"],
  ["CBS StatLine 81431NED", "Mean hourly wage by sector and age, 2024", "Pay for your age"],
  ["CBS StatLine 85776NED and 85456NED", "International graduates one year after graduating; unemployment by origin", "The graduate figures"],
  ["Belastingdienst, 2026", "Income tax brackets, tax credits, the 30% ruling and its distance rule", "Net income and ruling"],
  ["IND", "Salary thresholds for highly skilled migrants and the orientation year, 2026; the public register of recognised sponsors", "Permit check and sponsors"],
  ["Rijksoverheid, 2026", "Average basic health insurance premium", "Take-home pay"],
  ["Employers' career sites and LinkedIn", `Job postings collected on ${collected}`, "The jobs, posted pay, age and applicant counts"],
  ["JobHop (Ghent University and VDAB)", "333,096 Flemish career histories, aggregate job-to-job moves", "Where people go next (Flemish, not Dutch)"],
  ["Ashby 2026 and SmartRecruiters 2025", "Application-to-interview funnels from recruiting software", "The starting rate"],
  ["Thijssen et al. 2019 and 2021, SCP 2010", "Dutch field experiments: identical CVs sent to real vacancies", "The effect of a background from abroad"],
  ["Baert et al. 2021, ResumeGo 2020, Mathematica", "Internship effect (Belgium), tailored applications (US vendor test), foreign experience (not Dutch)", "The other effects"],
]

export function SourcesPage({ onBack }: Props): React.JSX.Element {
  const { collected } = useData()

  return (
    <Shell onBack={onBack} title="Where every number comes from.">
      <div className="overflow-x-auto rounded-xl border-[1.5px] bg-card">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b-[1.5px] text-sm font-medium text-muted-foreground">
              <th className="p-4">Source</th>
              <th className="p-4">What it is</th>
              <th className="p-4">Used for</th>
            </tr>
          </thead>
          <tbody>
            {sourcesList(collected).map(([source, what, used]) => (
              <tr key={source} className="border-b-[1.5px] align-top last:border-b-0">
                <td className="p-4 font-medium">{source}</td>
                <td className="p-4 text-muted-foreground">{what}</td>
                <td className="p-4 text-muted-foreground">{used}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Block title="Two things to know">
        <p>Glassdoor salary pages were used once, to check that our pay figures land close to what employees report. None of its figures are shown here.</p>
        <p>Company logos come from LinkedIn company pages and from each company&apos;s website icon. Postings belong to their employers.</p>
      </Block>
    </Shell>
  )
}

export function SafetyPage({ onBack }: Props): React.JSX.Element {
  return (
    <Shell onBack={onBack} title="What we keep, and what to double-check.">
      <Block title="What we keep">
        <p>
          Without an account, your answers, kept jobs and applications stay in this browser. Files you add are read in the browser and are not uploaded. With an
          account, your profile and applications are stored in our database and only you can read them.
        </p>
      </Block>
      <Block title="Check what matters with the source">
        <p>
          The salary thresholds and the tax figures follow the IND and the Belastingdienst for 2026, but a permit or a tax decision is yours. Confirm it with the
          IND, the Belastingdienst or an adviser before you act on it. A company being a recognised sponsor is not a promise that it will sponsor a particular job.
        </p>
      </Block>
    </Shell>
  )
}

export function PrivacyPage({ onBack }: Props): React.JSX.Element {
  return (
    <Shell onBack={onBack} title="Plain privacy.">
      <Block title="Draft">
        <p>This text is a draft and not legal advice.</p>
        <p>
          We store only what you give us: your answers, the experience you add, the jobs you keep and the applications you log, plus your email if you make an account.
          Job postings and reference figures are public. The app has no advertising and no third-party trackers.
        </p>
      </Block>
    </Shell>
  )
}

export function TermsPage({ onBack }: Props): React.JSX.Element {
  return (
    <Shell onBack={onBack} title="Plain terms.">
      <Block title="Draft">
        <p>This text is a draft and not legal advice.</p>
        <p>
          The figures are estimates for orientation. They are not immigration, tax or employment advice, and not a promise about any hiring decision. Job postings belong
          to their employers; follow the link on each job to the original.
        </p>
      </Block>
    </Shell>
  )
}

export function StaticPageView({ page, onBack, onOpenPage }: { page: StaticPage } & Props): React.JSX.Element {
  switch (page) {
    case "about":
      return <AboutPage onBack={onBack} onOpenPage={onOpenPage} />
    case "how-it-works":
      return <HowItWorksPage onBack={onBack} onOpenPage={onOpenPage} />
    case "technology":
      return <TechnologyPage onBack={onBack} onOpenPage={onOpenPage} />
    case "network":
      return <NetworkPage onBack={onBack} onOpenPage={onOpenPage} />
    case "sources":
      return <SourcesPage onBack={onBack} />
    case "safety":
      return <SafetyPage onBack={onBack} />
    case "privacy":
      return <PrivacyPage onBack={onBack} />
    case "terms":
      return <TermsPage onBack={onBack} />
    case "research":
      return <ResearchPage onBack={onBack} onOpenPage={onOpenPage} />
  }
}
