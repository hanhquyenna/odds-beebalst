import { useEffect, useMemo, useState } from "react"
import { CompanyLogo } from "@/components/CompanyMark"
import { BookmarkIcon } from "@/components/icons"
import { KeyFacts } from "@/components/Tag"
import { AboutCompany, MoreAtEmployer } from "@/components/CompanyInsights"
import { PostingText } from "@/components/PostingText"
import { SourceLinks } from "@/components/SourceChips"
import { StatusPicker } from "@/components/StatusPicker"
import { JobProperties } from "@/components/JobProperties"
import { Hint } from "@/components/Hint"
import { CareerLadder, FitCard, LockedPersonal, PayCard, Recommendations, Section, UspStrip } from "@/components/JobPersonal"
import { useData } from "@/lib/data"
import { saved as notifySaved } from "@/lib/saved"
import { isWhatIfActive, NO_WHAT_IF, standing, type WhatIf } from "@/lib/engine"
import { stripMarkup } from "@/lib/format"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { removeFromList, toggleSave } from "@/lib/save"
import { extractRequirements, fromJev, namedSkills, relaxedGates, tiersOf } from "@/lib/requirements"
import { allowanceNote, payOf, TRAINEE_NOTE, type AllowanceSource } from "@/lib/spec"
import { fetchBody, fetchJevRequirements } from "@/lib/jobs"
import type { Posting } from "@/lib/types"

interface JobDetailProps {
  /** Said above the facts when the job has been judged before. */
  note?: string | null
  onBack: () => void
  /** Called after a tag has narrowed the list, so a panel over the list can get out of the way. */
  onPick?: () => void
  /** Opens another job in the same place, for the list of the employer's other jobs. */
  onOpenJob?: (post: Posting) => void
  post: Posting
  /** Shown in the right-hand pane of the list: a header like a LinkedIn listing, no cover, no back link. */
  pane?: boolean
  /** The public preview: the personal sections become a locked card whose button leads into the form. */
  locked?: { onUnlock: () => void }
}

/**
 * The whole job behind a card, opened by tapping it. Everything about the
 * posting is open to anyone. What the questions unlock is the personal part:
 * whether you clear it, your chance, what you keep after tax, your permit.
 */
