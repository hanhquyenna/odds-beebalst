import { BellSimpleIcon, BriefcaseIcon, CalendarIcon, CheckIcon, ChevronRightIcon, BadgeCheckIcon } from "@/components/icons"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { CompanyLogo } from "@/components/CompanyMark"
import { JobDrawer } from "@/components/JobBoard"
import { usePhone } from "@/lib/use-phone"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useData } from "@/lib/data"
import { standing } from "@/lib/engine"
import { applyFilters } from "@/lib/filters"
import { fitFilters } from "@/lib/fit-filters"
import { useFollowDays } from "@/lib/follow-days"
import { appliedDay, followUpFor, overrideOf } from "@/lib/cells"
import { useSavedViews } from "@/lib/use-saved-views"
import { todayIso } from "@/lib/tracker"
import { readStored, store } from "@/lib/remembered"
import { openInstallGuide, platformOf, promptInstall, turnOnNotifications, useHasPhone, usePush } from "@/lib/push"
import { loadSeenRooms } from "@/lib/seen"
import type { Posting } from "@/lib/types"

/** Anything past this is shown as a plus, so the badge stays a badge. */
const MOST_SHOWN = 9
/** A new job whose fit reads at least this strong is its own notification, not one of the batch. */
const STRONG_FIT = 0.75
/** A saved job closing within this many days is a notification. */
const DEADLINE_DAYS = 3
const READ_KEY = "odds:notifications-read"
const LAST_KEY = "odds:notifications-count"

interface NewJobsBellProps {
  onOpen: () => void
  /** Bumped by the parent on every visit to the jobs, which marks them seen. */
  refresh: number
}

/** One notification. The id is stable while the thing it is about stays the same, so having read it sticks. */
interface Note {
  id: string
  title: string
  detail: string
  post?: Posting
}

interface Group {
  key: "new" | "fit" | "follow" | "deadline"
  title: string
  notes: Note[]
}

const MS_DAY = 86_400_000

/**
 * Everything worth a look, in sections: new jobs that fit (one notification for the batch), each new job that fits
 * you very well, applications due a follow-up, and saved jobs about to close. The bell is orange; a red number counts
 * what you have not opened yet, and opening the panel reads them. A new arrival shakes the bell, says so, and puts
 * the number on the Home Screen icon.
 */
