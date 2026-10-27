import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CompanyLogo } from "@/components/CompanyMark"
import { ArrowLeftIcon, ArrowRightIcon, BookmarkIcon, CheckIcon, ChevronDownIcon, CopyIcon, UploadIcon, XIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { useDocumentStore } from "@/lib/documents"
import { formatPlace } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import type { Posting } from "@/lib/types"

/**
 * odds in Claude. The person gives Claude the address of the odds connector (supabase/functions/mcp); Claude sends them to odds to sign in
 * and tap Allow (oauth.ts), and the page turns to Connected when Claude first uses it. Only a hash of the access key is kept
 * (migrations/20261010140000_claude_private_link.sql).
 * From then on Claude works with their own odds: their profile, their CVs and letters in Documents, their saved and applied jobs.
 * It can fill in an application from them (they press send), save a letter to Documents and mark a job applied.
 * The page walks through it in three steps with the person's own CVs and saved jobs: pick a CV, pick a job, copy the message.
 */

const MCP_URL = "https://gdavxkaioqlfvfunmtxd.supabase.co/functions/v1/mcp"
const CLAUDE_CONNECTORS = "https://claude.ai/settings/connectors"

const card = "rounded-xl border-[1.5px] bg-card"

/** Claude's mark (Simple Icons, CC0), in Claude's own orange. */
const CLAUDE_MARK = "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"

function ClaudeLogo({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Claude" className={className}>
      <path d={CLAUDE_MARK} fill="#D97757" />
    </svg>
  )
}


// ---- The connection ----

interface LinkState {
  status: "loading" | "none" | "on" | "signed-out" | "error"
  hint?: string
  lastUsed?: string | null
}

/**
 * Whether Claude is connected: a row in mcp_keys is made when the person taps Allow (supabase/functions/mcp/oauth.ts), and it counts as
 * connected once Claude has used it. Until then the page keeps looking, so it turns to "Connected" by itself when Claude arrives.
 */
function useClaudeLink(): { state: LinkState; disconnect: () => Promise<void>; retry: () => void } {
  const { session } = useData()
  const userId = session?.user.id ?? null
  // Kept with the account it was read for, so signing in as someone else never shows the last person's state.
  const [found, setFound] = useState<{ userId: string; state: LinkState } | null>(null)
  const [round, setRound] = useState<number>(0)
  const setState = (next: LinkState): void => {
    if (userId) setFound({ userId, state: next })
  }

  const read = (live: () => boolean, quiet: boolean): void => {
    if (!userId) return
    // A request that never answers would leave the page waiting for good: after 10 seconds it says so and offers a retry.
    void Promise.resolve(supabase.from("mcp_keys").select("hint,last_used_at").abortSignal(AbortSignal.timeout(10_000)).maybeSingle()).then(
      ({ data, error }) => {
        if (!live()) return
        const row = data as { hint: string; last_used_at: string | null } | null
        if (error) {
          if (!quiet) setFound({ userId, state: { status: "error" } })
          return
        }
        setFound({ userId, state: row ? { status: "on", hint: row.hint, lastUsed: row.last_used_at } : { status: "none" } })
      },
      () => live() && !quiet && setFound({ userId, state: { status: "error" } }),
    )
  }

  useEffect(() => {
    let alive = true
    read(() => alive, false)

    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, round])
  const state: LinkState = !userId ? { status: "signed-out" } : found?.userId === userId ? found.state : { status: "loading" }

  // Not connected yet (or Claude has not used it yet): look every few seconds, so the page turns to "Connected" by itself.
  const waiting = state.status === "none" || (state.status === "on" && !state.lastUsed)
  useEffect(() => {
    if (!userId || !waiting) return
    let alive = true
    const timer = window.setInterval(() => read(() => alive, true), 3000)

    return () => {
      alive = false
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, waiting])

  const disconnect = async (): Promise<void> => {
    const { error } = await supabase.rpc("revoke_mcp_key")
    if (error) {
      toast.error("Could not disconnect. Try again.")
      return
    }
    setState({ status: "none" })
    toast.success("Claude is disconnected from your odds.")
  }

  const retry = (): void => {
    setFound(null)
    setRound((n) => n + 1)
  }

  return { state, disconnect, retry }
}

function when(iso: string | null | undefined): string {
  if (!iso) return "not used yet"
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)

  return days <= 0 ? "used today" : days === 1 ? "used yesterday" : `used ${days} days ago`
}

/** Connect, or the state of the connection. Claude is given only the address; it sends the person to odds to sign in and tap Allow. */
function ConnectCard({ onSignIn }: { onSignIn: () => void }): React.JSX.Element {
  const { state, disconnect, retry } = useClaudeLink()
  const [copied, setCopied] = useState<boolean>(false)
  const [opened, setOpened] = useState<boolean>(false)
  const used = state.status === "on" && Boolean(state.lastUsed)
  const [wasUsed, setWasUsed] = useState<boolean>(used)
  // The first time Claude reaches odds while this page is open.
  useEffect(() => {
    if (used && !wasUsed) toast.success("Claude is connected to your odds.")
    setWasUsed(used)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [used])

  const copy = (): void => {
    void navigator.clipboard.writeText(MCP_URL).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      },
      () => setCopied(false),
    )
  }

  if (state.status === "signed-out") {
    return (
      <div className={`${card} flex flex-col gap-3 p-5`}>
        <p className="font-semibold">Sign in first</p>
        <p className="text-sm text-muted-foreground">Sign in to connect Claude.</p>
        <Button type="button" onClick={onSignIn} className="w-fit cursor-pointer">
          Sign in
        </Button>
      </div>
    )
  }

  return (
    <div className={`${card} flex flex-col gap-4 p-5`}>
      {state.status === "error" ? (
        <>
          <p className="font-semibold">We couldn't check your connection</p>
          <p className="text-sm text-muted-foreground">Our server took too long to answer. Check your internet and try again.</p>
          <Button type="button" variant="outline" onClick={retry} className="w-fit cursor-pointer">
            Try again
          </Button>
        </>
      ) : used ? (
        <>
          <div className="flex items-center gap-3">
            <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl border-[1.5px] bg-background">
              <ClaudeLogo className="size-7" />
              <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-good-foreground text-white ring-2 ring-card">
                <CheckIcon weight="bold" className="size-3" aria-hidden="true" />
              </span>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">Connected</span>
              <span className="text-sm text-muted-foreground">Claude has your odds, {when(state.lastUsed)}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => void disconnect()} className="cursor-pointer text-destructive">
              Disconnect
            </Button>
          </div>
        </>
      ) : state.status === "loading" ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border-[1.5px] bg-background">
              <ClaudeLogo className="size-7" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 font-semibold">
                <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-brand" />
                Not connected yet
              </span>
              <span className="text-sm text-muted-foreground">This page turns to Connected by itself.</span>
            </span>
          </div>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>
              Copy odds' address:
              <div className="mt-1.5 flex items-center gap-2 rounded-lg border-[1.5px] bg-secondary/40 py-1 pl-3 pr-1">
                <code className="min-w-0 flex-1 truncate text-sm">{MCP_URL}</code>
                <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0 cursor-pointer">
                  {copied ? <CheckIcon className="size-4" aria-hidden="true" /> : <CopyIcon className="size-4" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </li>
            <li>
              In Claude, tap <span className="font-medium">Add custom connector</span>, type <span className="font-medium">odds</span> as the name, paste the address and tap <span className="font-medium">Add</span>.
            </li>
            <li>
              Claude opens odds. Sign in, tap <span className="font-medium">Allow</span>, done.
            </li>
          </ol>
          <Button
            type="button"
            onClick={() => {
              window.open(CLAUDE_CONNECTORS, "_blank", "noopener")
              setOpened(true)
            }}
            className="w-fit cursor-pointer"
          >
            {opened ? "Open Claude again" : "Open Claude settings"}
          </Button>
        </>
      )}
    </div>
  )
}

