import { useState } from "react"
import { InfoIcon, XIcon } from "@/components/icons"
import { WhyDeck } from "@/components/WhyDeck"
import { copyText } from "@/lib/clipboard"
import { MIND_MAP, SOURCES, type MapNode } from "@/lib/outreach-strategy"
import { openResearch } from "@/lib/research-link"
import logoUrl from "@/logo.svg"

/** Why reaching out matters, as a short slide deck that is the whole panel: the link above it carries the question, so the panel has no title of its own. Closes with the X (a white round button, so it shows on the black and orange slides too) and stays closed on later visits until it is opened again from its link. */
export function WhyOutreach({ onClose }: { onClose: () => void }): React.JSX.Element {
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
      <Peek label="see example" id={id} text={node.example} copied={copied} onCopy={onCopy}>
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
          <Peek label="see example" id="map-ask" text={ask.example} copied={copied} onCopy={onCopy} />
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
export function MessageStrategy({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [copied, setCopied] = useState<string | null>(null)
  const [why, setWhy] = useState<boolean>(false)

  function markCopied(id: string): void {
    setCopied(id)
    window.setTimeout(() => setCopied(null), 1500)
  }

  function copy(text: string, id: string): void {
    copyText(text, () => markCopied(id))
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
