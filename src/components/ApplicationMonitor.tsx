import { Fragment, useEffect, useRef, useState } from "react"
import { cn } from "cn"
import { toast } from "sonner"
import { ApplicationHistory } from "@/components/ApplicationHistory"
import { CompanyLogo } from "@/components/CompanyMark"
import { ToolBar } from "@/components/ToolBar"
import type { Choice } from "@/components/ViewSettings"
import { Button } from "@/components/ui/button"
import {
  acknowledgeApplicationControl,
  loadApplicationMonitor,
  type MonitorSnapshot,
} from "@/lib/application-monitor"
import {
  applicationProgress,
  applicationUpdateLabel,
  type MonitoredRun,
} from "@/lib/application-progress"
import { cancelApplication } from "@/lib/application-runs"
import { overrideOf } from "@/lib/cells"
import { useData } from "@/lib/data"
import { driveControl } from "@/lib/drive-runs"
import { prepareInExtension } from "@/lib/extension-connect"
import type { Posting } from "@/lib/types"

const CORE_COLUMNS = new Set(["status", "activity", "next"])

interface ApplicationMonitorProps {
  monitor: MonitorSnapshot
  posts: ReadonlyArray<Posting>
  attempts: ReadonlyMap<string | null, MonitoredRun>
  orphanedAttempts: ReadonlyArray<MonitoredRun>
  onOpen: (post: Posting, history?: boolean) => void
  toolbar: React.ReactNode
  lead: React.ReactNode
  columns: ReadonlyArray<Choice>
  renderCell: (post: Posting, key: string) => React.ReactNode
  renderHeader: (label: string, key: string) => React.ReactNode
}

interface ApplicationRow {
  id: string
  post?: Posting
  attempt?: MonitoredRun
}