// ---- What to ask Claude: pick a CV, pick a job, copy the message ----

/** Your saved and applied jobs, newest first. */
function useMyJobs(): Posting[] {
  const data = useData()
  const applied = new Set(data.applications.map((a) => a.posting_id))
  const mine = new Map<string, Posting>()
  for (const p of [...data.postings, ...data.keptExtra]) if ((data.saved.has(p.id) || applied.has(p.id)) && !mine.has(p.id)) mine.set(p.id, p)

  return [...mine.values()]
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex flex-col gap-2.5">
      <p className="flex items-center gap-2.5 font-semibold">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs text-background tabular-nums">{n}</span>
        {title}
      </p>
      <div className="flex flex-col gap-2 pl-8.5">{children}</div>
    </li>
  )
}

/** "PDF", "DOCX"… from the file name, for the little file drawing. */
function fileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toUpperCase() ?? ""

  return ext.length > 0 && ext.length <= 4 ? ext : "FILE"
}

/** A small drawing of a page, like the file itself. */
function Paper({ type, faded = false }: { type: string; faded?: boolean }): React.JSX.Element {
  return (
    <span aria-hidden="true" className={`relative flex h-12 w-10 shrink-0 flex-col gap-1 rounded-md border-[1.5px] bg-white px-1.5 pt-2 shadow-sm ${faded ? "opacity-60" : ""}`}>
      <span className="h-1 w-4 rounded-full bg-neutral-400" />
      <span className="h-0.5 w-full rounded-full bg-neutral-200" />
      <span className="h-0.5 w-full rounded-full bg-neutral-200" />
      <span className="h-0.5 w-3/4 rounded-full bg-neutral-200" />
      <span className="absolute -right-1.5 bottom-1 rounded bg-brand px-1 py-px text-[8px] font-bold text-white">{type}</span>
    </span>
  )
}

