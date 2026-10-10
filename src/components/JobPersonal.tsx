import { skillLabel } from "@/lib/skills"
import { CircleHelpIcon, InfoIcon } from "@/components/icons"
import { Suspense, lazy, useMemo, useState } from "react"
import { useOriginalChance } from "@/components/FitCells"
import { Moved } from "@/components/Moved"
import { Button } from "@/components/ui/button"
import { Pill } from "@/components/bits"
import { Hint } from "@/components/Hint"
import { Caret, ChancePanel } from "@/components/OddsExplain"
import { Section } from "@/components/Section"
import { TIERS, TIER_LABEL, type Requirement, type Tier } from "@/lib/requirements"
import { standardise, standardNames, standardTiers } from "@/lib/standard"
import { useData } from "@/lib/data"
import { useJobProfile } from "@/lib/use-documents"
import { ladderStats, poolOf, rungOf } from "@/lib/ladder"
import { derive, eur, isInternship, levelOf, type Level, payChoicesOf, netMonth, pct, point, standing, thresholdLines, type Standing, type WhatIf, NO_WHAT_IF } from "@/lib/engine"
import { EXAMPLE_PROFILE } from "@/lib/example"
import { DUTCH_OPTIONS } from "@/lib/journey"
import { IMPORT_HINT, openLinkedInImport } from "@/lib/open-profile"
import { saved } from "@/lib/saved"
import { allowanceNote, allowanceOf, payMid, payOf, TRAINEE_NOTE, type AllowanceSource } from "@/lib/spec"
import { useApplyFilter } from "@/lib/filter-bus"
import { industryOf } from "@/lib/industries"
import type { PayChoices, PermitRoute, Posting, Transition } from "@/lib/types"

// Lazy: the add-someone form opens on a click and lives with the people view, which the job drawer should not wait on.
const AddPerson = lazy(() => import("@/components/People").then((module) => ({ default: module.AddPerson })))

/** The same four, as they read inside a sentence. */
const MISSING_WORDS: Record<string, string> = { Permit: "a high enough salary", Degree: "the degree", "Minimum years": "enough experience", Dutch: "Dutch", Language: "the language", Student: "student status" }

