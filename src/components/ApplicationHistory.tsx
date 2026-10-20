import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { applicationHistoryPage } from "@/lib/application-monitor"
import { applicationProgress, type MonitoredRun } from "@/lib/application-progress"
import { useData } from "@/lib/data"
import { STEPS } from "@/components/job-steps"
import { driveSteps, type DriveStep } from "@/lib/drive-runs"

const STEP_PAGE_SIZE = 20
const STEP_LABELS: Readonly<Record<string, string>> = {
  queued: "Queued",
  taken: "In progress",
  done: "Response received",
  cancelled: "Cancelled",
  expired: "No response",
}

/** Shows a job's durable attempt history only when requested, including runs whose live chip has ended. */
export function ApplicationHistory({
  postingId,
  initialOpen = false,
  url,
}: {
  postingId: string | null
  initialOpen?: boolean
  url?: string
}): React.JSX.Element | null {
  const data = useData()
  const userId = data.session?.user.id
  const application = data.applications.find((item) => item.posting_id === postingId)
  const [open, setOpen] = useState(initialOpen)
  const [attempts, setAttempts] = useState<MonitoredRun[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(initialOpen)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    void applicationHistoryPage(userId, postingId, page, url)
      .then((result) => {
        if (cancelled) return
        setAttempts((previous) => {
          const all = new Map(
            (page === 0 ? [] : previous).map((attempt) => [
              `${attempt.source}:${attempt.run.id}`,
              attempt,
            ]),
          )
          for (const attempt of result.attempts)
            all.set(`${attempt.source}:${attempt.run.id}`, attempt)

          return [...all.values()].sort((a, b) => b.run.created_at.localeCompare(a.run.created_at))
        })
        setHasMore(result.hasMore)
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Could not load application history.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, page, postingId, retry, url, userId])
  if (!userId) return null

  return (
    <details
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open
        if (next === open) return
        setOpen(next)
        if (next) {
          setLoading(true)
          setError("")
        }
      }}
      className="text-sm"
    >
      <summary className="cursor-pointer font-medium">Application history</summary>
      <div className="mt-3 flex flex-col gap-3">
        {application ? (
          <p>
            Application logged {new Date(application.logged_at).toLocaleString()} ·{" "}
            {STEPS.find(
              (step) => step.step === (application.stage === "hired" ? "offer" : application.stage),
            )?.title || "Applied"}
          </p>
        ) : null}
        {loading ? (
          <p role="status" className="text-muted-foreground">
            Loading application history…
          </p>
        ) : null}
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLoading(true)
                setError("")
                setRetry((value) => value + 1)
              }}
              className="cursor-pointer"
            >
              Try again
            </Button>
          </div>
        ) : null}
        {!loading && !error && attempts.length === 0 ? (
          <p className="text-muted-foreground">
            {application
              ? "No browser assistance recorded for this job."
              : "No application activity recorded yet."}
          </p>
        ) : null}
        {attempts.map((attempt) => (
          <AttemptHistory key={`${attempt.source}:${attempt.run.id}`} attempt={attempt} />
        ))}
        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => {
              setLoading(true)
              setError("")
              setPage((value) => value + 1)
            }}
            className="w-fit cursor-pointer disabled:cursor-not-allowed"
          >
            Older attempts
          </Button>
        ) : null}
      </div>
    </details>
  )
}

/** Expands one recorded attempt; command state is transport evidence, not a claim that a field was verified. */
function AttemptHistory({ attempt }: { attempt: MonitoredRun }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [steps, setSteps] = useState<DriveStep[]>([])
  const [before, setBefore] = useState<number | undefined>()
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const progress = applicationProgress(attempt)
  useEffect(() => {
    if (!open || attempt.source !== "drive") return
    let cancelled = false
    void driveSteps(attempt.run.id, STEP_PAGE_SIZE, before)
      .then((rows) => {
        if (cancelled) return
        setSteps((previous) => {
          const all = new Map((before === undefined ? [] : previous).map((step) => [step.id, step]))
          for (const step of rows) all.set(step.id, step)

          return [...all.values()].sort((a, b) => b.id - a.id)
        })
        setHasMore(rows.length === STEP_PAGE_SIZE)
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Could not load activity.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [attempt.run.id, attempt.source, before, open, retry])

  return (
    <details
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open
        if (next === open) return
        setOpen(next)
        if (next && attempt.source === "drive") {
          setLoading(true)
          setError("")
        }
      }}
      className="border-l border-line pl-3"
    >
      <summary className="cursor-pointer">
        <span className="font-medium">{progress.label}</span>
        <span className="ml-2 text-muted-foreground">
          {new Date(attempt.run.created_at).toLocaleString()}
        </span>
      </summary>
      <p className="mt-2">{progress.message}</p>
      {attempt.source === "drive" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {attempt.run.steps} browser actions recorded
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="mt-2 text-muted-foreground">
          Loading activity…
        </p>
      ) : null}
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setLoading(true)
              setError("")
              setRetry((value) => value + 1)
            }}
            className="cursor-pointer"
          >
            Try again
          </Button>
        </div>
      ) : null}
      {steps.length ? (
        <ol aria-label="Recorded application activity" className="mt-3 flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start justify-between gap-3">
              <div>
                <p>{step.note || step.tool.replaceAll("_", " ")}</p>
                <p className="text-xs text-muted-foreground">
                  {STEP_LABELS[step.status] || "Recorded"}
                </p>
              </div>
              <time dateTime={step.created_at} className="shrink-0 text-xs text-muted-foreground">
                {new Date(step.created_at).toLocaleTimeString()}
              </time>
            </li>
          ))}
        </ol>
      ) : null}
      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            setError("")
            setBefore(steps.at(-1)?.id)
          }}
          className="mt-3 cursor-pointer disabled:cursor-not-allowed"
        >
          Older activity
        </Button>
      ) : null}
    </details>
  )
}
