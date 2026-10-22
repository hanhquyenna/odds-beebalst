import { useState } from "react"
import { toast } from "sonner"
import { CompanyLogo } from "@/components/CompanyMark"
import { moveJob } from "@/components/job-steps"
import { Pill, WebButton, WebCard } from "@/components/web/ui"
import { leaveQueue, markQueueSent, retryQueue, useApplyQueue } from "@/lib/apply-queue"
import { GROUP_ORDER, groupOf, queueActions, queueCounts, queueReport, queueWords, reportHeadline, type QueueGroup, type QueueItem, type QueueReport } from "@/lib/apply-queue-words"
import { useData } from "@/lib/data"
import { prepareInExtension, useExtensionPresent } from "@/lib/extension-connect"
import type { Posting } from "@/lib/types"

const TONE: Record<QueueGroup, string> = {
  needs: "border-[1.5px] border-brand bg-accent text-[#8A3F10]",
  ready: "bg-good text-good-foreground",
  working: "bg-accent text-[#8A3F10]",
  failed: "border-[1.5px] border-line text-[#4E4842]",
  sent: "bg-[#E7EEF8] text-[#0A4C8F]",
}

/** The odds mark: a black disc, a white eye, the orange dot (green once the run is done). */
export function AgentMark({ size = 44, done = false }: { size?: number; done?: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" className="shrink-0">
      <circle cx="15" cy="17" r="13" fill="#2B2825" />
      <circle cx="15" cy="17" r="8.2" fill="#fff" />
      <circle cx="15" cy="17" r="4.2" fill="#1C1A18" />
      <circle cx="16.4" cy="15.6" r="1.3" fill="#fff" />
      <circle cx="25.5" cy="6.5" r="4" fill={done ? "var(--good-foreground)" : "var(--brand)"} stroke="#2B2825" strokeWidth="1.5" />
    </svg>
  )
}

/** Heading of a stop that needs the person: the step, then the employer. */
function needsTitle(item: QueueItem, post: Posting | undefined): string {
  const who = post?.employer_display ?? "this job"
  if (item.reason === "captcha") return `A check is in the way: ${who}`
  if (item.reason === "account") return `Make an account: ${who}`

  return `${queueWords(item).label}: ${who}`
}

/**
 * The apply queue as the agent's page: what Odds is doing now, the few stops that need the person (a check, an account), the report once
 * it is done, and every application in one bordered list. Odds fills each form in its own window and stops before Submit; the person
 * sends each one. Shows nothing when the queue is empty.
 */
