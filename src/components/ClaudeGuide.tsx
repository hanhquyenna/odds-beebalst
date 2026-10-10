import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CompanyLogo } from "@/components/CompanyMark"
import { ArrowLeftIcon, CheckIcon, CopyIcon, StarIcon, XIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { useDocumentStore } from "@/lib/documents"
import { formatPlace } from "@/lib/format"
import { useJobCompany } from "@/lib/job-company"
import { supabase } from "@/lib/supabase"
import type { Posting } from "@/lib/types"
import { useHearBackMap } from "@/lib/use-hear-back"

/**
 * odds in Claude. One click on "Connect Claude" makes the person a private link to the odds connector (supabase/functions/mcp,
 * ?key=, only a hash is kept: migrations/20261010140000_claude_private_link.sql), copies it and opens Claude's connector settings.
 * From then on Claude works with their own odds: their profile, their CVs and letters in Documents, their saved and applied jobs.
 * It can fill in an application from them (they press send), save a letter to Documents and mark a job applied.
 * The page shows what that looks like with the person's own jobs and documents, drawn the way the app draws them.
 */

const MCP_URL = "https://ukpmpyfcnbhngkgbnkxi.supabase.co/functions/v1/mcp"
const CLAUDE_CONNECTORS = "https://claude.ai/settings/connectors"

const card = "rounded-xl border-[1.5px] bg-card"

// ---- The private link ----

interface LinkState {
  status: "loading" | "none" | "on" | "signed-out"
  hint?: string
  lastUsed?: string | null
}

function useClaudeLink(): { state: LinkState; connect: () => Promise<string | null>; disconnect: () => Promise<void> } {
  const { session } = useData()
  const userId = session?.user.id ?? null
  // Kept with the account it was read for, so signing in as someone else never shows the last person's link.
  const [found, setFound] = useState<{ userId: string; state: LinkState } | null>(null)
  const setState = (next: LinkState): void => {
    if (userId) setFound({ userId, state: next })
  }

  useEffect(() => {
    if (!userId) return
    let live = true
    void Promise.resolve(supabase.from("mcp_keys").select("hint,last_used_at").maybeSingle()).then(({ data }) => {
      if (!live) return
      const row = data as { hint: string; last_used_at: string | null } | null
      setFound({ userId, state: row ? { status: "on", hint: row.hint, lastUsed: row.last_used_at } : { status: "none" } })
    })

    return () => {
      live = false
    }
  }, [userId])
  const state: LinkState = !userId ? { status: "signed-out" } : found?.userId === userId ? found.state : { status: "loading" }

  const connect = async (): Promise<string | null> => {
    const { data, error } = await supabase.rpc("create_mcp_key")
    if (error || typeof data !== "string") {
      toast.error("Could not make your link. Try again.")
      return null
    }
    setState({ status: "on", hint: data.slice(-4), lastUsed: null })

    return `${MCP_URL}?key=${data}`
  }
  const disconnect = async (): Promise<void> => {
    const { error } = await supabase.rpc("revoke_mcp_key")
    if (error) {
      toast.error("Could not disconnect. Try again.")
      return
    }
    setState({ status: "none" })
    toast.success("Claude is disconnected from your odds.")
  }

  return { state, connect, disconnect }
}

function when(iso: string | null | undefined): string {
  if (!iso) return "not used yet"
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)

  return days <= 0 ? "used today" : days === 1 ? "used yesterday" : `used ${days} days ago`
}

