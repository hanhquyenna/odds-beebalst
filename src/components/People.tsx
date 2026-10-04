import { PersonAvatar } from "@/components/PersonAvatar"
import { useMemo, useState } from "react"
import { CompanyLogo } from "@/components/CompanyMark"
import { ChevronDownIcon, ExternalLinkIcon, InfoIcon, MessageIcon, PlusIcon, TrashIcon, XIcon } from "@/components/icons"
import { Section } from "@/components/Section"
import { Button, buttonVariants } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { suggestReferrals } from "@/lib/linkedin"
import { useRemembered } from "@/lib/remembered"
import { PersonPanel } from "@/components/PersonPanel"
import { WhyDeck } from "@/components/WhyDeck"
import logoUrl from "@/logo.svg"
import { departmentOf } from "@/lib/field"
import { MIND_MAP, SOURCES, type MapNode } from "@/lib/outreach-strategy"
import { openResearch } from "@/lib/research-link"
import { addPage, canFindMore, dropPerson, firstPage, hasFree, isUrl, linkedinHref, linkedinPeopleSearch, rankForJob, readPast, revealNext, whyThisPerson, type Suggestion } from "@/lib/suggest"
import { saved } from "@/lib/saved"
import { templatesOf } from "@/lib/templates"
import { useFollowDays } from "@/lib/follow-days"
import { useViewConfig } from "@/lib/views"
import { PeopleCalendar } from "@/components/TrackerCalendar"
import { PeopleFilterBar } from "@/components/PeopleFilterBar"
import { PeopleTable } from "@/components/PeopleTable"
import { ToolBar } from "@/components/ToolBar"
import { ViewTabs } from "@/components/ViewTabs"
import { applyPeopleFilter, isPeopleFilterOn } from "@/lib/people-table"
import type { usePeopleViews } from "@/lib/use-people-views"
import { formatPlace } from "@/lib/format"
import { STAGES, nextStep, stamp } from "@/lib/outreach-stage"
import { CONTACT_STATUSES, MESSAGE_KINDS, type ContactStatus, type MessageKind, type MessageTemplate, type PastSearch, type Person, type Posting } from "@/lib/types"

/**
 * A button in the toolbar above the list: white with an outline, the same height as Jobs, List and Sort beside it.
 * Pressed, it turns black, so it is plain which panel is open. Every button here uses this one style.
 */
export function ToolButton({ pressed, onClick, label, children }: { pressed: boolean; onClick: () => void; label?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg border-[1.5px] px-3.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px ${
        pressed ? "border-foreground bg-foreground text-background hover:bg-foreground/85" : "bg-card hover:border-foreground/40 hover:bg-accent"
      }`}
    >
      {children}
    </button>
  )
}

/** Why reaching out matters, as a short slide deck that is the whole panel: the link above it carries the question, so the panel has no title of its own. Closes with the X (a white round button, so it shows on the black and orange slides too) and stays closed on later visits until it is opened again from its link. */
function WhyOutreach({ onClose }: { onClose: () => void }): React.JSX.Element {
  return (
    <section aria-label="Why reach out" className="relative max-w-3xl overflow-hidden rounded-xl border-[1.5px] border-brand/40 bg-card">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 flex size-11 cursor-pointer items-center justify-center rounded-full bg-card text-foreground shadow-md ring-1 ring-foreground/15 transition-colors hover:bg-foreground hover:text-background"
      >
        <XIcon className="size-5" aria-hidden="true" />
      </button>
      <WhyDeck />
    </section>
  )
}

/** An arrow pointing down: the order the steps go in. */
function Arrow(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 30" className="h-7 w-3 shrink-0 text-brand">
      <path d="M6 0v26M1.5 21 6 27l4.5-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Words to copy. The whole block is the button: hover it and it lifts and says Copy in the corner, press it and it says Copied. There is no
 * separate button to find. On a touch screen, where there is no hover, the label is always there.
 */
function CopyBlock({ text, id, copied, onCopy, children }: { text: string; id: string; copied: string | null; onCopy: (text: string, id: string) => void; children?: React.ReactNode }): React.JSX.Element {
  const done = copied === id

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Copy: ${text.slice(0, 48).replace(/\n/g, " ")}`}
      onClick={() => onCopy(text, id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onCopy(text, id)
        }
      }}
      className="group relative w-full cursor-copy rounded-lg border-[1.5px] bg-background px-3 py-2.5 pr-16 text-left text-sm whitespace-pre-line transition-colors duration-150 outline-none hover:border-brand/60 hover:bg-accent/50 focus-visible:border-brand focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {children ?? text}
      <span className={`absolute top-2.5 right-3 text-xs font-medium transition-opacity duration-150 ${done ? "text-brand opacity-100" : "text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100"}`}>{done ? "Copied" : "Copy"}</span>
    </div>
  )
}

