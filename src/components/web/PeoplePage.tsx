import { useMemo, useRef, useState } from "react"
import { PersonAvatar } from "@/components/PersonAvatar"
import { PersonDetails, OutreachFromJobs } from "@/components/People"
import { PencilIcon, PlusIcon } from "@/components/icons"
import { Pill, WEB_INPUT, WebButton, WebCard } from "@/components/web/ui"
import { useData } from "@/lib/data"
import { useDrafts } from "@/lib/outreach"
import { STAGES, stamp } from "@/lib/outreach-stage"
import { saved } from "@/lib/saved"
import { takePerson } from "@/lib/web-nav"
import { CONTACT_STATUSES, type ContactStatus, type Person } from "@/lib/types"

/** The colour of each stage, in the pairs the board was drawn with. */
const STAGE_LOOK: Record<ContactStatus, string> = {
  "To contact": "bg-[#F4F1EC] text-foreground",
  Contacted: "bg-[#E6F0FB] text-[#0A4F96]",
  Connected: "bg-[#E6F0FB] text-[#0A4F96]",
  Replied: "bg-good text-good-foreground",
  "Chat booked": "bg-accent text-[#8A3F10]",
  Met: "bg-good text-good-foreground",
  "Referral asked": "bg-[#EFE6F7] text-[#5A3A86]",
  Referred: "bg-good text-good-foreground",
  "No reply": "bg-[#F4F1EC] text-muted-foreground",
  "Said no": "bg-[#FBE9E6] text-[#9B2C1F]",
  "Passed me on": "bg-[#F4F1EC] text-muted-foreground",
}

const DAY = 86_400_000

/** "3 days ago", "today": how long since the stage last changed. Nothing when it was never stamped. */
function lastStep(person: Person): string {
  if (!person.statusAt) return "—"
  const days = Math.floor((Date.now() - new Date(person.statusAt).getTime()) / DAY)

  return days <= 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`
}

/**
 * The people you know at employers: a row each, with the stage they are at, and on the right the form that adds someone and the message
 * you are writing to the one you picked. The message is yours to write or one Claude drafted for that person; nothing is made up here.
 */
export function PeoplePage(): React.JSX.Element {
  const data = useData()
  const [stage, setStage] = useState<ContactStatus | "All">("All")
  const [message, setMessage] = useState<string | null>(() => takePerson())
  const [details, setDetails] = useState<string | null>(null)
  const [finding, setFinding] = useState<boolean>(false)
  const name = useRef<HTMLInputElement>(null)
  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const p of data.people) out.set(p.status, (out.get(p.status) ?? 0) + 1)

    return out
  }, [data.people])
  const shown = stage === "All" ? data.people : data.people.filter((p) => p.status === stage)
  const picked = data.people.find((p) => p.id === message) ?? null
  const open = data.people.find((p) => p.id === details) ?? null

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <WebButton onClick={() => setFinding((v) => !v)} aria-expanded={finding}>
          Find people at a company
        </WebButton>
        <WebButton tone="primary" onClick={() => name.current?.focus()}>
          <PlusIcon className="size-4" aria-hidden="true" weight="bold" /> Add a person
        </WebButton>
      </div>

      {finding ? <OutreachFromJobs onClose={() => setFinding(false)} /> : null}

      <div role="group" aria-label="Stage" className="flex flex-wrap gap-2">
        {(["All", ...CONTACT_STATUSES] as const).map((s) => {
          const on = stage === s
          const n = s === "All" ? data.people.length : (counts.get(s) ?? 0)

          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => setStage(s)}
              className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[0.8125rem] font-extrabold transition-colors ${on ? "border-foreground bg-foreground text-background" : "border-line bg-card text-foreground hover:border-foreground/40"}`}
            >
              {s}
              <span className={on ? "text-background/70" : "text-muted-foreground"}>{n}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <WebCard className="w-full min-w-0 flex-1 overflow-hidden p-0">
          <div className="hidden grid-cols-[2.2fr_1.5fr_1.5fr_1.1fr_40px_110px] gap-3 px-5 py-3.5 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase lg:grid">
            <span>Person</span>
            <span>Company</span>
            <span>Stage</span>
            <span>Last step</span>
            <span />
            <span />
          </div>
          {shown.length === 0 ? (
            <p className="border-t-[1.5px] border-line/60 px-5 py-10 text-center text-sm text-muted-foreground">{data.people.length === 0 ? "No one yet. Add a person on the right." : "No one at this stage."}</p>
          ) : (
            <ul>
              {shown.map((p) => (
                <li key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-t-[1.5px] border-line/60 px-5 py-3 lg:grid-cols-[2.2fr_1.5fr_1.5fr_1.1fr_40px_110px]">
                  <div className="flex min-w-0 items-center gap-3">
                    <PersonAvatar name={p.name} photo={p.photo} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-bold">{p.name || "No name"}</span>
                      {p.role ? <span className="truncate text-xs text-muted-foreground">{p.role}</span> : null}
                    </div>
                  </div>
                  <span className="hidden truncate text-sm lg:block">{p.company}</span>
                  <StagePill person={p} />
                  <span className="hidden text-[0.8125rem] text-muted-foreground lg:block">{lastStep(p)}</span>
                  <button type="button" aria-label={`Details of ${p.name}`} onClick={() => setDetails(p.id)} className="hidden size-9 cursor-pointer place-items-center rounded-[10px] border-[1.5px] border-line hover:border-foreground/40 lg:grid">
                    <PencilIcon className="size-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => setMessage(p.id)} aria-pressed={message === p.id} aria-label={`Message ${p.name}`} className="hidden h-9 cursor-pointer items-center justify-center rounded-[10px] bg-brand text-[0.8125rem] font-extrabold hover:bg-[#E56E1E] lg:inline-flex">
                    Message
                  </button>
                </li>
              ))}
            </ul>
          )}
        </WebCard>

        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-[440px]">
          <AddPerson nameRef={name} />
          {picked ? <MessageCard key={picked.id} person={picked} /> : null}
        </div>
      </div>

      {open ? <PersonDetails person={open} onClose={() => setDetails(null)} /> : null}
    </div>
  )
}