/** Connect, or the state of the connection: one button, then the one thing Claude asks for (pasting the link once). */
function ConnectCard({ onSignIn }: { onSignIn: () => void }): React.JSX.Element {
  const { state, connect, disconnect } = useClaudeLink()
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean>(false)
  const [busy, setBusy] = useState<boolean>(false)

  const copy = (text: string): void => {
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => setCopied(false),
    )
  }
  const start = async (): Promise<void> => {
    // Claude's settings open in a new tab straight from the tap (a tab opened after waiting would be blocked); the link is copied once it is made.
    window.open(CLAUDE_CONNECTORS, "_blank", "noopener")
    setBusy(true)
    const made = await connect()
    setBusy(false)
    if (made) {
      setLink(made)
      copy(made)
    }
  }

  if (state.status === "signed-out") {
    return (
      <div className={`${card} flex flex-col gap-3 p-5`}>
        <p className="font-semibold">Sign in to connect Claude</p>
        <p className="text-sm text-muted-foreground">Claude works with your own odds: your profile, your CVs and your saved jobs. Sign in first so it knows which ones are yours.</p>
        <Button type="button" onClick={onSignIn} className="w-fit cursor-pointer">
          Sign in
        </Button>
      </div>
    )
  }

  return (
    <div className={`${card} flex flex-col gap-4 p-5`}>
      {link ? (
        <>
          <p className="font-semibold">{copied ? "Your link is copied" : "Your link is ready"}</p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
            <li>
              In the Claude tab that just opened, choose <span className="font-medium">Add custom connector</span>.
            </li>
            <li>
              Name it <span className="font-medium">odds</span>, paste the link and press <span className="font-medium">Add</span>.
            </li>
            <li>That's it. Ask Claude anything below.</li>
          </ol>
          <div className="flex items-center gap-2 rounded-lg border-[1.5px] bg-secondary/40 py-1 pl-3 pr-1">
            <code className="min-w-0 flex-1 truncate text-sm">{link}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => copy(link)} className="shrink-0 cursor-pointer">
              {copied ? <CheckIcon className="size-4" aria-hidden="true" /> : <CopyIcon className="size-4" aria-hidden="true" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">This link is yours alone: anyone with it can work with your odds. We show it once. Claude didn't open? Go to claude.ai, then Settings and Connectors.</p>
        </>
      ) : state.status === "on" ? (
        <>
          <p className="flex items-center gap-2 font-semibold">
            <span className="size-2.5 rounded-full bg-good-foreground" aria-hidden="true" /> Claude is connected
          </p>
          <p className="text-sm text-muted-foreground">
            Your link ends in …{state.hint}, {when(state.lastUsed)}. Lost it, or connecting another app? Make a new one: the old one stops working.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void start()} className="cursor-pointer">
              Make a new link
            </Button>
            <Button type="button" variant="ghost" onClick={() => void disconnect()} className="cursor-pointer text-destructive">
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="font-semibold">Connect Claude to your odds</p>
          <p className="text-sm text-muted-foreground">One tap makes your private link, copies it and opens Claude. You paste it there once.</p>
          <Button type="button" disabled={busy || state.status === "loading"} onClick={() => void start()} className="w-fit cursor-pointer">
            {busy ? "Connecting…" : "Connect Claude"}
          </Button>
        </>
      )}
    </div>
  )
}

// ---- What it looks like, with your own jobs and documents ----

/** Your saved and applied jobs, as the list shows them; the newest jobs when you have none yet. */
function useShownJobs(): { jobs: Posting[]; yours: boolean } {
  const data = useData()
  const applied = new Set(data.applications.map((a) => a.posting_id))
  const mine = new Map<string, Posting>()
  for (const p of [...data.postings, ...data.keptExtra]) if ((data.saved.has(p.id) || applied.has(p.id)) && !mine.has(p.id)) mine.set(p.id, p)
  if (mine.size > 0) return { jobs: [...mine.values()].slice(0, 3), yours: true }

  return { jobs: data.postings.filter((p) => !p.local).sort((a, b) => (a.days_open ?? 1e9) - (b.days_open ?? 1e9)).slice(0, 3), yours: false }
}

/** A job the way the job list draws it: logo, title, company, the hear-back tag, place. */
function JobLine({ post, tagged, right }: { post: Posting; tagged?: boolean; right?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border-[1.5px] bg-background px-3 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center">
        <CompanyLogo employer={post.employer} name={post.employer_display} size={36} wide={1.3} url={post.url} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-1 text-sm font-semibold">{post.title}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="truncate">{post.employer_display}</span>
          {tagged ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border-[1.5px] border-good-foreground/40 bg-good-foreground/10 px-1.5 py-px text-xs font-semibold text-good-foreground">
              <span aria-hidden="true">★</span> Most likely to hear back
            </span>
          ) : null}
        </span>
        <span className="truncate text-xs text-muted-foreground">{formatPlace(post.region)}</span>
      </span>
      {right}
    </div>
  )
}