/** What a step shows when there is nothing to choose yet: a picture, one line, and the way to add one. */
function Empty({ picture, title, body, children }: { picture: React.ReactNode; title: string; body: string; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3.5 rounded-lg border-[1.5px] border-dashed bg-background/60 p-3.5">
      {picture}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-sm text-muted-foreground">{body}</span>
        </span>
        {children}
      </span>
    </div>
  )
}

const choice = "flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border-[1.5px] bg-background px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-secondary/60"
const chosen = "border-foreground ring-1 ring-foreground"

/** The message to paste into Claude, with one tap to copy it. */
function Message({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState<boolean>(false)
  const copy = (): void => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }

  // Drawn like the box you type in on claude.ai, so it is clear where the message goes.
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-[1.5px] bg-background p-3.5 shadow-sm">
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <ClaudeLogo className="size-4" /> Message to Claude
      </p>
      <p className="text-[0.95rem] leading-relaxed">{text}</p>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="sm" onClick={copy} className="cursor-pointer rounded-full px-3.5">
          {copied ? <CheckIcon className="size-4" aria-hidden="true" /> : <CopyIcon className="size-4" aria-hidden="true" />}
          {copied ? "Copied. Paste it in Claude" : "Copy message"}
        </Button>
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-lg bg-[#D97757] text-white">
          <ArrowRightIcon weight="bold" className="size-4 -rotate-90" />
        </span>
      </div>
    </div>
  )
}

type Task = "apply" | "cv" | "letter" | "reach" | "find"

const TASKS: ReadonlyArray<{ id: Task; label: string }> = [
  { id: "apply", label: "Apply for a job" },
  { id: "cv", label: "Make a CV for a job" },
  { id: "letter", label: "Write a cover letter" },
  { id: "reach", label: "Message people there" },
  { id: "find", label: "Find jobs" },
]

