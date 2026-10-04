import { BellIcon } from "@/components/icons"
import { useMemo, useState } from "react"
import { InstallGuide } from "@/components/InstallGuide"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useData } from "@/lib/data"
import { standing } from "@/lib/engine"
import { DEFAULT_FILTERS, activeCount, applyFilters, normalizeFilters } from "@/lib/filters"
import { platformOf, promptInstall, turnOnNotifications, usePush } from "@/lib/push"
import { loadSeenRooms } from "@/lib/seen"

/** Anything past this is shown as a plus, so the badge stays a badge. */
const MOST_SHOWN = 9

interface NewJobsBellProps {
  onOpen: () => void
  /** Bumped by the parent on every visit to the jobs, which marks them seen. */
  refresh: number
}

/**
 * What has turned up since this browser last looked: jobs that clear your hard
 * requirements and that you have not been shown yet. One press says what is
 * new, a second goes to it. The badge counts only those that fit, the same
 * number the Start looking button carries.
 */
export function NewJobsBell({ onOpen, refresh }: NewJobsBellProps): React.JSX.Element {
  const data = useData()
  const [open, setOpen] = useState<boolean>(false)

  const fresh = useMemo(() => {
    if (!data.reference || !data.shares) {
      return []
    }
    const seen = loadSeenRooms()
    // A first visit has nothing to compare against, so nothing is new yet.
    if (!seen) {
      return []
    }

    // Only jobs the list itself would show: the person's saved preferences when they are on, otherwise the list's opening filters
    // (internship, traineeship and entry, English). A new senior job or a job that needs Dutch is not news for them.
    const prefs = data.profile.prefs ? normalizeFilters(data.profile.prefs) : null
    const filters = data.profile.prefsOn && prefs && activeCount(prefs) > 0 ? prefs : DEFAULT_FILTERS

    return applyFilters(data.postings, filters, { signals: data.signals, reference: data.reference })
      .filter((post) => !seen.has(post.id) && !data.passed.has(post.id) && !data.saved.has(post.id))
      .filter((post) => standing(post, data.profile, data.reference!, data.shares!, undefined, data.referrals.has(post.id)).failing === 0)
    // refresh is a trigger: a visit to the jobs marks them seen, and the count must be taken again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.postings, data.passed, data.saved, data.profile, data.reference, data.shares, data.referrals, data.signals, refresh])

  const count = fresh.length
  const push = usePush()
  const [guide, setGuide] = useState<boolean>(false)
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  // After a LinkedIn import, until this device gets the morning message, the bell asks for it.
  const invite = Boolean(data.session && data.profile.linkedin) && (push.state === "install" || push.state === "ask" || push.state === "blocked")

  async function addToHomeScreen(): Promise<void> {
    // Android and computers can offer their own one-tap install; iPhones need the steps.
    if (push.canPrompt && (await promptInstall())) {
      return
    }
    setOpen(false)
    setGuide(true)
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

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={count > 0 ? `${count} new jobs that fit` : "No new jobs"} className="relative flex size-11 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors duration-150 hover:bg-foreground/10">
        <BellIcon weight="fill" className="size-8" aria-hidden="true" />
        {count > 0 ? (
          <span className="absolute -top-1 -right-1 rounded-full bg-background px-1.5 text-[11px] font-semibold text-foreground tabular-nums">{count > MOST_SHOWN ? `${MOST_SHOWN}+` : count}</span>
        ) : invite ? (
          <span aria-hidden="true" className="absolute top-1 right-1 size-3 rounded-full bg-brand ring-2 ring-background" />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-2 p-3">
        {invite ? (
          <div className="flex flex-col gap-2 border-b-[1.5px] pb-3">
            {push.state === "install" ? (
              <>
                <p className="text-sm font-medium">Get your jobs every morning</p>
                <p className="text-xs text-muted-foreground">Add odds to your Home Screen and get the new jobs that fit you at 8 every morning.</p>
                <Button size="sm" onClick={() => void addToHomeScreen()} className="cursor-pointer">
                  Add to Home Screen
                </Button>
              </>
            ) : push.state === "ask" ? (
              <>
                <p className="text-sm font-medium">Turn on notifications</p>
                <p className="text-xs text-muted-foreground">Get the new jobs that fit you at 8 every morning.</p>
                <Button size="sm" disabled={busy} onClick={() => void turnOn()} className="cursor-pointer">
                  {busy ? "Turning on…" : "Turn on notifications"}
                </Button>
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Notifications are off for odds</p>
                <p className="text-xs text-muted-foreground">
                  {platformOf() === "ios" ? "Turn them on in Settings, Notifications, odds." : platformOf() === "android" ? "Turn them on in Settings, Apps, odds, Notifications." : "Turn them on in your browser's site settings for odds."}
                </p>
              </>
            )}
          </div>
        ) : null}
        {count > 0 ? (
          <>
            <p className="text-sm font-medium">{count === 1 ? "1 new job fits you" : `${count} new jobs fit you`}</p>
            <p className="text-xs text-muted-foreground">Added since you last opened the jobs, inside your filters, and meeting your requirements.</p>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {fresh.slice(0, 4).map((post) => (
                <li key={post.id} className="truncate">
                  {post.title} · {post.employer_display}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              onClick={() => {
                setOpen(false)
                onOpen()
              }}
              className="cursor-pointer"
            >
              See them
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing new since you last looked, inside your filters. We keep looking.</p>
        )}
      </PopoverContent>
    </Popover>
    {guide ? <InstallGuide onClose={() => setGuide(false)} /> : null}
    </>
  )
}
