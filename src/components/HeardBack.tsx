import { useState } from "react"
import { CompanyLogo } from "@/components/CompanyMark"
import { Button } from "@/components/ui/button"
import { answersDue, daysSince, NO_ANSWER_AFTER_DAYS } from "@/lib/answers-due"
import { useData } from "@/lib/data"
import { supabase } from "@/lib/supabase"
import type { Application } from "@/lib/types"

/**
 * On Home, two weeks or more after you marked a job applied: "Did you hear back from them?" One tap moves the application on
 * (interview, rejected, no answer) and tells odds what happened, which is how the interview chance gets checked against real results
 * (outcome loop, docs/ENGINE_DATA_PLAN.md E2). "Not yet" asks again in a week. One question at a time, the longest wait first.
 */

const SNOOZE_KEY = "odds:heard-back-snooze"

function readSnoozed(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}") as unknown

    return raw && typeof raw === "object" ? (raw as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function HeardBack(): React.JSX.Element | null {
  const data = useData()
  const [snoozed, setSnoozed] = useState<Record<string, string>>(readSnoozed)
  const [busy, setBusy] = useState<boolean>(false)
  const due = answersDue(data.applications, snoozed)
  const first = due[0]
  if (!data.session || !first) return null
  const days = daysSince(first.logged_at, Date.now())
  const post = data.byId.get(first.posting_id)

  const answer = async (app: Application, stage: Application["stage"]): Promise<void> => {
    setBusy(true)
    await data.changeStage(app.id, stage)
    setBusy(false)
  }
  const later = (app: Application): void => {
    const today = new Date().toISOString().slice(0, 10)
    const next = { ...snoozed, [app.posting_id]: today }
    setSnoozed(next)
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(next))
    } catch {
      // Private mode: it asks again next visit, which is fine.
    }
    // Best effort, so another device does not ask the same day.
    void Promise.resolve(supabase.from("chance_snapshots").update({ asked_on: today }).eq("posting_id", app.posting_id)).catch(() => undefined)
  }

  return (
    <section aria-label="Did you hear back?" className="flex flex-col gap-3 rounded-xl border-[1.5px] bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center">
          <CompanyLogo employer={post?.employer ?? first.employer} name={first.employer} size={40} wide={1.3} url={post?.url} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">Did you hear back from {first.employer}?</p>
          <p className="text-sm text-muted-foreground">
            You applied for {first.title} {days} days ago. What happened helps us check how well our estimates hold up.
            {due.length > 1 ? ` ${due.length - 1} more to answer after this.` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy} onClick={() => void answer(first, "interview")} className="cursor-pointer max-md:h-10">
          Yes, an interview
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void answer(first, "rejected")} className="cursor-pointer max-md:h-10">
          Rejected
        </Button>
        {days >= NO_ANSWER_AFTER_DAYS ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void answer(first, "no_reply")} className="cursor-pointer max-md:h-10">
            No answer
          </Button>
        ) : null}
        <Button type="button" variant="ghost" disabled={busy} onClick={() => later(first)} className="cursor-pointer max-md:h-10">
          Not yet
        </Button>
      </div>
    </section>
  )
}