export function ApplyInbox({ onOpenJob }: { onOpenJob?: (post: Posting) => void }): React.JSX.Element | null {
  const data = useData()
  const queue = useApplyQueue(data.session !== null)
  const extension = useExtensionPresent()
  if (!queue.loaded || queue.items.length === 0) return null
  const posts = new Map([...data.postings, ...data.keptExtra].map((p) => [p.id, p]))
  const counts = queueCounts(queue.items)
  const waiting = queue.items.filter((i) => i.state === "waiting").length
  const working = queue.items.filter((i) => i.state === "working").length
  const report = queueReport(queue.items)
  const needs = queue.items.filter((i) => i.state === "needs_you").sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const rows = queue.items
    .filter((i) => i.state !== "needs_you")
    .sort((a, b) => GROUP_ORDER.indexOf(groupOf(a)) - GROUP_ORDER.indexOf(groupOf(b)) || b.updated_at.localeCompare(a.updated_at))
  const headline = working > 0 ? `Odds is working on ${working} ${working === 1 ? "application" : "applications"}` : waiting > 0 ? `${waiting} waiting for Odds` : report ? reportHeadline(report) : "Apply queue"
  const sub = working + waiting > 0
    ? `In your Chrome${waiting > 0 && working > 0 ? ` · ${waiting} more waiting` : ""}. It only stops for a check or a new account; you send each one.`
    : report?.minutes ? `Done in ${report.minutes} ${report.minutes === 1 ? "minute" : "minutes"}. Check each one and press Submit on the site yourself.` : "Check each one and press Submit on the site yourself."
  const chips: Array<[QueueGroup, number, string]> = [["needs", counts.needs, "need you"], ["working", working, "working"], ["ready", counts.ready, "ready"], ["sent", counts.sent, "sent"]]

  return (
    <WebCard aria-label="Apply queue" className="flex flex-col gap-0 overflow-hidden p-0">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <span className="flex min-w-0 flex-[1_1_320px] items-center gap-3.5">
          <AgentMark done={working + waiting === 0} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-xl font-extrabold tracking-tight">{headline}</h2>
            <span className="text-sm text-muted-foreground">{sub}</span>
          </span>
        </span>
        <span className="flex flex-wrap gap-2">
          {chips.filter(([, n]) => n > 0).map(([group, n, word]) => (
            <Pill key={group} className={`h-8 px-3.5 text-[0.8125rem] ${group === "needs" ? TONE.needs : "border-[1.5px] border-line text-foreground"}`}>{n} {word}</Pill>
          ))}
        </span>
      </header>
      {extension === "no" && working + waiting > 0 ? (
        <p role="status" className="border-t-[1.5px] border-line px-5 py-3 text-sm font-bold text-[#7A5B00]">Odds in Chrome is not connected, so nothing is being filled in. Connect it, then open Chrome.</p>
      ) : null}
      {report && working + waiting === 0 ? <ReportTiles report={report} /> : null}
      {needs.length > 0 ? (
        <section aria-label="Needs you" className="flex flex-col gap-2.5 border-t-[1.5px] border-line px-5 py-4">
          {needs.map((item) => <NeedsCard key={item.posting_id} item={item} post={posts.get(item.posting_id)} />)}
        </section>
      ) : null}
      {rows.length > 0 ? (
        <ul aria-label="Applications" className="flex flex-col">
          {rows.map((item) => <QueueRow key={item.posting_id} item={item} post={posts.get(item.posting_id)} onOpenJob={onOpenJob} />)}
        </ul>
      ) : null}
    </WebCard>
  )
}

/** The run in four counts, once Odds has nothing left to do. */
function ReportTiles({ report }: { report: QueueReport }): React.JSX.Element {
  const tiles: Array<[number, string]> = [[report.ready, "Ready to send"], [report.sent, "Sent"], [report.needs, "Need you"], [report.skipped, "Skipped (closed or stuck)"]]

  return (
    <section aria-label="Report" className="grid grid-cols-2 gap-2 border-t-[1.5px] border-line px-5 py-4 sm:grid-cols-4">
      {tiles.map(([n, label]) => (
        <span key={label} className="flex flex-col gap-0.5 rounded-xl border-[1.5px] border-line px-3.5 py-3">
          <span className="text-2xl font-extrabold tabular-nums">{n}</span>
          <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        </span>
      ))}
    </section>
  )
}

function useQueueAction(): { busy: boolean; run: (work: () => Promise<void>) => void } {
  const [busy, setBusy] = useState<boolean>(false)
  const run = (work: () => Promise<void>): void => {
    setBusy(true)
    work().catch((e: unknown) => toast.error(e instanceof Error ? e.message : "That did not go through. Try again.")).finally(() => setBusy(false))
  }

  return { busy, run }
}

