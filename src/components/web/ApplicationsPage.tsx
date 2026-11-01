import { useMemo, useState } from "react"
import { CompanyLogo } from "@/components/CompanyMark"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { WebButton } from "@/components/web/ui"
import { leaveQueue, markQueueSent, retryQueue, useApplyQueue } from "@/lib/apply-queue"
import { groupOf, groupQueue, linePlaces, queueActions, queueCounts, queueWords, type QueueItem } from "@/lib/apply-queue-words"
import { useData } from "@/lib/data"
import { prepareInExtension } from "@/lib/extension-connect"
import { formatPlace } from "@/lib/format"
import { goTo } from "@/lib/web-nav"
import type { Posting } from "@/lib/types"
import { toast } from "sonner"

/**
 * Applications: the one page for what Odds is doing. Every job the person pressed Apply on, from the queue on the server, until they send,
 * skip or remove it: what needs them first, then what is ready to send, then what Odds is filling and what waits its turn, then what is done.
 * Each row has one next step. Nothing here can submit an application; Odds never does.
 */
type Filter = "all" | "needs" | "ready" | "done"
const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs", label: "Needs you" },
  { id: "ready", label: "Ready to send" },
  { id: "done", label: "Done" },
]

export function ApplicationsPage(): React.JSX.Element {
  const data = useData()
  const queue = useApplyQueue(Boolean(data.session))
  const [filter, setFilter] = useState<Filter>("all")
  const [confirmSent, setConfirmSent] = useState<string | null>(null)
  const counts = queueCounts(queue.items)
  const places = useMemo(() => linePlaces(queue.items), [queue.items])
  const groups = useMemo(() => groupQueue(queue.items), [queue.items])
  const rows = groups.flatMap((g) => g.items).filter((i) => filter === "all" || groupOf(i) === filter)
  const needs = groups.find((g) => g.group === "needs")?.items[0]
  const post = (id: string): Posting | undefined => data.byId.get(id)

  const act = (fn: () => Promise<void>, done?: string): void => {
    void fn().then(() => { if (done) toast.message(done) }).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Try again."))
  }
  const goToTab = (item: QueueItem): void => {
    const url = post(item.posting_id)?.url
    if (!url) return goTo("jobs", { job: item.posting_id })
    act(() => prepareInExtension(url, { reveal: true, postingId: item.posting_id }))
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 py-2">
      <Header counts={counts} />
      {needs ? (
        <section aria-label="Needs you now" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[18px] border-2 border-brand bg-card px-5 py-4">
          <NeedsIcon size={24} />
          <div className="flex min-w-[240px] flex-1 flex-col gap-0.5">
            <span className="text-base font-extrabold">{queueWords(needs).label}: {post(needs.posting_id)?.employer_display ?? "a job"}</span>
            <span className="text-sm text-[#4E4842]">{queueWords(needs).why}</span>
          </div>
          {queueActions(needs).goToTab ? <WebButton tone="dark" onClick={() => goToTab(needs)}>Go to the tab</WebButton> : <WebButton tone="dark" onClick={() => act(() => retryQueue(needs.posting_id), "Back in your queue.")}>Try again</WebButton>}
        </section>
      ) : null}
      <section aria-label="Your applications" className="overflow-hidden rounded-[18px] border-[1.5px] border-line bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-[#E7E1D8] px-5 py-3.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
            {FILTERS.map((f) => {
              const n = f.id === "all" ? queue.items.length : queue.items.filter((i) => groupOf(i) === f.id).length
              const on = filter === f.id
              return (
                <button key={f.id} type="button" aria-pressed={on} onClick={() => setFilter(f.id)} className={`h-[34px] cursor-pointer rounded-full border-[1.5px] px-3.5 text-[13px] font-bold ${on ? "border-foreground bg-foreground text-background" : "border-line bg-card text-foreground"}`}>
                  {f.label} {n}
                </button>
              )
            })}
          </div>
          <span className="text-[13px] text-muted-foreground">What needs you first</span>
        </div>
        {queue.loaded && rows.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-5 py-8">
            <p className="text-base font-extrabold">{filter === "all" ? "Nothing in your queue yet" : "Nothing here"}</p>
            <p className="text-sm text-muted-foreground">Press Apply with Odds on a job. It joins here, and Odds fills it in your Chrome, three at a time.</p>
            <WebButton tone="primary" onClick={() => goTo("jobs")}>Find jobs</WebButton>
          </div>
        ) : (
          <ul className="flex flex-col">
            {rows.map((item) => {
              const p = post(item.posting_id)
              const words = queueWords(item, places.get(item.posting_id) ?? 0)
              const can = queueActions(item)
              return (
                <li key={item.posting_id} data-queue-row={item.state} className="grid grid-cols-1 items-center gap-x-4 gap-y-2 border-t-[1.5px] border-[#E7E1D8] px-5 py-3.5 first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,300px)]">
                  <button type="button" onClick={() => goTo("jobs", { job: item.posting_id })} className="flex min-w-0 cursor-pointer items-center gap-3 text-left">
                    <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] border-[1.5px] border-[#E7E1D8] bg-card p-1">
                      {p ? <CompanyLogo employer={p.employer} name={p.employer_display} size={28} wide={1.1} url={p.url} /> : null}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-bold">{p?.title ?? "A job you applied to"}</span>
                      <span className="truncate text-[13px] text-muted-foreground">{[p?.employer_display, p ? formatPlace(p.region) : null].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                  <span className="flex items-start gap-2.5">
                    <StateIcon item={item} />
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="font-bold">{words.label}</span>
                      <span className="text-[13px] text-muted-foreground">{words.why}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                    {can.goToTab && item.state !== "working" ? <WebButton tone={item.state === "review" ? "dark" : "outline"} className="h-[34px] px-3.5 text-[13px]" onClick={() => goToTab(item)}>{item.state === "review" ? "Review & send" : "Go to the tab"}</WebButton> : null}
                    {item.state === "working" ? <button type="button" onClick={() => goToTab(item)} className="cursor-pointer text-sm font-bold text-muted-foreground hover:text-foreground">Watch</button> : null}
                    {can.retry ? <WebButton className="h-[34px] px-3.5 text-[13px]" onClick={() => act(() => retryQueue(item.posting_id), "Back in your queue.")}>Try again</WebButton> : null}
                    {can.markSent ? <button type="button" onClick={() => setConfirmSent(item.posting_id)} className="cursor-pointer text-sm font-bold text-[#B4561A] hover:text-[#8A3F10]">I sent it</button> : null}
                    {can.skip ? <button type="button" onClick={() => act(() => leaveQueue(item.posting_id), "Skipped.")} className="cursor-pointer text-sm font-bold text-muted-foreground hover:text-foreground">Skip</button> : null}
                    {can.remove ? <button type="button" onClick={() => act(() => leaveQueue(item.posting_id), "Removed from your queue.")} className="cursor-pointer text-sm font-bold text-muted-foreground hover:text-foreground">Remove</button> : null}
                    {item.state === "sent" ? <button type="button" onClick={() => goTo("people")} className="cursor-pointer text-sm font-bold text-[#B4561A] hover:text-[#8A3F10]">Write to someone</button> : null}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <p className="px-1 text-[13px] text-muted-foreground">Odds fills three at a time in background tabs of your own window and never presses Submit. If one stops partway, it starts it again by itself.</p>
      {confirmSent ? (
        <ConfirmDialog
          title="Did you press Submit on the site?"
          body="Only mark it sent if the site took your application. Odds never sends it for you."
          confirm="Yes, I sent it"
          onCancel={() => setConfirmSent(null)}
          onConfirm={() => { const id = confirmSent; setConfirmSent(null); act(() => markQueueSent(id), "Marked as sent.") }}
        />
      ) : null}
    </div>
  )
}

function Header({ counts }: { counts: ReturnType<typeof queueCounts> }): React.JSX.Element {
  const title = counts.working > 0
    ? `Odds is working on ${counts.working} application${counts.working === 1 ? "" : "s"}`
    : counts.waiting > 0 ? "Odds starts your next applications soon" : "Your applications"
  const line = counts.working > 0 || counts.waiting > 0
    ? `In your Chrome${counts.waiting ? ` · ${counts.waiting} up next` : ""}`
    : "Press Apply with Odds on a job and it joins here."
  const chips: Array<{ n: number; label: string; icon: React.ReactNode }> = [
    { n: counts.needs, label: "needs you", icon: <NeedsIcon size={16} /> },
    { n: counts.working, label: "filling in", icon: <FillingIcon /> },
    { n: counts.ready, label: "ready to send", icon: <CheckIcon fill="#2F6B47" /> },
    { n: counts.sent, label: "sent", icon: <CheckIcon fill="#1C1A18" /> },
  ]
  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[18px] border-[1.5px] border-line bg-card px-[22px] py-5">
      <div className="flex min-w-[280px] flex-1 items-center gap-3.5">
        <svg viewBox="0 0 32 32" width="44" height="44" aria-hidden="true" className={counts.working > 0 ? "odds-working" : undefined}><circle cx="15" cy="17" r="13" fill="#2B2825" /><circle cx="15" cy="17" r="8.2" fill="#FFFFFF" /><circle cx="15" cy="17" r="4.2" fill="#1C1A18" /><circle cx="16.4" cy="15.6" r="1.3" fill="#FFFFFF" /><circle cx="25.5" cy="6.5" r="4" fill="#EE7A2A" stroke="#2B2825" strokeWidth="1.5" /></svg>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[22px] font-extrabold tracking-[-0.01em]">{title}</h1>
          <span className="text-sm text-muted-foreground">{line}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <span key={c.label} className="flex h-9 items-center gap-2 rounded-full border-[1.5px] border-line px-3.5 text-sm font-bold">{c.icon}{c.n} {c.label}</span>
        ))}
      </div>
    </section>
  )
}

function StateIcon({ item }: { item: QueueItem }): React.JSX.Element {
  const group = groupOf(item)
  if (item.state === "waiting") return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="mt-0.5 shrink-0"><circle cx="8" cy="8" r="6.2" fill="none" stroke="#9A8F84" strokeWidth="1.6" strokeDasharray="2.6 2.2" /></svg>
  if (item.state === "working") return <FillingIcon className="mt-0.5" />
  if (group === "needs") return <NeedsIcon size={16} className="mt-0.5" />
  if (item.state === "review") return <CheckIcon fill="#2F6B47" className="mt-0.5" />
  if (item.state === "sent") return <CheckIcon fill="#1C1A18" className="mt-0.5" />
  return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="mt-0.5 shrink-0"><circle cx="8" cy="8" r="7" fill="#9A8F84" /><path d="M5 8h6" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" /></svg>
}

function NeedsIcon({ size, className }: { size: number; className?: string }): React.JSX.Element {
  return <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className={`shrink-0 ${className ?? ""}`}><circle cx="8" cy="8" r="7" fill="#E8701F" /><path d="M8 4.2v4.6" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" /><circle cx="8" cy="11.4" r="1" fill="#FFFFFF" /></svg>
}

function FillingIcon({ className }: { className?: string }): React.JSX.Element {
  return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`shrink-0 animate-spin [animation-duration:2.4s] motion-reduce:animate-none ${className ?? ""}`}><circle cx="8" cy="8" r="6.2" fill="none" stroke="#E7E1D8" strokeWidth="2.4" /><circle cx="8" cy="8" r="6.2" fill="none" stroke="#E8701F" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="15.6 39" transform="rotate(-90 8 8)" /></svg>
}

function CheckIcon({ fill, className }: { fill: string; className?: string }): React.JSX.Element {
  return <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`shrink-0 ${className ?? ""}`}><circle cx="8" cy="8" r="7" fill={fill} /><path d="M4.8 8.2l2.1 2.1 4.3-4.5" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
