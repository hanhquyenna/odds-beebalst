import { useMemo, useState } from "react"
import { BookmarkIcon, BriefcaseIcon, BuildingsIcon, CalendarIcon, CurrencyEurIcon, GraduationCapIcon, MapPinIcon, ShieldCheckIcon, TrendUpIcon, ChevronRightIcon, PeopleIcon } from "@/components/icons"
import { CompanyLogo } from "@/components/CompanyMark"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { JobCompanyTab } from "@/components/web/JobCompanyTab"
import { JobPeopleTab, peopleCounts, schoolOf, type TabGroup } from "@/components/web/JobPeopleTab"
import { SourceLine } from "@/components/web/SourceCircle"
import { useJobModel } from "@/components/web/use-job-model"
import { JobDocuments } from "@/components/JobDocuments"
import { LockedPersonal, PayCard, CareerLadder } from "@/components/JobPersonal"
import { MoreAtEmployer } from "@/components/CompanyInsights"
import { OddsApply } from "@/components/OddsApply"
import { PastHires } from "@/components/JobCompany"
import { PostingText } from "@/components/PostingText"
import { useData } from "@/lib/data"
import { displayedChance, levelOf, type Standing } from "@/lib/engine"
import { fieldOf } from "@/lib/filters"
import { formatAge, placeOf, stripMarkup } from "@/lib/format"
import { workplaceOf } from "@/lib/job-facts"
import { parsePosting } from "@/lib/job-sections"
import { industryOf } from "@/lib/industries"
import { openLinkedInImport } from "@/lib/open-profile"
import { readPast, PEOPLE_DATA_VERSION } from "@/lib/suggest"
import { removeFromList, toggleSave } from "@/lib/save"
import { payOf } from "@/lib/spec"
import { TIER_LABEL, type Requirement, type Tier } from "@/lib/requirements"
import type { Posting } from "@/lib/types"

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "company", label: "Company" },
  { value: "people", label: "People" },
  { value: "documents", label: "Documents" },
] as const
type Tab = (typeof TABS)[number]["value"]

const degreeText = (d: string | null): string => (d === "master" ? "Master’s degree" : d === "phd" ? "PhD" : d === "bachelor" ? "Bachelor’s degree" : d ?? "")

const card = "rounded-[18px] border-[1.5px] border-line bg-card"

/**
 * The job, drawn as the owner designed it: a tab bar (Overview, Company, People, Documents) with the save, original posting and Auto apply buttons,
 * and under it the page for the tab. It works for any posting; the list on the left of the Jobs page opens one here.
 */