/** One stop only the person can do: what it is, and the tab to do it in. Everything else in the queue keeps going meanwhile. */
export function NeedsCard({ item, post }: { item: QueueItem; post: Posting | undefined }): React.JSX.Element {
  const words = queueWords(item)
  const { busy, run } = useQueueAction()

  return (
    <div data-queue-card={item.posting_id} data-queue-state={item.state} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border-2 border-brand bg-card px-4 py-3.5">
      <span className="flex min-w-0 flex-[1_1_280px] flex-col gap-0.5">
        <span className="text-base font-extrabold">{needsTitle(item, post)}</span>
        <span className="text-sm leading-snug text-[#4E4842]">{words.why}</span>
        <Pill className={`mt-1 w-fit ${TONE.needs}`}>{words.label}</Pill>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <WebButton tone="dark" disabled={busy || !post} onClick={() => post && run(() => prepareInExtension(post.url ?? "", { reveal: true, postingId: post.id }))}>Go to the tab</WebButton>
        <WebButton disabled={busy} onClick={() => run(() => retryQueue(item.posting_id))}>Try again</WebButton>
        <WebButton disabled={busy} aria-label={`Take ${post?.title ?? "this job"} out of the queue`} onClick={() => run(() => leaveQueue(item.posting_id))} className="px-3.5 text-muted-foreground">Skip</WebButton>
      </span>
    </div>
  )
}

function QueueRow({ item, post, onOpenJob }: { item: QueueItem; post: Posting | undefined; onOpenJob?: (post: Posting) => void }): React.JSX.Element {
  const data = useData()
  const words = queueWords(item)
  const can = queueActions(item)
  const [asking, setAsking] = useState<boolean>(false)
  const { busy, run } = useQueueAction()
  const openForm = (): void => {
    if (post) run(() => prepareInExtension(post.url ?? "", { reveal: true, postingId: post.id }))
  }
  const sent = (): void => {
    run(async () => {
      await markQueueSent(item.posting_id)
      if (post) await moveJob(data, post, "applied", "")
      setAsking(false)
    })
  }

  return (
    <li data-queue-card={item.posting_id} data-queue-state={item.state} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t-[1.5px] border-line px-5 py-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_220px_360px]">
      <span className="flex min-w-0 flex-[1_1_300px] items-center gap-3.5">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card p-1.5 shadow-[0_0_0_1.5px_var(--line)]">
          {post ? <CompanyLogo employer={post.employer} name={post.employer_display} size={32} wide={1.1} url={post.url} /> : null}
        </span>
        <button type="button" disabled={!post || !onOpenJob} onClick={() => post && onOpenJob?.(post)} className="flex min-w-0 cursor-pointer flex-col text-left disabled:cursor-default">
          <span className="line-clamp-1 text-[0.95rem] font-extrabold">{post?.title ?? "A job you picked"}</span>
          <span className="truncate text-[0.8125rem] text-muted-foreground">{post?.employer_display ?? ""}</span>
        </button>
      </span>
      <span className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
        <Pill className={`w-fit ${TONE[words.group]}`}>{words.label}</Pill>
        {item.state === "failed" ? <span className="text-[0.8125rem] leading-snug text-[#4E4842]">{words.why}</span> : null}
        {asking ? (
          <span role="group" aria-label="Did you send it?" className="mt-1 flex flex-wrap items-center gap-2 text-[0.8125rem] font-bold">
            Did you press Submit on the site?
            <WebButton tone="primary" disabled={busy} onClick={sent} className="h-9">Yes, I sent it</WebButton>
            <WebButton disabled={busy} onClick={() => setAsking(false)} className="h-9">Not yet</WebButton>
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
        {item.state === "review" ? <WebButton tone="dark" disabled={busy || !post} onClick={openForm}>Review &amp; send</WebButton> : null}
        {can.markSent && !asking ? <WebButton disabled={busy} onClick={() => setAsking(true)}>Mark as sent</WebButton> : null}
        {item.state === "working" ? <WebButton disabled={busy || !post} onClick={openForm}>Watch</WebButton> : null}
        {can.retry && item.reason !== "closed" ? <WebButton disabled={busy} onClick={() => run(() => retryQueue(item.posting_id))}>Try again</WebButton> : null}
        {item.state !== "sent" && can.remove ? <WebButton disabled={busy} aria-label={`Take ${post?.title ?? "this job"} out of the queue`} onClick={() => run(() => leaveQueue(item.posting_id))} className="px-3.5 text-muted-foreground">Remove</WebButton> : null}
      </span>
    </li>
  )
}
