import { useState } from "react"
import { toast } from "sonner"
import { WebButton } from "@/components/web/ui"
import { addToQueue, leaveQueue, useApplyQueue } from "@/lib/apply-queue"
import { useData } from "@/lib/data"
import type { Posting } from "@/lib/types"

/** The one-line toast after adding: how many went in, and that the person stays in charge of Submit. */
export function addedWords(added: number, asked: number): string {
  if (added === 0) return asked === 1 ? "That job is already in your queue, or is closed." : "Those jobs are already in your queue, or are closed."
  const skipped = asked - added
  const base = `${added} ${added === 1 ? "job" : "jobs"} added to your queue. Odds fills them in and stops before Submit.`

  return skipped > 0 ? `${base} ${skipped} left out (already queued or closed).` : base
}

/** "Add to queue" next to Apply: Odds fills this job in later, in the background, and stops at Review. */
export function QueueButton({ post, className }: { post: Posting; className?: string }): React.JSX.Element | null {
  const data = useData()
  const queue = useApplyQueue(data.session !== null)
  const [busy, setBusy] = useState<boolean>(false)
  // The queue works shared jobs for people who are signed in; a job you typed in yourself has no application page Odds knows.
  if (data.session === null || post.local || post.closed_at) return null
  const state = queue.byId.get(post.id)?.state
  const waiting = state === "waiting" || state === "working"
  const inbox = state === "review" || state === "needs_you"
  const press = (): void => {
    setBusy(true)
    const work = waiting
      ? leaveQueue(post.id).then(() => void toast("Taken out of your queue."))
      : addToQueue([post.id]).then((n) => void toast(addedWords(n, 1)))
    work.catch((e: unknown) => toast.error(e instanceof Error ? e.message : "That did not go through. Try again.")).finally(() => setBusy(false))
  }

  return (
    <WebButton disabled={busy || inbox || state === "sent"} onClick={press} data-queue-button className={className}>
      {waiting ? "In your queue · Remove" : inbox ? "In your apply queue" : state === "sent" ? "Sent" : "Add to queue"}
    </WebButton>
  )
}
