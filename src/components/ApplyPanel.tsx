import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { CompanyLogo } from "@/components/CompanyMark"
import type { JobTab } from "@/components/JobDetail"
import { sourcesOf } from "@/components/SourceChips"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { fetchKeptPostings } from "@/lib/jobs"
import { applySourceOf } from "@/lib/apply-source"
import { onPanelInfo, toExtension, type PanelInfo, type QueueItem } from "@/lib/embed"
import { NO_WHAT_IF, point, standing } from "@/lib/engine"
import { formatAge } from "@/lib/format"
import type { Posting } from "@/lib/types"
import { useJobProfile, useJobStrength } from "@/lib/use-documents"

const JobDetail = lazy(() => import("@/components/JobDetail").then((m) => ({ default: m.JobDetail })))

/**
 * The extension's side panel (embedded only). Like handing the job to someone: on a job page one orange Apply with Odds puts it in the
 * queue, Odds applies in a background tab of the Odds tab group, and the person keeps working. The panel shows the job, what it asks, the
 * CV Odds sends, and the queue: what Odds is working on, what is ready to send, and the only things that need the person (a check, an
 * account). Odds never presses Submit.
 */
export function ApplyPanel(): React.JSX.Element | null {
  const data = useData()
  const [info, setInfo] = useState<PanelInfo | null>(null)
  const [away, setAway] = useState<string | null>(null)
  const [view, setView] = useState<"job" | "queue">("job")
  const [tab, setTab] = useState<{ tab: JobTab; at: number } | undefined>(undefined)
  useEffect(() => onPanelInfo(setInfo), [])
  // The job's own posting: from the loaded pool, else fetched by id (a job just read from its page is not in the pool yet).
  const jobId = info?.job_id ?? null
  const known = jobId ? data.byId.get(jobId) ?? null : null
  const [fetched, setFetched] = useState<{ id: string; post: Posting | null } | null>(null)
  useEffect(() => {
    if (!jobId || known || data.status !== "ready") return
    let live = true
    void fetchKeptPostings([jobId]).then((rows) => { if (live) setFetched({ id: jobId, post: rows[0] ?? null }) }).catch(() => { if (live) setFetched({ id: jobId, post: null }) })
    return () => { live = false }
  }, [jobId, known, data.status])
  const page = info?.page ?? null
  // Between the panel opening and the extension telling it which page is in front, show a short "getting ready", never the app's Home.
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), 3500)
    return () => window.clearTimeout(timer)
  }, [])
  if (!info && !waited) {
    return (
      <div data-apply-panel className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <OddsMark size={56} />
        <p className="text-base font-bold">Getting your application ready…</p>
      </div>
    )
  }
  const queue = info?.queue ?? []
  // Not on a job page (or the person went to My jobs): the queue when there is one, else the app.
  const onJob = Boolean(page && info?.connected && away !== page.url)
  if (!onJob && !queue.length) return null
  if (!onJob || view === "queue") {
    return (
      <Shell>
        <QueueView queue={queue} onBack={onJob ? () => setView("job") : undefined} />
      </Shell>
    )
  }
  const post = known ?? (fetched && fetched.id === jobId ? fetched.post : null)
  // "Company and people" and Change open that part of the job further down the panel.
  const open = (next: JobTab): void => {
    setTab({ tab: next, at: Date.now() })
    window.setTimeout(() => document.getElementById("job-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
  }
  const needs = queue.filter(needsPerson)

  return (
    <Shell>
      <QueuePill queue={queue} onOpen={() => setView("queue")} />
      {needs[0] ? <NeedsYou item={needs[0]} /> : null}
      <JobCard info={info!} post={post} />
      <OddsButton info={info!} post={post} queue={queue} />
      <SaveAnswers info={info!} />
      <Details info={info!} post={post} onCompany={() => open("overview")} onCv={() => window.location.assign("/documents")} />
      <QueueFooter queue={queue} onOpen={() => setView("queue")} />
      {post && tab ? (
        <Suspense fallback={null}>
          <div className="pt-2"><JobDetail post={post} bare showTab={tab} onBack={() => setAway(page!.url)} /></div>
        </Suspense>
      ) : null}
      <Button variant="ghost" size="sm" className="self-center" onClick={() => setAway(page!.url)}>My jobs</Button>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }): React.JSX.Element {
  // The panel wears the app's sand look (sand ground, white cards, flat orange), as the design draws it.
  useEffect(() => {
    document.body.classList.add("web")
    return () => document.body.classList.remove("web")
  }, [])
  return <div data-apply-panel className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-background p-3.5 [&>*]:shrink-0">{children}</div>
}

const card = "rounded-[18px] border-[1.5px] border-line bg-card"
const darkButton = "flex h-12 w-full cursor-pointer items-center justify-center rounded-[14px] bg-foreground text-base font-extrabold text-background transition hover:opacity-90"

/** A check or an account in the way, or Odds stuck: the person's turn. Ready (to send) is not "needs you": it waits in the queue. */
const needsPerson = (q: QueueItem): boolean => q.state === "needs_input" || q.state === "failed" || q.state === "stuck"
const working = (q: QueueItem): boolean => q.state === "filling"
const ready = (q: QueueItem): boolean => q.state === "ready" || q.state === "review"

/** The odds mark, as the app icon draws it: a black disc with a white eye and the orange dot. */
function OddsMark({ size = 28, dot = "var(--brand)" }: { size?: number; dot?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
      <circle cx="15" cy="17" r="13" fill="#2B2825" />
      <circle cx="15" cy="17" r="8.2" fill="#fff" />
      <circle cx="15" cy="17" r="4.2" fill="#1C1A18" />
      <circle cx="16.4" cy="15.6" r="1.3" fill="#fff" />
      <circle cx="25.5" cy="6.5" r="4" fill={dot} stroke="#2B2825" strokeWidth="1.5" />
    </svg>
  )
}

function Chevron(): React.JSX.Element {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-muted-foreground"><path d="M9 6l6 6-6 6" /></svg>
}

/** At the top: "1 needs you" (orange) or "2 working", which opens the queue. Nothing when the queue is empty. */
function QueuePill({ queue, onOpen }: { queue: QueueItem[]; onOpen: () => void }): React.JSX.Element | null {
  const needs = queue.filter(needsPerson).length
  const busy = queue.filter(working).length
  if (!needs && !busy) return null

  return (
    <button type="button" onClick={onOpen} className={`flex h-8 cursor-pointer items-center gap-2 self-end rounded-full border-[1.5px] px-3 text-[13px] font-bold ${needs ? "border-brand bg-accent text-brand-ink" : "border-line bg-card"}`}>
      <span className="size-2 rounded-full bg-brand" />
      {needs ? `${needs} needs you` : `${busy} working`}
    </button>
  )
}

/** The job: logo, title, company · place · age, and the interview chance in one line. */
function JobCard({ info, post }: { info: PanelInfo; post: Posting | null }): React.JSX.Element {
  const page = info.page!
  let host = ""
  try { host = new URL(page.url).hostname.replace(/^www\./, "") } catch { host = "" }
  const employer = post?.employer ?? (info.job?.employer || host)
  const name = post?.employer_display ?? (info.job?.employer || host)
  const title = post?.title ?? (info.job?.title || page.title || host)
  const age = post && !post.local ? formatAge(post) : ""

  return (
    <section className={`${card} flex flex-col gap-3.5 p-4`}>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center">
          <CompanyLogo employer={employer} name={name} size={44} wide={1.3} url={post?.url ?? page.url} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-3 text-[17px] leading-tight font-extrabold">{title}</span>
          <span className="text-[13px] text-muted-foreground">{[name, post?.region, age && age !== "Date not shown" ? age : ""].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      {post ? <Chance post={post} /> : null}
    </section>
  )
}

const NO_POST = { id: "", family: null }
function useStanding(post: Posting | null) {
  const data = useData()
  const profile = useJobProfile(post?.id ?? "")
  const strength = useJobStrength(post ?? NO_POST)
  const referral = post ? data.referrals.has(post.id) : false
  return useMemo(() => (post && data.reference && data.shares ? standing(post, profile, data.reference, data.shares, NO_WHAT_IF, referral, strength) : null), [post, profile, data.reference, data.shares, referral, strength])
}

function Chance({ post }: { post: Posting }): React.JSX.Element | null {
  const st = useStanding(post)
  const mid = st && !st.needsProfile ? st.rate?.mid ?? null : null
  if (mid === null) return null

  return (
    <div className="flex items-center justify-between rounded-xl border-[1.5px] border-secondary bg-secondary px-3.5 py-3">
      <span className="text-sm font-semibold text-muted-foreground">Your interview chance</span>
      <span className="text-[22px] font-extrabold tracking-tight tabular-nums">{point(mid)}</span>
    </div>
  )
}

/**
 * The one orange button. On a job page: Apply with Odds, which queues it (a background tab applies; this tab stays as it is). On a tab
 * that is itself applying: how it stands. On an account step or a form the person opened themselves: Odds fills it right here.
 */
function OddsButton({ info, post, queue }: { info: PanelInfo; post: Posting | null; queue: QueueItem[] }): React.JSX.Element {
  const data = useData()
  const page = info.page!
  const state = info.status?.state ?? null
  const [pressed, setPressed] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const look = "flex h-14 w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-brand-ink bg-brand px-4 text-[17px] font-extrabold text-foreground transition hover:brightness-105 disabled:cursor-default disabled:opacity-70"
  const caption = (text: string): React.JSX.Element => <p className="-mt-0.5 mx-1 text-[13px] leading-snug text-muted-foreground">{text}</p>
  const source = post ? applySourceOf(sourcesOf(post)) : null
  const kind = page.kind ?? null

  // This tab is an application Odds is working in: how it stands, and what (if anything) the person does here.
  if (state) {
    const message = (info.status?.message ?? "").replace(/^needs you:\s*/i, "").trim()
    if (state === "filling") return <StateCard tone="work" title="Odds is filling this in" text="Switch tabs anytime: it keeps going in the background." />
    if (state === "ready" || state === "review") return <StateCard tone="good" title="Ready to send" text="Check the form and press Submit yourself. Odds never sends it." />
    if (state === "submitted") return <StateCard tone="good" title="Applied" text="Sent. It is in your tracker." />
    return (
      <>
        <StateCard tone="needs" title="Your turn on this page" text={message || "Odds needs you here, then carries on by itself."} />
        <button type="button" className={look} onClick={() => { setPressed("fill"); toExtension({ type: "panel-fill", tabId: page.tabId }) }}>{pressed === "fill" ? "Carrying on…" : "Carry on with Odds"}</button>
      </>
    )
  }
  // An account step the person is on: Odds fills the email and a strong password it keeps for this site, and presses the site's button.
  if (kind === "create_account" || kind === "sign_in") {
    const create = kind === "create_account"
    return (
      <>
        <button type="button" disabled={pressed === "account"} className={look} onClick={() => { setPressed("account"); toExtension({ type: "panel-account", tabId: page.tabId, create }); window.setTimeout(() => setPressed(null), 6000) }}>
          {pressed === "account" ? (create ? "Making your account…" : "Signing in…") : create ? "Make the account with Odds" : page.account ? "Sign in with Odds" : "Fill after you sign in"}
        </button>
        {caption("Odds uses your email and a strong password it keeps in this Chrome, then fills the application after it.")}
      </>
    )
  }
  // A form the person opened themselves: Odds fills it here, in front of them.
  if (page.form) {
    return (
      <>
        <button type="button" disabled={pressed === "fill"} className={look} onClick={() => { setPressed("fill"); toExtension({ type: "panel-fill", tabId: page.tabId }) }}>{pressed === "fill" ? "Filling…" : "Apply with Odds"}</button>
        {caption("Odds fills this form here and stops before Submit.")}
      </>
    )
  }
  // A job Odds holds (or this page): queued. Already in the queue: where it stands, with no second press.
  const inQueue = queue.find((q) => (post && q.postingId === post.id))
  if (inQueue || pressed === "queued") {
    const title = post?.title ?? info.job?.title ?? page.title
    const place = queue.filter(working).length
    return (
      <div role="status" className="flex items-center gap-3 rounded-2xl border-[1.5px] border-good-foreground bg-card px-3.5 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-good text-good-foreground">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
        </span>
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[15px] font-extrabold">Added: {title}</span>
          <span className="text-[13px] text-muted-foreground">{inQueue && ready(inQueue) ? "Ready for you to send." : inQueue && needsPerson(inQueue) ? "It needs you: see above." : `${place > 1 ? `${place} in the queue. ` : ""}You can close this tab.`}</span>
        </div>
      </div>
    )
  }
  if (post || kind === "job") {
    return (
      <>
        <button type="button" disabled={pressed === "queue"} className={look} onClick={() => {
          setPressed("queue")
          if (post) data.setSaved(post.id, true)
          toExtension({ type: "apply-here", tabId: page.tabId, url: source?.url ?? page.url, postingId: post?.id ?? null, title: [post?.title ?? info.job?.title, post?.employer_display ?? info.job?.employer].filter(Boolean).join(" · ") || page.title })
          window.setTimeout(() => setPressed("queued"), 900)
        }}>{pressed === "queue" ? "Adding…" : "Apply with Odds"}</button>
        {caption("Odds fills and checks it in the background. It only stops for a captcha or a new account.")}
      </>
    )
  }

  return (
    <button type="button" disabled={adding} className={look} onClick={() => {
      setAdding(true)
      toExtension({ type: "panel-add-job", url: page.url })
      window.setTimeout(() => { void data.refreshPostings().finally(() => setAdding(false)) }, 2500)
    }}>{adding ? "Adding…" : "Track this job"}</button>
  )
}

function StateCard({ tone, title, text }: { tone: "work" | "good" | "needs"; title: string; text: string }): React.JSX.Element {
  const ring = tone === "good" ? "border-good-foreground" : tone === "needs" ? "border-2 border-brand" : "border-line"
  return (
    <div role="status" className={`flex items-center gap-3 rounded-2xl border-[1.5px] bg-card px-3.5 py-3 ${ring}`}>
      <span className={tone === "work" ? "odds-working" : ""}><OddsMark size={30} dot={tone === "good" ? "#2F6B47" : "var(--brand)"} /></span>
      <div className="flex min-w-0 flex-col gap-px">
        <span className="text-[15px] font-extrabold">{title}</span>
        <span className="text-[13px] leading-snug text-muted-foreground">{text}</span>
      </div>
    </div>
  )
}

/** What they ask (in your CV: green; not yet: dashed orange), the CV it sends, and the company and people. */
function Details({ info, post, onCompany, onCv }: { info: PanelInfo; post: Posting | null; onCompany: () => void; onCv: () => void }): React.JSX.Element {
  const st = useStanding(post)
  const data = useData()
  const asks = st && !st.needsProfile ? st.checklist.slice(0, 8) : []
  const company = (post?.employer_display ?? info.job?.employer ?? "").toLowerCase()
  const people = data.people.filter((p) => (post && p.jobId === post.id) || (company && p.company.toLowerCase() === company)).length
  const facts = [post?.ind_sponsor ? "Visa sponsor" : "", people ? `${people} ${people === 1 ? "person" : "people"} you could write to` : ""].filter(Boolean).join(" · ")
  const row = "flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/60"

  return (
    <section aria-label="Details" className={`${card} flex flex-col overflow-hidden`}>
      {asks.length ? (
        <div className="flex flex-col gap-1.5 px-4 py-3.5">
          <span className="text-[15px] font-bold">What they ask</span>
          <ul className="flex flex-wrap gap-1.5">
            {asks.map((c) => <li key={c.skill} className={c.have ? "rounded-full bg-good px-2.5 py-0.5 text-xs font-bold text-good-foreground" : "rounded-full border-[1.5px] border-dashed border-brand px-2.5 py-0.5 text-xs font-bold text-brand-ink"}>{c.skill}</li>)}
          </ul>
        </div>
      ) : null}
      <button type="button" onClick={onCv} className={`${row} ${asks.length ? "border-t-[1.5px] border-secondary" : ""}`}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-bold">CV it sends</span><span className="truncate text-[13px] text-muted-foreground">{info.cv ?? "No CV yet: add one"}</span></span>
        <span className="text-[13px] font-bold text-brand-ink">{info.cv ? "Change" : "Add"}</span>
      </button>
      {post ? (
        <button type="button" onClick={onCompany} className={`${row} border-t-[1.5px] border-secondary`}>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="text-[15px] font-bold">Company and people</span><span className="truncate text-[13px] text-muted-foreground">{facts || "About the job, the company and who works there"}</span></span>
          <Chevron />
        </button>
      ) : null}
    </section>
  )
}

/** One application that needs the person: what is in the way, Go to the tab (the one press that brings it forward), or Skip it. */
function NeedsYou({ item }: { item: QueueItem }): React.JSX.Element {
  const text = item.message.replace(/^needs you:\s*/i, "")
  const check = /captcha|human|robot|verify you/i.test(text)
  const account = /account|password|sign[ -]?in|log[ -]?in|verification code/i.test(text)
  const title = check ? "A check is in the way" : account ? "An account needs you" : item.state === "failed" ? "Odds got stuck" : "Odds needs you"

  return (
    <section className="flex flex-col gap-3.5 rounded-[18px] border-2 border-brand bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-brand-ink">
          {check
            ? <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
            : <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-lg leading-tight font-extrabold">{title}</span>
          <span className="truncate text-sm text-muted-foreground">{item.title}{item.site ? ` · ${item.site}` : ""}</span>
        </div>
      </div>
      {text ? <p className="text-sm leading-normal text-muted-foreground">{check ? "The site asks you to prove you are human. Tick it in the tab; Odds carries on by itself the moment it is done." : text}</p> : null}
      <button type="button" className={darkButton} onClick={() => toExtension({ type: "panel-show-tab", tabId: item.tabId })}>Go to the tab</button>
      <button type="button" className="cursor-pointer self-center p-1.5 text-[13px] font-bold text-muted-foreground hover:text-foreground" onClick={() => toExtension({ type: "panel-skip-tab", tabId: item.tabId })}>Skip this job</button>
    </section>
  )
}

/** At the bottom of the job: the queue in one line, which opens it. */
function QueueFooter({ queue, onOpen }: { queue: QueueItem[]; onOpen: () => void }): React.JSX.Element | null {
  if (!queue.length) return null
  const busy = queue.filter(working).length
  const done = queue.filter(ready).length
  const needs = queue.filter(needsPerson).length

  return (
    <button type="button" onClick={onOpen} className={`${card} flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left hover:bg-secondary/60`}>
      <OddsMark size={30} />
      <span className="flex flex-1 flex-col gap-px">
        <span className="text-sm font-extrabold">Your queue</span>
        <span className="text-[13px] text-muted-foreground">{`${busy} working · ${done} ready · ${needs ? `${needs} needs you` : "nothing needs you"}`}</span>
      </span>
      <span className="text-[13px] font-bold text-brand-ink">Open</span>
    </button>
  )
}

/** The queue: what needs the person first, then what Odds is working on, then what is ready to send (each opens in its tab). */
function QueueView({ queue, onBack }: { queue: QueueItem[]; onBack?: () => void }): React.JSX.Element {
  const needs = queue.filter(needsPerson)
  const busy = queue.filter(working)
  const done = queue.filter(ready)
  const show = (q: QueueItem): void => toExtension({ type: "panel-show-tab", tabId: q.tabId })
  const line = (q: QueueItem, right: React.ReactNode, sub?: string): React.JSX.Element => (
    <div key={q.tabId} className="flex flex-col gap-1.5 border-t-[1.5px] border-secondary px-4 py-3">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] border-[1.5px] border-secondary bg-secondary text-[13px] font-extrabold">{(q.title || q.site || "?").charAt(0).toUpperCase()}</span>
        <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm font-bold">{q.title}</span><span className="truncate text-xs text-muted-foreground">{q.site}</span></span>
        {right}
      </div>
      {sub ? <span className="line-clamp-2 text-xs text-muted-foreground">{sub}</span> : null}
    </div>
  )

  return (
    <>
      <div className="flex items-center gap-2.5">
        {onBack ? (
          <button type="button" aria-label="Back to the job" onClick={onBack} className="grid size-9 cursor-pointer place-items-center rounded-full hover:bg-secondary">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
        ) : null}
        <span className="text-lg font-extrabold">Your queue</span>
      </div>
      {needs.map((q) => <NeedsYou key={q.tabId} item={q} />)}
      {busy.length ? (
        <section className={`${card} flex flex-col`}>
          <div className="flex items-center gap-2.5 px-4 py-3.5">
            <span className="odds-working"><OddsMark size={28} /></span>
            <span className="flex-1 text-[15px] font-extrabold">Odds is working on {busy.length}</span>
          </div>
          {busy.map((q) => line(q, <span className="text-xs font-bold text-brand-ink">Filling</span>, q.message))}
        </section>
      ) : null}
      {done.length ? (
        <section className={`${card} flex flex-col`}>
          <div className="flex items-center justify-between px-4 py-3"><span className="text-[15px] font-extrabold">Ready for you to send</span><span className="text-[13px] text-muted-foreground">each opens in its tab</span></div>
          {done.map((q) => line(q, <button type="button" onClick={() => show(q)} className="flex h-[34px] cursor-pointer items-center rounded-[10px] bg-foreground px-3 text-[13px] font-extrabold text-background">Open</button>))}
        </section>
      ) : null}
      {!queue.length ? <p className="px-1 text-sm text-muted-foreground">Nothing in the queue. Press Apply with Odds on a job and it goes here.</p> : null}
      <p className="mx-1 text-[13px] leading-snug text-muted-foreground">Odds keeps going while Chrome is open, in the Odds tab group of this window. It tells you when a check or a new account needs you.</p>
    </>
  )
}

/**
 * The form's answers Autofill did not have yet (Odds' and the person's own). They are kept in Autofill as soon as they show here, as the
 * person's own, and every one can be edited: the next form asking the same question gets it word for word.
 */
function SaveAnswers({ info }: { info: PanelInfo }): React.JSX.Element | null {
  const items = info.answers ?? []
  const [values, setValues] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [kept, setKept] = useState<Set<string>>(new Set())
  const tabId = info.page?.tabId
  const key = items.map((it) => it.question).join("\n")
  useEffect(() => {
    const fresh = items.filter((it) => !kept.has(it.question) && it.answer.trim())
    if (!fresh.length || tabId === undefined) return
    toExtension({ type: "panel-keep-answers", tabId, questions: fresh.map((it) => ({ question: it.question, answer: it.answer.trim() })) })
    setKept((was) => new Set([...was, ...fresh.map((it) => it.question)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tabId])
  if (!items.length) return null
  const save = (question: string, answer: string): void => {
    const text = answer.trim()
    if (text && tabId !== undefined) toExtension({ type: "panel-keep-answers", tabId, questions: [{ question, answer: text }] })
    setEditing(null)
  }

  return (
    <div className={`${card} flex flex-col gap-3 p-4`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-base font-bold"><span className="grid size-5 place-items-center rounded-full bg-good-foreground text-xs text-white">✓</span>Saved to Autofill</span>
        <span className="rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-bold text-brand-ink">{items.length} new</span>
      </div>
      <p className="text-sm text-muted-foreground">Your answers are saved. The next form fills them for you.</p>
      {items.map((it) => {
        const value = values[it.question] ?? it.answer

        return (
          <div key={it.question} className="flex flex-col gap-1.5 rounded-xl border-[1.5px] border-line p-3">
            <div className="flex items-start gap-2">
              <span className="flex-1 text-sm font-semibold text-muted-foreground">{it.question}</span>
              {editing === it.question ? null : <button type="button" onClick={() => setEditing(it.question)} className="cursor-pointer rounded-lg border-[1.5px] border-line px-3 py-1 text-sm font-bold hover:bg-accent">Edit</button>}
            </div>
            {editing === it.question ? (
              <>
                {it.long
                  ? <textarea rows={3} value={value} onChange={(e) => setValues({ ...values, [it.question]: e.target.value })} className="w-full rounded-lg border-2 border-brand bg-background p-2 text-sm" />
                  : <input value={value} onChange={(e) => setValues({ ...values, [it.question]: e.target.value })} className="h-10 w-full rounded-lg border-2 border-brand bg-background px-2 text-sm" />}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => save(it.question, value)}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setValues({ ...values, [it.question]: it.answer }); setEditing(null) }}>Cancel</Button>
                </div>
              </>
            ) : <div className="rounded-lg bg-background px-2.5 py-2 text-sm">{value}</div>}
          </div>
        )
      })}
      <a href="/autofill" className="text-sm font-bold text-brand-ink">Open all my Autofill answers ›</a>
    </div>
  )
}