/** A small "?" that opens the working behind a figure, so the page can say less and lose nothing. */
function Info({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)

  return (
    <div className="mt-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <CircleHelpIcon className="size-4" aria-hidden="true" /> {label}
      </button>
      {open ? <div className="mt-2 rounded-xl bg-secondary/70 p-4 text-sm leading-relaxed">{children}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------- the two numbers at the top

/** What you keep each month after tax at this job's pay, with and without health insurance. Null when there is no pay to work from. */
function keepOf(post: Posting, data: ReturnType<typeof useData>, original = false): { net: number; afterInsurance: number; basis: "Stated" | "Typical" } | null {
  const ref = data.reference
  const mid = ref ? payMid(post, ref) : null
  if (!ref || !mid) {
    return null
  }
  // `original` is the same job with the pay settings as they start (before you changed the 30% ruling, the master's rule or the visa).
  const c = payChoicesOf(original ? { ...data.profile, payChoices: undefined } : data.profile)
  const net = netMonth(mid.month * 12, c.ruling, c.masterFloor, ref.tax).net

  return { net, afterInsurance: net - ref.tax.health_insurance_2026.average_premium_month, basis: mid.basis }
}

/**
 * The two numbers this product exists to give: your chance of an interview and
 * what you would keep each month. They lead every job, and they move when you
 * tick a recommendation below.
 */
export function UspStrip({ post, st }: { post: Posting; st: Standing }): React.JSX.Element {
  const data = useData()
  const [open, setOpen] = useState<boolean>(false)
  const keep = keepOf(post, data)
  const keepWas = keepOf(post, data, true)?.net ?? null
  const original = useOriginalChance(post)
  const r = st.rate
  const chance = r && !r.thin ? point(r.mid) : st.needsProfile ? "0%" : null
  // The number against what it was before anything you did (a referral, a ticked recommendation): green and up, or red and down, with the original in the hover.
  const gain = r && !r.thin && original !== null ? (r.mid - original) * 100 : 0
  const missing = st.gates.filter((g) => g.status === "fail").map((g) => MISSING_WORDS[g.name])
  const studentGate = st.gates.find((g) => g.name === "Student")

  return (
    <div className="flex flex-col gap-2">
      <section aria-label="Your numbers" className="grid overflow-hidden rounded-xl border-[1.5px] sm:grid-cols-2">
        <div className="flex flex-col gap-1 p-4 sm:p-5">
          <p className="text-[0.8125rem] text-muted-foreground">Interview chance</p>
          {chance !== null ? (
            <>
              {st.needsProfile ? (
                <button type="button" title={IMPORT_HINT} aria-label={`0%. ${IMPORT_HINT}`} onClick={openLinkedInImport} className="group flex w-fit cursor-pointer items-center gap-2 text-left">
                  <span className="text-3xl leading-none font-semibold tracking-tight tabular-nums underline decoration-dotted decoration-1 underline-offset-[6px] group-hover:decoration-solid">{chance}</span>
                </button>
              ) : (
                <button type="button" aria-expanded={open} aria-controls="chance-explained" onClick={() => setOpen(!open)} className="group flex w-fit cursor-pointer items-center gap-2 text-left">
                  <Moved delta={gain} min={0.05} wasText={original === null ? "" : point(original)}>
                    <span className="text-3xl leading-none font-semibold tracking-tight tabular-nums underline decoration-dotted decoration-1 underline-offset-[6px] group-hover:decoration-solid">{chance}</span>
                  </Moved>
                  <Caret open={open} />
                </button>
              )}
              {st.needsProfile ? <p className="text-sm text-muted-foreground">Import LinkedIn to see yours</p> : null}
              {st.failing > 0 ? (
                <p className="text-sm text-muted-foreground">
                  This job also asks for {missing.join(" and ")}.{studentGate?.status === "fail" ? ` ${studentGate.why.replace(/^the posting /, "It ")}.` : ""} Tick a recommendation below to count it.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Too few similar jobs to give a range we would stand behind.</p>
          )}
        </div>
        <div className="flex flex-col gap-1 border-t-[1.5px] p-4 sm:border-t-0 sm:border-l-[1.5px] sm:p-5">
          <p className="text-[0.8125rem] text-muted-foreground">You keep</p>
          {keep ? (
            <>
              <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
                <Moved delta={keepWas === null ? 0 : keep.net - keepWas} min={10} wasText={keepWas === null ? "" : eur(keepWas)}>
                  {eur(keep.net)}
                </Moved>
              </p>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                a month after tax
                <Hint label="About what you keep">
                  At the {keep.basis === "Stated" ? "pay the employer states" : "typical pay for this kind of job"}, with 2026 tax and credits{" "}
                  and the 30% ruling if you qualify. {eur(keep.afterInsurance)} after an average health insurance premium. Pension is not included.
                </Hint>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{isInternship(post) ? "An internship allowance is not a salary, so there is no tax figure." : "There is no pay figure for this job to work from."}</p>
          )}
        </div>
      </section>
      {open ? (
        <div id="chance-explained">
          <ChancePanel post={post} st={st} />
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- what to put on your CV

interface FitProps {
  post: Posting
  st: Standing
  /** The lines of the posting that say what it asks for, each with how much it insists. Empty when the posting has no such part. */
  requirements: Requirement[]
}

/** What each tier means, in the posting's own terms. */
/** The more a posting insists, the more orange: a rail on the card, a tint on the chips. */
const TIER_CHIP: Record<Tier, string> = {
  must: "border-[1.5px] border-brand/60 bg-brand/15 text-foreground",
  strong: "border-[1.5px] border-brand/35 bg-brand/[0.07] text-foreground",
  optional: "border-[1.5px] border-transparent bg-secondary text-foreground",
  nice: "border-[1.5px] border-dashed bg-transparent text-muted-foreground",
}
const TIER_RAIL: Record<Tier, string> = { must: "border-l-brand", strong: "border-l-brand/50", optional: "border-l-muted-foreground/30", nice: "border-l-border" }

const TIER_NOTE: Record<Tier, string> = {
  must: "the posting insists on these",
  strong: "it says these clearly help",
  optional: "preferred, a small help",
  nice: "mentioned, barely counts",
}

type Kind = "skills" | "experience" | "education" | "language" | "qualities" | "conditions"
const KIND_LABEL: Record<Kind, string> = { skills: "Skills and tools", experience: "Experience", education: "Education", language: "Language", qualities: "Qualities", conditions: "Conditions" }
const KINDS: Kind[] = ["skills", "experience", "education", "language", "qualities", "conditions"]

/**
 * What to put on your CV for this job. Not a score, and nothing judged from your profile: only what the posting
 * asks for, sorted by how much it insists (Jev's reading of the posting) and shown the same way on every job, in a
 * fixed vocabulary (see standard.ts). If you have a thing, say so on your CV in these words.
 */
export function FitCard({ post, requirements }: FitProps): React.JSX.Element {
  const tiers = standardTiers(requirements, TIERS).map(({ tier, std }) => ({ tier, std, rows: KINDS.filter((k) => std[k].length > 0) }))
  const unread = standardise(requirements).unread
  // A posting with no requirements part still names things: those are listed without a tier.
  const mentioned = requirements.length === 0 ? standardNames(post.skills ?? []) : []

  return (
    <Section title="What to put on your CV">
      <div className="flex flex-col gap-7">
        <p className="text-sm text-muted-foreground">
          What this job asks for, most important first, in the same words for every job. Whatever of it is true for you, put on your CV in these words, near the top.
        </p>

        {tiers.map(({ tier, std, rows }) => (
          <div key={tier} className={`rounded-xl border-[1.5px] border-l-4 bg-card p-4 ${TIER_RAIL[tier]}`}>
            <p className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-base font-semibold">{TIER_LABEL[tier]}</span>
              <span className="text-xs text-muted-foreground">{TIER_NOTE[tier]}</span>
            </p>
            <dl className="flex flex-col gap-3">
              {rows.map((kind) => (
                <div key={kind} className="grid gap-1.5 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
                  <dt className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{KIND_LABEL[kind]}</dt>
                  <dd>
                    <ul className="flex flex-wrap gap-1.5">
                      {std[kind].map((t) => (
                        <li key={t} className={`rounded-md px-3 py-1 text-sm ${TIER_CHIP[tier]}`}>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}

        {unread > 0 ? <p className="text-sm text-muted-foreground">{unread === 1 ? "One more line" : `${unread} more lines`} in the posting say something beyond this list. They are in the description below.</p> : null}

        {mentioned.length > 0 ? (
          <div className="flex flex-col">
            <p className="mb-2 text-sm font-medium">What it mentions</p>
            <ul className="flex flex-wrap gap-2 border-y-[1.5px] py-3">
              {mentioned.map((t) => (
                <li key={t} className="rounded-md bg-secondary px-2.5 py-1 text-sm font-medium">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tiers.length === 0 && mentioned.length === 0 ? <p className="text-sm text-muted-foreground">This posting does not list what it asks for. Read the description below, and use its words.</p> : null}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------- recommendations

interface Rec {
  key: string
  title: string
  reason: string
  source: string
  /** A few words on what ticking it does, shown beside the title. */
  badge: string
  /** True when it settles a requirement but the number does not move until the others are met. */
  gap?: boolean
  /** True when ticking it changes the percentage, false when it closes a gap only. */
  moves: boolean
  on: boolean
  /** True when a person on the People table already settles it, so the box cannot be unticked here. */
  fixed?: boolean
  /** Shown under the line, outside the tick box, for a control that belongs to it. */
  extra?: React.ReactNode
  toggle: () => void
}

/**
 * What you could do about this job: a tick box, what it is worth in a few words,
 * and a "?" for the reason and where the figure comes from. Tick one and the
 * numbers at the top move. Ticking "someone at the company" is a fact about you and stays.
 */
export function Recommendations({ post, base, whatIf, setWhatIf }: { post: Posting; base: Standing; whatIf: WhatIf; setWhatIf: (w: WhatIf) => void }): React.JSX.Element | null {
  const data = useData()
  const ref = data.reference!
  const shares = data.shares!
  const referral = data.referrals.has(post.id)
  const jobProfile = useJobProfile(post.id)
  const d = derive(jobProfile)
  const active = whatIf.dutch || whatIf.degree || whatIf.student || whatIf.years > 0 || whatIf.skills.length > 0 || whatIf.tailor !== null
  const failed = (name: string): boolean => base.gates.find((g) => g.name === name)?.status === "fail"
  const [open, setOpen] = useState<string | null>(null)

  /**
   * What one change does to your interview chance, in the plainest words: "+1.3%" (percentage points more), "Needed" when it settles a requirement that must be met but the
   * number only moves once the others are met too, and "No effect" when it does nothing. `gap` carries the "Needed" case so the reason can say why.
   */
  function worthOf(change: Partial<WhatIf>, asReferral = false): { badge: string; gap: boolean } {
    const alt = standing(post, jobProfile, ref, shares, { ...NO_WHAT_IF, ...change }, asReferral || referral, data.strengthFor(post))
    if (base.rate && alt.rate && !base.rate.thin && !alt.rate.thin) {
      const gain = (alt.rate.mid - base.rate.mid) * 100
      if (Math.abs(gain) >= 0.05) {
        return { badge: `${gain > 0 ? "↑" : "↓"} ${Math.abs(gain).toFixed(1)}%`, gap: false }
      }
    }
    if (alt.failing < base.failing) {
      return { badge: "Needed", gap: true }
    }

    return { badge: "No effect", gap: false }
  }


  const recs: Rec[] = []
  if (failed("Dutch")) {
    recs.push({ key: "dutch", title: "Learn Dutch", reason: `This job requires Dutch and yours is ${DUTCH_OPTIONS.find((o) => o.value === data.profile.dutch)?.label.replace(/ \(.*/, "").toLowerCase()}. Professional level meets it.`, source: "Posting and your profile", ...worthOf({ dutch: true }), moves: true, on: whatIf.dutch, toggle: () => setWhatIf({ ...whatIf, dutch: !whatIf.dutch }) })
  }
  if (failed("Degree")) {
    recs.push({ key: "degree", title: post.degree_asked === "bachelor" ? "Finish a bachelor's" : post.degree_asked === "phd" ? "Get a PhD" : "Finish a master's", reason: `The posting asks for a ${post.degree_asked}'s degree and yours is ${d.degree === "unknown" ? "not on your profile" : d.degree}.`, source: "Posting and your profile", ...worthOf({ degree: true }), moves: true, on: whatIf.degree, toggle: () => setWhatIf({ ...whatIf, degree: !whatIf.degree }) })
  }
  if (failed("Minimum years")) {
    const need = Math.max(1, Math.ceil((post.years_min ?? 1) - d.years))
    recs.push({ key: "years", title: need === 1 ? "Add a year of experience" : `Add ${need} years of experience`, reason: `It asks for ${post.years_min}+ years and you have ${d.years.toFixed(1)}.`, source: "Posting and your profile", ...worthOf({ years: need }), moves: true, on: whatIf.years > 0, toggle: () => setWhatIf({ ...whatIf, years: whatIf.years > 0 ? 0 : need }) })
  }
  if (failed("Student")) {
    recs.push({ key: "student", title: "I am a student", reason: "The posting asks for a current student and your profile says you are not studying (or has no current study). If you are enrolled now, tick this to see the job as it counts for you, then say so in your profile so every job knows.", source: "Posting and your profile", ...worthOf({ student: true }), moves: true, on: whatIf.student, toggle: () => setWhatIf({ ...whatIf, student: !whatIf.student }) })
  }
  const person = data.people.find((p) => p.jobId === post.id && p.status === "Referred")
  recs.push({
    key: "referral",
    title: "Get a referral",
    reason: person ? `${person.name} has referred you for this job. People who are referred get an interview about one and a half times as often.` : "People who are referred get an interview about one and a half times as often.",
    source: "Ashby 2026, all countries",
    ...(person || referral ? { badge: "Done", gap: false } : worthOf({}, true)),
    moves: true,
    on: referral,
    fixed: Boolean(person),
    extra: <ReferralLink post={post} />,
    toggle: () => {
      data.toggleReferral(post.id)
      saved()
    },
  })
  {
    recs.push({ key: "tailor", title: "Tailor your CV", reason: "Tailored applications did better in a US test. It is the weakest evidence we use, so it only raises the top of the range.", source: "ResumeGo 2020", ...worthOf({ tailor: true }), moves: true, on: whatIf.tailor === true, toggle: () => setWhatIf({ ...whatIf, tailor: whatIf.tailor === true ? null : true }) })
  }
  const tierRank = (skill: string): number => { const t = post.tiers?.[skill]; const i = t ? TIERS.indexOf(t) : -1; return i < 0 ? TIERS.length : i }
  for (const m of base.checklist.filter((c) => !c.have).sort((a, b) => tierRank(a.skill) - tierRank(b.skill) || (b.share ?? 0) - (a.share ?? 0)).slice(0, 3)) {
    const on = whatIf.skills.includes(m.skill)
    recs.push({
      key: `skill-${m.skill}`,
      title: `Learn ${skillLabel(m.skill)}`,
      reason: `${m.share != null ? `Mentioned in ${pct(m.share)} of similar postings. ` : ""}Having more of the skills a posting lists raises the estimate. The size is scaled from one US study and partly our assumption, so treat it as a guide.`,
      source: "Posting",
      ...worthOf({ skills: [m.skill] }),
      moves: true,
      on,
      toggle: () => setWhatIf({ ...whatIf, skills: on ? whatIf.skills.filter((s) => s !== m.skill) : [...whatIf.skills, m.skill] }),
    })
  }

  return (
    <Section
      title="Recommendations"
      aside={
        active ? (
          <button type="button" onClick={() => setWhatIf(NO_WHAT_IF)} className="cursor-pointer text-sm font-medium text-primary underline">
            Untick all
          </button>
        ) : (
          <Hint label="How recommendations work" align="right">
            Tick what you could do. The numbers at the top move, and each line has a reason and its source behind the question mark.
          </Hint>
        )
      }
    >
      <ul className="divide-y-[1.5px] border-y-[1.5px]">
        {recs.map((r) => (
          <li key={r.key}>
            <div className="flex items-center gap-3 py-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={r.on} disabled={r.fixed} onChange={r.toggle} className="size-4 shrink-0" />
                <span className="min-w-0 font-medium">{r.title}</span>
              </label>
              <span className={`shrink-0 rounded-md px-2 py-0.5 text-[0.8125rem] font-medium tabular-nums ${r.on && r.moves ? "bg-good text-good-foreground" : "bg-secondary text-secondary-foreground"}`}>{r.badge}</span>
              <button
                type="button"
                aria-label={`Why: ${r.title}`}
                aria-expanded={open === r.key}
                onClick={() => setOpen(open === r.key ? null : r.key)}
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
              >
                <CircleHelpIcon className="size-4" aria-hidden="true" />
              </button>
            </div>
            {open === r.key ? (
              <p className="-mt-1 pb-3 pl-7 text-sm text-muted-foreground">
                {r.reason}{r.gap ? " It must be met, but your chance only moves once the other missing requirements are met too." : ""} <span className="whitespace-nowrap">Source: {r.source}.</span>
              </p>
            ) : null}
            {r.extra}
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------- the locked version

/**
 * The same three blocks, blurred, for someone who has not signed in: the page
 * looks the same for everyone and the part that is about you is one step away.
 * The figures behind the blur are placeholders, not anyone's numbers.
 */
export function LockedPersonal({ onUnlock }: { onUnlock: () => void }): React.JSX.Element {
  const data = useData()
  const bar = (w: string): React.JSX.Element => <span className={`block h-3 rounded bg-foreground/15 ${w}`} />

  return (
    <div className="relative">
      <section className="mb-6 grid overflow-hidden rounded-xl border-[1.5px] sm:grid-cols-2">
        <div className="flex flex-col gap-1 p-5">
          <p className="text-[0.8125rem] text-muted-foreground">Interview chance</p>
          <button type="button" title={IMPORT_HINT} aria-label={`0%. ${IMPORT_HINT}`} onClick={onUnlock} className="w-fit cursor-pointer text-3xl font-semibold tabular-nums underline decoration-dotted decoration-1 underline-offset-[6px] hover:decoration-solid">
            0%
          </button>
          <p className="text-sm text-muted-foreground">Import LinkedIn to see yours</p>
        </div>
        <div className="flex flex-col gap-1 border-t-[1.5px] p-5 sm:border-t-0 sm:border-l-[1.5px]">
          <p className="text-[0.8125rem] text-muted-foreground">You keep</p>
          <p className="text-sm text-muted-foreground">Shown once your profile is in</p>
        </div>
      </section>
      <div aria-hidden="true" className="pointer-events-none flex flex-col gap-8 opacity-70 blur-[7px] select-none">
        <section className="border-t-[1.5px] pt-6">
          <h2 className="mb-4 text-lg font-semibold">Does it fit your CV?</h2>
          <div className="flex flex-col gap-4">
            {["w-64", "w-52", "w-72"].map((w) => (
              <div key={w} className="flex items-start gap-3">
                <span className="size-6 shrink-0 rounded-full bg-good" />
                <div className="flex flex-col gap-2">
                  {bar(w)}
                  {bar("w-40")}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="border-t-[1.5px] pt-6">
          <h2 className="mb-4 text-lg font-semibold">Recommendations</h2>
          <div className="flex flex-col gap-4">
            {["w-60", "w-72", "w-56"].map((w) => (
              <div key={w} className="flex items-start gap-3">
                <span className="mt-1 size-4 shrink-0 rounded border-[1.5px]" />
                <div className="flex flex-col gap-2">
                  {bar(w)}
                  {bar("w-64")}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="absolute inset-x-0 top-40 flex justify-center px-4">
        <div className="flex max-w-sm flex-col items-start gap-3 rounded-xl border-[1.5px] bg-card p-5 shadow-lg">
          <h2 className="text-lg font-semibold tracking-tight">Import LinkedIn to see your numbers</h2>
          <p className="text-sm text-muted-foreground">Your chance of an interview, what you keep after tax, how your CV fits, and what to do to improve it.</p>
          <Button onClick={onUnlock} className="cursor-pointer">
            Import LinkedIn
          </Button>
          <button type="button" onClick={() => {
              data.setProfile(EXAMPLE_PROFILE)
              window.dispatchEvent(new Event("careersim:show-jobs"))
            }} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Or look around with an example profile
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- pay

export function PayCard({ post, st }: { post: Posting; st: Standing }): React.JSX.Element | null {
  const data = useData()
  const ref = data.reference!
  const view = st.band

  const allowance = payOf(post, ref)
  if (!view || (isInternship(post) && !allowance.text)) {
    // No pay band for this kind of job: the section is still here, with the employer's own figure when there is one.
    return (
      <Section title="Pay and career path">
        {allowance.text ? (
          <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
            {allowance.text}
            <span className="text-base font-normal text-muted-foreground">{allowance.perHour ? "an hour" : "a month"}</span>
            {allowance.source ? <Hint label="About this pay">{allowance.basis === "Allowance" ? allowanceNote(allowance.source as AllowanceSource) : `${allowance.source}, before tax.`}</Hint> : null}
          </p>
        ) : null}
        <CareerPath />
      </Section>
    )
  }
  if (allowance.perHour) {
    return (
      <Section title="Pay and career path">
        <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
          {allowance.text}
          <span className="text-base font-normal text-muted-foreground">an hour</span>
          <Hint label="About this pay">Stated by the employer, before tax. A monthly figure depends on how many hours you work, so none is worked out.</Hint>
        </p>
        <CareerPath />
      </Section>
    )
  }
  if (allowance.source === "Typical traineeship pay") {
    return (
      <Section title="Pay and career path">
        <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
          {allowance.text}
          <span className="text-base font-normal text-muted-foreground">a month, typical for a traineeship</span>
          <Hint label="About this pay">{TRAINEE_NOTE}</Hint>
        </p>
        <CareerPath />
      </Section>
    )
  }
  if (allowance.basis === "Allowance") {
    // An internship pays an allowance, not a salary: the pay bands, tax and permit rows would all be for a job it is not.
    return (
      <Section title="Pay and career path">
        <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
          {allowance.text}
          <span className="text-base font-normal text-muted-foreground">a month</span>
          <Hint label="About this allowance">
            {allowanceNote(allowance.source as AllowanceSource)} Ask the employer what this one pays.
          </Hint>
        </p>
        <p className="mt-3">An allowance is not taxed like a salary, so your settings do not change it. They change the pay after tax at the levels below.</p>
        <CareerPath />
      </Section>
    )
  }

  if (allowance.basis === "Stated") {
    return (
      <Section title="Pay and career path">
        <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
          {allowance.text}
          <span className="text-base font-normal text-muted-foreground">{allowance.perHour ? "an hour" : "a month"}</span>
          <Hint label="About this pay">Stated by the employer in this posting, before tax.</Hint>
        </p>
        {post.glassdoor ? <p className="mt-2 text-sm text-muted-foreground">Glassdoor cross-check: {post.glassdoor.reports} employee salary reports, read {post.glassdoor.readOn}. This is a benchmark, not the employer’s offer.</p> : null}
        <CareerPath />
      </Section>
    )
  }

  const p25 = Math.round(view.grossMonth.p25 / 10) * 10
  const p50 = Math.round(view.grossMonth.p50 / 10) * 10
  const p75 = Math.round(view.grossMonth.p75 / 10) * 10

  return (
    <Section title="Pay and career path">
      <p className="flex flex-wrap items-center gap-x-2 text-2xl leading-tight font-semibold tracking-tight tabular-nums">
        {eur(p25)} – {eur(p75)}
        <span className="text-base font-normal text-muted-foreground">a month, estimated for this kind of job</span>
        <Hint label="About this pay">
          Before tax. An estimate for this kind of job across employers (Statistics Netherlands, 2024), not what this employer pays. The middle of the range is {eur(p50)}.
        </Hint>
      </p>

      <CareerPath />

      <Info label="Sources">
        <ul className="space-y-1.5">
          <li>
            <b>Pay</b> · Statistics Netherlands 2024, {view.band.label}, {view.band.employees_k}k employees, with holiday allowance
          </li>
          {view.ageAdjustedP50 ? (
            <li>
              <b>Your age</b> · {view.ageBand?.replace(" tot ", "–").replace(" jaar", "")}: middle {eur(view.ageAdjustedP50)}
            </li>
          ) : null}
          <li>
            <b>Tax</b> · Belastingdienst 2026, pension not included{derive(data.profile).rulingEligible ? "" : ", no 30% ruling for you"}
          </li>
          <li>
            <b>Permit</b> · IND 2026 thresholds
          </li>
          <li>
            <b>Sponsor</b> · {post.ind_sponsor ? `on the IND register as "${post.ind_sponsor_name}"` : "not on the IND register"}
          </li>
          {post.glassdoor ? <li><b>Glassdoor check</b> · {post.glassdoor.reports} employee salary reports, read {post.glassdoor.readOn}; benchmark only</li> : null}
        </ul>
        <ul className="mt-3 border-t-[1.5px]">
          {thresholdLines(view, data.profile, ref).map((t) => (
            <li key={t.label} className="flex items-center justify-between gap-3 border-b-[1.5px] py-1.5 last:border-b-0">
              <span>{t.yours ? <b>{t.label} (yours)</b> : t.label}</span>
              <Pill tone={t.clears ? "ok" : "bad"}>{t.clears ? "Clear" : "Short"} by {eur(Math.abs(t.gap))}</Pill>
            </li>
          ))}
        </ul>
      </Info>

    </Section>
  )
}

/**
 * The occupation the next-step data is filed under, only when the job's own title says it. The data covers five occupations
 * (Flemish careers, JobHop), so a job in a neighbouring pay group is not that occupation, and an internship or working-student job
 * is not a career spell at all: for those nothing is shown rather than another occupation's moves.
 */
const TRANSITION_TITLES: ReadonlyArray<[string, RegExp]> = [
  ["DATA ANALYST", /\bdata analyst/i],
  ["FINANCIAL ANALYST", /\b(financial|finance) analyst/i],
  ["BUSINESS ANALYST", /\bbusiness analyst/i],
  ["ACCOUNTANT", /\baccountant\b/i],
  ["SOFTWARE DEVELOPER", /\bsoftware (developer|engineer)/i],
]
function transitionKeyOf(post: Posting): string | undefined {
  if (isInternship(post)) return undefined
  const title = post.title_clean ?? post.title

  return TRANSITION_TITLES.find(([, re]) => re.test(title))?.[0]
}

interface LevelPay {
  /** Gross a month. */
  v: number
  /** True when no posting states it and the figure is the typical pay for this kind of work. */
  typical: boolean
  /** Set when the employer states an hourly rate: shown as written, with no monthly or tax figure. */
  hourly?: string
  /** Set for an internship allowance, which is not a salary. */
  allowance?: { text: string; source: AllowanceSource }
  /** The employer's own range, as written. */
  text?: string
}

/** One row of the "Count for me" list: what it is and what it does on the left, the switch on the right. `help` adds an (i) that opens an explanation under the row. */
function ToggleRow({ title, hint, on, set, help, helpLabel }: { title: string; hint: string; on: boolean; set: (v: boolean) => void; help?: React.ReactNode; helpLabel?: string }): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
            {title}
            {help ? (
              <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex cursor-pointer items-center gap-1 text-sm font-normal text-muted-foreground underline underline-offset-4 hover:text-foreground">
                <InfoIcon className="size-4" aria-hidden="true" />
                {helpLabel ?? "More"}
              </button>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label={title} onClick={() => set(!on)} className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}>
          <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-background shadow transition-transform ${on ? "translate-x-5" : ""}`} />
        </button>
      </div>
      {help && open ? <div className="mt-3 rounded-lg bg-secondary/50 p-3 text-sm leading-relaxed">{help}</div> : null}
    </div>
  )
}

/** What a person needs to know to tell whether the 30% ruling is theirs. Plain words; the rules are the Belastingdienst's, as in our gross-to-net report. */
function RulingHelp({ floor, floorMaster, abroad, under30Master }: { floor: number; floorMaster: number; abroad: number; under30Master: boolean }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">The 30% ruling means you pay no tax on 30% of your pay. You get it only if all three are true:</p>
      <ol className="flex list-decimal flex-col gap-2 pl-5">
        <li>
          <strong>A Dutch employer brought you here from abroad.</strong> In the 24 months before your first day of work here, you lived outside the Netherlands for at least 16 months. You also lived more than 150 km from the Dutch border. Living just across the border in Belgium or Germany does not count.
        </li>
        <li>
          <strong>Your pay is high enough.</strong> Before tax, at least {eur(floor)} a year. If you are under 30 and have a master&apos;s degree, at least {eur(floorMaster)} a year. This lower amount stops the month you turn 30. Below that amount, the ruling gives you nothing.
        </li>
        <li>
          <strong>Your employer asks for it with you.</strong> It is not automatic, and you cannot ask for it alone.
        </li>
      </ol>
      <p className="font-medium">What this means for you</p>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>
          <strong>You studied in the Netherlands, then got a job here.</strong> Usually no. The months you studied here count as living here, so you fall short of the 16 months. The exception is a job you started right after you first arrived.
        </li>
        <li>
          <strong>You studied or worked abroad and a Dutch company hired you.</strong> Probably yes, if you were far enough from the border for 16 of the last 24 months.
        </li>
        <li>
          <strong>You did a PhD in the Netherlands.</strong> The 24 months are counted from before your PhD started. Living here during and after the PhD is allowed.
        </li>
        <li>
          <strong>Your first-job pay is low.</strong> Many first jobs sit below the minimum, so the ruling would change nothing. The switch above shows what it is worth at this job.
        </li>
        <li>
          <strong>How long it lasts.</strong> Up to 5 years.
        </li>
        <li>
          <strong>From 2027.</strong> For most people the tax-free part drops from 30% to 27%, and the minimum pay goes up to 50,436 a year (38,338 for under 30 with a master&apos;s). People who started before 2024 keep 30%. This tool still counts 30%, with this year&apos;s amounts.
        </li>
      </ul>
      <p className="rounded-md bg-background p-2">
        <strong>From your profile:</strong>{" "}
        {abroad >= 16 ? `you lived outside the Netherlands for ${abroad} of the last 24 months, so you meet the 16-month test. Check that you lived more than 150 km from the border.` : `you lived outside the Netherlands for ${abroad} of the last 24 months, which is under the 16 needed. The ruling is probably not yours. If that number is wrong, change it in your profile.`}{" "}
        {under30Master ? `You are under 30 with a master's degree, so the lower pay minimum applies.` : `The pay minimum that applies to you is ${eur(floor)} a year.`}
      </p>
      <p className="text-muted-foreground">Source: the Dutch tax office (Belastingdienst) and our gross-to-net research. This is not tax advice. Ask your employer&apos;s payroll team before you count on it.</p>
    </div>
  )
}

/** What a monthly pay becomes: tax, then health insurance, a month and a year. */
function TakeHome({ month, typical, totals, premium, threshold, ruling, range, startNet }: { range?: React.ReactNode; startNet: number; month: number; typical: boolean; totals: { gross: number; netM: number; free: number }; premium: number; threshold: number | null; ruling: boolean }): React.JSX.Element {
  // Numbers that follow your pay settings (what you get, what is left) show against what they are with the settings as they start.
  const row = (label: string, m: number, strong = false, minus = false, was: number | null = null): React.JSX.Element => (
    <div className={`grid grid-cols-[minmax(0,1fr)_5.5rem_6rem] items-baseline gap-x-3 py-2 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="text-right tabular-nums">
        <Moved delta={was === null ? 0 : minus ? was - m : m - was} min={10} wasText={was === null ? "" : `${minus ? "−" : ""}${eur(was)}`}>
          {minus ? "−" : ""}
          {eur(Math.abs(m))}
        </Moved>
      </dd>
      <dd className="text-right tabular-nums">{minus ? "−" : ""}{eur(Math.abs(m) * 12)}</dd>
    </div>
  )
  // The typical figure includes the 8% holiday pay; the visa minimum does not, so it is compared like for like.
  const gap = threshold != null ? (typical ? month / 1.08 : month) - threshold : null

  return (
    <div className="mt-3 min-w-0 rounded-lg bg-secondary/50 p-3 text-sm">
      {range}
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6rem] gap-x-3 text-xs text-muted-foreground">
        <span />
        <span className="text-right">a month</span>
        <span className="text-right">a year</span>
      </div>
      <dl className="divide-y-[1.5px]">
        {row("Pay before tax", totals.gross)}
        {row("Income tax", totals.gross - totals.netM, false, true, totals.gross - startNet)}
        {row("What you get", totals.netM, true, false, startNet)}
        {row("Health insurance", premium, false, true)}
        {row("What is left", totals.netM - premium, true, false, startNet - premium)}
      </dl>
      {gap != null && threshold != null ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 border-t-[1.5px] pt-2">
          Your visa needs {eur(threshold)} a month
          <Pill tone={gap >= 0 ? "ok" : "bad"}>{gap >= 0 ? "This is enough" : "This is not enough"}</Pill>
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        Dutch tax for 2026, no pension.{ruling ? ` 30% of the pay is tax-free${totals.free > 0 ? "" : ""}.` : ""}
        {typical ? " The pay is what this kind of work typically pays, not a posted salary." : ""}
      </p>
    </div>
  )
}

/** Same colour for roles with about the same share: a new group starts where the next role falls below 80% of the one before it. */
const MOVE_COLORS = ["bg-brand", "bg-primary", "bg-muted-foreground/60", "bg-brand/40"]

/**
 * Where people in this job went next, as columns: the share sits on top of each, roles that are about equally common share a colour, and
 * pressing one says what we know about that role: how many moved there and what the postings we hold for it look like.
 */
function NextMoves({ transition, postings, onPick }: { transition: Transition; postings: ReadonlyArray<Posting>; onPick?: () => void }): React.JSX.Element {
  const apply = useApplyFilter()
  const [picked, setPicked] = useState<number | null>(null)
  const top5 = transition.top.slice(0, 5)
  const biggest = Math.max(1, ...top5.map(([, n]) => n))
  const covered = top5.reduce((sum, [, n]) => sum + n, 0) / transition.with_next
  const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)
  const group: number[] = []
  top5.forEach(([, n], i) => group.push(i === 0 ? 0 : n / top5[i - 1][1] < 0.8 ? group[i - 1] + 1 : group[i - 1]))
  const colorOf = (i: number): string => MOVE_COLORS[Math.min(group[i], MOVE_COLORS.length - 1)]
  const share = (n: number): string => pct(n / transition.with_next, 1)

  const sel = picked !== null ? top5[picked] : null
  const selTitle = picked !== null ? (transition.top[picked]?.[0] ?? null) : null
  const open = useMemo(() => {
    if (!selTitle) return null
    const words = selTitle.toLowerCase().split(/\s+/).filter(Boolean)
    const hits = postings.filter((q) => {
      const t = (q.title_clean ?? q.title).toLowerCase()
      return words.every((w) => t.includes(w))
    })
    const years = hits.map((q) => q.years_min).filter((y): y is number => y != null).sort((a, b) => a - b)
    const levels = new Map<string, number>()
    for (const q of hits) levels.set(levelOf(q), (levels.get(levelOf(q)) ?? 0) + 1)
    const common = [...levels.entries()].sort((a, b) => b[1] - a[1])[0]

    return { n: hits.length, years: years.length >= 3 ? years[Math.floor(years.length / 2)] : null, common: common ? { level: common[0], n: common[1] } : null }
  }, [selTitle, postings])

  return (
    <div className="rounded-xl border-[1.5px] bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h4 className="flex items-center gap-2 text-base font-semibold">
          Where people in this job went next
          <Hint label="About these moves">
            Real careers of people in Flanders (JobHop data), written by the people themselves, so titles can be noisy and the Dutch market may differ. People moved to many different roles: these five make up {pct(covered, 0)} of all moves.
          </Hint>
        </h4>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">people stay about {(transition.tenure_q_median / 4).toFixed(1)} years</span>
      </div>
      <ol className="mt-5 grid grid-cols-5 gap-2 sm:gap-3">
        {top5.map(([role, count], i) => (
          <li key={role} className="min-w-0">
            <button type="button" aria-pressed={picked === i} onClick={() => setPicked(picked === i ? null : i)} className={`flex w-full cursor-pointer flex-col items-center rounded-lg px-1 pt-1 pb-2 text-center transition-colors hover:bg-secondary/60 ${picked === i ? "bg-secondary" : ""}`}>
              <div className="flex h-36 w-full flex-col items-center justify-end gap-1">
                <span className="text-sm font-semibold tabular-nums">{share(count)}</span>
                <div className={`w-full rounded-t-md ${colorOf(i)}`} style={{ height: `${Math.max(8, (count / biggest) * 108)}px` }} />
              </div>
              <span className="mt-1.5 w-full break-words text-xs leading-tight">{cap(role)}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">Same colour means about the same share. Press a role for more.</p>

      {sel && open ? (
        <div className="mt-3 rounded-lg border-[1.5px] bg-background p-4 text-sm">
          <p className="text-base font-semibold">{cap(sel[0])}</p>
          <p className="mt-1">{share(sel[1])} of the people who left this job went on to this role.</p>
          {open.n > 0 ? (
            <>
              <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">Open now</dt>
                <dd className="font-medium">{open.n} {open.n === 1 ? "job" : "jobs"} on odds</dd>
                {open.common ? (
                  <>
                    <dt className="text-muted-foreground">Usual level</dt>
                    <dd className="font-medium">{open.common.level}</dd>
                  </>
                ) : null}
                {open.years !== null ? (
                  <>
                    <dt className="text-muted-foreground">Asks for</dt>
                    <dd className="font-medium">{open.years}+ years of experience</dd>
                  </>
                ) : null}
              </dl>
              {apply ? (
                <button type="button" onClick={() => { apply({ query: sel[0] }); onPick?.() }} className="mt-3 cursor-pointer rounded-full border-[1.5px] px-3 py-1 font-medium transition-colors hover:border-foreground">
                  See these jobs →
                </button>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-muted-foreground">No open job with this title on odds right now.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

/** The pay and visa settings every figure on the page is counted with: what you tick decides the numbers for every job, and is kept as you change it. */
function CareerPath(): React.JSX.Element {
  const data = useData()
  const ref = data.reference!
  const d = derive(data.profile)
  const choices = payChoicesOf(data.profile)
  const { ruling, masterFloor, route } = choices
  const choose = (patch: Partial<PayChoices>): void => {
    data.setProfile({ ...data.profile, payChoices: { ...choices, ...patch } })
    saved()
  }
  const routes = ref.tax.ind_hsm_thresholds_h2_2026_monthly_excl_holiday
  const threshold = route === "eu" ? null : route === "orientation_year" ? routes.reduced_orientation_year : route === "hsm_under_30" ? routes.under_30 : routes.age_30_plus

  return (
    <div className="mt-6 flex flex-col gap-5 border-t-[1.5px] pt-5">
      {(() => {
        const ROUTES: Array<[PermitRoute, string, string]> = [["eu", "EU/EEA", "no visa"], ["orientation_year", "Orientation year", ""], ["hsm_under_30", "Skilled worker", "under 30"], ["hsm_30_plus", "Skilled worker", "30 or older"]]

        return (
          <section aria-label="Count for me" className="rounded-xl border-[1.5px] bg-card px-4 pt-3 pb-4">
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Count for me</h4>
            <p className="mt-1 text-sm">Change these and the pay after tax, above and in every level below, changes with them.</p>
            <div className="divide-y-[1.5px]">
              <ToggleRow title="30% ruling" hint={ruling ? "30% of your pay is tax-free" : "Tax on all of your pay"} on={ruling} set={(v) => choose({ ruling: v })} helpLabel="Do I qualify?" help={<RulingHelp floor={ref.tax.ruling_30pct.min_salary} floorMaster={ref.tax.ruling_30pct.min_salary_under30_masters} abroad={data.profile.abroad} under30Master={masterFloor} />} />
              <ToggleRow title="Master's degree, under 30" hint="The ruling needs a lower salary" on={masterFloor} set={(v) => choose({ masterFloor: v })} />
              <div className="py-3">
                <p className="font-medium">Visa</p>
                <div role="radiogroup" aria-label="My visa" className="mt-2 grid gap-1 sm:grid-cols-2">
                  {ROUTES.map(([value, top, bottom]) => (
                    <button key={value} type="button" role="radio" aria-checked={route === value} onClick={() => choose({ route: value })} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary/60">
                      <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${route === value ? "border-primary" : "border-muted-foreground/50"}`}>
                        <span className={`size-2.5 rounded-full transition-transform ${route === value ? "scale-100 bg-primary" : "scale-0"}`} />
                      </span>
                      <span className="text-sm leading-tight font-medium">
                        {top}
                        {bottom ? <span className="font-normal text-muted-foreground"> · {bottom}</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{threshold === null ? "No salary minimum." : `Your visa needs ${eur(threshold)} a month.`}</p>
              </div>
            </div>
            {!d.rulingEligible && ruling ? <p className="text-xs text-muted-foreground">Your answers say you may not qualify for the 30% ruling ({data.profile.abroad} of the last 24 months abroad, 16 needed). Only an employer and the tax office can confirm it.</p> : null}
          </section>
        )
      })()}
    </div>
  )
}

/** The levels, in the words a person would use. */
const LEVEL_WORDS: Record<string, string> = { Internship: "Internship", Entry: "Entry level", Mid: "Mid-level", Senior: "Senior", Manager: "Manager", Director: "Director" }

/**
 * What comes next in this kind of work, laid out as steps: for each level above this job, what it usually asks, what it pays, some example jobs, and how many
 * are open. It is read from the postings we hold in the same line of work. It is what the market asks and pays at each level, not a promise that this job
 * leads there, and the section says so in one line.
 */
export function CareerLadder({ post, st, onPick }: { post: Posting; st?: Standing | null; onPick?: () => void }): React.JSX.Element | null {
  const data = useData()
  const apply = useApplyFilter()
  const industry = industryOf(post)
  const ref = data.reference
  const [openRow, setOpenRow] = useState<string | null>(null)
  const choices = payChoicesOf(data.profile)
  const { ruling, masterFloor, route } = choices
  const under30Master = masterFloor
  const stats = useMemo(() => ladderStats(data.postings, post), [data.postings, post])
  const pool = useMemo(() => poolOf(data.postings, post), [data.postings, post])
  if (!ref) {
    return null
  }
  const premium = ref.tax.health_insurance_2026.average_premium_month
  const routes = ref.tax.ind_hsm_thresholds_h2_2026_monthly_excl_holiday
  const threshold = route === "eu" ? null : route === "orientation_year" ? routes.reduced_orientation_year : route === "hsm_under_30" ? routes.under_30 : routes.age_30_plus
  const here = rungOf(levelOf(post))
  const hereIdx = stats.findIndex((x) => x.level === here)
  const now = payMid(post, ref)
  const key = transitionKeyOf(post)
  const transition = key ? ref.transitions[key] : undefined
  const steps = stats.filter((_, i) => i > hereIdx && stats[i].open > 0)
  // Where postings state too little pay at a step, the occupation's own CBS spread stands in: its lower quarter for Entry, the middle for Mid, the upper quarter for Senior.
  const groups = new Map<string, number>()
  for (const q of pool.posts) if (q.cbs_group) groups.set(q.cbs_group, (groups.get(q.cbs_group) ?? 0) + 1)
  const group = post.cbs_group ?? [...groups.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
  const spread = group ? ref.bands[group] : null
  const monthly = (hourly: unknown): number => Math.round((Number(hourly) * 2080 * 1.08) / 12 / 50) * 50
  const estimate = (level: string): number | null => (!spread ? null : level === "Entry" ? monthly(spread.p25_hourly) : level === "Mid" ? monthly(spread.p50_hourly) : level === "Senior" ? monthly(spread.p75_hourly) : null)
  if (steps.length === 0 && !transition) {
    return null
  }

  const money = (level: string, stated: number | null): LevelPay | null => (stated !== null ? { v: stated, typical: false } : estimate(level) !== null ? { v: estimate(level)!, typical: true } : null)
  const po = payOf(post, ref)
  const here0: LevelPay | null =
    po.perHour ? { v: 0, typical: false, hourly: po.text ?? "" } :
    po.basis === "Allowance" ? (() => { const a = allowanceOf(post); return { v: (a.low + a.high) / 2, typical: false, allowance: { text: po.text ?? "", source: po.source as AllowanceSource } } })()
    : now ? { v: Math.round(now.month / 10) * 10, typical: now.basis !== "Stated", text: po.basis === "Stated" || po.source === "Typical traineeship pay" ? po.text ?? undefined : undefined } : null
  const rows: Array<{ level: string; years: number | null; open: number; roles: string[]; pay: LevelPay | null; mine: boolean }> = [
    { level: here ?? "This job", years: null, open: 0, roles: [], pay: here0, mine: true },
    ...steps.map((r) => ({ level: r.level, years: r.years, open: r.open, roles: r.roles, pay: money(r.level, r.pay), mine: false })),
  ]
  const band = st?.band ?? null
  const r10 = (n: number): number => Math.round(n / 10) * 10
  const pickBand = (on: boolean): { p25: number; p75: number } | null => (!band ? null : on ? (masterFloor ? band.netRulingUnder30 : band.netRuling) : band.netOff)
  // The same range with the pay settings as they start, so a change you make shows against it.
  const startChoices = payChoicesOf({ ...data.profile, payChoices: undefined })
  const firstBand = band ? (startChoices.ruling ? (startChoices.masterFloor ? band.netRulingUnder30 : band.netRuling) : band.netOff) : null
  const firstRange = firstBand ? { p25: r10(firstBand.p25), p75: r10(firstBand.p75) } : null
  const startNet = (month: number): number => netMonth(month * 12, startChoices.ruling, startChoices.masterFloor, ref.tax).net
  const mineRange = pickBand(ruling)
  const otherRange = pickBand(!ruling)
  const taxTotals = (month: number): { gross: number; netM: number; free: number } => {
    const n = netMonth(month * 12, ruling, under30Master, ref.tax)

    return { gross: month, netM: n.net, free: n.freeShare }
  }
  return (
    <Section title="What comes next in this kind of work">
      <p className="text-[0.95rem] text-muted-foreground">What each level usually asks and pays in {pool.name}, from the jobs we hold. The after-tax figures follow your settings. This is the road ahead in this field, not a promise that this job leads there.</p>
      <ol className="mt-6 flex flex-col">
        {rows.map((r, i) => {
          const id = r.level + String(r.mine)
          const isOpen = openRow === id
          const salary = r.pay && !r.pay.hourly && !r.pay.allowance ? r.pay : null

          return (
            <li key={id} className="relative pb-9 pl-10 last:pb-0">
              {i < rows.length - 1 ? <span className="absolute top-5 -bottom-1 left-[9px] w-px bg-border" aria-hidden="true" /> : null}
              <span className={`absolute top-1.5 left-0 size-5 rounded-full border-2 ${r.mine ? "border-brand bg-brand" : "border-border bg-background"}`} aria-hidden="true" />
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h3 className="text-base font-semibold tracking-tight">{LEVEL_WORDS[r.level] ?? r.level}</h3>
                  </div>
                  {salary ? (
                    <>
                      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="text-xl font-semibold tracking-tight tabular-nums">
                          {salary.typical ? "about " : ""}
                          {salary.text ?? eur(salary.v)}
                        </span>
                        <span>a month before tax</span>
                      </p>
                      {/* What it comes to after tax with your settings: it moves when a setting does. */}
                      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="text-xl font-semibold tracking-tight tabular-nums">
                          <Moved delta={taxTotals(salary.v).netM - startNet(salary.v)} min={10} wasText={eur(startNet(salary.v))}>
                            {eur(taxTotals(salary.v).netM)}
                          </Moved>
                        </span>
                        <span>a month after tax</span>
                      </p>
                    </>
                  ) : r.pay?.allowance ? (
                    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="text-xl font-semibold tracking-tight tabular-nums">{r.pay.allowance.text}</span>
                      <span>a month as an allowance</span>
                    </p>
                  ) : r.pay?.hourly ? (
                    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="text-xl font-semibold tracking-tight tabular-nums">{r.pay.hourly}</span>
                      <span>an hour</span>
                    </p>
                  ) : null}
                  {salary ? (
                    <button type="button" aria-expanded={isOpen} onClick={() => setOpenRow(isOpen ? null : id)} className="mt-2 cursor-pointer text-sm underline underline-offset-4 hover:text-brand">
                      {isOpen ? "Hide how this is worked out" : "How this is worked out"}
                    </button>
                  ) : null}
                  {isOpen && salary ? <TakeHome startNet={startNet(salary.v)} range={r.mine && mineRange && otherRange ? <AfterTaxRange first={firstRange} mine={{ p25: r10(mineRange.p25), p75: r10(mineRange.p75) }} other={{ p25: r10(otherRange.p25), p75: r10(otherRange.p75) }} ruling={ruling} /> : undefined} month={salary.v} typical={salary.typical} totals={taxTotals(salary.v)} premium={premium} threshold={r.level === "Internship" ? null : threshold} ruling={ruling} /> : null}
                  {r.mine ? <p className="mt-2 text-sm">{post.title_clean ?? post.title}</p> : r.years !== null ? <p className="mt-2 text-sm">Asks for {Math.round(r.years)}+ years of experience</p> : null}
                  {!r.mine && r.roles.length > 0 ? (
                    <p className="mt-2 text-sm">
                      <span className="font-semibold">Typical jobs: </span>
                      {r.roles.slice(0, 3).join(", ")}
                    </p>
                  ) : null}
                </div>
                {!r.mine && apply ? (
                  <button
                    type="button"
                    onClick={() => {
                      apply({ level: [r.level as Level], ...(industry ? { industry: [industry] } : {}) })
                      onPick?.()
                    }}
                    className="w-40 shrink-0 cursor-pointer rounded-full border-[1.5px] px-4 py-2 text-center text-sm font-medium transition-colors hover:border-foreground"
                  >
                    See {r.open} open {r.open === 1 ? "job" : "jobs"}
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      {transition ? (
        <div className="mt-8">
          <NextMoves transition={transition} postings={data.postings} onPick={onPick} />
        </div>
      ) : null}
    </Section>
  )
}

/**
 * The pay after tax with your settings, inside "How this is worked out" and set like the table under it: a month and a year, the low and the high end of the range, and the same
 * two ends with the 30% ruling the other way. A number that a setting has moved turns green or red, with the first one in the hover.
 */
function AfterTaxRange({ mine, other, ruling, first }: { mine: { p25: number; p75: number }; other: { p25: number; p75: number }; ruling: boolean; first: { p25: number; p75: number } | null }): React.JSX.Element {
  const cell = (now: number, was: number | null, strong: boolean): React.JSX.Element => (
    <>
      <dd className="text-right tabular-nums">
        <Moved delta={was === null ? 0 : now - was} min={10} wasText={was === null ? "" : eur(was)}>
          {eur(now)}
        </Moved>
      </dd>
      <dd className={`text-right tabular-nums ${strong ? "" : "text-muted-foreground"}`}>{eur(now * 12)}</dd>
    </>
  )
  const row = (label: string, now: number, was: number | null, strong = false): React.JSX.Element => (
    <div className={`grid grid-cols-[minmax(0,1fr)_7rem_6rem] items-baseline gap-x-3 py-2 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      {cell(now, was, strong)}
    </div>
  )

  return (
    <div className="mb-3 border-b-[1.5px] pb-3">
      <div className="grid grid-cols-[minmax(0,1fr)_7rem_6rem] gap-x-3 text-xs text-muted-foreground">
        <span>After tax, with your settings</span>
        <span className="text-right">a month</span>
        <span className="text-right">a year</span>
      </div>
      <dl className="divide-y-[1.5px]">
        {row("Low end of the range", mine.p25, first?.p25 ?? null, true)}
        {row("High end of the range", mine.p75, first?.p75 ?? null, true)}
        {row(`Low end ${ruling ? "without" : "with"} the 30% ruling`, other.p25, null)}
        {row(`High end ${ruling ? "without" : "with"} the 30% ruling`, other.p75, null)}
      </dl>
    </div>
  )
}

/**
 * Under "Get a referral" on a job: link someone you already added at this
 * company, or add a new person right there; the form has the search for
 * people at the company inside it. Either way they show on the People
 * table and count as the referral.
 */
function ReferralLink({ post }: { post: Posting }): React.JSX.Element | null {
  const data = useData()
  const [adding, setAdding] = useState<boolean>(false)
  const candidates = data.people.filter((p) => p.jobId !== post.id && p.company.trim().toLowerCase() === post.employer_display.trim().toLowerCase())
  if (data.people.some((p) => p.jobId === post.id && p.status === "Referred")) {
    return null
  }
  if (adding) {
    return (
      <Suspense fallback={null}>
        <AddPerson fixedJob={post} onDone={() => setAdding(false)} />
      </Suspense>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pb-3.5 pl-7">
      {candidates.length > 0 ? (
        <select
          aria-label={`Link someone you know at ${post.employer_display}`}
          value=""
          onChange={(e) => {
            data.updatePerson(e.target.value, { jobId: post.id, company: post.employer_display })
            saved()
          }}
          className="h-8 rounded-md border-[1.5px] bg-background px-2 text-sm"
        >
          <option value="">Link someone you know here</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : null}
      <button type="button" onClick={() => setAdding(true)} className="cursor-pointer text-sm font-medium text-primary underline underline-offset-4">
        Add someone new
      </button>
    </div>
  )
}