/** Adds application activity to the regular Tracker table, using compact rows when the available content width is narrow. */
export function ApplicationMonitor({
  monitor,
  posts,
  attempts,
  orphanedAttempts,
  onOpen,
  toolbar,
  lead,
  columns,
  renderCell,
  renderHeader,
}: ApplicationMonitorProps): React.JSX.Element {
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now)
  const [compact, setCompact] = useState(true)
  const frame = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!frame.current) return
    const observer = new ResizeObserver((entries) => {
      setCompact((entries[0]?.contentRect.width ?? 0) < 780)
    })
    observer.observe(frame.current)

    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const update = (): void => {
      if (!document.hidden) setNow(Date.now())
    }
    const timer = window.setInterval(update, 15_000)
    document.addEventListener("visibilitychange", update)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", update)
    }
  }, [])
  const rows: ApplicationRow[] = [
    ...posts.map((post) => ({ id: post.id, post: post, attempt: attempts.get(post.id) })),
    ...orphanedAttempts.map((attempt) => ({
      id: `${attempt.source}:${attempt.run.id}`,
      attempt: attempt,
    })),
  ]
  const orderedColumns = [
    ...columns.filter((column) => column.key !== "next"),
    ...columns.filter((column) => column.key === "next"),
  ]
  const extraColumns = columns.filter((column) => !CORE_COLUMNS.has(column.key))
  const show = (key: string): boolean => columns.some((column) => column.key === key)
  const openHistory = (row: ApplicationRow): void => {
    if (row.post) onOpen(row.post, Boolean(row.attempt))
    else setHistoryId(historyId === row.id ? null : row.id)
  }
  const activity = (row: ApplicationRow): React.ReactNode => {
    if (!row.attempt) return <span className="text-muted-foreground">Saved in your Tracker</span>
    const progress = applicationProgress(row.attempt, now)

    return (
      <div className="application-event">
        <p>{progress.message}</p>
        <time dateTime={progress.updatedAt} title={new Date(progress.updatedAt).toLocaleString()}>
          {applicationUpdateLabel(progress.updatedAt, now)}
        </time>
      </div>
    )
  }
  const cell = (row: ApplicationRow, key: string): React.ReactNode => {
    if (key === "status")
      return row.attempt ? (
        <ApplicationStatus attempt={row.attempt} now={now} />
      ) : row.post ? (
        renderCell(row.post, key)
      ) : null
    if (key === "activity") return activity(row)
    if (key === "next")
      return row.attempt ? (
        <ApplicationActions
          attempt={row.attempt}
          post={row.post}
          onOpen={onOpen}
          onHistory={() => openHistory(row)}
        />
      ) : row.post ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => openHistory(row)}
          className="cursor-pointer"
        >
          View job
        </Button>
      ) : null

    return row.post ? renderCell(row.post, key) : null
  }
  const history = (row: ApplicationRow): React.ReactNode =>
    historyId === row.id && row.attempt ? (
      <ApplicationHistory
        postingId={row.attempt.run.posting_id}
        url={row.attempt.run.url}
        initialOpen
      />
    ) : null

  return (
    <section
      ref={frame}
      aria-label="Application activity"
      className="application-tracker max-md:-mx-5"
    >
      <div className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card max-md:rounded-none max-md:border-x-0">
        <div className="application-toolbar border-b-[1.5px] border-line px-4 py-2.5">
          <ToolBar noun={{ one: "job", many: "jobs" }} lead={lead} tools={toolbar} />
        </div>
        {monitor.error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <p>{monitor.error}</p>
            <Button
              type="button"
              variant="outline"
              disabled={monitor.loading}
              onClick={() => {
                if (monitor.userId) void loadApplicationMonitor(monitor.userId, true)
              }}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              Try again
            </Button>
          </div>
        ) : null}
        {monitor.loading ? (
          <p role="status" className="px-4 py-3 text-sm text-muted-foreground">
            Loading application activity…
          </p>
        ) : null}
        {!rows.length && !monitor.loading && !monitor.error ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No jobs match this view.</p>
        ) : null}
        {!compact ? (
          <div className="application-table-wrap">
            <table
              className="application-table w-full table-fixed text-left text-sm"
              style={{
                minWidth: `${240 + orderedColumns.reduce((total, column) => total + (column.key === "activity" ? 220 : column.key === "next" ? 150 : column.key === "status" ? 130 : 160), 0)}px`,
              }}
            >
              <colgroup>
                <col />
                {orderedColumns.map((column) => (
                  <col
                    key={column.key}
                    style={{
                      width:
                        column.key === "activity"
                          ? 220
                          : column.key === "next"
                            ? 150
                            : column.key === "status"
                              ? 130
                              : 160,
                    }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b-[1.5px] border-line text-xs text-muted-foreground">
                  <th scope="col" className="application-name-cell px-3 py-2.5 font-medium">
                    {renderHeader("Job", "title")}
                  </th>
                  {orderedColumns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className={cn(
                        "px-3 py-2.5 font-medium",
                        column.key === "next" && "application-next-cell",
                      )}
                    >
                      {renderHeader(column.label, column.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className="border-b-[1.5px] border-line last:border-b-0">
                      <td className="application-name-cell px-3 py-3.5">
                        <ApplicationName row={row} onOpen={() => openHistory(row)} />
                      </td>
                      {orderedColumns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            "px-3 py-3.5 align-middle",
                            column.key === "next" && "application-next-cell",
                            !CORE_COLUMNS.has(column.key) && "truncate",
                          )}
                        >
                          {cell(row, column.key)}
                        </td>
                      ))}
                    </tr>
                    {historyId === row.id ? (
                      <tr>
                        <td
                          colSpan={orderedColumns.length + 1}
                          className="border-b-[1.5px] border-line px-4 py-3"
                        >
                          {history(row)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {compact ? (
          <ul className="application-compact">
            {rows.map((row) => (
              <li key={row.id} className="border-b-[1.5px] border-line px-4 py-3.5 last:border-b-0">
                <div className="application-compact-row">
                  <div className="application-job">
                    <ApplicationName row={row} onOpen={() => openHistory(row)} />
                  </div>
                  {show("status") ? (
                    <div className="application-status">{cell(row, "status")}</div>
                  ) : null}
                  {show("activity") ? (
                    <div className="application-note">{activity(row)}</div>
                  ) : null}
                  {show("next") ? (
                    <div className="application-next">{cell(row, "next")}</div>
                  ) : null}
                </div>
                {extraColumns.length && row.post ? (
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    {extraColumns.map((column) => (
                      <div key={column.key} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{column.label}</dt>
                        <dd className="mt-1 break-words">{cell(row, column.key)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {historyId === row.id ? <div className="mt-3">{history(row)}</div> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-[1.5px] border-line px-4 py-3 text-xs text-muted-foreground">
          <span>
            {rows.length} {rows.length === 1 ? "job" : "jobs"}
          </span>
          {monitor.hasMore ? (
            <Button
              type="button"
              variant="ghost"
              disabled={monitor.loading}
              onClick={() => {
                if (monitor.userId) void loadApplicationMonitor(monitor.userId)
              }}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              Load older applications
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/** Keeps one next step beside an immediate Stop control and updates state only after acknowledgement. */
function ApplicationActions({
  attempt,
  post,
  onOpen,
  onHistory,
}: {
  attempt: MonitoredRun
  post?: Posting
  onOpen: (post: Posting, history?: boolean) => void
  onHistory: () => void
}): React.JSX.Element {
  const userId = useData().session?.user.id
  const [busy, setBusy] = useState<"stop" | "continue" | "open" | null>(null)
  const progress = applicationProgress(attempt)
  const question =
    (attempt.source === "drive" && attempt.run.reason === "questions") ||
    (attempt.source === "desktop" && attempt.run.status === "needs_input")
  const primary = progress.canContinue ? "continue" : "open"
  const label = progress.canContinue
    ? "Continue"
    : progress.group === "review"
      ? "Review"
      : progress.group === "working" && progress.tabAvailable
        ? "Open"
        : question
          ? "Answer"
          : "View job"
  const act = async (action: "open" | "stop" | "continue"): Promise<void> => {
    if (busy || !userId) return
    setBusy(action)
    try {
      if (action === "open") {
        if (
          progress.tabAvailable &&
          attempt.run.url &&
          (progress.group === "working" || progress.group === "review")
        ) {
          await prepareInExtension(attempt.run.url, {
            reveal: true,
            postingId: attempt.run.posting_id || undefined,
          })
        } else if (post)
          onOpen(post, progress.group === "history" || attempt.run.status === "review")
        else onHistory()
      } else {
        if (attempt.source === "drive") {
          if (!(await driveControl(attempt.run.id, action)))
            throw new Error("That did not go through. Try again.")
        } else if (attempt.source === "desktop") await cancelApplication(attempt.run.id)
        acknowledgeApplicationControl(userId, attempt, action)
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Could not update this application.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="application-actions flex flex-nowrap items-center gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={Boolean(busy)}
        onClick={() => {
          void act(primary)
        }}
        className="cursor-pointer disabled:cursor-not-allowed"
      >
        {busy === "continue" ? "Continuing…" : label}
      </Button>
      {progress.canStop ? (
        <Button
          type="button"
          variant="ghost"
          aria-busy={busy === "stop"}
          disabled={Boolean(busy)}
          onClick={() => {
            void act("stop")
          }}
          className="cursor-pointer disabled:cursor-not-allowed"
        >
          Stop
        </Button>
      ) : null}
    </div>
  )
}

/** Uses existing semantic colors with explicit labels; a response or review state never implies submission. */
function ApplicationStatus({
  attempt,
  now,
}: {
  attempt: MonitoredRun
  now: number
}): React.JSX.Element {
  const progress = applicationProgress(attempt, now)
  const failed =
    attempt.run.status === "failed" ||
    (attempt.source === "manual" && attempt.run.stage === "rejected")
  const confirmed =
    attempt.run.status === "submitted" &&
    (attempt.source !== "manual" || ["applied", "offer", "hired"].includes(attempt.run.stage))
  const tone = failed
    ? "text-bad-foreground"
    : progress.group === "review" || confirmed
      ? "text-good-foreground"
      : progress.group === "attention" ||
          (attempt.source === "manual" && attempt.run.stage === "interview")
        ? "text-brand-ink"
        : progress.group === "working"
          ? "text-foreground"
          : "text-muted-foreground"

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-start gap-1.5 text-[0.8125rem] font-medium",
        tone,
      )}
    >
      <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current" />
      <span>{progress.label}</span>
    </span>
  )
}

/** Opens the existing job panel; unresolved postings retain a readable address and on-demand history. */
function ApplicationName({
  row,
  onOpen,
}: {
  row: ApplicationRow
  onOpen: () => void
}): React.JSX.Element {
  const notes = useData().profile.notes
  const post = row.post
  const manual = row.attempt?.source === "manual" ? row.attempt.run : null
  const title = post
    ? overrideOf(notes, post.id, "title") || post.title
    : manual?.title || "Job application"
  const company = post
    ? overrideOf(notes, post.id, "company") || post.employer_display
    : manual?.employer || row.attempt?.run.url

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 text-left"
    >
      {post ? (
        <span className="flex size-8 shrink-0 items-center justify-center">
          <CompanyLogo
            employer={post.employer}
            name={post.employer_display}
            size={28}
            wide={1.1}
            url={post.url}
          />
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm leading-snug font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{company}</span>
      </span>
    </button>
  )
}