export function NewJobsBell({ onOpen, refresh }: NewJobsBellProps): React.JSX.Element {
  const data = useData()
  const fitView = useSavedViews("fit")
  const follow = useFollowDays()
  const [open, setOpen] = useState<boolean>(false)
  const [job, setJob] = useState<Posting | null>(null)
  const phone = usePhone()
  const [read, setRead] = useState<ReadonlyArray<string>>(() => readList())

  const { fresh, strong } = useMemo(() => {
    if (!data.reference || !data.shares) {
      return { fresh: [], strong: [] }
    }
    const seen = loadSeenRooms()
    // A first visit has nothing to compare against, so nothing is new yet.
    if (!seen) {
      return { fresh: [], strong: [] }
    }

    // The same jobs as "Jobs that fit you" and the morning message (src/lib/fit-filters.ts).
    const filters = fitFilters({ ...fitView.active.filters, query: "" }, data.profile)
    const fits: Array<{ post: Posting; score: number }> = []
    for (const post of applyFilters(data.postings, filters, { signals: data.signals, reference: data.reference })) {
      if (seen.has(post.id) || data.passed.has(post.id) || data.saved.has(post.id)) continue
      const s = standing(post, data.profile, data.reference, data.shares, undefined, data.referrals.has(post.id))
      if (s.failing === 0) fits.push({ post, score: s.fit?.score ?? 0 })
    }

    return { fresh: fits.map((f) => f.post), strong: fits.filter((f) => f.score >= STRONG_FIT).sort((a, b) => b.score - a.score) }
    // refresh is a trigger: a visit to the jobs marks them seen, and the count must be taken again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.postings, data.passed, data.saved, data.profile, data.reference, data.shares, data.referrals, data.signals, fitView.active, refresh])

  const groups = useMemo<Group[]>(() => {
    const kept = [...data.postings, ...data.keptExtra]
    const byId = new Map(kept.map((p) => [p.id, p]))
    const notes = data.profile.notes
    const followUps: Note[] = []
    for (const app of data.applications) {
      const post = byId.get(app.posting_id)
      if (!post) continue
      const f = followUpFor(app, overrideOf(notes, post.id, "followup"), appliedDay(app, overrideOf(notes, post.id, "applied")), new Date(), follow.followUp)
      if (f?.due) followUps.push({ id: `follow:${post.id}:${f.on}`, title: `Follow up: ${post.title}`, detail: `${post.employer_display} · ${f.inDays === 0 ? "due today" : `${-f.inDays} ${f.inDays === -1 ? "day" : "days"} overdue`}`, post })
    }
    const applied = new Set(data.applications.map((a) => a.posting_id))
    const today = Date.parse(`${todayIso()}T00:00:00Z`)
    const deadlines: Note[] = []
    for (const post of kept) {
      if (!data.saved.has(post.id) || applied.has(post.id) || post.closed_at) continue
      const until = (overrideOf(notes, post.id, "deadline") || post.valid_through || "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) continue
      // Whole calendar days from today, so a deadline tomorrow reads "tomorrow" whatever the hour.
      const days = Math.round((Date.parse(`${until}T00:00:00Z`) - today) / MS_DAY)
      if (days >= 0 && days <= DEADLINE_DAYS) deadlines.push({ id: `deadline:${post.id}:${until}`, title: `Closes ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}: ${post.title}`, detail: `${post.employer_display} · you saved it, not applied yet`, post })
    }
    const batch: Note[] = fresh.length > 0 ? [{ id: `new:${fresh.length}:${fresh[0].id}`, title: fresh.length === 1 ? "1 new job fits you" : `${fresh.length} new jobs fit you`, detail: fresh.slice(0, 3).map((p) => p.employer_display).filter((v, i, all) => all.indexOf(v) === i).join(", ") + (fresh.length > 3 ? " and more" : "") }] : []

    return [
      { key: "new", title: "New jobs", notes: batch },
      { key: "fit", title: "Strong fits", notes: strong.map(({ post, score }) => ({ id: `fit:${post.id}`, title: post.title, detail: `${post.employer_display} · ${Math.round(score * 100)}% match with your profile`, post })) },
      { key: "follow", title: "Follow-ups due", notes: followUps },
      { key: "deadline", title: "Closing soon", notes: deadlines },
    ]
  }, [fresh, strong, data.postings, data.keptExtra, data.applications, data.saved, data.profile.notes, follow.followUp])

  const all = groups.flatMap((g) => g.notes)
  const unread = all.filter((n) => !read.includes(n.id))
  const count = unread.length

  // Something new since the last look: shake the bell, say so once, and put the number on the Home Screen icon.
  const [shake, setShake] = useState<boolean>(false)
  const first = useRef<boolean>(true)
  useEffect(() => {
    const before = Number(readStored(LAST_KEY) ?? "0") || 0
    store(LAST_KEY, String(count))
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    void (count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => undefined)
    if (count > before && !first.current) {
      setShake(true)
      toast(count - before === 1 ? "1 new notification" : `${count - before} new notifications`, { id: "notifications", action: { label: "Open", onClick: () => setOpen(true) } })
      window.setTimeout(() => setShake(false), 900)
    }
    first.current = false
  }, [count])

  function openPanel(next: boolean): void {
    setOpen(next)
    // Opening the panel reads everything in it; the items stay until they are dealt with.
    if (next && unread.length > 0) {
      const ids = [...new Set([...read, ...all.map((n) => n.id)])].slice(-400)
      setRead(ids)
      store(READ_KEY, JSON.stringify(ids))
    }
  }

  const push = usePush()
  const hasPhone = useHasPhone(data.session)
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const desktop = platformOf() === "desktop"
  // After a LinkedIn import, until one of the person's phones gets the morning message, the bell asks for it.
  const invite = Boolean(data.session && data.profile.linkedin) && !hasPhone && (push.state === "install" || push.state === "ask" || push.state === "blocked")

  async function addToPhone(): Promise<void> {
    // Android offers its own one-tap install; a computer shows the QR code and an iPhone the steps.
    if (!desktop && push.canPrompt && (await promptInstall())) {
      return
    }
    setOpen(false)
    openInstallGuide()
  }

  async function turnOn(): Promise<void> {
    if (!data.session) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await turnOnNotifications(data.session.user.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not turn on notifications.")
    } finally {
      setBusy(false)
    }
  }

  function pick(note: Note): void {
    setOpen(false)
    if (note.post) {
      setJob(note.post)
    } else {
      onOpen()
    }
  }

  const badge = count > 0 ? (
    <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white tabular-nums ring-2 ring-background">{count > MOST_SHOWN ? `${MOST_SHOWN}+` : count}</span>
  ) : invite ? (
    <span aria-hidden="true" className="absolute top-0 right-0 size-3 rounded-full bg-red-600 ring-2 ring-background" />
  ) : null
  const triggerClass = `relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-white shadow-sm ring-2 ring-background transition-transform duration-150 active:scale-95 ${shake ? "bell-shake" : ""}`
  const label = count > 0 ? `${count} unread ${count === 1 ? "notification" : "notifications"}` : "Notifications"
  const bell = <BellSimpleIcon weight={count > 0 ? "fill" : "bold"} className="size-5" aria-hidden="true" />

  const shown = groups.filter((g) => g.notes.length > 0)
  const panel = (
    <div className="flex flex-col gap-5">
      <p className="text-lg font-semibold tracking-tight">Notifications</p>

      {invite ? (
        <div className="flex gap-3 rounded-xl bg-secondary p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
            <BellSimpleIcon weight="fill" className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {push.state === "install" ? (
              <>
                <p className="text-sm font-semibold">{desktop ? "Get your jobs on your phone" : "Get your jobs every morning"}</p>
                <p className="text-xs text-muted-foreground">{desktop ? "Add odds to your phone and get the new jobs that fit you at 8 every morning." : "Add odds to your Home Screen and get the new jobs that fit you at 8 every morning."}</p>
                <Button size="sm" onClick={() => void addToPhone()} className="mt-1 w-fit cursor-pointer rounded-full px-4">
                  {desktop ? "Add to your phone" : "Add to Home Screen"}
                </Button>
              </>
            ) : push.state === "ask" ? (
              <>
                <p className="text-sm font-semibold">Turn on notifications</p>
                <p className="text-xs text-muted-foreground">Get pinged when new jobs fit you, at 8 every morning.</p>
                <Button size="sm" disabled={busy} onClick={() => void turnOn()} className="mt-1 w-fit cursor-pointer rounded-full px-4">
                  {busy ? "Turning on…" : "Turn on"}
                </Button>
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Notifications are off for odds</p>
                <p className="text-xs text-muted-foreground">
                  {platformOf() === "ios" ? "Turn them on in Settings, Notifications, odds." : platformOf() === "android" ? "Turn them on in Settings, Apps, odds, Notifications." : "Turn them on in your browser's site settings for odds."}
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
            <CheckIcon weight="bold" className="size-6" aria-hidden="true" />
          </span>
          <p className="font-semibold">You're all caught up</p>
          <p className="max-w-64 text-sm text-muted-foreground">Nothing new inside your filters since you last looked. We keep looking.</p>
        </div>
      ) : (
        shown.map((g) => (
          <section key={g.key} aria-label={g.title} className="flex flex-col gap-2">
            <h3 className="flex items-baseline gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {g.title}
              <span className="tabular-nums">{g.notes.length}</span>
            </h3>
            <ul className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card">
              {g.notes.slice(0, 5).map((n) => (
                <li key={n.id} className="border-b-[1.5px] border-line last:border-b-0">
                  <button type="button" onClick={() => pick(n)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent active:bg-accent">
                    <NoteIcon group={g.key} post={n.post} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="line-clamp-2 text-sm leading-snug font-semibold">{n.title}</span>
                      <span className="truncate text-xs text-muted-foreground">{n.detail}</span>
                    </span>
                    {!read.includes(n.id) ? <span className="size-2 shrink-0 rounded-full bg-red-600" aria-label="Unread" /> : <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
            {g.notes.length > 5 ? <p className="text-xs text-muted-foreground">and {g.notes.length - 5} more</p> : null}
            {g.key === "new" ? (
              <Button onClick={() => pick(g.notes[0])} className="h-11 w-full cursor-pointer rounded-full">
                See the new jobs
              </Button>
            ) : null}
          </section>
        ))
      )}
    </div>
  )

  const drawer = job ? <JobDrawer key={job.id} post={job} onClose={() => setJob(null)} onSwitch={setJob} /> : null

  if (phone) {
    return (
      <>
        <button type="button" aria-label={label} onClick={() => openPanel(true)} className={triggerClass}>
          {bell}
          {badge}
        </button>
        {open ? <Sheet onClose={() => setOpen(false)}>{panel}</Sheet> : null}
        {drawer}
      </>
    )
  }

  return (
    <>
      <Popover open={open} onOpenChange={openPanel}>
        <PopoverTrigger aria-label={label} className={triggerClass}>
          {bell}
          {badge}
        </PopoverTrigger>
        <PopoverContent align="end" className="max-h-[80vh] w-96 overflow-y-auto rounded-2xl p-4">
          {panel}
        </PopoverContent>
      </Popover>
      {drawer}
    </>
  )
}

/** The picture beside a notification: the company's logo for a job, an icon for the batch. */
function NoteIcon({ group, post }: { group: Group["key"]; post?: Posting }): React.JSX.Element {
  if (post) {
    return (
      <span className="relative flex size-10 shrink-0 items-center justify-center">
        <CompanyLogo employer={post.employer} name={post.employer_display} size={32} wide={1.2} url={post.url} />
        <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card text-brand ring-2 ring-card">
          {group === "fit" ? <BadgeCheckIcon weight="fill" className="size-4" aria-hidden="true" /> : <CalendarIcon weight="fill" className="size-3.5" aria-hidden="true" />}
        </span>
      </span>
    )
  }

  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
      <BriefcaseIcon weight="fill" className="size-5" aria-hidden="true" />
    </span>
  )
}

function readList(): string[] {
  try {
    const parsed: unknown = JSON.parse(readStored(READ_KEY) ?? "[]")

    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

/** A phone's way to show a panel: up from the bottom, with a handle, over a dimmed page. Tapping outside or Escape closes it. */
function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/40 animate-in fade-in duration-200" />
      <div role="dialog" aria-modal="true" aria-label="Notifications" className="absolute inset-x-0 bottom-0 max-h-[85svh] overflow-y-auto rounded-t-3xl bg-background px-5 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-foreground/15" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  )
}