/** A document the way Documents draws it. */
function DocLine({ name, detail, main }: { name: string; detail: string; main?: boolean }): React.JSX.Element {
  return (
    <div className="rounded-lg border-[1.5px] bg-background px-3 py-2.5">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 truncate font-medium">{name}</span>
        {main ? <span className="rounded-md bg-brand/15 px-2 py-0.5 text-xs font-medium">Main</span> : null}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

const Pill = ({ children }: { children: React.ReactNode }): React.JSX.Element => <span className="shrink-0 rounded-md bg-good-foreground/10 px-2 py-0.5 text-xs font-semibold text-good-foreground">{children}</span>

/** One thing Claude does: what it is, what it looks like in odds, and how you'd ask. */
function Ability({ title, body, ask, children }: { title: string; body: string; ask: string; children: React.ReactNode }): React.JSX.Element {
  const [copied, setCopied] = useState<boolean>(false)
  const copy = (): void => {
    void navigator.clipboard.writeText(ask).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <li className={`${card} flex flex-col gap-3 p-4`}>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
      <button type="button" onClick={copy} className="mt-auto flex cursor-pointer items-start justify-between gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent">
        <span>“{ask}”</span>
        {copied ? <CheckIcon className="mt-0.5 size-4 shrink-0" aria-label="Copied" /> : <CopyIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Copy" />}
      </button>
    </li>
  )
}

function Stars({ value }: { value: number }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon key={i} weight={value >= i - 0.25 ? "fill" : "regular"} className={`size-3.5 ${value >= i - 0.25 ? "text-brand" : "text-muted-foreground/50"}`} aria-hidden="true" />
      ))}
    </span>
  )
}

/** The company's Glassdoor numbers, as the job page shows them. Nothing when there are none. */
function CompanyScore({ post }: { post: Posting }): React.JSX.Element | null {
  const company = useJobCompany(post.employer, post.employer_display)
  const rating = company?.glassdoor?.rating ?? company?.reviewStats?.overall ?? null
  if (rating === null) return null

  return (
    <div className="flex items-center gap-3 rounded-lg border-[1.5px] bg-background px-3 py-2.5 text-sm">
      <span className="text-2xl font-semibold tabular-nums">{rating.toFixed(1)}</span>
      <span className="flex flex-col">
        <Stars value={rating} />
        <span className="text-xs text-muted-foreground">
          {post.employer_display}
          {company?.glassdoor?.recommendPct ? ` · ${company.glassdoor.recommendPct}% would recommend it` : ""}
        </span>
      </span>
    </div>
  )
}

function Abilities(): React.JSX.Element {
  const data = useData()
  const { docs } = useDocumentStore()
  const { jobs, yours } = useShownJobs()
  const tags = useHearBackMap(data)
  const first = jobs[0]
  const cv = docs.find((d) => d.kind === "cv" && d.isMain) ?? docs.find((d) => d.kind === "cv")
  const cvName = cv?.name ?? "Your CV"
  const company = first?.employer_display ?? "the company"

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Ability title="Apply for you" body="Claude opens the job, fills in the employer's form with your details, your CV and your letter from Documents, and stops before sending. You check it and press send." ask={`Apply to the ${first ? first.title : "first job"} at ${company} with my main CV.`}>
        {first ? <JobLine post={first} right={<Pill>Ready to send</Pill>} /> : null}
        <DocLine name={cvName} detail="From your Documents · attached" main />
      </Ability>

      <Ability title="Knows your saved jobs" body={yours ? "Every job you saved or applied to, where each one stands, and your chance for each." : "Every job you save or apply to, where each one stands, and your chance for each."} ask="Which of my saved jobs should I apply to first, and why?">
        {jobs.slice(0, 2).map((p) => (
          <JobLine key={p.id} post={p} tagged={tags.has(p.id)} />
        ))}
      </Ability>

      <Ability title="Writes letters into your Documents" body="A cover letter from your own CV for the job you pick, saved to Documents and attached to that job, ready for you to edit." ask={`Write a cover letter for ${company} and save it to my Documents.`}>
        <DocLine name={`Cover letter ${company}`} detail={`Written with Claude · on ${first ? first.title : "the job"}`} />
      </Ability>

      <Ability title="Keeps your tracker up to date" body="Once you've sent an application, Claude marks it applied, so your Home stays right without you typing a thing." ask="I just sent it. Mark it applied.">
        {first ? <JobLine post={first} right={<Pill>Applied</Pill>} /> : null}
      </Ability>

      <Ability title="Prepares you for the interview" body="What people say about working there, how big the company is, where its people studied, and the questions to expect." ask={`I have an interview at ${company}. Help me prepare.`}>
        {first ? <CompanyScore post={first} /> : null}
      </Ability>

      <Ability title="Fits your CV to each job" body="For every saved job, what to move up on your CV, what to cut, and which words from the posting to use." ask="For each of my saved jobs, what should I change on my CV?">
        <DocLine name={cvName} detail={jobs.length > 1 ? `Checked against ${jobs.length} saved jobs` : "Checked against your saved jobs"} main />
      </Ability>
    </ul>
  )
}

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "What can Claude see?", a: "Once connected: your odds profile (from your LinkedIn and CV), your CVs and letters in Documents, your saved and applied jobs, and the public job list. Nothing else from your account." },
  { q: "What can it change?", a: "It can save a cover letter to your Documents, save a job and mark a job applied. It can't delete anything, and it never sends an application: you press send." },
  { q: "How do I stop it?", a: "Press Disconnect on this page. The link stops working at once." },
  { q: "Does it cost anything?", a: "Not from odds. You need a Claude plan that lets you add connectors. Filling in forms on a company's site uses Claude in Chrome." },
  { q: "How sure are the chances?", a: "They're estimates from hiring studies and how many people apply, the same as on the job pages. Use them to choose where to start, not as a promise." },
]

