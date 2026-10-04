import { ChevronDownIcon } from "@/components/icons"
import { useData } from "@/lib/data"
import { confidenceOf } from "@/lib/confidence"
import type { Standing } from "@/lib/engine"
import { openResearch } from "@/lib/research-link"
import type { Posting } from "@/lib/types"

/** The little arrow beside a number that opens its explanation. */
export function Caret({ open }: { open: boolean }): React.JSX.Element {
  return <ChevronDownIcon aria-hidden="true" className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
}

function SeeHow({ slug = "interview-odds-base-rates" }: { slug?: string }): React.JSX.Element {
  return (
    <button type="button" onClick={() => openResearch(slug)} className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
      <span className="underline underline-offset-4">See the research</span> <span aria-hidden="true">→</span>
    </button>
  )
}

/** A figure in the explanation, picked out so the numbers are what the eye finds first. */
function Num({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <mark className="rounded-sm bg-brand px-1.5 py-0.5 font-bold text-white tabular-nums">{children}</mark>
}

/** One bullet: the question in bold, the answer after it. */
function Point({ q, children }: { q: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <li>
      <b className="text-foreground">{q}</b> {children}
    </li>
  )
}

/**
 * Under the interview chance on a job: the same general explanation for everyone, as bullet answers, with the confidence for this job in
 * one line and a link to the long version. Nothing here depends on the profile.
 */
export function ChancePanel({ post, st }: { post: Posting; st: Standing }): React.JSX.Element {
  const data = useData()
  const confidence = confidenceOf(st, post, data.profile)

  return (
    <div className="rounded-xl bg-secondary/70 p-4 text-sm sm:p-5">
      <ul className="list-disc space-y-2.5 pl-5 text-[0.8125rem] leading-snug text-muted-foreground marker:text-foreground/60">
        <Point q="What is the interview chance?">The share of people applying to a job like this who are invited to an interview. It is not the chance of getting the job.</Point>
        <Point q="How do we judge it?">
          We start from how often applications to jobs like this lead to an interview. Then we move that number up or down for the things employers have been shown to react to: your background, your experience, and how well your CV matches the posting.
        </Point>
        <Point q="What do we look at?">
          Your skills and tools, your line of work, role and level, your track record (employers, schools, prizes, grades), your background, internships, and a referral or a tailored application if you tick them. On the job side: what the posting asks for, and how much it insists on each thing.
        </Point>
        <Point q="Where do the sources come from?">
          Hiring data from the recruiting software employers use (Ashby 2026, SmartRecruiters 2025). Field experiments where researchers sent matched CVs to real Dutch vacancies (Thijssen et al. 2019 and 2021, SCP 2010). Other controlled studies on internships, employer prestige, CV quality and tailoring (Baert 2021, Kessler et al. 2019, Bertrand and Mullainathan 2004, ResumeGo 2020).
        </Point>
        <Point q="How much research is behind it?">
          <Num>9</Num> research reports in this app, citing <Num>32</Num> sources. Ashby&apos;s hiring data alone covers <Num>109 million</Num> applications, and the Dutch matched-CV experiment behind the background gap sent <Num>4,211</Num> applications.
        </Point>
        <Point q="How sure are we?">
          {confidence ? (
            <>
              <b className="text-foreground">{confidence.level}, {confidence.score} out of 100</b> for this job. That score counts how much we had to go on (enough similar jobs, how much of your profile could be read, how many skills the posting lists, how closely the studies agree). It is an estimate from research and has not been compared with real outcomes yet.
            </>
          ) : (
            <>It is an estimate from research and has not been compared with real outcomes yet.</>
          )}
        </Point>
        <Point q="What could make it more scientific?">
          <ul className="mt-1 list-[circle] space-y-1 pl-5">
            <li>Compare you with people who were actually hired into similar roles.</li>
            <li>Fit how much each part of a CV counts to real recruiter decisions, with a regression.</li>
            <li>Train on real applications and their outcomes, and publish how well it is calibrated (for example the Brier score).</li>
            <li>Show a proper confidence interval instead of a range between studies.</li>
            <li>Combine the studies with a meta-analysis, and check the result for bias across groups.</li>
          </ul>
        </Point>
      </ul>
      <SeeHow />
    </div>
  )
}

/** Under the odds on the dashboard: what the two numbers are and where they come from, in four short lines. The same for everyone. */
export function OddsPanel(): React.JSX.Element {
  const line = "px-5 py-4 text-base leading-snug text-foreground"

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-foreground/70 bg-card">
      <p className={line}>
        The first number is your chance of at least one interview from the jobs you marked Applied. The second is your chance of an offer: about <Num>1 in 4</Num> interviews ends in one.
      </p>
      <p className={`${line} border-t-[1.5px] border-line`}>Each job starts from how often jobs like it lead to an interview, then moves up or down for your CV.</p>
      <p className={`${line} border-t-[1.5px] border-line`}>
        Built on <Num>109 million</Num> real applications, <Num>4,211</Num> CVs sent to real Dutch vacancies, and <Num>9</Num> reports citing <Num>32</Num> sources.
      </p>
      <p className={`${line} border-t-[1.5px] border-line`}>It&apos;s an estimate. We haven&apos;t checked it against real outcomes yet.</p>
      <div className="border-t-[1.5px] border-line px-5 pb-4">
        <SeeHow />
      </div>
    </div>
  )
}
