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
    <button type="button" onClick={() => openResearch(slug)} className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
      <span className="underline underline-offset-4">See the research</span> <span aria-hidden="true">→</span>
    </button>
  )
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
          9 research reports in this app, citing 32 sources. Ashby&apos;s hiring data alone covers 109 million applications, and the Dutch matched-CV experiment behind the background gap sent 4,211 applications.
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

/** One step of the method: a number, a name, and what is done. */
function Step({ n, name, children }: { n: number; name: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-x-2 py-4">
      <span className="font-semibold tabular-nums">{n}.</span>
      <div className="flex flex-col gap-2">
        <h4 className="font-semibold">{name}</h4>
        {children}
      </div>
    </li>
  )
}

/** The relative effects the model applies, each from a controlled study. */
const FACTORS_TABLE: ReadonlyArray<readonly [string, string, string]> = [
  ["Non-Dutch background", "×0.76 to ×0.93", "Thijssen et al. 2021, 4,211 applications"],
  ["Work experience mostly outside the EU", "×0.88, low bound only", "Mathematica audit study"],
  ["Internship on your CV", "×1.13", "Baert et al. 2021"],
  ["Referral at the employer", "×1.49", "Ashby 2026"],
  ["CV tailored to the job", "×1.31, high bound only", "ResumeGo 2020"],
]

/**
 * What the model still has to prove, and how. A goal list, not a claim: each row says plainly whether the work has started. Keep the status honest when it changes;
 * the plan behind each row is in docs/credibility-plan.md.
 */
const PROOF: ReadonlyArray<readonly [string, string, string]> = [
  ["Are the chances right?", "Compare them with what really happened to applications logged on odds, and publish how close they were (calibration).", "Started: the tracker records interviews and offers"],
  ["Are the weights right?", "Estimate them from real applications and their outcomes with a logistic regression, instead of setting them ourselves.", "Planned"],
  ["Do the studies agree?", "Pool the experiments in a meta-analysis: one effect per factor, with a confidence interval.", "Planned"],
  ["How uncertain is each number?", "Give every chance a confidence interval based on how much data sits behind it.", "Planned"],
  ["Does it hold for the Netherlands today?", "Collect Dutch applications with outcomes, through students and university career services.", "Planned"],
  ["Is it fair to everyone?", "Check that the chances are equally accurate across backgrounds, fields and levels.", "Planned"],
  ["Can others check it?", "Publish the method and every change to it, and have it reviewed by labour-market researchers.", "Planned"],
]

/**
 * How the odds are calculated, written as a method: the base rate, the adjustment factors, the fit score, the point estimate, how applications combine,
 * then the evidence and the limitations. It describes what engine.ts and fit.ts actually do, and every figure is one the research pages state.
 * `bare` drops the frame, for when it opens inside a card that already has one.
 */
export function OddsPanel({ bare = false }: { bare?: boolean }): React.JSX.Element {
  const cell = "border-b-[1.5px] border-line py-2 pr-4 align-top"

  return (
    <div className={`text-[0.9375rem] leading-relaxed text-foreground ${bare ? "" : "rounded-2xl border-2 border-foreground/70 bg-card px-5 sm:px-6"}`}>
      <h3 className="pt-5 text-lg font-bold">Method</h3>
      <ol className="divide-y-[1.5px] divide-line">
        <Step n={1} name="Base rate">
          <p>
            Each job starts from the share of applications that reach an interview in its job family, taken from employer hiring data: 109 million applications (Ashby 2026) and 89 million (SmartRecruiters 2025). The two
            sources disagree, so each job carries a low and a high bound, for example 2.4% to 4.7% for business roles.
          </p>
        </Step>
        <Step n={2} name="Adjustment factors">
          <p>Effects measured in controlled studies, where only one thing on the CV was changed, are applied as multipliers to both bounds.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-t-[1.5px] border-line text-left text-sm">
              <thead>
                <tr>
                  <th className={`${cell} font-semibold`}>Factor</th>
                  <th className={`${cell} font-semibold`}>Effect</th>
                  <th className={`${cell} font-semibold`}>Source</th>
                </tr>
              </thead>
              <tbody>
                {FACTORS_TABLE.map(([factor, effect, source]) => (
                  <tr key={factor}>
                    <td className={cell}>{factor}</td>
                    <td className={`${cell} tabular-nums`}>{effect}</td>
                    <td className={cell}>{source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Step>
        <Step n={3} name="Fit score">
          <p>
            Your profile is compared with the posting on up to five weighted parts: skills 35%, line of work 25%, career consistency 15%, role 15%, level 10%. Each skill counts by how strongly the posting asks for it.
          </p>
          <p>
            An average applicant scores 40%. Above that, the chance rises toward what CVs written to fit the vacancy received in Dutch field experiments (18% to 54%). Below it, the chance falls by up to a factor of 1.3, the gap between strong and weak CVs that Bertrand and
            Mullainathan (2004) measured. The weights are set by us, because no study measures them.
          </p>
        </Step>
        <Step n={4} name="Point estimate">
          <p>The number shown is the geometric mean of the low and high bound: the middle of the range when chances are compared as ratios.</p>
        </Step>
        <Step n={5} name="Combining applications">
          <p className="font-mono text-sm">P(at least one interview) = 1 − (1 − p₁) × (1 − p₂) × … × (1 − pₙ)</p>
          <p>
            Here p is the chance for each job you marked Applied. The formula treats applications as independent, so the result is an upper bound. The offer chance per job is the interview chance × 0.81 ÷ 3.25: 3.25 interviews
            per offer (SmartRecruiters 2025) and 81% of offers accepted (Ashby 2026), about 1 in 4.
          </p>
        </Step>
      </ol>

      <h3 className="border-t-[1.5px] border-line pt-5 text-lg font-bold">Evidence</h3>
      <p className="py-3">9 research reports citing 32 sources: hiring data from applicant tracking systems, field experiments with matched CVs sent to real Dutch and European vacancies, and controlled studies on internships, referrals and CV tailoring.</p>

      <h3 className="border-t-[1.5px] border-line pt-5 text-lg font-bold">How we will prove it</h3>
      <p className="pt-3">What the model does not have yet, and the work that answers it.</p>
      <div className="overflow-x-auto py-3">
        <table className="w-full min-w-[34rem] border-t-[1.5px] border-line text-left text-sm">
          <thead>
            <tr>
              <th className={`${cell} font-semibold`}>Open question</th>
              <th className={`${cell} font-semibold`}>How we will answer it</th>
              <th className={`${cell} font-semibold`}>Status</th>
            </tr>
          </thead>
          <tbody>
            {PROOF.map(([question, answer, status]) => (
              <tr key={question}>
                <td className={cell}>{question}</td>
                <td className={cell}>{answer}</td>
                <td className={`${cell} whitespace-nowrap`}>{status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t-[1.5px] border-line py-4">
        <SeeHow />
      </div>
    </div>
  )
}