/** The page in the menu: connect in one tap, then what Claude can do with your odds, shown with your own jobs and documents. */
export function ClaudePage({ onBack, onSignIn }: { onBack: () => void; onSignIn: () => void }): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8 pb-10">
      <button type="button" onClick={onBack} className="flex w-fit cursor-pointer items-center gap-1 text-sm font-medium text-primary">
        <ArrowLeftIcon className="size-4" aria-hidden="true" /> Dashboard
      </button>

      <header className="grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Claude, working on your odds</h1>
          <p className="text-muted-foreground">Connect once. Claude then knows your saved jobs, uses the CVs and letters in your Documents, fills in applications for you to send, and keeps your tracker up to date.</p>
        </div>
        <ConnectCard onSignIn={onSignIn} />
      </header>

      <section>
        <h2 className="mb-4 font-heading text-xl font-medium tracking-tight">What Claude can do for you</h2>
        <Abilities />
      </section>

      <section>
        <h2 className="mb-4 font-heading text-xl font-medium tracking-tight">Good to know</h2>
        <ul className={`${card} divide-y-[1.5px]`}>
          {FAQ.map(({ q, a }) => (
            <li key={q} className="px-4 py-3.5">
              <p className="font-medium">{q}</p>
              <p className="mt-1 text-sm text-muted-foreground">{a}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const PROMO_KEY = "odds:claude-promo-hidden"

/** On Home, until closed or connected: Claude can apply for you, with the way to connect. */
export function ClaudePromo({ onOpen }: { onOpen: () => void }): React.JSX.Element | null {
  const { state } = useClaudeLink()
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PROMO_KEY) === "1"
    } catch {
      return false
    }
  })
  if (hidden || state.status === "on" || state.status === "loading") return null
  const hide = (): void => {
    setHidden(true)
    try {
      localStorage.setItem(PROMO_KEY, "1")
    } catch {
      // Private mode: it shows again next time, which is fine.
    }
  }

  return (
    <section aria-label="Claude on your odds" className={`${card} relative flex flex-col gap-3 p-4 pr-12`}>
      <div>
        <p className="font-semibold">Let Claude apply for you</p>
        <p className="text-sm text-muted-foreground">Connect Claude and it fills in applications with the CV in your Documents, writes your letters and keeps this list up to date.</p>
      </div>
      <Button type="button" onClick={onOpen} className="w-fit cursor-pointer">
        Connect Claude
      </Button>
      <button type="button" aria-label="Hide" onClick={hide} className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </section>
  )
}

/** On the profile: whether Claude is connected, and the way to the page. */
export function ClaudeProfileRow({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const { state } = useClaudeLink()

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">{state.status === "on" ? `Connected · link ending …${state.hint}, ${when(state.lastUsed)}` : "Not connected yet."}</p>
      <Button type="button" variant="outline" onClick={onOpen} className="shrink-0 cursor-pointer">
        {state.status === "on" ? "Manage" : "Connect Claude"}
      </Button>
    </div>
  )
}