/** The stage as a coloured pill that is also the picker: the native list sits invisible over it. */
function StagePill({ person }: { person: Person }): React.JSX.Element {
  const data = useData()

  return (
    <span className="relative w-fit">
      <Pill className={`${STAGE_LOOK[person.status]} px-3 py-[5px]`}>{person.status} ▾</Pill>
      <select
        aria-label={`Stage of ${person.name}`}
        value={person.status}
        onChange={(e) => {
          data.updatePerson(person.id, stamp(e.target.value as ContactStatus))
          saved()
        }}
        className="absolute inset-0 w-full cursor-pointer opacity-0"
      >
        {CONTACT_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.8125rem] font-bold text-[#4E4842]">{label}</span>
      {children}
    </label>
  )
}

function AddPerson({ nameRef }: { nameRef: React.RefObject<HTMLInputElement | null> }): React.JSX.Element {
  const data = useData()
  const [name, setName] = useState<string>("")
  const [company, setCompany] = useState<string>("")
  const [link, setLink] = useState<string>("")
  const [status, setStatus] = useState<ContactStatus>("To contact")
  const companies = useMemo(() => [...new Set(data.people.map((p) => p.company).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [data.people])
  const ready = name.trim() !== "" && company.trim() !== ""

  function clear(): void {
    setName("")
    setCompany("")
    setLink("")
    setStatus("To contact")
  }

  return (
    <WebCard className="flex flex-col gap-3.5">
      <h2 className="text-lg font-extrabold">Add a person</h2>
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ready) return
          const known = data.postings.find((p) => p.employer_display.trim().toLowerCase() === company.trim().toLowerCase())
          const added = data.addPerson({ name: name.trim(), company: known ? known.employer_display : company.trim(), jobId: null, ...stamp(status), contact: link.trim(), notes: "" })
          saved(() => data.removePerson(added.id))
          clear()
        }}
      >
        <Field label="Name">
          <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className={WEB_INPUT} />
        </Field>
        <Field label="Company">
          <input value={company} onChange={(e) => setCompany(e.target.value)} list="web-people-companies" placeholder="Company" aria-label="Company" className={WEB_INPUT} />
          <datalist id="web-people-companies">
            {companies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="LinkedIn link">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link, email or phone" aria-label="LinkedIn link" className={WEB_INPUT} />
        </Field>
        <Field label="Stage">
          <select value={status} onChange={(e) => setStatus(e.target.value as ContactStatus)} aria-label="Stage" className={`${WEB_INPUT} cursor-pointer`}>
            {CONTACT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <div className="flex gap-2">
          <WebButton type="submit" tone="primary" disabled={!ready}>
            Save person
          </WebButton>
          <WebButton onClick={clear}>Cancel</WebButton>
        </div>
      </form>
    </WebCard>
  )
}

/**
 * The message to one person. It starts from what is already there: the draft Claude wrote for them, else the draft you saved. Copy puts it on the
 * clipboard, Save draft keeps it on the person, and Mark as contacted moves them to Contacted with this message kept as sent.
 */
function MessageCard({ person }: { person: Person }): React.JSX.Element {
  const data = useData()
  const { drafts } = useDrafts()
  const claude = drafts.find((d) => d.personId === person.id && d.status !== "sent")
  const mine = [...(person.messages ?? [])].reverse().find((m) => m.direction === "draft")
  const [text, setText] = useState<string>(claude ? (claude.subject ? `${claude.subject}\n\n${claude.body}` : claude.body) : (mine?.body ?? ""))
  const [copied, setCopied] = useState<boolean>(false)
  const kind = STAGES[person.status]?.kind ?? "Other"

  function keep(direction: "draft" | "sent"): void {
    if (!text.trim()) return
    const messages = (person.messages ?? []).filter((m) => !(direction === "draft" && m.direction === "draft"))
    const message = { id: `${direction}-${Date.now()}`, date: new Date().toISOString(), kind: kind ?? "Other", direction, body: text.trim() }
    data.updatePerson(person.id, { messages: [...messages, message], ...(direction === "sent" && (person.status === "To contact" || person.status === "Connected") ? stamp("Contacted") : {}) })
    saved()
  }

  return (
    <WebCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-lg font-extrabold">Message to {person.name}</h2>
        {kind ? <Pill className="shrink-0 bg-accent text-[#8A3F10]">{kind}</Pill> : null}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={`Message to ${person.name}`}
        placeholder={claude ? "" : "Write your message here, or ask Claude to draft one for this person."}
        className="min-h-[150px] w-full resize-y rounded-xl border-0 bg-secondary p-3.5 text-sm leading-relaxed text-[#4E4842] placeholder:text-muted-foreground focus:outline-2 focus:outline-brand"
      />
      <div className="flex flex-wrap gap-2">
        <WebButton
          tone="primary"
          disabled={!text.trim()}
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1500)
            }, () => undefined)
          }}
        >
          {copied ? "Copied" : "Copy message"}
        </WebButton>
        <WebButton disabled={!text.trim()} onClick={() => keep("draft")}>
          Save draft
        </WebButton>
        <WebButton tone="dark" disabled={!text.trim()} onClick={() => keep("sent")}>
          Mark as contacted
        </WebButton>
      </div>
    </WebCard>
  )
}