export function JobDetail({ note, onBack, onPick, onOpenJob, post, pane = false, locked }: JobDetailProps): React.JSX.Element {
  useBackEntry(post.id, onBack, !pane)
  const data = useData()
  const [body, setBody] = useState<string | null>(post.body ?? null)
  // The ticks under Recommendations are kept per job, so they are there next time, and every change shows the same "Saved." notice.
  const [whatIf, setWhatIfState] = useState<WhatIf>(() => ({ ...NO_WHAT_IF, ...(data.profile.ticks?.[post.id] ?? {}) }))
  const setWhatIf = (next: WhatIf): void => {
    setWhatIfState(next)
    const rest = Object.fromEntries(Object.entries(data.profile.ticks ?? {}).filter(([id]) => id !== post.id))
    const active = isWhatIfActive(next)
    const ticks = active ? { ...rest, [post.id]: next } : rest
    const keep = Object.fromEntries(Object.entries(ticks).slice(-200))
    data.setProfile({ ...data.profile, ticks: keep })
    notifySaved()
  }

  useEffect(() => {
    if (post.body !== undefined) {
      return
    }
    let live = true
    fetchBody(post.id)
      .then((text) => live && setBody(text))
      .catch(() => live && setBody(""))

    return () => {
      live = false
    }
  }, [post.id, post.body])

  // What the posting asks is read from its own text once it has loaded; until then no skills are shown, rather than the rough ones stored with it.
  // Jev's own reading of the requirements, when the posting has one; otherwise the headings and cue words in the text.
  const [jev, setJev] = useState<Awaited<ReturnType<typeof fetchJevRequirements>>>(null)
  useEffect(() => {
    let live = true
    void fetchJevRequirements(post.id).then((r) => {
      if (live) {
        setJev(r)
      }
    })

    return () => {
      live = false
    }
  }, [post.id])
  const requirements = useMemo(() => (jev && jev.length > 0 ? fromJev(jev) : body ? extractRequirements(stripMarkup(body)) : []), [body, jev])
  const job = useMemo<Posting>(
    () => (body ? { ...post, ...relaxedGates(post, requirements), skills: namedSkills(stripMarkup(body), requirements), tiers: tiersOf(requirements) } : { ...post, skills: [] }),
    [post, body, requirements],
  )
  const referral = data.referrals.has(post.id)
  // How strong your saved profile reads for this job. Until something has been read (or if the reader is off) the chance shows without it.
  const strength = data.strengthFor(post)
  const base = useMemo(
    () => (data.reference && data.shares ? standing(job, data.profile, data.reference, data.shares, NO_WHAT_IF, referral, strength) : null),
    [job, data.profile, data.reference, data.shares, referral, strength],
  )
  const st = useMemo(
    () => (data.reference && data.shares ? standing(job, data.profile, data.reference, data.shares, whatIf, referral, strength) : null),
    [job, data.profile, data.reference, data.shares, whatIf, referral, strength],
  )

  const pay = payOf(post, data.reference)
  const saved = data.saved.has(post.id)
  const [asking, setAsking] = useState<boolean>(false)
  const active = isWhatIfActive(whatIf)
  const fit = base ? (base.failing === 0 ? "met every requirement" : base.failing === 1 ? "missing one requirement" : "missing several requirements") : ""

  return (
    <div className={pane ? "flex w-full flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8" : "mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8"}>
      {pane ? null : (
        <button type="button" onClick={() => history.back()} className="cursor-pointer self-start text-sm font-medium text-primary">
          &larr; Back
        </button>
      )}

      <header className="flex flex-col gap-4 rounded-xl border-[1.5px] bg-secondary/30 p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-16 shrink-0 items-center justify-center">
            <CompanyLogo employer={post.employer} name={post.employer_display} size={52} wide={1.4} url={post.url} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-[1.75rem]">{post.title}</h1>
            <p className="text-base">{post.employer_display}</p>
            {post.local ? <p className="text-sm text-muted-foreground">Added by you</p> : null}
            {post.dutch_required ? <p className="mt-1 w-fit rounded-md border-[1.5px] border-brand/60 bg-brand/10 px-3 py-1.5 text-sm font-medium">Dutch needed: the posting asks you to speak or write Dutch.</p> : null}
          </div>
          <button
            type="button"
            aria-label={saved ? "Remove from your saved jobs" : "Save this job"}
            aria-pressed={saved}
            onClick={() => (locked ? locked.onUnlock() : saved ? setAsking(true) : toggleSave(data, post))}
            className={`flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${saved ? "border-brand bg-[oklch(0.96_0.03_45)] text-brand" : "text-muted-foreground hover:border-primary hover:text-foreground"}`}
          >
            <BookmarkIcon weight={saved ? "fill" : "bold"} className="size-5" aria-hidden="true" />
          </button>
          {asking ? <ConfirmDialog title="Remove this job from your list?" body={`${post.title} goes back to the jobs that fit you.`} confirm="Remove" onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); removeFromList(data, post) }} /> : null}
        </div>
        {pay.text ? (
          <p className="flex items-center gap-2 text-lg tabular-nums">
            <span className="font-semibold">{pay.text}</span>
            <span className="text-muted-foreground">{pay.perHour ? "an hour" : "a month"}</span>
            <Hint label="About this pay">{pay.basis === "Stated" ? "Stated by the employer, before tax." : pay.basis === "Allowance" && pay.source ? allowanceNote(pay.source as AllowanceSource) : pay.source === "Typical traineeship pay" ? TRAINEE_NOTE : "Typical for this kind of job across employers, before tax (CBS 2024). The employer does not state pay for this one."}</Hint>
          </p>
        ) : null}
        {/* Status at the left, the way into the posting at the right, on one line. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <StatusPicker post={post} fit={fit} onLocked={locked?.onUnlock} />
          <SourceLinks post={post} />
        </div>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
        {locked ? <KeyFacts post={post} onPick={onPick} /> : null}
      </header>

      {locked || !st || !base ? (
        <LockedPersonal onUnlock={locked?.onUnlock ?? onBack} />
      ) : (
        <>
          <JobProperties post={job} st={st} />
          <UspStrip post={job} st={st} base={base} active={active} />
          <Recommendations post={job} base={base} whatIf={whatIf} setWhatIf={setWhatIf} />
          <FitCard post={job} st={st} requirements={requirements} />
        </>
      )}

      {body !== "" ? (
        <Section title="About the job">{body ? <PostingText body={body} employer={post.employer_display} /> : <p className="text-sm text-muted-foreground">Loading the posting…</p>}</Section>
      ) : null}

      <AboutCompany post={post} />

      {st ? <PayCard post={post} st={st} onPick={onPick} /> : null}

      {st ? <CareerLadder post={post} st={st} onPick={onPick} /> : null}

      <MoreAtEmployer post={post} onOpenJob={onOpenJob} />
    </div>
  )
}

function isOurEntry(id: string): boolean {
  const state: unknown = history.state

  return typeof state === "object" && state !== null && "job" in state && state.job === id
}

/**
 * Opening a job adds a history entry, so the phone's back gesture or button
 * closes the job instead of leaving the site. Skipped when the entry is
 * already there, which is what StrictMode's second mount sees.
 */
function useBackEntry(id: string, onBack: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return
    }
    if (!isOurEntry(id)) {
      history.pushState({ job: id }, "")
    }
    window.addEventListener("popstate", onBack)

    return () => window.removeEventListener("popstate", onBack)
  }, [id, onBack, enabled])
}
