import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { CompanyLogo } from "@/components/CompanyMark"
import type { JobTab } from "@/components/JobDetail"
import { sourcesOf } from "@/components/SourceChips"
import { TailorFlow } from "@/components/TailorFlow"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { fetchKeptPostings } from "@/lib/jobs"
import { applySourceOf } from "@/lib/apply-source"
import { onPanelInfo, toExtension, type PanelInfo } from "@/lib/embed"
import { NO_WHAT_IF, point, standing } from "@/lib/engine"
import { formatAge } from "@/lib/format"
import type { Posting } from "@/lib/types"
import { useJobProfile, useJobStrength } from "@/lib/use-documents"

const JobDetail = lazy(() => import("@/components/JobDetail").then((m) => ({ default: m.JobDetail })))

/**
 * The extension's side panel on a job site (embedded only), laid out like a copilot's sidebar: how it stands on this page, the job
 * (logo, title, pay, people you know there), one odds button (Fill when the page has a form, else Track), and the CV card with the
 * interview chance and the recommendations that raise it. At review, the form's new answers can be kept in Autofill.
 */
export function ApplyPanel(): React.JSX.Element | null {
  const data = useData()
  const [info, setInfo] = useState<PanelInfo | null>(null)
  const [away, setAway] = useState<string | null>(null)
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
  const page = info?.page
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
  if (!page || !info?.connected || away === page.url) return null
  const post = known ?? (fetched && fetched.id === jobId ? fetched.post : null)
  // "See job insights" (the job, who got hired before, the company, people) and Tailor open that part of the job further down the panel.
  const open = (next: JobTab): void => {
    setTab({ tab: next, at: Date.now() })
    window.setTimeout(() => document.getElementById("job-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
  }

  return (
    <div data-apply-panel className="fixed inset-0 z-50 flex flex-col gap-3 overflow-y-auto bg-background p-3 [&>*]:shrink-0">
      <JobCard info={info} post={post} onInsights={post ? () => open("overview") : undefined} />
      <OddsButton info={info} post={post} />
      <SaveAnswers info={info} />
      {post ? <ChanceCard post={post} /> : null}
      <Attach info={info} post={post} />
      {post ? (
        <Suspense fallback={null}>
          <div className="pt-2"><JobDetail post={post} bare showTab={tab} onBack={() => setAway(page.url)} /></div>
        </Suspense>
      ) : null}
      <Button variant="ghost" size="sm" className="self-center" onClick={() => setAway(page.url)}>My jobs</Button>
    </div>
  )
}

/** The odds mark, as the app icon draws it: a black disc with a white ring and the orange dot. */
function OddsMark({ size = 28 }: { size?: number }): React.JSX.Element {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
      <circle cx="15" cy="17" r="13" fill="#1b1b1b" />
      <circle cx="15" cy="17" r="5.4" fill="none" stroke="#fff" strokeWidth="3" />
      <circle cx="25.5" cy="6.5" r="4" fill="var(--brand)" stroke="#1b1b1b" strokeWidth="1.5" />
    </svg>
  )
}

/** One line on how it stands: a form here or not, filling, ready, or what the person has to do. */
const KIND_STATUS: Record<string, [string, string]> = {
  job: ["brand", "Job page: Odds starts the application here"],
  create_account: ["brand", "This site needs an account"],
  sign_in: ["brand", "Sign in to continue"],
  captcha: ["bad", "Tick the check on the page: Odds carries on by itself"],
  form: ["brand", "Application form found"],
}

/** How it stands, said inside the orange button: filling, ready, what the person has to do, or what this page is. */
function statusLine(info: PanelInfo): string {
  const state = info.status?.state
  const message = (info.status?.message ?? "").replace(/^needs you:\s*/i, "").trim()
  if (state === "filling") return message || "Filling in your application…"
  if (state === "submitted") return "Applied"
  if (state === "ready" || state === "review") return "Check the form and press Submit yourself."
  if (state === "needs_input" || state === "failed" || state === "stuck") return message || "Odds needs you on the page."
  return KIND_STATUS[info.page!.kind ?? ""]?.[1] ?? (info.page!.form ? "Application form found" : "")
}

/** The button's face: the odds mark, what pressing does, and how it stands under it. */
function Face({ label, sub }: { label: string; sub: string }): React.JSX.Element {
  return (
    <>
      <OddsMark />
      <span className="flex min-w-0 flex-col items-start text-left">
        <span>{label}</span>
        {sub ? <span className="line-clamp-3 text-sm font-medium leading-snug opacity-80">{sub}</span> : null}
      </span>
    </>
  )
}

function JobCard({ info, post, onInsights }: { info: PanelInfo; post: Posting | null; onInsights?: () => void }): React.JSX.Element {
  const data = useData()
  const page = info.page!
  let host = ""
  try { host = new URL(page.url).hostname.replace(/^www\./, "") } catch { host = "" }
  const employer = post?.employer ?? (info.job?.employer || host)
  const name = post?.employer_display ?? (info.job?.employer || host)
  const title = post?.title ?? (info.job?.title || page.title || host)
  const age = post && !post.local ? formatAge(post) : ""
  const kept = post ? data.saved.has(post.id) || data.applications.some((a) => a.posting_id === post.id) : false
  const company = name.toLowerCase()
  const people = data.people.filter((p) => (post && p.jobId === post.id) || (company && p.company.toLowerCase() === company))

  return (
    <div className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card">
      <div className="flex items-start gap-3 p-3">
        <span className="flex size-12 shrink-0 items-center justify-center">
          <CompanyLogo employer={employer} name={name} size={48} wide={1.3} url={post?.url ?? page.url} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-3 leading-snug font-semibold">{title}</div>
          <div className="text-sm text-muted-foreground">{[name, age && age !== "Date not shown" ? age : ""].filter(Boolean).join(" · ")}</div>
          {post?.pay_posted ? <div className="mt-1 text-sm font-medium">{post.pay_posted}</div> : null}
        </div>
        {post ? (
          <button type="button" aria-label={kept ? "Tracked" : "Track this job"} aria-pressed={kept} onClick={() => data.setSaved(post.id, !kept)} className={`flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition ${kept ? "border-brand bg-brand text-foreground" : "border-foreground hover:bg-accent"}`}>
            <svg viewBox="0 0 24 24" className="size-4" fill={kept ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
          </button>
        ) : null}
      </div>
      {onInsights ? (
        <button type="button" onClick={onInsights} className="flex w-full cursor-pointer items-center gap-2 border-t-[1.5px] border-line px-3 py-3 text-left hover:bg-accent/60">
          <span className="flex-1 text-sm font-semibold">See job insights</span>
          {people.length ? (
            <span className="flex -space-x-2">
              {people.slice(0, 3).map((p) => p.photo
                ? <img key={p.id} src={p.photo} alt={p.name} className="size-7 rounded-full border-2 border-card object-cover" />
                : <span key={p.id} title={p.name} className="flex size-7 items-center justify-center rounded-full border-2 border-card bg-accent text-xs font-semibold">{p.name.charAt(0)}</span>)}
            </span>
          ) : <span aria-hidden="true">›</span>}
        </button>
      ) : null}
    </div>
  )
}

/**
 * The one odds button, Apply: on a page with a form it fills that form; on a job's page it applies with Odds in that same tab (the
 * employer's form opens there and is filled step by step). A page Odds does not hold as a job is tracked first. Odds never presses Submit.
 */
function OddsButton({ info, post }: { info: PanelInfo; post: Posting | null }): React.JSX.Element {
  const data = useData()
  const page = info.page!
  const [pressed, setPressed] = useState(false)
  const [adding, setAdding] = useState(false)
  const state = info.status?.state ?? null
  useEffect(() => { if (state) setPressed(false) }, [state])
  const look = "flex min-h-16 w-full cursor-pointer items-center justify-center gap-3 rounded-2xl bg-brand px-4 py-3 text-lg font-bold text-foreground shadow-sm transition hover:brightness-105 disabled:cursor-default disabled:opacity-60"
  const needs = state === "needs_input" || state === "failed" || state === "stuck"
  // The button names the state; the words under it are only for what the person has to do.
  const sub = needs ? statusLine(info) : ""
  const ready = state === "ready" || state === "review"
  const busy = pressed || state === "filling"
  const source = post ? applySourceOf(sourcesOf(post)) : null

  const kind = page.kind ?? null
  // An account step (like Simplify): Odds fills your email and a strong password it keeps for this site, presses the site's button,
  // then fills the application that follows in this tab. Sign-in uses the password Odds made here, or you type yours.
  if ((kind === "create_account" || kind === "sign_in") && state !== "filling") {
    const create = kind === "create_account"
    const label = create ? "Create account & Autofill" : page.account ? "Sign in & Autofill" : "Autofill after sign-in"
    return (
      <button type="button" disabled={pressed} onClick={() => { setPressed(true); toExtension({ type: "panel-account", tabId: page.tabId, create }); window.setTimeout(() => setPressed(false), 6000) }} className={`${look} ${pressed ? "" : "odds-fill-pulse"}`}>
        <Face label={pressed ? (create ? "Creating your account…" : "Signing in…") : label} sub={sub} />
      </button>
    )
  }
  if (kind === "job" && !state && !page.form) {
    return (
      <button type="button" disabled={pressed} className={`${look} ${pressed ? "" : "odds-fill-pulse"}`} onClick={() => {
        setPressed(true)
        if (post) data.setSaved(post.id, true)
        toExtension({ type: "apply-here", tabId: page.tabId, url: page.url, postingId: post?.id ?? null })
        window.setTimeout(() => setPressed(false), 6000)
      }}>
        <Face label={pressed ? "Starting…" : "Start application"} sub={sub} />
      </button>
    )
  }
  if (page.form || state) {
    return (
      <button type="button" disabled={busy} onClick={() => { setPressed(true); toExtension({ type: "panel-fill", tabId: page.tabId }) }} className={`${look} ${!state && !busy ? "odds-fill-pulse" : ""}`}>
        <Face label={busy ? "Filling…" : ready ? "Ready to send" : needs ? "Carry on with Odds" : state === "submitted" ? "Applied" : state ? "Apply again" : "Apply with Odds"} sub={sub} />
      </button>
    )
  }
  // A job Odds holds: Apply opens its application from here. The page in front is the job's own, so it is the way in when Odds has no
  // other apply link for it.
  if (post) {
    return (
      <button type="button" disabled={pressed} className={`${look} ${pressed ? "" : "odds-fill-pulse"}`} onClick={() => {
        setPressed(true)
        data.setSaved(post.id, true)
        toExtension({ type: "apply-here", tabId: page.tabId, url: source?.url ?? page.url, postingId: post.id })
        window.setTimeout(() => setPressed(false), 4000)
      }}>
        <Face label={pressed ? "Opening the application…" : "Apply with Odds"} sub={sub} />
      </button>
    )
  }

  return (
    <button type="button" disabled={adding} className={look} onClick={() => {
      setAdding(true)
      toExtension({ type: "panel-add-job", url: page.url })
      window.setTimeout(() => { void data.refreshPostings().finally(() => setAdding(false)) }, 2500)
    }}>
      <Face label={adding ? "Adding…" : "Track this job"} sub={sub} />
    </button>
  )
}

/** Like a resume score, but the interview chance: the ring, then the recommendations that raise it (tick one and the chance moves). */
function ChanceCard({ post }: { post: Posting }): React.JSX.Element | null {
  const data = useData()
  const profile = useJobProfile(post.id)
  const strength = useJobStrength(post)
  const referral = data.referrals.has(post.id)
  const st = useMemo(() => (data.reference && data.shares ? standing(post, profile, data.reference, data.shares, NO_WHAT_IF, referral, strength) : null), [post, profile, data.reference, data.shares, referral, strength])
  if (!st || st.needsProfile) return null
  const mid = st.rate?.mid ?? null
  // The ring is drawn against 10%: interview chances sit between about 1% and 10%.
  const fill = mid !== null ? Math.min(100, Math.round(mid * 1000)) : 0

  const R = 42
  const C = 2 * Math.PI * R
  // What the posting asks for that the CV already says, and what it does not say yet (the engine's checklist).
  const have = st.checklist.filter((c) => c.have).map((c) => c.skill).slice(0, 6)
  const missing = st.checklist.filter((c) => !c.have).map((c) => c.skill).slice(0, 6)

  return (
    <div className="flex flex-col gap-4 rounded-xl border-[1.5px] border-line bg-card p-4">
      <div className="flex items-center gap-4">
        <div className="relative grid size-[96px] shrink-0 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--secondary)" strokeWidth="12" />
            <circle cx="50" cy="50" r={R} fill="none" stroke="var(--brand)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(C * Math.max(fill, 3)) / 100} ${C}`} className="transition-[stroke-dasharray] duration-500" />
          </svg>
          <span className="relative text-2xl font-extrabold tracking-tight tabular-nums">{mid !== null ? point(mid) : "–"}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base font-bold">Interview chance</span>
          {mid !== null ? <span className="text-sm text-muted-foreground">{Math.max(1, Math.round(mid * 100))} in 100 similar applicants get a call</span> : null}
        </div>
      </div>
      {have.length ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-extrabold tracking-wider text-good-foreground uppercase">Already in your CV</span>
          <ul className="flex flex-wrap gap-1.5">{have.map((k) => <li key={k} className="rounded-full bg-good-foreground px-2.5 py-1 text-xs font-bold text-white">✓ {k}</li>)}</ul>
        </div>
      ) : null}
      {missing.length ? (
        <div className="flex flex-col gap-2 rounded-xl bg-brand/10 p-3">
          <span className="text-xs font-extrabold tracking-wider text-brand-ink uppercase">The posting insists on</span>
          <ul className="flex flex-wrap gap-1.5">{missing.map((k) => <li key={k} className="rounded-full border-[1.5px] border-dashed border-brand bg-card px-2.5 py-1 text-xs font-bold text-brand-ink">+ {k}</li>)}</ul>
        </div>
      ) : null}
    </div>
  )
}

/** What goes with the application: the CV as a file card (change it, or upload one), and the cover letter. */
function Attach({ info, post }: { info: PanelInfo; post: Posting | null }): React.JSX.Element {
  const go = (): void => window.location.assign("/documents")
  const file = (name: string | null | undefined, empty: string): React.JSX.Element => name ? (
    <button type="button" onClick={go} className="flex w-full cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-line px-3 py-3 text-left hover:bg-accent/60">
      <span className="flex h-12 w-10 shrink-0 items-end justify-center rounded-md bg-destructive/10 pb-1.5 text-[10px] font-extrabold text-destructive">PDF</span>
      <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm font-bold">{name}</span><span className="text-xs text-muted-foreground">Used for this application</span></span>
      <span className="rounded-lg border-[1.5px] border-line px-3 py-1.5 text-sm font-bold">Change</span>
    </button>
  ) : (
    <button type="button" onClick={go} className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-brand px-3 text-sm font-bold hover:bg-brand/10">{empty}</button>
  )

  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border-[1.5px] border-line bg-card p-4">
        <div className="text-base font-bold">Your CV</div>
        {file(info.cv, "Upload your CV")}
        {post ? <TailorFlow post={post} kind="cv" solid compact /> : null}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border-[1.5px] border-line bg-card p-4">
        <div className="text-base font-bold">Your cover letter</div>
        {file(info.letter, "Add a cover letter")}
        {post ? <TailorFlow post={post} kind="cover_letter" compact /> : null}
      </div>
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
    <div className="flex flex-col gap-3 rounded-xl border-[1.5px] border-line bg-card p-4">
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