function Tasks({ onDocuments, onJobs }: { onDocuments?: () => void; onJobs?: () => void }): React.JSX.Element {
  const { docs } = useDocumentStore()
  const jobs = useMyJobs()
  const cvs = docs.filter((d) => d.kind === "cv")
  const [task, setTask] = useState<Task>("apply")
  const [cvId, setCvId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const cv = cvs.find((d) => d.id === cvId) ?? cvs.find((d) => d.isMain) ?? cvs[0] ?? null
  const job = jobs.find((p) => p.id === jobId) ?? jobs[0] ?? null
  const needsJob = task !== "find"

  const cvName = cv ? `my CV "${cv.name}"` : "my CV"
  const jobName = job ? `${job.title} at ${job.employer_display}` : "this job"
  const message =
    task === "apply"
      ? `Prepare the application for ${jobName}${job ? ` (job_id: ${job.id})` : ""} using ${cvName}${cv ? ` (document_id: ${cv.id})` : ""}. Attach that CV to the job, then use prepare_application to fill it in my connected desktop Chrome. Use application_status to check the actual progress and tell me if my desktop is offline. If it needs me to sign in or make an account, stop and tell me, and carry on when I say so. Stop before sending so I can check it.`
      : task === "cv"
        ? `Make a CV for ${jobName} from ${cvName}. Keep everything true, choose and reword what fits the job, save it to my Documents and put it on that job.`
        : task === "letter"
          ? `Write a cover letter for ${jobName} using ${cvName}, and save it to my Documents.`
          : task === "reach"
            ? `Look at the people I keep for ${jobName} and write a short, honest message to each one, using ${cvName}. Save them as drafts. I will tell you which ones to send.`
            : `Find internships and first jobs in the Netherlands that fit ${cvName} and don't need Dutch.`

  return (
    <div className={`${card} flex flex-col gap-5 p-4 sm:p-5`}>
      <div role="tablist" aria-label="What do you want Claude to do?" className="grid grid-cols-2 gap-1 sm:grid-cols-5 rounded-lg border-[1.5px] p-1 text-sm font-medium">
        {TASKS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={task === t.id}
            onClick={() => setTask(t.id)}
            className={`cursor-pointer rounded-md px-1 py-2 leading-tight ${task === t.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ol className="flex flex-col gap-5">
        <Step n={1} title={task === "cv" ? "Choose the CV to start from" : "Choose a CV from your Documents"}>
          {cvs.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {cvs.map((d) => (
                <button key={d.id} type="button" aria-pressed={cv?.id === d.id} onClick={() => setCvId(d.id)} className={`${choice} ${cv?.id === d.id ? chosen : ""}`}>
                  <Paper type={fileType(d.fileName)} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{d.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{d.fileName}</span>
                  </span>
                  {d.isMain ? <span className="shrink-0 rounded-md bg-brand/15 px-2 py-0.5 text-xs font-medium">Main</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <Empty picture={<Paper type="PDF" faded />} title="No CV yet" body="Upload a CV in Documents, for example one for marketing and one for finance.">
              {onDocuments ? (
                <Button type="button" size="sm" onClick={onDocuments} className="cursor-pointer rounded-full px-3.5">
                  <UploadIcon className="size-4" aria-hidden="true" /> Upload a CV
                </Button>
              ) : null}
            </Empty>
          )}
        </Step>

        {needsJob ? (
          <Step n={2} title="Choose the job">
            {jobs.length > 0 ? (
              <div className="flex flex-col gap-2">
                {jobs.slice(0, 6).map((p) => (
                  <button key={p.id} type="button" aria-pressed={job?.id === p.id} onClick={() => setJobId(p.id)} className={`${choice} ${job?.id === p.id ? chosen : ""}`}>
                    <span className="flex size-8 shrink-0 items-center justify-center">
                      <CompanyLogo employer={p.employer} name={p.employer_display} size={32} wide={1.3} url={p.url} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{p.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {p.employer_display} · {formatPlace(p.region)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                picture={
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand/15">
                    <BookmarkIcon weight="fill" className="size-5 text-brand" aria-hidden="true" />
                  </span>
                }
                title="No saved jobs yet"
                body="Tap the bookmark on any job and it shows up here."
              >
                {onJobs ? (
                  <Button type="button" size="sm" variant="outline" onClick={onJobs} className="cursor-pointer rounded-full px-3.5">
                    Go to Jobs
                  </Button>
                ) : null}
              </Empty>
            )}
          </Step>
        ) : null}

        <Step n={needsJob ? 3 : 2} title="Copy this and send it to Claude">
          <Message text={message} />
          {task === "apply" ? <p className="text-xs text-muted-foreground">You press send.</p> : null}
          {task === "cv" || task === "letter" ? <p className="text-xs text-muted-foreground">Saved to Documents.</p> : null}
          {task === "reach" ? <p className="text-xs text-muted-foreground">The drafts show under each person. Nothing goes out until you approve it.</p> : null}
        </Step>
      </ol>
    </div>
  )
}

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  { q: "What is Claude?", a: "An AI assistant made by Anthropic, at claude.ai. You chat with it the way you'd text a person. It works on the web, in the desktop app and in the phone app, and once you connect odds it works in all of them." },
  { q: "What can Claude see?", a: "Your odds profile, the CVs and cover letters in your Documents, and the jobs you saved or applied to. Nothing else from your account." },
  { q: "Can it send an application by itself?", a: "No. It fills in the form and stops. You always check it and press send yourself." },
  { q: "Can Claude send my messages on LinkedIn?", a: "Only the ones you approve. It writes drafts first. Tap Let Claude send it on a draft, or tell Claude to send it, and it sends from your own LinkedIn in your browser, at most ten a day and a little apart. LinkedIn does not like automatic activity, so keep it small. If LinkedIn shows a warning, Claude stops." },
  { q: "What if a website asks me to sign in?", a: "Claude stops and tells you. You sign in on that page yourself, then tell Claude to carry on. It never types your password or makes an account for you." },
  { q: "What can it change?", a: "It can save a CV or a cover letter to your Documents, keep the answers forms ask for, save message drafts, save a job, and mark a job as applied or a message as sent. It can't delete anything." },
  { q: "How do I disconnect?", a: "Tap Disconnect at the top of this page. Claude loses access straight away." },
  { q: "Does it cost money?", a: "odds is free. On Claude's side you need a plan that lets you add custom connectors. To fill in forms on company websites, Claude also uses Claude in Chrome." },
  { q: "How sure are the chances?", a: "They're estimates, the same as on the job pages: based on hiring research and how many people apply. Use them to decide where to start, not as a promise." },
]

/** The page in the menu: connect in one tap, then what Claude can do with your odds, shown with your own jobs and documents. */
export function ClaudePage({ onBack, onSignIn, onDocuments, onJobs }: { onBack: () => void; onSignIn: () => void; onDocuments?: () => void; onJobs?: () => void }): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8 pb-10">
      <button type="button" onClick={onBack} className="flex w-fit cursor-pointer items-center gap-1 text-sm font-medium text-primary">
        <ArrowLeftIcon className="size-4" aria-hidden="true" /> Dashboard
      </button>

      <header className="grid grid-cols-1 items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Let Claude help you apply</h1>
          <p className="text-muted-foreground">Claude applies to your saved jobs with the CVs in your Documents.</p>
        </div>
        <ConnectCard onSignIn={onSignIn} />
      </header>

      <section>
        <h2 className="font-heading text-xl font-medium tracking-tight">Use Claude in 3 steps</h2>
        <Tasks onDocuments={onDocuments} onJobs={onJobs} />
      </section>

      <section>
        <h2 className="mb-4 font-heading text-xl font-medium tracking-tight">Good to know</h2>
        <ul className="flex flex-col border-t-[1.5px]">
          {FAQ.map(({ q, a }) => (
            <li key={q} className="border-b-[1.5px]">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-medium [&::-webkit-details-marker]:hidden">
                  <span className="underline decoration-1 underline-offset-4 group-open:no-underline">{q}</span>
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="pb-4 text-muted-foreground">{a}</p>
              </details>
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
  if (hidden || (state.status === "on" && state.lastUsed) || state.status === "loading" || state.status === "error") return null
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
        <p className="font-semibold">Let Claude help you apply</p>
        <p className="text-sm text-muted-foreground">Claude writes your cover letters and fills in applications. You press send.</p>
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
      <p className="text-sm">{state.status === "on" && state.lastUsed ? `Connected, ${when(state.lastUsed)}.` : "Not connected yet."}</p>
      <Button type="button" variant="outline" onClick={onOpen} className="shrink-0 cursor-pointer">
        {state.status === "on" && state.lastUsed ? "Manage" : "Connect Claude"}
      </Button>
    </div>
  )
}
