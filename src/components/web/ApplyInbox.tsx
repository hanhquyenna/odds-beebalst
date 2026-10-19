import { useState } from "react"
import { toast } from "sonner"
import { CompanyLogo } from "@/components/CompanyMark"
import { moveJob } from "@/components/job-steps"
import { Pill, WebButton, WebCard } from "@/components/web/ui"
import { leaveQueue, markQueueSent, retryQueue, useApplyQueue } from "@/lib/apply-queue"
import { groupQueue, queueActions, queueCounts, queueWords, type QueueGroup, type QueueItem } from "@/lib/apply-queue-words"
import { useData } from "@/lib/data"
import { prepareInExtension, useExtensionPresent } from "@/lib/extension-connect"
import type { Posting } from "@/lib/types"

const TONE: Record<QueueGroup, string> = {
  needs: "bg-[#FFF1C9] text-[#7A5B00]",
  ready: "bg-good text-good-foreground",
  working: "bg-accent text-[#8A3F10]",
  failed: "bg-[#FBE9E6] text-[#9B2C1F]",
  sent: "bg-secondary text-foreground",
}

/**
 * The inbox for the apply queue: one card per application Odds is working on or has stopped. Odds fills each form in its own window and
 * stops at Review; the person opens it, checks it and presses Submit on the site themselves. Shows nothing when the queue is empty.
 */
export function ApplyInbox({ onOpenJob }: { onOpenJob?: (post: Posting) => void }): React.JSX.Element | null {
  const data = useData()
  const queue = useApplyQueue(data.session !== null)
  const extension = useExtensionPresent()
  if (!queue.loaded || queue.items.length === 0) return null
  const posts = new Map([...data.postings, ...data.keptExtra].map((p) => [p.id, p]))
  const counts = queueCounts(queue.items)
  const open = counts.needs + counts.ready
  const groups = groupQueue(queue.items)

  return (
    <WebCard aria-label="Apply queue" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-extrabold tracking-tight">
          Apply queue
          {open > 0 ? <span className="ml-2 rounded-full bg-brand px-2.5 py-0.5 align-middle text-sm tabular-nums">{open}</span> : null}
        </h2>
        <p className="text-sm text-muted-foreground">
          Odds fills these in while you are away, two at a time, and stops before the last step. You check each one and press Submit yourself.
        </p>
        {extension === "no" && counts.working + counts.ready + (queue.items.length - counts.sent) > 0 ? (
          <p role="status" className="text-sm font-bold text-[#7A5B00]">Odds in Chrome is not connected, so nothing is being filled in. Connect it, then open Chrome.</p>
        ) : null}
      </header>
      {groups.map((g) => (
        <section key={g.group} aria-label={g.title} className="flex flex-col gap-2">
          <h3 className="text-sm font-extrabold">{g.title} <span className="font-semibold text-muted-foreground tabular-nums">{g.items.length}</span></h3>
          <ul className="flex flex-col gap-2">
            {g.items.map((item) => (
              <QueueCard key={item.posting_id} item={item} post={posts.get(item.posting_id)} onOpenJob={onOpenJob} />
            ))}
          </ul>
        </section>
      ))}
    </WebCard>
  )
}

function QueueCard({ item, post, onOpenJob }: { item: QueueItem; post: Posting | undefined; onOpenJob?: (post: Posting) => void }): React.JSX.Element {
  const data = useData()
  const words = queueWords(item)
  const can = queueActions(item)
  const [asking, setAsking] = useState<boolean>(false)
  const [busy, setBusy] = useState<boolean>(false)
  const run = (work: () => Promise<void>): void => {
    setBusy(true)
    work().catch((e: unknown) => toast.error(e instanceof Error ? e.message : "That did not go through. Try again.")).finally(() => setBusy(false))
  }
  const openForm = (): void => {
    if (!post) return
    run(() => prepareInExtension(post.url ?? "", { reveal: true, postingId: post.id }))
  }
  const sent = (): void => {
    run(async () => {
      await markQueueSent(item.posting_id)
      if (post) await moveJob(data, post, "applied", "")
      setAsking(false)
    })
  }

  return (
    <li data-queue-card={item.posting_id} data-queue-state={item.state} className="flex flex-col gap-3 rounded-xl border-[1.5px] border-line bg-background p-3.5 sm:flex-row sm:items-center">
      <span className="flex min-w-0 flex-1 items-start gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card p-1.5 shadow-[0_0_0_1.5px_var(--line)]">
          {post ? <CompanyLogo employer={post.employer} name={post.employer_display} size={36} wide={1.1} url={post.url} /> : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <button type="button" disabled={!post || !onOpenJob} onClick={() => post && onOpenJob?.(post)} className="w-fit max-w-full cursor-pointer text-left disabled:cursor-default">
            <span className="line-clamp-2 text-[0.95rem] leading-snug font-extrabold">{post?.title ?? "A job you picked"}</span>
            <span className="block truncate text-[0.8125rem] text-muted-foreground">{post?.employer_display ?? ""}</span>
          </button>
          <span className="flex flex-wrap items-center gap-2">
            <Pill className={TONE[words.group]}>{words.label}</Pill>
          </span>
          <span className="text-[0.8125rem] leading-snug text-[#4E4842]">{words.why}</span>
          {asking ? (
            <span role="group" aria-label="Did you send it?" className="mt-1 flex flex-wrap items-center gap-2 text-[0.8125rem] font-bold">
              Did you press Submit on the site?
              <WebButton tone="primary" disabled={busy} onClick={sent} className="h-9">Yes, I sent it</WebButton>
              <WebButton disabled={busy} onClick={() => setAsking(false)} className="h-9">Not yet</WebButton>
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-2">
        {can.open ? <WebButton tone={item.state === "review" ? "primary" : "outline"} disabled={busy || !post} onClick={openForm}>Open the form</WebButton> : null}
        {can.markSent && !asking ? <WebButton disabled={busy} onClick={() => setAsking(true)}>Mark as sent</WebButton> : null}
        {can.retry ? <WebButton disabled={busy} onClick={() => run(() => retryQueue(item.posting_id))}>Try again</WebButton> : null}
        {can.remove ? <WebButton disabled={busy} aria-label={`Take ${post?.title ?? "this job"} out of the queue`} onClick={() => run(() => leaveQueue(item.posting_id))} className="px-3.5 text-muted-foreground">Remove</WebButton> : null}
      </span>
    </li>
  )
}