/** "see example" as an underlined link; pressed, the words open right under it, ready to copy. */
function Peek({ label, id, text, numbered, copied, onCopy, children }: { label: string; id: string; text?: string; numbered?: ReadonlyArray<string>; copied: string | null; onCopy: (text: string, id: string) => void; children?: React.ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const copyText = numbered ? numbered.map((l, i) => `${i + 1}. ${l}`).join("\n") : (text ?? "")

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="cursor-pointer text-sm font-medium underline underline-offset-4 transition-colors hover:text-brand">
        {open ? `hide ${label.replace(/^see /, "")}` : label}
      </button>
      {open ? (
        <div className="flex w-full flex-col gap-1.5 text-left">
          <CopyBlock text={copyText} id={id} copied={copied} onCopy={onCopy}>
            {numbered ? (
              <ol className="flex list-decimal flex-col gap-1 pl-4 marker:text-muted-foreground">
                {numbered.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ol>
            ) : undefined}
          </CopyBlock>
          {children}
        </div>
      ) : null}
    </div>
  )
}

const CARD = "rounded-2xl border-[1.5px] border-foreground/10 bg-background shadow-sm"

/** A step: a white card with an orange number (or the bare odds mark), the words, and whatever opens from it. */
function Step({ node, mark, dashed = false, children }: { node: MapNode; mark?: React.ReactNode; dashed?: boolean; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className={`flex w-full max-w-[19rem] flex-col items-center gap-1.5 p-4 text-center ${dashed ? "rounded-2xl border-[1.5px] border-dashed border-brand/60 bg-background/70" : CARD}`}>
      {mark ?? (node.step === "2" ? <Tick yes={!dashed} size="size-9" /> : <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-base font-semibold text-background tabular-nums">{node.step}</span>)}
      <p className="font-semibold">{node.title}</p>
      <p className="text-sm text-muted-foreground">{node.caption}</p>
      {children}
    </div>
  )
}

/** The tick in a circle: solid for yes, outlined for no. */
function Tick({ yes, size = "size-7" }: { yes: boolean; size?: string }): React.JSX.Element {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${size} ${yes ? "bg-brand text-background" : "border-2 border-brand text-brand"}`}>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4">
        <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/** What a yes or a no leads to: a card with a tick, solid for yes, dashed for no. Both end in something gained. */
function Outcome({ node, yes }: { node: MapNode; yes: boolean }): React.JSX.Element {
  return (
    <div className="relative flex w-full max-w-[19rem] justify-center">
      <div className={`flex w-full flex-col items-center gap-1.5 p-4 text-center ${yes ? `${CARD} border-brand/50` : "rounded-2xl border-[1.5px] border-dashed border-brand/60 bg-background/70"}`}>
        <Tick yes={yes} />
        <p className="font-semibold">{node.title}</p>
        <p className="text-sm text-muted-foreground">{node.caption}</p>
      </div>
      {yes ? null : <p aria-hidden="true" className="absolute top-1/2 left-full ml-4 hidden w-32 -translate-y-1/2 rotate-3 text-lg leading-snug font-medium text-brand-ink italic lg:block">a win is a win!!!</p>}
    </div>
  )
}

const LINE = "w-0.5 bg-brand/50"

/** Two ways forward from one step: a bar, two lines (each can carry a word, like yes or no), the two cards, and a bar that joins them again. */
function Fork({ left, right }: { left: { label?: string; body: React.ReactNode }; right: { label?: string; body: React.ReactNode } }): React.JSX.Element {
  const side = ({ label, body }: { label?: string; body: React.ReactNode }): React.JSX.Element => (
    <div className="flex flex-col items-center">
      <span className="flex h-7 flex-col items-center">
        <span aria-hidden="true" className={`flex-1 ${LINE}`} />
        {label ? <span className="-mb-1 rounded bg-background px-1.5 text-xs font-semibold tracking-wide text-brand-ink uppercase">{label}</span> : null}
      </span>
      {body}
      <span aria-hidden="true" className={`mt-auto h-5 ${LINE}`} />
    </div>
  )

  return (
    <div className="relative grid w-full grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
      <span aria-hidden="true" className="absolute top-0 right-1/4 left-1/4 hidden h-0.5 bg-brand/50 sm:block" />
      {side(left)}
      {side(right)}
      <span aria-hidden="true" className="absolute right-1/4 bottom-0 left-1/4 hidden h-0.5 bg-brand/50 sm:block" />
    </div>
  )
}

/**
 * The plan as a mind map, drawn as a flow. The goal sits in the middle in solid ink, orange arrows run down the steps in order, and the
 * path forks twice: found one or none (step 2), and the referral answered yes or no (step 4). Both answers end in something gained, then
 * the log in odds. What to do when it stalls hangs underneath in dashes. Colours: white cards on a warm, dotted canvas, ink for the goal,
 * orange for the path. Words that need room open from underlined links.
 */
function MindMap({ copied, onCopy }: { copied: string | null; onCopy: (text: string, id: string) => void }): React.JSX.Element {
  const { goal, find, yes, no, reply, ask, refYes, refNo, log, stalls } = MIND_MAP
  const way = (node: MapNode, id: string, dashed = false): React.JSX.Element => (
    <Step node={node} dashed={dashed}>
      <Peek label="see example" id={id} text={node.example as string} copied={copied} onCopy={onCopy}>
        {node.swap ? <p className="text-xs text-muted-foreground">{node.swap}</p> : null}
      </Peek>
    </Step>
  )

  return (
    <div role="group" aria-label="The plan in five steps" className="relative flex justify-center">
      <div className="flex w-full min-w-0 max-w-[40rem] flex-col items-center px-1 py-2">
        <div className="flex size-28 items-center justify-center rounded-full bg-foreground px-4 text-center text-sm leading-snug font-semibold text-background shadow-md">{goal}</div>
        <Arrow />
        <div className="relative flex w-full max-w-[19rem] justify-center">
          <Step node={find} />
          <p aria-hidden="true" className="absolute top-3 right-full mr-5 hidden w-40 -rotate-6 text-right text-lg leading-snug font-medium text-brand-ink italic md:block">we believe outreaching is a numbers game too</p>
        </div>
        <span aria-hidden="true" className={`h-1 ${LINE}`} />
        <Fork left={{ label: "yes", body: way(yes, "map-yes") }} right={{ label: "no", body: way(no, "map-no", true) }} />
        <Arrow />
        <Step node={reply}>
          <Peek label="see questions" id="map-questions" numbered={reply.questions ?? []} copied={copied} onCopy={onCopy} />
        </Step>
        <Arrow />
        <Step node={ask}>
          <Peek label="see example" id="map-ask" text={ask.example as string} copied={copied} onCopy={onCopy} />
        </Step>
        <span aria-hidden="true" className={`h-1 ${LINE}`} />
        <Fork left={{ label: "yes", body: <Outcome node={refYes} yes /> }} right={{ label: "no", body: <Outcome node={refNo} yes={false} /> }} />
        <Arrow />
        <Step node={log} mark={<img src={logoUrl} alt="odds" className="size-12" />} />

        <div className="relative mt-4 flex h-12 w-full justify-center">
          <span aria-hidden="true" className="h-full w-0.5 border-l-2 border-dashed border-brand/50" />
          <p aria-hidden="true" className="absolute top-1/2 left-1/2 ml-5 -translate-y-1/2 -rotate-3 text-base font-medium whitespace-nowrap text-brand-ink italic">we don't stop the grind yet...</p>
        </div>
        <div className="w-full rounded-2xl border-[1.5px] border-dashed border-foreground/25 p-4">
          <p className="mb-3 text-center text-sm font-semibold">If it stalls</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {stalls.map((leaf, i) => (
              <li key={leaf.title} className={`flex flex-col items-center gap-1.5 p-3 text-center ${CARD}`}>
                <p className="text-sm font-semibold">{leaf.title}</p>
                <p className="text-sm text-muted-foreground">{leaf.say}</p>
                {leaf.message ? <Peek label="see message" id={`stall-${i}`} text={leaf.message} copied={copied} onCopy={onCopy} /> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/** The message plan: the mind map first, the full playbook as a research report behind a link, the sources behind another. The words live in lib/outreach-strategy.ts. */
function MessageStrategy({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [copied, setCopied] = useState<string | null>(null)
  const [why, setWhy] = useState<boolean>(false)

  function done(id: string): void {
    setCopied(id)
    window.setTimeout(() => setCopied(null), 1500)
  }

  /** The clipboard API where the browser allows it, else the older way through a hidden text box. */
  function copy(text: string, id: string): void {
    const fallback = (): void => {
      const box = document.createElement("textarea")
      box.value = text
      box.style.position = "fixed"
      box.style.opacity = "0"
      document.body.appendChild(box)
      box.select()
      const ok = document.execCommand("copy")
      document.body.removeChild(box)
      if (ok) done(id)
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => done(id), fallback)
    } else {
      fallback()
    }
  }

  return (
    <section
      aria-label="What should I message"
      className="flex flex-col gap-5 overflow-x-clip rounded-xl border-[1.5px] border-brand/25 bg-brand/[0.06] p-4 sm:p-6"
      style={{ backgroundImage: "radial-gradient(color-mix(in oklch, var(--color-brand) 32%, transparent) 1px, transparent 1.2px)", backgroundSize: "20px 20px" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold tracking-tight">What should I message?</h3>
          <p className="text-sm text-muted-foreground">Five steps, and what to do when it stalls.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      </div>

      <MindMap copied={copied} onCopy={copy} />

      <a
        href="/research/reaching-out-for-a-referral"
        onClick={(e) => {
          e.preventDefault()
          openResearch("reaching-out-for-a-referral")
        }}
        className="flex w-fit items-center gap-1.5 text-sm font-semibold underline underline-offset-4 hover:text-brand-ink"
      >
        See the full playbook here
        <span aria-hidden="true">→</span>
      </a>

      <div className="flex flex-col gap-2">
        <button type="button" aria-expanded={why} onClick={() => setWhy(!why)} className="flex w-fit cursor-pointer items-center gap-1.5 text-sm font-semibold underline underline-offset-4 hover:text-brand-ink">
          <InfoIcon className="size-4" aria-hidden="true" />
          where this comes from
        </button>
        {why ? (
          <div className="rounded-xl bg-background p-4 sm:p-5">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold tracking-[0.14em] uppercase">Sources</p>
              <ol className="flex flex-col">
                {SOURCES.map((x, i) => {
                  const cut = x.label.indexOf(": ")
                  const who = cut > 0 ? x.label.slice(0, cut) : x.label
                  const what = cut > 0 ? x.label.slice(cut + 2) : ""

                  return (
                    <li key={x.url} className="border-b-[1.5px] last:border-b-0">
                      <a href={x.url} target="_blank" rel="noreferrer" className="group grid grid-cols-[1.75rem_1fr] items-baseline gap-y-0.5 py-2.5 text-sm">
                        <span className="text-muted-foreground tabular-nums">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="font-semibold decoration-brand decoration-2 underline-offset-4 group-hover:underline">{who}</span>
                          {what ? <span className="text-muted-foreground"> · {what}</span> : null}
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

const field = "h-9 rounded-md border-[1.5px] bg-background px-2.5 text-sm focus:border-ring focus:outline-none"

/** The jobs a person can be tied to: the ones in your tracker, saved or applied. */
function useTrackedJobs(): Posting[] {
  const data = useData()

  return useMemo(() => {
    const applied = new Set(data.applications.map((a) => a.posting_id))

    return data.postings.filter((p) => data.saved.has(p.id) || applied.has(p.id))
  }, [data.postings, data.saved, data.applications])
}

export function AddPerson({ onDone, fixedJob }: { onDone: () => void; fixedJob?: Posting }): React.JSX.Element {
  const data = useData()
  const tracked = useTrackedJobs()
  const [name, setName] = useState<string>("")
  const [company, setCompany] = useState<string>(fixedJob?.employer_display ?? "")
  const [jobId, setJobId] = useState<string>(fixedJob?.id ?? "")
  const [role, setRole] = useState<string>("")
  const [contact, setContact] = useState<string>("")
  // The companies to pick from: the ones whose jobs you keep, then anyone already added.
  const companies = useMemo(() => [...new Set([...tracked.map((j) => j.employer_display), ...data.people.map((p) => p.company).filter(Boolean)])].sort((a, b) => a.localeCompare(b)), [tracked, data.people])
  const positions = tracked.filter((j) => j.employer_display.trim().toLowerCase() === company.trim().toLowerCase())
  const linked = fixedJob ?? positions.find((j) => j.id === jobId)

  return (
    <form
      className="grid gap-2 rounded-xl border-[1.5px] bg-card p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || (!linked && !company.trim())) {
          return
        }
        const added = data.addPerson({ name: name.trim(), company: linked ? linked.employer_display : company.trim(), jobId: linked?.id ?? null, status: "To contact", contact: contact.trim(), notes: "", ...(role.trim() ? { role: role.trim() } : {}) })
        saved(() => data.removePerson(added.id))
        onDone()
      }}
    >
      <input autoFocus aria-label="Name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
      <input aria-label="Their position" placeholder="Their position, e.g. Finance manager (optional)" value={role} onChange={(e) => setRole(e.target.value)} className={field} />
      {fixedJob ? null : (
        <>
          <div className="flex flex-col gap-1">
            <input
              aria-label="Company"
              list="people-companies"
              placeholder="Company: pick one of yours or type a new one"
              value={company}
              onChange={(e) => {
                setCompany(e.target.value)
                setJobId("")
              }}
              className={field}
            />
            <datalist id="people-companies">
              {companies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <select aria-label="Position at that company" value={jobId} onChange={(e) => setJobId(e.target.value)} disabled={positions.length === 0} className={`${field} disabled:opacity-60`}>
            <option value="">{positions.length === 0 ? "No saved position at this company" : "No position yet"}</option>
            {positions.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </>
      )}
      <input aria-label="Email, phone or LinkedIn" placeholder="Email, phone or LinkedIn (optional)" value={contact} onChange={(e) => setContact(e.target.value)} className={`${field} sm:col-span-2`} />
      {fixedJob ? <FindPeople post={fixedJob} /> : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={!name.trim() || (!linked && !company.trim())} className="cursor-pointer">
          Add person
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone} className="cursor-pointer">
          Cancel
        </Button>
      </div>
    </form>
  )
}

/**
 * Looking for people at a job's company who do something like it. One press of Find shows five more people: from what is already
 * fetched when there are any (free), otherwise from the next page of 25 (one search). Never on its own.
 */
function useFindPeople(post: Posting): { state: "idle" | "busy"; problem: string | null; find: () => void; drop: (url: string) => void; rec: PastSearch | null; canMore: boolean; notLookedUp: boolean } {
  const data = useData()
  const [state, setState] = useState<"idle" | "busy">("idle")
  const [problem, setProblem] = useState<string | null>(null)
  // The employer has not been searched yet: pressing again would only repeat that, so the button gives way to a link that searches LinkedIn.
  const [notLookedUp, setNotLookedUp] = useState<boolean>(false)
  const rec = readPast(data.profile.peopleFound?.[post.id])

  function find(): void {
    setProblem(null)
    if (rec && hasFree(rec)) {
      data.updatePast(post.id, (cur) => (cur ? revealNext(cur) : cur))

      return
    }
    setState("busy")
    const page = rec ? rec.page + 1 : 1
    suggestReferrals(post.employer, data.session?.access_token ?? null)
      .then(({ people, searched }) => {
        const ranked = rankForJob(people, post.family ?? null)
        data.updatePast(post.id, (cur) => (cur ? addPage(cur, ranked, page, false) : firstPage(ranked, page, false)))
        setState("idle")
        setNotLookedUp(ranked.length === 0 && !searched)
        if (ranked.length === 0) setProblem(searched ? `We looked at ${post.employer_display} and found no one in this kind of work, or a department next to it, whom we could confirm in the Netherlands.` : `We have not looked up people at ${post.employer_display} yet. You can search for them on LinkedIn in the meantime.`)
      })
      .catch((err: unknown) => {
        setState("idle")
        setProblem(err instanceof Error ? err.message : "Could not look for people.")
      })
  }

  return { state, problem, find, drop: (url) => data.updatePast(post.id, (cur) => (cur ? dropPerson(cur, url) : cur)), rec, canMore: canFindMore(rec) && !notLookedUp, notLookedUp }
}

/**
 * People found for one job, one line each: order number, picture (or the grey silhouette), name, position and department, then Connect
 * (opens their LinkedIn page), Add (puts them in your list, linked to the job) and an X to drop them from the results for good.
 * `start` is how many came before, so the numbers carry on across the list.
 */
function FoundPeople({ post, people, start = 0, onDrop }: { post: Posting; people: Suggestion[]; start?: number; onDrop: (url: string) => void }): React.JSX.Element | null {
  const data = useData()
  const [panel, setPanel] = useState<Suggestion | null>(null)
  const add = (s: Suggestion): void => {
    const added = data.addPerson({ name: s.name, company: post.employer_display, jobId: post.id, status: "To contact", contact: s.url, role: s.headline, notes: "", photo: s.photo, place: s.place, about: s.about, positions: s.positions })
    saved(() => data.removePerson(added.id))
  }
  if (people.length === 0) {
    return null
  }

  return (
    <>
    <ul aria-label={`People you could ask at ${post.employer_display}`} className="flex flex-col divide-y-[1.5px] rounded-lg border-[1.5px]">
      {people.map((s, i) => {
        const added = data.people.some((p) => p.contact === s.url)
        const department = s.headline ? departmentOf(s.headline) : null

        return (
          <li key={s.url}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:flex-nowrap">
            <span className="w-5 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{start + i + 1}</span>
            <PersonAvatar name={s.name} photo={s.photo} />
            <span className="min-w-0 flex-1 basis-40 text-sm sm:truncate">
              <span className="font-semibold">{s.name}</span>
              {s.headline ? <span className="text-muted-foreground"> · {s.headline}</span> : null}
              {department ? <span className="hidden text-muted-foreground sm:inline"> · {department}</span> : null}
            </span>
            <a href={s.url} target="_blank" rel="noreferrer" aria-label={`Connect with ${s.name} on LinkedIn`} className={`${buttonVariants({ variant: "default", size: "sm" })} w-[6.25rem] shrink-0 cursor-pointer justify-center`}>
              Connect
              <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
            </a>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={added}
              onClick={() => add(s)}
              className="w-16 shrink-0 cursor-pointer justify-center"
            >
              {added ? "Added" : "Add"}
            </Button>
            <button type="button" aria-label={`Drop ${s.name} from the results`} title="Drop from the results" onClick={() => onDrop(s.url)} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <XIcon className="size-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setPanel(s)} className="shrink-0 cursor-pointer text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
              More details
            </button>
          </div>
          </li>
        )
      })}
    </ul>
      {panel ? (
        <PersonPanel
          person={{ name: panel.name, headline: panel.headline, company: post.employer_display, place: panel.place, photo: panel.photo, about: panel.about, positions: panel.positions, url: panel.url, facts: [{ label: "Company", value: post.employer_display }, { label: "Job", value: post.title }, { label: "Why this person", value: whyThisPerson(panel.headline, post.family ?? null) }] }}
          onClose={() => setPanel(null)}
          action={
            <Button type="button" size="sm" variant="outline" disabled={data.people.some((p) => p.contact === panel.url)} onClick={() => add(panel)} className="cursor-pointer">
              {data.people.some((p) => p.contact === panel.url) ? "Added" : "Add"}
            </Button>
          }
        />
      ) : null}
    </>
  )
}

/** Looks for people at the job's company who do something like it, and lets you add one. Sits inside the add-someone form. */
function FindPeople({ post }: { post: Posting }): React.JSX.Element {
  const { state, problem, find, drop, rec, canMore, notLookedUp } = useFindPeople(post)
  const revealed = rec ? rec.pool.slice(0, rec.shown) : []

  return (
    <div className="flex flex-col gap-2 border-t-[1.5px] pt-3 sm:col-span-2">
      <p className="text-sm text-muted-foreground">Do not know anyone there yet?</p>
      {canMore ? (
        <div>
          <button type="button" onClick={find} disabled={state === "busy"} className="cursor-pointer text-sm font-medium text-primary underline underline-offset-4 disabled:opacity-60">
            {state === "busy" ? "Looking…" : revealed.length > 0 ? "Find more" : `Find people at ${post.employer_display}`}
          </button>
        </div>
      ) : revealed.length > 0 ? (
        <p className="text-sm text-muted-foreground">That is everyone we have for this job.</p>
      ) : null}
      {problem ? <p role="status" className="text-sm text-muted-foreground">{problem}</p> : null}
      {notLookedUp ? (
        <a href={linkedinPeopleSearch(post.employer_display, post.family)} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1.5 text-sm font-medium underline underline-offset-4">
          Search {post.employer_display} on LinkedIn
          <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
      <FoundPeople post={post} people={revealed} onDrop={drop} />
    </div>
  )
}

/**
 * Reach out from a job: pick one you kept and we look for people at that company who do something like it, a
 * step or two from the role and not its leaders, to ask about the team or for a referral. Anyone you add is
 * linked to the job, so they show on the job and count as the referral.
 */
function OutreachFromJobs({ onClose }: { onClose: () => void }): React.JSX.Element {
  const tracked = useTrackedJobs()

  return (
    <section aria-label="Reach out from a job" className="flex flex-col gap-4 rounded-xl border-[1.5px] border-brand/40 bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold tracking-tight">Reach out from a job</h3>
          <p className="max-w-xl text-sm text-muted-foreground">
            Pick your job. We find the people most worth a message.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {tracked.length === 0 ? (
        <p className="rounded-lg border-[1.5px] border-dashed px-4 py-6 text-sm text-muted-foreground">Keep a job first (press its bookmark), then come back to find people at that company.</p>
      ) : (
        <ul className="flex flex-col divide-y-[1.5px] rounded-lg border-[1.5px]">
          {tracked.map((post) => (
            <OutreachRow key={post.id} post={post} />
          ))}
        </ul>
      )}
    </section>
  )
}

function OutreachRow({ post }: { post: Posting }): React.JSX.Element {
  const { state, problem, find, drop, rec, canMore, notLookedUp } = useFindPeople(post)
  const [showPast, setShowPast] = useState<boolean>(false)
  const revealed = rec ? rec.pool.slice(0, rec.shown) : []
  // What was already shown when the panel opened sits in "Past results"; what this visit brings sits below it, numbered on.
  const [before] = useState<number>(revealed.length)
  const past = revealed.slice(0, before)
  const fresh = revealed.slice(before)

  return (
    <li className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center">
          <CompanyLogo employer={post.employer} name={post.employer_display} size={36} wide={1.3} url={post.url} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold sm:truncate">{post.title}</span>
          <span className="block text-sm sm:truncate text-muted-foreground">
            {post.employer_display} · {formatPlace(post.region)}
          </span>
        </span>
        {canMore ? (
          <Button type="button" size="sm" onClick={find} disabled={state === "busy"} className="shrink-0 cursor-pointer">
            {state === "busy" ? "Looking…" : revealed.length > 0 ? "Find more" : "Find people"}
          </Button>
        ) : revealed.length > 0 ? (
          <span className="shrink-0 text-sm text-muted-foreground">That is everyone we have for this job</span>
        ) : null}
      </div>
      {problem ? <p role="status" className="text-sm text-muted-foreground">{problem}</p> : null}
      {notLookedUp ? (
        <a href={linkedinPeopleSearch(post.employer_display, post.family)} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-1.5 text-sm font-medium underline underline-offset-4">
          Search {post.employer_display} on LinkedIn
          <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
      {past.length > 0 ? (
        <div className="flex flex-col gap-2">
          <button type="button" aria-expanded={showPast} onClick={() => setShowPast(!showPast)} className="flex w-fit cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ChevronDownIcon className={`size-4 transition-transform ${showPast ? "rotate-180" : ""}`} aria-hidden="true" />
            Past results
          </button>
          {showPast ? <FoundPeople post={post} people={past} onDrop={drop} /> : null}
        </div>
      ) : null}
      <FoundPeople post={post} people={fresh} start={past.length} onDrop={drop} />
    </li>
  )
}

/**
 * Under "Get a referral" on a job: link someone you already added at this
 * company, or add a new person right there; the form has the search for
 * people at the company inside it. Either way they show on the People
 * table and count as the referral.
 */
export function ReferralLink({ post }: { post: Posting }): React.JSX.Element | null {
  const data = useData()
  const [adding, setAdding] = useState<boolean>(false)
  const candidates = data.people.filter((p) => p.jobId !== post.id && p.company.trim().toLowerCase() === post.employer_display.trim().toLowerCase())
  if (data.people.some((p) => p.jobId === post.id && p.status === "Referred")) {
    return null
  }
  if (adding) {
    return <AddPerson fixedJob={post} onDone={() => setAdding(false)} />
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

/** The column names over the rows, from a laptop up. They share the rows' sizes, so each name sits over its column. Below that the fields carry their own names. */
function PeopleColumns({ show }: { show: (key: string) => boolean }): React.JSX.Element {
  const cell = "min-w-0 truncate px-2"

  return (
    <div aria-hidden="true" className="hidden items-center gap-3 border-b-[1.5px] bg-secondary/25 px-3 py-1.5 text-xs font-medium text-muted-foreground lg:flex">
      <span className="w-5 shrink-0" />
      <span className="size-8 shrink-0" />
      <span className={`${cell} flex-[2]`}>Name</span>
      <span className={`${cell} flex-[1.5]`}>Current job</span>
      {show("status") ? <span className={`${cell} w-32 shrink-0`}>Stage</span> : null}
      {show("contact") ? <span className={`${cell} flex-[1.2]`}>Link</span> : null}
      <span className="w-[13.4rem] shrink-0" />
    </div>
  )
}

/** The panel with everything about one person you hold, and the fields to change it. Opened from "More details" on a row, and from a person's name in the table. */
export function PersonDetails({ person, onClose }: { person: Person; onClose: () => void }): React.JSX.Element {
  const data = useData()
  const put = (patch: Partial<Omit<Person, "id">>): void => data.updatePerson(person.id, patch)
  const step = nextStep(person, new Date(), useFollowDays().nudge)
  const plain = "h-9 rounded-md border-[1.5px] border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none lg:h-8 lg:border-transparent lg:bg-transparent lg:px-2 lg:hover:border-input lg:focus:bg-background"
  const stage = (
    <select aria-label={`Stage of ${person.name}`} value={person.status} onChange={(e) => {
        put(stamp(e.target.value as ContactStatus))
        saved()
      }} className={`${plain} w-full`}>
      {CONTACT_STATUSES.map((r) => (
        <option key={r}>{r}</option>
      ))}
    </select>
  )

  return (
    <PersonPanel
      person={{ name: person.name, headline: person.role, company: person.company, place: person.place, photo: person.photo, about: person.about, positions: person.positions, url: linkedinHref(person), facts: [{ label: "Next step", value: step.text }, { label: "Company", value: person.company }, { label: "Job", value: person.jobId ? (data.byId.get(person.jobId)?.title ?? "") : "" }, { label: "Stage", value: person.status }] }}
      editor={
        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1 text-muted-foreground">
            Current job
            <input value={person.role ?? ""} onChange={(e) => put({ role: e.target.value })} placeholder="What they do now" className={`${plain} w-full text-foreground`} />
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">
            Stage
            {stage}
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">
            Link
            <input value={person.contact} onChange={(e) => put({ contact: e.target.value })} placeholder="LinkedIn, email or phone" className={`${plain} w-full text-foreground`} />
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">
            Notes
            <textarea value={person.notes} onChange={(e) => put({ notes: e.target.value })} placeholder="What you want to remember" className="min-h-20 w-full rounded-md border-[1.5px] border-input bg-background px-2.5 py-2 text-foreground focus:border-ring focus:outline-none" />
          </label>
          <button type="button" onClick={() => { data.removePerson(person.id); onClose() }} className="flex w-fit cursor-pointer items-center gap-1.5 text-muted-foreground hover:text-destructive">
            <TrashIcon className="size-4" aria-hidden="true" /> Remove from my list
          </button>
        </div>
      }
      onClose={onClose}
    />
  )
}

function PersonRow({ person, show, n }: { person: Person; show: (key: string) => boolean; n: number }): React.JSX.Element {
  const data = useData()
  const [panel, setPanel] = useState<boolean>(false)
  const put = (patch: Partial<Omit<Person, "id">>): void => data.updatePerson(person.id, patch)
  const step = nextStep(person, new Date(), useFollowDays().nudge)
  // Below a laptop the fields are drawn as fields so it is clear they can be typed in; on a laptop they are quiet until hovered.
  const plain = "h-9 rounded-md border-[1.5px] border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none lg:h-8 lg:border-transparent lg:bg-transparent lg:px-2 lg:hover:border-input lg:focus:bg-background"
  const stage = (
    <select aria-label={`Stage of ${person.name}`} value={person.status} onChange={(e) => {
        put(stamp(e.target.value as ContactStatus))
        saved()
      }} className={`${plain} w-full`}>
      {CONTACT_STATUSES.map((r) => (
        <option key={r}>{r}</option>
      ))}
    </select>
  )

  return (
    <li className="border-b-[1.5px] last:border-b-0">
      {/* Phone: a card with the person, their current job, the stage and the two actions; link, notes and removing are under More details.
          Tablet: the card also shows the link. Notes are only under More details, so the row stays roomy. Laptop and up: one line, the same fields in a row under the column names. */}
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 lg:flex lg:flex-nowrap lg:gap-y-0 lg:py-2.5">
        <span className="hidden w-5 shrink-0 text-right text-sm text-muted-foreground tabular-nums lg:block">{n}</span>
        <span className="row-span-2 self-start lg:row-span-1">
          <PersonAvatar name={person.name} photo={person.photo} />
        </span>
        <input aria-label={`Name of ${person.name}`} placeholder="Name" value={person.name} onChange={(e) => put({ name: e.target.value })} className={`${plain} min-w-0 font-semibold lg:order-1 lg:flex-[2] lg:font-medium`} />
        {show("status") ? <span className="w-28 shrink-0 lg:order-3 lg:w-32">{stage}</span> : <span />}
        <input aria-label={`Current job of ${person.name}`} placeholder="Current job" value={person.role ?? ""} onChange={(e) => put({ role: e.target.value })} className={`${plain} col-span-2 col-start-2 min-w-0 text-muted-foreground lg:order-2 lg:flex-[1.5] lg:text-foreground`} />
        {show("contact") ? <input aria-label={`Link for ${person.name}`} placeholder="Link: LinkedIn, email or phone" value={person.contact} onChange={(e) => put({ contact: e.target.value })} className={`${plain} col-span-3 hidden min-w-0 sm:block lg:order-4 lg:col-span-1 lg:flex-[1.2]`} /> : null}
        <div className="col-span-3 flex items-center gap-3 lg:contents">
          <a
            href={linkedinHref(person)}
            target="_blank"
            rel="noreferrer"
            title={isUrl(person.contact) ? `Open ${person.name} on LinkedIn` : `Search LinkedIn for ${person.name}${person.company ? ` at ${person.company}` : ""}`}
            className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border-[1.5px] px-3 text-sm font-medium transition-colors duration-150 hover:border-foreground/40 hover:bg-accent lg:order-6 lg:h-8 lg:px-2.5"
          >
            Connect
            <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
          </a>
          <button type="button" aria-label={`Remove ${person.name}`} onClick={() => data.removePerson(person.id)} className="ml-auto hidden size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-destructive sm:flex lg:order-7 lg:ml-0">
            <TrashIcon className="size-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setPanel(true)} className="ml-auto shrink-0 cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground sm:ml-0 lg:order-8 lg:text-xs">
            More details
          </button>
        </div>
      </div>
      {step.due ? <p className="px-3 pb-2.5 text-sm font-medium text-brand-ink lg:pl-[4.75rem]">{step.text}</p> : null}
      {panel ? <PersonDetails person={person} onClose={() => setPanel(false)} /> : null}
    </li>
  )
}

/** Your templates: edit the wording, add your own, or go back to the starting set. */
export function TemplatesEditor({ onClose }: { onClose: () => void }): React.JSX.Element {
  const data = useData()
  const templates = templatesOf(data.profile)
  const set = (next: MessageTemplate[] | null): void => data.setProfile({ ...data.profile, templates: next })
  const edit = (id: string, patch: Partial<MessageTemplate>): void => set(templates.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  return (
    <div className="flex flex-col gap-3 rounded-xl border-[1.5px] bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight">Outreach message templates</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {templates.map((t) => (
          <li key={t.id} className="flex flex-col gap-2 rounded-lg border-[1.5px] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Template name" value={t.name} onChange={(e) => edit(t.id, { name: e.target.value })} className={`${field} min-w-44 flex-1 font-medium`} />
              <select aria-label="Kind" value={t.kind} onChange={(e) => edit(t.id, { kind: e.target.value as MessageKind })} className={field}>
                {MESSAGE_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <button type="button" aria-label={`Delete ${t.name}`} onClick={() => set(templates.filter((x) => x.id !== t.id))} className="flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
                <TrashIcon className="size-4" aria-hidden="true" />
              </button>
            </div>
            <textarea aria-label={`Wording of ${t.name}`} value={t.body} onChange={(e) => edit(t.id, { body: e.target.value })} className="min-h-28 rounded-lg border-[1.5px] bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none" />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => set([...templates, { id: crypto.randomUUID(), name: "New template", kind: "Other", body: "Hi {name},\n\n" }])} className="cursor-pointer">
          <PlusIcon className="size-4" aria-hidden="true" /> Add a template
        </Button>
        {data.profile.templates ? (
          <Button variant="ghost" size="sm" onClick={() => set(null)} className="cursor-pointer text-muted-foreground">
            Back to the starting set
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The people table: everyone in your search, grouped by company and then by the
 * position they are linked to. A person linked to a job shows on that job, and a
 * referral counts in its chance, so the two views are the same facts.
 */
export function PeopleView({ onOpen, views, tools }: { onOpen: (post: Posting) => void; views: ReturnType<typeof usePeopleViews>; tools: React.ReactNode }): React.JSX.Element {
  const data = useData()
  const { active } = views
  const layout = active.layout
  const view = useViewConfig(views.configName)
  const [details, setDetails] = useState<Person | null>(null)
  const days = useFollowDays()
  const people = useMemo(() => applyPeopleFilter(data.people, active.filter, new Date(), days.nudge), [data.people, active.filter, days.nudge])
  const filtered = isPeopleFilterOn(active.filter)
  // One panel at a time: opening one replaces whichever was open.
  const [panel, setPanel] = useState<"outreach" | "add" | "strategy" | null>(null)
  const adding = panel === "add"
  const outreach = panel === "outreach"
  const strategy = panel === "strategy"
  // Closed with the X, it stays closed on later visits until "why does it even matter?" opens it again; a new visitor sees it open.
  const [why, setWhy] = useRemembered("odds:people-why-open", true)
  const setAdding = (on: boolean): void => setPanel(on ? "add" : null)
  const sortKey = view.config.sortKey || "company"
  const dir = view.config.sortDir === "asc" ? 1 : -1

  const groups = useMemo(() => {
    const order = (p: Person): string => (sortKey === "name" ? p.name : sortKey === "status" ? String(CONTACT_STATUSES.indexOf(p.status)) : p.name)
    const byCompany = new Map<string, { employer: string | null; jobs: Map<string, { post: Posting | null; people: Person[] }> }>()
    for (const person of people) {
      const post = person.jobId ? (data.byId.get(person.jobId) ?? null) : null
      const company = post ? post.employer_display : person.company || "No company yet"
      const entry = byCompany.get(company) ?? { employer: post?.employer ?? null, jobs: new Map() }
      const key = post ? post.id : "none"
      const job = entry.jobs.get(key) ?? { post, people: [] }
      job.people.push(person)
      entry.jobs.set(key, job)
      byCompany.set(company, entry)
    }
    for (const entry of byCompany.values()) {
      for (const job of entry.jobs.values()) {
        job.people.sort((a, b) => order(a).localeCompare(order(b), undefined, { numeric: true }) * (sortKey === "company" ? 1 : dir))
      }
    }

    return [...byCompany.entries()].sort((a, b) => a[0].localeCompare(b[0]) * (sortKey === "company" ? dir : 1))
  }, [people, data.byId, sortKey, dir])

  // One running order number down the whole table, in the order the rows are drawn.
  const order = useMemo(() => {
    const map = new Map<string, number>()
    for (const [, group] of groups) for (const job of group.jobs.values()) for (const p of job.people) map.set(p.id, map.size + 1)

    return map
  }, [groups])

  const addButton = (
    <div className="flex flex-wrap items-center gap-2">
      <ToolButton pressed={adding} onClick={() => setAdding(!adding)}>
        <PlusIcon className="size-4" aria-hidden="true" /> Add a person
      </ToolButton>
      <ToolButton pressed={outreach} onClick={() => setPanel(outreach ? null : "outreach")}>
        <PlusIcon className="size-4" aria-hidden="true" /> Reach out from a job
      </ToolButton>
      <ToolButton pressed={strategy} onClick={() => setPanel(strategy ? null : "strategy")}>
        <MessageIcon className="size-4" aria-hidden="true" /> What should I message?
      </ToolButton>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          aria-pressed={why}
          onClick={() => setWhy(!why)}
          className={`flex cursor-pointer items-center gap-1.5 text-sm font-medium underline-offset-4 hover:text-foreground hover:underline ${why ? "text-foreground underline" : "text-muted-foreground"}`}
        >
          <InfoIcon className="size-4" aria-hidden="true" />
          why does it even matter?
        </button>
      </div>
      {why ? <WhyOutreach onClose={() => setWhy(false)} /> : null}

      {/* The buttons come first and what they open sits under them, so a panel opens downward. */}
      <div>{addButton}</div>
      {outreach ? <OutreachFromJobs onClose={() => setPanel(null)} /> : null}
      {strategy ? <MessageStrategy onClose={() => setPanel(null)} /> : null}
      {adding ? <AddPerson onDone={() => setAdding(false)} /> : null}

      <ViewTabs views={views.views} active={active} onSelect={views.select} onAdd={views.add} onRename={views.rename} onDuplicate={views.duplicate} onRemove={views.remove} onReset={views.reset} noun="people" />
      {data.people.length > 0 ? (
        <>
          <PeopleFilterBar value={active.filter} onChange={views.setFilter} />
          {layout === "table" ? null : <ToolBar count={people.length} noun={{ one: "person", many: "people" }} tools={tools} />}
        </>
      ) : null}

      {data.people.length > 0 && layout === "calendar" ? (
        <PeopleCalendar people={people} dateKey={active.dateKey ?? "nudge"} onDateKey={views.setDateKey} onOpen={setDetails} />
      ) : data.people.length > 0 && people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{filtered ? "No one here fits these filters." : "No one here yet."}</p>
      ) : layout === "table" && data.people.length > 0 ? (
        <PeopleTable people={people} onOpenPerson={setDetails} onOpenJob={onOpen} viewName={views.configName} toolbar={tools} />
      ) : layout === "board" && data.people.length > 0 ? (
        <PeopleBoard people={people} onOpen={onOpen} sortKey={sortKey} dir={dir} show={view.show} />
      ) : groups.length === 0 ? (
        <div className="rounded-xl border-[1.5px] border-dashed p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No one here yet.</p>
          <p className="mt-1">Add someone you know at a company you are applying to, and link them to the job. A referral raises the interview chance for that job, and everyone shows up on the job too.</p>
        </div>
      ) : (
        groups.map(([company, group]) => {
          return (
            <section key={company} className="overflow-hidden rounded-xl border-[1.5px]">
              {/* One job at the company: its title and city sit in the company's header. Several: each job gets its own line above its people. */}
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-[1.5px] bg-secondary/40 px-4 py-3">
                <span className="flex size-9 items-center justify-center">
                  <CompanyLogo employer={group.employer ?? company} name={company} size={30} wide={1.4} />
                </span>
                <h3 className="font-semibold">{company}</h3>
                {group.jobs.size === 1 && [...group.jobs.values()][0].post ? (
                  <div className="flex min-w-0 basis-full items-baseline justify-between gap-3 text-sm sm:ml-auto sm:basis-auto sm:flex-1 sm:justify-end">
                    <button type="button" onClick={() => onOpen([...group.jobs.values()][0].post as Posting)} className="min-w-0 cursor-pointer text-left font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground sm:truncate">
                      {[...group.jobs.values()][0].post?.title}
                    </button>
                    <span className="shrink-0 whitespace-nowrap text-muted-foreground">{formatPlace([...group.jobs.values()][0].post?.region ?? null)}</span>
                  </div>
                ) : null}
              </header>
              <PeopleColumns show={view.show} />
              {[...group.jobs.values()].map((job) => (
                <div key={job.post?.id ?? "none"}>
                  {group.jobs.size > 1 || !job.post ? (
                  <div className="flex items-center justify-between gap-3 border-b-[1.5px] px-4 py-2 text-sm">
                    {job.post ? (
                      <button type="button" onClick={() => onOpen(job.post as Posting)} className="cursor-pointer text-left font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground">
                        {job.post.title}
                      </button>
                    ) : (
                      <span className="font-medium text-muted-foreground">Not linked to a position yet</span>
                    )}
                    {job.post ? <span className="shrink-0 whitespace-nowrap text-muted-foreground">{formatPlace(job.post.region)}</span> : null}
                  </div>
                  ) : null}
                  <ul>
                    {job.people.map((p) => (
                      <PersonRow key={p.id} person={p} show={view.show} n={order.get(p.id) ?? 0} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )
        })
      )}
      {details ? <PersonDetails person={data.people.find((p) => p.id === details.id) ?? details} onClose={() => setDetails(null)} /> : null}
    </div>
  )
}


/**
 * The same people as a board: a column per step of the conversation, a card per person. Drag a card, or use the
 * menu on it, to move it. Each card shows who they are, how you know them and the job they are linked to.
 */
function PeopleBoard({ people: shown, onOpen, sortKey, dir, show }: { people: ReadonlyArray<Person>; onOpen: (post: Posting) => void; sortKey: string; dir: number; show: (key: string) => boolean }): React.JSX.Element {
  const data = useData()
  const [over, setOver] = useState<ContactStatus | null>(null)
  const company = (p: Person): string => (p.jobId ? (data.byId.get(p.jobId)?.employer_display ?? p.company) : p.company)
  const key = (p: Person): string => (sortKey === "name" ? p.name : company(p))
  const people = [...shown].sort((a, b) => key(a).localeCompare(key(b)) * (sortKey === "company" ? 1 : dir))

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CONTACT_STATUSES.map((status) => {
        const here = people.filter((p) => p.status === status)

        return (
          <section
            key={status}
            aria-label={`${status}, ${here.length} ${here.length === 1 ? "person" : "people"}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(status)
            }}
            onDragLeave={() => setOver((now) => (now === status ? null : now))}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const id = e.dataTransfer.getData("text/plain")
              if (data.people.some((p) => p.id === id)) {
                data.updatePerson(id, stamp(status))
                saved()
              }
            }}
            className={`flex min-h-40 flex-col gap-3 rounded-xl p-3 ${over === status ? "bg-accent ring-2 ring-primary/30" : "bg-secondary/40"}`}
          >
            <header className="flex items-baseline justify-between gap-2 px-1">
              <div>
                <h3 className="text-base font-semibold tracking-tight">{status}</h3>
                <p className="text-xs text-muted-foreground">{STAGES[status].hint}</p>
              </div>
              <span className="rounded-full bg-card px-2.5 py-0.5 text-sm font-medium tabular-nums">{here.length}</span>
            </header>
            {here.length === 0 ? <p className="rounded-xl border-[1.5px] border-dashed px-3 py-8 text-center text-sm text-muted-foreground">No one here</p> : null}
            {here.map((p) => {
              const post = p.jobId ? (data.byId.get(p.jobId) ?? null) : null

              return (
                <article key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)} className="flex cursor-grab flex-col gap-3 rounded-lg border-[1.5px] bg-card p-4 active:cursor-grabbing">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-10 shrink-0 items-center justify-center">
                      <CompanyLogo employer={post?.employer ?? company(p)} name={company(p) || p.name} size={32} wide={1.4} url={post?.url} />
                    </span>
                    <span className="min-w-0">
                      <span className="block leading-snug font-semibold break-words">{p.name}</span>
                      <span className="block text-[0.95rem]">{company(p) || "No company yet"}</span>
                    </span>
                  </div>
                  {show("job") && post ? (
                    <button type="button" onClick={() => onOpen(post)} className="line-clamp-2 w-fit cursor-pointer text-left text-sm font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground">
                      {post.title}
                    </button>
                  ) : null}
                  <select aria-label={`Move ${p.name}`} value={p.status} onChange={(e) => {
                    data.updatePerson(p.id, stamp(e.target.value as ContactStatus))
                    saved()
                  }} className="h-9 w-full cursor-pointer rounded-md border-[1.5px] bg-background px-2 text-sm text-foreground">
                    {CONTACT_STATUSES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </article>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

/** On a job: the people linked to it, and a quick way to add one. The same records as the People table. */
export function PeopleForJob({ post }: { post: Posting }): React.JSX.Element {
  const data = useData()
  const [adding, setAdding] = useState<boolean>(false)
  const linked = data.people.filter((p) => p.jobId === post.id)

  return (
    <Section title={`People at ${post.employer_display}`}>
      {linked.length > 0 ? (
        <ul className="divide-y-[1.5px] border-y-[1.5px]">
          {linked.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <span className="font-medium">{p.name}{p.role ? <span className="font-normal text-muted-foreground"> · {p.role}</span> : null}</span>
              <span className="text-sm text-muted-foreground">
                {p.status}
                {p.status === "Referred" ? <span className="text-good-foreground"> · counted in your chance</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No one linked to this job yet. Add a referral and it counts in your interview chance.</p>
      )}
      <div className="mt-3">
        {adding ? (
          <AddPerson fixedJob={post} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="cursor-pointer">
            <PlusIcon className="size-4" aria-hidden="true" /> Add a person
          </Button>
        )}
      </div>
    </Section>
  )
}