export function JobPage({ post, onOpenJob }: { post: Posting; onOpenJob?: (post: Posting) => void }): React.JSX.Element {
  const data = useData()
  const model = useJobModel(post)
  const [tab, setTab] = useState<Tab>("overview")
  const [asking, setAsking] = useState<boolean>(false)
  const saved = data.saved.has(post.id)

  return (
    <article aria-label={`${post.title} at ${post.employer_display}`} className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-[1.5px] border-line px-5">
        <div id="job-tabs" role="tablist" aria-label="Job" className="flex gap-6 overflow-x-auto">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`-mb-[1.5px] shrink-0 cursor-pointer border-b-[3px] px-0.5 py-4 text-[0.95rem] transition-colors ${tab === value ? "border-foreground font-extrabold text-foreground" : "border-transparent font-bold text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 py-2.5">
          <button
            type="button"
            aria-label={saved ? "Remove from your saved jobs" : "Save this job"}
            aria-pressed={saved}
            onClick={() => (saved ? setAsking(true) : toggleSave(data, post))}
            className={`grid size-[42px] cursor-pointer place-items-center rounded-full border-[1.5px] transition-colors ${saved ? "border-brand bg-brand text-foreground" : "border-foreground bg-card text-foreground hover:bg-secondary"}`}
          >
            <BookmarkIcon weight={saved ? "fill" : "bold"} className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>
      {asking ? <ConfirmDialog title="Remove this job from your list?" body={`${post.title} goes back to the jobs that fit you.`} confirm="Remove" onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); removeFromList(data, post) }} /> : null}

      <div className="px-5 pt-5 pb-6 sm:px-6">
        {tab === "overview" ? <Overview post={post} model={model} onTab={setTab} onOpenJob={onOpenJob} /> : null}
        {tab === "company" ? <JobCompanyTab post={post} /> : null}
        {tab === "people" ? <JobPeopleTab post={post} /> : null}
        {tab === "documents" ? <JobDocuments post={post} /> : null}
      </div>
    </article>
  )
}

// ---------------------------------------------------------------- overview

function Overview({ post, model, onTab, onOpenJob }: { post: Posting; model: ReturnType<typeof useJobModel>; onTab: (tab: Tab) => void; onOpenJob?: (post: Posting) => void }): React.JSX.Element {
  const { job, body, requirements, st } = model
  const data = useData()
  const [full, setFull] = useState<boolean>(false)
  const industry = industryOf(post)
  const level = levelOf(post)
  const posted = post.local ? null : formatAge(post)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3.5">
        <div className="flex items-center gap-3.5">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-card p-2 shadow-[0_0_0_1.5px_var(--line)]">
            <CompanyLogo employer={post.employer} name={post.employer_display} size={40} wide={1.2} url={post.url} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-lg font-extrabold">{post.employer_display}</span>
            {industry ? <span className="truncate text-sm text-muted-foreground">{industry}</span> : null}
          </div>
          <div className="w-full max-w-[22rem] shrink-0 sm:w-[20rem] [&_[data-odds-apply=primary]]:h-14 [&_[data-odds-apply=primary]]:rounded-xl [&_[data-odds-apply=primary]]:text-lg [&_[data-odds-apply=primary]]:font-extrabold">
            <OddsApply post={post} />
          </div>
        </div>
        <h1 className="text-[2rem] leading-[1.1] font-extrabold tracking-[-0.035em] text-balance sm:text-[2.35rem]">{post.title}</h1>
        <div className="flex flex-wrap gap-2">
          {level !== "Not stated" ? <span className="rounded-full bg-accent px-3 py-1 text-[0.8125rem] font-extrabold text-[#8A3F10]">{level}</span> : null}
          {posted && posted !== "Date not shown" ? <span className="rounded-full bg-secondary px-3 py-1 text-[0.8125rem] font-extrabold">{posted}</span> : null}
          {post.dutch_required ? <span className="rounded-full bg-[#FBE9E6] px-3 py-1 text-[0.8125rem] font-extrabold text-[#9B2C1F]">Dutch needed</span> : <span className="rounded-full bg-good px-3 py-1 text-[0.8125rem] font-extrabold text-good-foreground">English is enough</span>}
          {post.closed_at ? <span className="rounded-full bg-[#FBE9E6] px-3 py-1 text-[0.8125rem] font-extrabold text-[#9B2C1F]">Closed</span> : null}
        </div>
        <Facts post={post} requirements={requirements} signals={data.signals[post.id]} />
      </header>

      <hr className="border-line/70" />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-label="About the job" className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-extrabold tracking-tight">About the job</h2>
              {body ? (
                <div role="group" aria-label="How to read the posting" className="inline-flex rounded-full bg-secondary p-1">
                  {([["Summary", false], ["Full posting", true]] as const).map(([label, value]) => (
                    <button key={label} type="button" aria-pressed={full === value} onClick={() => setFull(value)} className={`h-8 cursor-pointer rounded-full px-4 text-[0.8125rem] font-extrabold ${full === value ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {body === null ? <p className="text-sm text-muted-foreground">Loading the posting…</p> : body === "" ? <p className="text-sm text-muted-foreground">We do not have the text of this posting.</p> : full ? <PostingText body={body} /> : <Summary body={body} requirements={requirements} />}
          </section>

          <div className="[&_section]:border-t-0 [&_section]:pt-0 [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:tracking-tight">
            <PastHires post={post} />
          </div>

          {st ? (
            <div className="[&_section]:border-t-0 [&_section]:pt-0 [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:tracking-tight">
              <PayCard post={post} st={st} />
              <CareerLadder post={post} st={st} />
            </div>
          ) : null}

          <div className="[&_section]:border-t-0 [&_section]:pt-0 [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:tracking-tight">
            <MoreAtEmployer post={post} onOpenJob={onOpenJob} />
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[5.25rem]">
          {st ? <ChanceCard post={job} st={st} onTab={onTab} /> : <LockedPersonal onUnlock={() => undefined} />}
          <PeopleCard post={post} onTab={onTab} />
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the facts

interface Fact {
  icon: React.ReactNode
  main: string
  note?: string
}

/** What the posting says about the job, one tile each. A fact the posting does not give is left out, never guessed. */
function Facts({ post, requirements, signals }: { post: Posting; requirements: Requirement[]; signals: Parameters<typeof workplaceOf>[1] }): React.JSX.Element {
  const data = useData()
  const pay = payOf(post, data.reference)
  const field = fieldOf(post)
  const years = post.years_min ?? requirements.map((r) => r.years).filter((y): y is number => y !== null).sort((a, b) => b - a)[0] ?? null
  const degree = post.degree_asked ?? requirements.find((r) => r.degree)?.degree ?? null
  const close = /^(\d{4})-(\d{2})-(\d{2})/.exec(post.valid_through ?? "")
  const ic = "size-[18px]"
  const level = levelOf(post)
  const facts: Array<Fact | null> = [
    pay.text
      ? {
          icon: <CurrencyEurIcon className={ic} aria-hidden="true" />,
          main: `${pay.text} ${pay.perHour ? "an hour" : "a month"}`,
          note: pay.basis === "Stated" ? "Stated by the employer, before tax" : pay.basis === "Allowance" ? "Typical for this kind of job, before tax" : pay.source === "Typical traineeship pay" ? "Typical traineeship pay, before tax" : "Typical for this kind of job, before tax",
        }
      : null,
    post.region ? { icon: <MapPinIcon className={ic} aria-hidden="true" />, main: placeOf(post.region) } : null,
    { icon: <BuildingsIcon className={ic} aria-hidden="true" />, main: workplaceOf(post, signals) },
    field ? { icon: <BriefcaseIcon className={ic} aria-hidden="true" />, main: field } : null,
    post.enrollment === "required" ? { icon: <GraduationCapIcon className={ic} aria-hidden="true" />, main: "You must be a student", note: "Enrolment is required" } : post.enrollment === "recent" ? { icon: <GraduationCapIcon className={ic} aria-hidden="true" />, main: "For students and recent graduates" } : post.enrollment === "open" ? { icon: <GraduationCapIcon className={ic} aria-hidden="true" />, main: "You do not need to be a student" } : null,
    { icon: <ShieldCheckIcon className={ic} aria-hidden="true" />, main: post.ind_sponsor ? "Can sponsor your visa" : "Does not sponsor visas", note: !post.ind_sponsor && level === "Internship" ? "Interns often come through their university" : undefined },
    years !== null || degree ? { icon: <TrendUpIcon className={ic} aria-hidden="true" />, main: years !== null ? `${years}+ years of experience` : degreeText(degree), note: years !== null && degree ? degreeText(degree) : undefined } : null,
    close ? { icon: <CalendarIcon className={ic} aria-hidden="true" />, main: `Apply by ${Number(close[3])} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(close[2]) - 1]} ${close[1]}` } : null,
  ]

  return (
    <dl className="grid gap-x-6 gap-y-4 pt-1 sm:grid-cols-2 xl:grid-cols-3">
      {facts.filter((f): f is Fact => f !== null).map((f) => (
        <div key={f.main} className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-[#B4561A]">{f.icon}</span>
          <div className="flex min-w-0 flex-col">
            <dd className="text-[0.95rem] leading-snug font-extrabold">{f.main}</dd>
            {f.note ? <dt className="text-[0.8125rem] leading-snug text-muted-foreground">{f.note}</dt> : null}
          </div>
        </div>
      ))}
    </dl>
  )
}

// ---------------------------------------------------------------- about the job

const DUTIES = /(responsibilit|what you.?ll do|what you will do|your role|the role|your tasks|tasks|wat ga je doen|dit ga je doen|what will you do|day to day|in this role|your impact)/i

/** The posting in short: what you will do (the posting's own section), what you bring (what it insists on), and what is nice to have. Every line is the employer's. */
function Summary({ body, requirements }: { body: string; requirements: Requirement[] }): React.JSX.Element {
  const parsed = useMemo(() => parsePosting(stripMarkup(body)), [body])
  const duties = parsed.sections.find((s) => (s.key === "duties" || DUTIES.test(s.title)) && s.blocks.length > 0)
  const lines = (blocks: NonNullable<typeof duties>["blocks"]): string[] => blocks.flatMap((b) => (b.kind === "ul" ? b.items : [b.text])).filter(Boolean)
  const asked = (tiers: Tier[]): string[] => requirements.filter((r) => tiers.includes(r.tier)).map((r) => r.text)
  const must = asked(["must", "strong"])
  const nice = asked(["optional", "nice"])
  const groups: Array<{ title: string; badge?: string; items: string[] }> = [
    ...(duties ? [{ title: duties.title && !/^(about|the role)$/i.test(duties.title) ? duties.title : "What you will do", items: lines(duties.blocks).slice(0, 6) }] : []),
    ...(must.length > 0 ? [{ title: "What you bring", badge: TIER_LABEL.must, items: must.slice(0, 6) }] : []),
    ...(nice.length > 0 ? [{ title: "Nice to have", badge: "Nice", items: nice.slice(0, 5) }] : []),
  ]
  if (groups.length === 0) {
    const first = parsed.sections.find((s) => s.blocks.length > 0)

    return first ? <div className="flex flex-col gap-2 text-[0.95rem] leading-relaxed">{lines(first.blocks).slice(0, 5).map((l, i) => <p key={i}>{l}</p>)}<p className="text-sm text-muted-foreground">Open Full posting to read it all.</p></div> : <p className="text-sm text-muted-foreground">Open Full posting to read it.</p>
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-base font-extrabold">
            {g.title}
            {g.badge ? <span className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-extrabold ${g.badge === "Nice" ? "bg-secondary text-muted-foreground" : "bg-accent text-[#8A3F10]"}`}>{g.badge}</span> : null}
          </h3>
          <ul className="flex flex-col gap-2">
            {g.items.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[0.95rem] leading-snug">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- the chance, the keywords, the people

/** The interview chance as a ring: the same figure as the side panel and the page badge. */
function Ring({ rate }: { rate: number }): React.JSX.Element {
  const r = 42
  const c = 2 * Math.PI * r
  const shown = displayedChance(rate)

  return (
    <div className="relative grid size-[88px] shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#F0E9DF" strokeWidth="12" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#EE7A2A" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${Math.max(0.02, Math.min(1, shown.pct / 100)) * c} ${c}`} />
      </svg>
      <span className="relative flex flex-col items-center leading-none">
        <span className="text-[1.6rem] font-extrabold tracking-tight tabular-nums">{shown.label.replace("%", "")}</span>
        <span className="mt-0.5 text-[0.65rem] font-bold text-muted-foreground">in 100</span>
      </span>
    </div>
  )
}

function ChanceCard({ post, st, onTab }: { post: Posting; st: Standing; onTab: (tab: Tab) => void }): React.JSX.Element {
  const known = !st.needsProfile
  const mid = st.rate?.mid ?? null
  const have = known ? st.checklist.filter((c) => c.have) : []
  const missing = known ? st.checklist.filter((c) => !c.have) : []
  // What the posting insists on and the CV lacks first; a posting that does not rank its words lists every missing one.
  const insists = missing.filter((c) => (post.tiers?.[c.skill] ?? "must") === "must" || post.tiers?.[c.skill] === "strong")
  const lacking = (insists.length > 0 ? insists : missing).slice(0, 8)

  return (
    <section aria-label="Interview chance" className={`${card} flex flex-col gap-4 p-5`}>
      <div className="flex items-center gap-4">
        {mid !== null && known ? (
          <Ring rate={mid} />
        ) : (
          <button type="button" onClick={known ? undefined : openLinkedInImport} title={known ? undefined : "Import your LinkedIn or upload your CV to see your chance"} className="grid size-[88px] shrink-0 cursor-pointer place-items-center rounded-full border-[12px] border-[#F0E9DF] text-2xl font-extrabold">
            ?
          </button>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-lg font-extrabold">Interview chance</h2>
          <p className="text-[0.8125rem] leading-snug text-muted-foreground">
            {mid !== null && known ? displayedChance(mid).perHundred : known ? "Too few similar jobs to give a number we would stand behind" : "Add your CV to see it"}
          </p>
        </div>
      </div>

      {have.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[0.7rem] font-extrabold tracking-[0.08em] text-good-foreground uppercase">Already in your CV</h3>
          <ul className="flex flex-wrap gap-1.5">
            {have.slice(0, 12).map((c) => (
              <li key={c.skill} className="inline-flex h-7 items-center gap-1 rounded-full bg-[#1F7A4D] px-3 text-xs font-extrabold text-white">
                <span aria-hidden="true">✓</span> {c.skill}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {lacking.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl bg-accent p-3.5">
          <h3 className="text-[0.7rem] font-extrabold tracking-[0.08em] text-[#8A3F10] uppercase">The posting insists on</h3>
          <ul className="flex flex-wrap gap-1.5">
            {lacking.map((c) => (
              <li key={c.skill} className="inline-flex h-7 items-center rounded-full border-[1.5px] border-dashed border-brand bg-card px-3 text-xs font-extrabold text-[#8A3F10]">
                + {c.skill}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={() => onTab("documents")} className="h-11 w-full cursor-pointer rounded-xl bg-brand text-sm font-extrabold hover:bg-[#E56E1E]">
          Tailor my CV with AI
        </button>
        <button type="button" onClick={() => onTab("documents")} className="h-11 w-full cursor-pointer rounded-xl border-[1.5px] border-brand bg-card text-sm font-extrabold hover:bg-accent">
          Tailor my cover letter with AI
        </button>
      </div>
    </section>
  )
}

const ROWS: Array<{ key: TabGroup; title: string }> = [
  { key: "manager", title: "Department leads" },
  { key: "team", title: "Same team" },
  { key: "alumni", title: "Alumni from your university" },
]

function PeopleCard({ post, onTab }: { post: Posting; onTab: (tab: Tab) => void }): React.JSX.Element {
  const data = useData()
  const school = schoolOf(data.profile.education)
  const past = readPast(data.profile.peopleFound?.[post.id])
  const rec = past?.open && past.peopleVersion === PEOPLE_DATA_VERSION ? past : null
  const counts = peopleCounts(rec, post.family ?? null, school)
  const icons: Record<string, React.ReactNode> = { manager: <BriefcaseIcon className="size-[18px]" aria-hidden="true" />, team: <PeopleIcon className="size-[18px]" aria-hidden="true" />, alumni: <GraduationCapIcon className="size-[18px]" aria-hidden="true" /> }

  return (
    <section aria-label={`People at ${post.employer_display}`} className={`${card} flex flex-col gap-3 p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">People at {post.employer_display}</h2>
        <SourceLine names={["LinkedIn"]} />
      </div>
      <ul className="flex flex-col gap-2.5">
        {ROWS.filter((r) => r.key !== "alumni" || school !== null).map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => onTab("people")} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-line px-3.5 py-3 text-left hover:border-foreground/40">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent text-[#B4561A]">{icons[r.key]}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[0.9rem] leading-tight font-extrabold">{r.title}</span>
                <span className="text-[0.8125rem] text-muted-foreground">{counts ? `${counts[r.key]} found` : "Look them up"}</span>
              </span>
              <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

