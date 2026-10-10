import { Suspense, lazy, useEffect, useState } from "react"
import { JobListSkeleton } from "@/components/Skeleton"
import { Footer } from "@/components/Footer"
import type { ShellTab } from "@/components/AppShell"
import { usePhone } from "@/lib/use-phone"
import { AddToPhonePrompt } from "@/components/AddToPhonePrompt"
import { NotifyPrompt } from "@/components/NotifyPrompt"
import { DevicePairing } from "@/components/DevicePairing"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"
import { takeDriveReturn } from "@/lib/drive"
import { useData } from "@/lib/data"
import { pageFromPath, pathForPage, type StaticPage } from "@/lib/pages"
import { clearSeenRooms, saveSeenRooms } from "@/lib/seen"
import { useDocumentsSync } from "@/lib/use-documents"
import { isGuestEmail } from "@/lib/auth"
import { openInstallGuide, useInstallGuide } from "@/lib/push"
import { clearDraft } from "@/lib/session"
import { clearShooNext, forgetShooIdentity, isShooCallback } from "@/lib/shoo"
import { prefetchOn } from "@/lib/prefetch"

// Lazy because they carry the form schema. Someone coming back to their
// account needs neither.
// Lazy because only someone with an account sees them: the front page a visitor lands on never waits on the app's
// own menus or the bell, and stays inside its size budget (e2e/lean.spec.ts).
const AppSidebar = lazy(() => import("@/components/AppShell").then((module) => ({ default: module.AppSidebar })))
const AppTopBar = lazy(() => import("@/components/AppShell").then((module) => ({ default: module.AppTopBar })))
const BottomNav = lazy(() => import("@/components/AppShell").then((module) => ({ default: module.BottomNav })))
const PhoneMore = lazy(() => import("@/components/AppShell").then((module) => ({ default: module.PhoneMore })))
const NewJobsBell = lazy(() => import("@/components/NewPlacesBell").then((module) => ({ default: module.NewJobsBell })))
const SeekerJourney = lazy(() => import("@/components/SeekerJourney").then((module) => ({ default: module.SeekerJourney })))
const SignIn = lazy(() => import("@/components/SignIn").then((module) => ({ default: module.SignIn })))
// Lazy because they open after the first paint: a job opens from a list, and
// settings open from the menu. Landing and the account never wait on them.
const JobDetail = lazy(() => import("@/components/JobDetail").then((module) => ({ default: module.JobDetail })))
const Documents = lazy(() => import("@/components/Documents").then((module) => ({ default: module.Documents })))
const ProfilePage = lazy(() => import("@/components/ProfilePage").then((module) => ({ default: module.ProfilePage })))
const ClaudePage = lazy(() => import("@/components/ClaudeGuide").then((module) => ({ default: module.ClaudePage })))
// Lazy because it is one view among several: first-timers never load the
// boards and tables until they have answers, and returning users wait on it
// behind a skeleton.
const Account = lazy(() => import("@/components/Account").then((module) => ({ default: module.Account })))
// Lazy because it only renders on the long-read paths (/how-it-works, /about,
// /research, /privacy, /terms): the app itself never waits on it. The header
// links fetch it on hover or focus.
const loadStaticPages = (): Promise<typeof import("@/components/StaticPages")> => import("@/components/StaticPages")
const StaticPageView = lazy(() => loadStaticPages().then((module) => ({ default: module.StaticPageView })))
// Lazy because it only renders on the OAuth callback path: every other visit
// never needs the code-for-session trade.
const ShooCallback = lazy(() => import("@/components/ShooCallback").then((module) => ({ default: module.ShooCallback })))
// Lazy because each renders nothing until its moment comes: an offer event, the
// colors editor, the install steps. The first two are mounted only once there
// is an account, since only its boards and menus fire their events.
const OfferGate = lazy(() => import("@/components/OfferGate").then((module) => ({ default: module.OfferGate })))
const StatusColorsDialog = lazy(() => import("@/components/StatusColorsDialog").then((module) => ({ default: module.StatusColorsDialog })))
const InstallGuide = lazy(() => import("@/components/InstallGuide").then((module) => ({ default: module.InstallGuide })))

type View = "account" | "answers" | "claude" | "documents" | "journey" | "jobs" | "signin"

/** The job id in a /job/<id> deep link. Null for any other path, or a malformed escape like /job/abc% that cannot be decoded. */
function jobIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/job\/([^/]+)\/?$/)
  if (!match) {
    return null
  }
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export default function App(): React.JSX.Element {
  const data = useData()
  useDocumentsSync()
  const onboarded = data.profile.onboarded
  const installGuide = useInstallGuide()
  const phone = usePhone()
  // With answers already given the account is coming, so the welcome screen
  // must not flash first.
  const [view, setView] = useState<View>(() => (onboarded ? "account" : "journey"))
  // Bumped when the jobs are opened, so the bell recounts against the mark
  // that visit just left.
  const [visits, setVisits] = useState<number>(0)
  // Bumped by the wordmark, so the form remounts on the front page.
  const [homeVisits, setHomeVisits] = useState<number>(0)
  const [formEntry, setFormEntry] = useState<"welcome" | "intro">("welcome")
  const [page, setPage] = useState<StaticPage | null>(() => pageFromPath(location.pathname))
  const [sharedJobId, setSharedJobId] = useState<string | null>(() => jobIdFromPath(location.pathname))

  useEffect(() => {
    const onPop = (): void => {
      setPage(pageFromPath(location.pathname))
      setSharedJobId(jobIdFromPath(location.pathname))
    }
    window.addEventListener("popstate", onPop)

    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // Back from Google's Drive consent screen (/?drive=...): straight to Documents, saying how it went.
  useEffect(() => {
    if (!onboarded || !data.session) return
    const outcome = takeDriveReturn()
    if (!outcome) return
    setView("documents")
    if (outcome === "connected") toast.success("Google Drive is connected. Your files are in the odds folder there.")
    else if (outcome === "failed") toast.error("Google Drive did not connect. Try again.")
  }, [onboarded, data.session])

  // Signing in brings a saved profile down with it: from then on this is someone's account.
  useEffect(() => {
    if (onboarded && view === "journey" && homeVisits === 0 && data.session) {
      setView("account")
    }
  }, [onboarded, view, homeVisits, data.session])

  // A one-question form wants a narrow column whatever the screen. A wall of
  // jobs does not, so only the browsing views widen, and the header widens
  // with them so the wordmark stays over the content.
  // The front page is a web page, not a form, so it gets the widest column.
  const [landing, setLanding] = useState<boolean>(false)
  const wide = view === "account" || view === "jobs" || view === "claude" || (view === "answers" && onboarded)
  const column = page
  ? "max-w-sm sm:max-w-2xl lg:max-w-5xl"
  : sharedJobId
    ? "max-w-sm sm:max-w-2xl lg:max-w-5xl"
    : view === "journey" && landing
      ? "max-w-sm sm:max-w-2xl lg:max-w-6xl"
      : wide
        ? "max-w-sm sm:max-w-2xl lg:max-w-6xl"
        : "max-w-sm md:max-w-lg"


  /** Back to the front page. The form remounts on the welcome step, which is what the wordmark promises. */
  function goHome(): void {
    setHomeVisits((count) => count + 1)
    setFormEntry("welcome")
    setView("journey")
  }

  function openPage(next: StaticPage): void {
    history.pushState({}, "", pathForPage(next))
    setPage(next)
    window.scrollTo(0, 0)
  }

  function closePage(): void {
    history.pushState({}, "", "/")
    setPage(null)
    window.scrollTo(0, 0)
  }

  function closeSharedJob(): void {
    history.pushState({}, "", "/")
    setSharedJobId(null)
    setPage(null)
    window.scrollTo(0, 0)
  }

  function leaveSharedJob(nextView: View): void {
    if (sharedJobId) {
      history.pushState({}, "", "/")
      setSharedJobId(null)
      setPage(null)
    }
    setView(nextView)
    window.scrollTo(0, 0)
  }

  // "Edit" next to a figure that comes from the sign-up answers opens the profile at the section that holds them.
  useEffect(() => {
    const open = (event: Event): void => {
      const section = String((event as CustomEvent<string>).detail ?? "")
      history.replaceState({}, "", "/")
      setSharedJobId(null)
      setPage(null)
      setView(onboarded ? "answers" : "journey")
      let tries = 0
      const reveal = (): void => {
        const el = document.getElementById(section)
        if (el) {
          el.scrollIntoView({ block: "start" })
          el.querySelector<HTMLElement>("select, input, textarea")?.focus({ preventScroll: true })
        } else if (tries++ < 20) {
          window.setTimeout(reveal, 50)
        }
      }
      window.setTimeout(reveal, 50)
    }
    window.addEventListener("careersim:open-profile", open)

    return () => window.removeEventListener("careersim:open-profile", open)
  }, [onboarded])

  // A "See how it works" link anywhere on the page opens that research report.
  useEffect(() => {
    const open = (event: Event): void => {
      const slug = String((event as CustomEvent<string>).detail ?? "")
      setSharedJobId(null)
      history.pushState({}, "", `/research/${slug}`)
      setPage("research")
      window.scrollTo(0, 0)
    }
    window.addEventListener("careersim:open-research", open)

    return () => window.removeEventListener("careersim:open-research", open)
  }, [])

  // Anything that has just given this device a profile (the example one) asks for the personal list.
  useEffect(() => {
    const go = (): void => {
      leaveSharedJob("jobs")
      setVisits((count) => count + 1)
    }
    window.addEventListener("careersim:show-jobs", go)

    return () => window.removeEventListener("careersim:show-jobs", go)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedJobId])

  /** Opening the jobs marks them seen, which is what the bell counts from. */
  function showJobs(): void {
    saveSeenRooms(data.postings.map((post) => post.id))
    setVisits((count) => count + 1)
    setView("jobs")
  }

  // The morning message opens odds at ?open=new-jobs: straight to the jobs, and the number on the icon is cleared.
  useEffect(() => {
    // Waits for the session too: the install steps hand the phone a sign-in link only once it is known.
    if (data.status !== "ready" || !data.sessionChecked) {
      return
    }
    ;(navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.().catch(() => undefined)
    const params = new URLSearchParams(window.location.search)
    // A phone that scanned the QR code on a computer: straight to the steps for that phone.
    if (params.get("install") === "1") {
      params.delete("install")
      window.history.replaceState(null, "", `${window.location.pathname}${params.size > 0 ? `?${params}` : ""}${window.location.hash}`)
      openInstallGuide()
    }
    if (params.get("open") !== "new-jobs") {
      return
    }
    params.delete("open")
    window.history.replaceState(null, "", `${window.location.pathname}${params.size > 0 ? `?${params}` : ""}${window.location.hash}`)
    if (onboarded) {
      showJobs()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.status, data.sessionChecked])

  function handleSaved(): void {
    // Straight to the jobs. Someone who has just answered wants those, not
    // their own answers read back at them.
    showJobs()
  }

  function handleSignOut(): void {
    // The next person on this browser gets a blank form, not the last one's answers.
    clearDraft()
    clearSeenRooms()
    clearShooNext()
    void forgetShooIdentity()
    data.signOut()
    setView("journey")
    setHomeVisits((count) => count + 1)
    setFormEntry("welcome")
  }

  // Back from Google: the callback URL has done its job, the page is home again.
  const shooReturn = isShooCallback(location.pathname)

  function handleShooDone(next: "account" | "jobs" | "signin", search: string): void {
    // Back home, keeping whatever address the trip started from: a deep link
    // (?open, ?install, a phone code) survives the Google round trip.
    history.replaceState({}, "", `/${search}`)
    if (next === "jobs") {
      // A fresh sign-up: the answers are saved, the draft has done its job.
      clearDraft()
      showJobs()
    } else {
      setView(next)
    }
  }

  // Someone with an account gets the app: a side menu on a laptop or iPad, a tab bar on a phone, no website header.
  const shell = onboarded && !shooReturn && view !== "signin"
  const activeTab: ShellTab | null = page || sharedJobId ? null : view === "account" || view === "jobs" || view === "documents" || view === "claude" || view === "answers" ? view : null

  function goTab(tab: ShellTab): void {
    if (page || sharedJobId) {
      history.pushState({}, "", "/")
      setPage(null)
      setSharedJobId(null)
    }
    window.scrollTo(0, 0)
    if (tab === "jobs") {
      showJobs()
    } else {
      setView(tab)
    }
  }

  // Holds the bell's place while it loads, so nothing beside it jumps.
  const bell = (
    <Suspense fallback={<span className="size-10 shrink-0" aria-hidden="true" />}>
      <NewJobsBell refresh={visits} onOpen={showJobs} />
    </Suspense>
  )
  const accountMenu = (
    <AccountMenu email={isGuestEmail(data.session?.user.email) ? null : (data.session?.user.email ?? null)} guest={isGuestEmail(data.session?.user.email)} profileAvatar={data.profile.avatar || ""} sessionAvatar={data.session?.user.avatar || ""} name={data.profile.name} onDashboard={onboarded ? () => goTab("account") : undefined} onAnswers={() => goTab("answers")} onDocuments={onboarded ? () => goTab("documents") : undefined} onSignIn={() => leaveSharedJob("signin")} onSignOut={handleSignOut} />
  )

  return (
    <div className={`flex min-h-svh flex-col bg-background text-foreground ${shell ? "md:pl-60" : ""}`}>
      {/* A phone gets its messages at the bottom, over the tab bar, where a thumb can swipe them away. */}
      <Toaster position={phone && shell ? "bottom-center" : "top-center"} closeButton={!phone} mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 80px)" }} />
      {onboarded ? (
        <Suspense fallback={null}>
          <StatusColorsDialog />
          <OfferGate />
        </Suspense>
      ) : null}

      {/* Stays at the top, solid brand orange, the same as the footer, so the two bookend the page. */}
      {shell ? (
        <Suspense fallback={null}>
          <AppSidebar active={activeTab} onNavigate={goTab} onOpenPage={openPage} onHome={() => goTab("account")} wordmark={<Wordmark />} bell={bell} account={accountMenu} loadPages={loadStaticPages} />
          <AppTopBar onHome={() => goTab("account")} wordmark={<Wordmark />} bell={bell} />
        </Suspense>
      ) : null}
      {shell ? null : (
      <header className={`sticky top-0 z-20 bg-brand text-foreground ${view === "signin" && !page ? "max-md:hidden" : ""}`}>
        <div className={`mx-auto flex w-full ${column} flex-nowrap items-center justify-between gap-2.5 px-4 py-3 sm:gap-2 sm:px-6 sm:py-4`}>
          {/* The wordmark is the way home: the account for someone with answers
              saved, the front page for everyone else. */}
          <button
            type="button"
            onClick={() => (page ? closePage() : onboarded ? setView("account") : goHome())}
            className="odds-wordmark shrink-0 cursor-pointer text-xl font-semibold tracking-tight text-foreground"
          >
            <Wordmark />
          </button>
          <nav aria-label="odds information" className="flex min-w-0 flex-1 items-center justify-end gap-2.5 text-xs sm:gap-4 sm:pl-4 md:gap-5 md:pl-6 md:text-sm">
            {(["how-it-works", "about", "research"] as const).map((nextPage) => (
              <button
                key={nextPage}
                type="button"
                onClick={() => openPage(nextPage)}
                {...prefetchOn(loadStaticPages)}
                className="shrink-0 cursor-pointer whitespace-nowrap py-2 text-foreground underline-offset-4 hover:underline focus:underline"
              >
                {nextPage === "how-it-works" ? "How it works" : nextPage === "about" ? "About" : "Research"}
              </button>
            ))}
          </nav>
          {onboarded || data.session ? (
            <div className="flex shrink-0 items-center gap-1.5 sm:ml-2 sm:gap-2">
              {bell}
              {accountMenu}
            </div>
          ) : !page && !sharedJobId && view === "journey" ? (
            <Button type="button" variant="ghost" onClick={() => leaveSharedJob("signin")} className="h-9 shrink-0 cursor-pointer px-1.5 text-xs font-semibold text-foreground hover:bg-foreground/10 sm:px-3 sm:text-sm">
              Sign in
            </Button>
          ) : null}
        </div>
      </header>
      )}

      <main className={`mx-auto flex w-full ${page ? "max-w-5xl" : column} flex-1 flex-col px-5 pt-8 sm:px-6 ${shell ? "pt-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pt-8 md:pb-7" : "pb-7"}`}>
        {data.status === "loading" ? (
          <JobListSkeleton />
        ) : data.status === "error" ? (
          <p className="py-20 text-center text-destructive">Could not load the jobs: {data.error}</p>
        ) : sharedJobId ? (
          <Suspense fallback={<JobListSkeleton />}>
            <PublicJobRoute
              id={sharedJobId}
              onBack={closeSharedJob}
              onUnlock={() => {
                setFormEntry("intro")
                leaveSharedJob("journey")
              }}
            />
          </Suspense>
        ) : page ? (
          <Suspense fallback={<JobListSkeleton />}>
            <StaticPageView page={page} onBack={closePage} onOpenPage={openPage} />
          </Suspense>
        ) : shooReturn ? (
          <Suspense fallback={<JobListSkeleton />}>
            {/* Waits for the stored session, so a guest's token is refreshed before it is handed over. */}
            {data.sessionChecked ? <ShooCallback onDone={handleShooDone} /> : <JobListSkeleton />}
          </Suspense>
        ) : (
          <Suspense fallback={null}>
            {view === "signin" ? <SignIn onCancel={() => setView(onboarded ? "account" : "journey")} /> : null}

            {(view === "account" || view === "jobs") && onboarded ? (
              <Suspense fallback={<JobListSkeleton />}>
                <Account looking={view === "jobs"} onEdit={() => setView("answers")} onStartLooking={showJobs} onStopLooking={() => setView("account")} onOpenClaude={() => goTab("claude")} />
              </Suspense>
            ) : null}

            {view === "answers" && onboarded ? (
              <>
                <ProfilePage onBack={() => setView("account")} onOpenDocuments={() => setView("documents")} onOpenClaude={() => goTab("claude")} />
                <PhoneMore session={data.session} onOpenPage={openPage} signedIn={Boolean(data.session?.user.email) && !isGuestEmail(data.session?.user.email)} onSignIn={data.session?.user.email && !isGuestEmail(data.session.user.email) ? undefined : () => setView("signin")} onSignOut={handleSignOut} />
              </>
            ) : null}

            {view === "claude" && onboarded ? <ClaudePage onBack={() => setView("account")} onSignIn={() => setView("signin")} onDocuments={() => setView("documents")} onJobs={showJobs} /> : null}

            {view === "documents" && onboarded ? (
              <Suspense fallback={null}>
                <Documents onBack={() => setView("account")} onSignIn={() => setView("signin")} />
              </Suspense>
            ) : null}

            {(view === "answers" && !onboarded) || view === "journey" || ((view === "account" || view === "jobs") && !onboarded) ? (
              <SeekerJourney
                // Keyed on the mode, so switching between signing up and
                // editing starts from the right step.
                key={`${onboarded ? "me" : "anon"}-${view}-${homeVisits}`}
                mode={view === "answers" ? "edit" : "signup"}
                atWelcome={homeVisits > 0}
                atIntro={formEntry === "intro"}
                onBack={() => (onboarded ? setView("account") : goHome())}
                // Settings stay on the page after a save; signing up goes to the jobs.
                onSaved={view === "answers" ? () => undefined : handleSaved}
                onSignIn={() => setView("signin")}
                onWelcome={setLanding}
                onOpenPage={openPage}
              />
            ) : null}
          </Suspense>
        )}

        {view !== "signin" || page ? (
          <div className={shell ? "hidden md:contents" : "contents"}>
            <Footer onOpenPage={openPage} />
          </div>
        ) : null}
      </main>
      {installGuide ? (
        <Suspense fallback={null}>
          <InstallGuide session={data.session} onClose={() => openInstallGuide(false)} />
        </Suspense>
      ) : null}
      {shell ? (
        <Suspense fallback={null}>
          <BottomNav active={activeTab} onNavigate={goTab} />
        </Suspense>
      ) : null}
      <AddToPhonePrompt active={shell && Boolean(data.session) && data.status === "ready" && !installGuide} />
      <NotifyPrompt session={data.session} />
      <DevicePairing />
    </div>
  )
}

function PublicJobRoute({ id, onBack, onUnlock }: { id: string; onBack: () => void; onUnlock: () => void }): React.JSX.Element {
  const data = useData()
  const post = data.byId.get(id)

  if (!post) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">This job is not in the list.</p>
        <Button className="mt-4 cursor-pointer" onClick={onBack}>
          See the jobs
        </Button>
      </div>
    )
  }

  return <JobDetail post={post} locked={data.profile.onboarded ? undefined : { onUnlock }} onBack={onBack} />
}

interface AccountMenuProps {
  email: string | null
  guest: boolean
  profileAvatar: string
  sessionAvatar: string
  name: string
  onDashboard?: () => void
  onAnswers: () => void
  onDocuments?: () => void
  onSignIn: () => void
  onSignOut: () => void
}

/** The circle in the header: your photo once signed in, and the way to your answers and out. */
function AccountMenu({ email, guest, profileAvatar, sessionAvatar, name, onDashboard, onAnswers, onDocuments, onSignIn, onSignOut }: AccountMenuProps): React.JSX.Element {
  // Controlled so choosing an item closes it; left open it covered the page it opened.
  const [open, setOpen] = useState<boolean>(false)
  // A dead photo URL falls through to the next source, then to the initial.
  const sources = [profileAvatar, sessionAvatar].filter((src, index, all) => src !== "" && all.indexOf(src) === index)
  const sourcesKey = sources.join("|")
  const [seenSources, setSeenSources] = useState<string>(sourcesKey)
  const [skipped, setSkipped] = useState<number>(0)
  // A new person resets the fallthrough: derive during render, not in an effect.
  if (seenSources !== sourcesKey) {
    setSeenSources(sourcesKey)
    setSkipped(0)
  }
  const displayName = name.trim()

  function choose(action: () => void): void {
    setOpen(false)
    action()
  }

  const photo = sources[skipped] ?? ""

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label="Account menu" className="flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border-[1.5px] border-foreground bg-background font-semibold text-primary">
        {photo ? (
          <img src={photo} alt="" onError={() => setSkipped((n) => n + 1)} className="size-full object-cover" />
        ) : (
          (displayName || email || (guest ? "Guest" : "Me")).charAt(0).toUpperCase()
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-60 flex-col p-0">
        <div className="border-b-[1.5px] px-4 py-3">
          <div className="font-medium">{displayName || email || (guest ? "Guest" : "Your profile")}</div>
          <div className="text-sm text-muted-foreground">{email ? "Saved to your account" : guest ? "Guest on this device" : "Saved on this device only"}</div>
        </div>
        {onDashboard ? (
          <Button variant="ghost" onClick={() => choose(onDashboard)} className="cursor-pointer justify-start">
            Dashboard
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => choose(onAnswers)} className="cursor-pointer justify-start">
          Profile and settings
        </Button>
        {onDocuments ? (
          <Button variant="ghost" onClick={() => choose(onDocuments)} className="cursor-pointer justify-start">
            Documents
          </Button>
        ) : null}
        {email ? null : (
          <Button variant="ghost" onClick={() => choose(onSignIn)} className="cursor-pointer justify-start">
            Continue with Google to keep it
          </Button>
        )}
        <Button variant="ghost" onClick={() => choose(onSignOut)} className="cursor-pointer justify-start text-destructive">
          {email ? "Sign out" : "Clear this device"}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** The name on the orange header, all in black so the "o" does not vanish into the orange. The round mark sits by the headline on the front page. */
function Wordmark(): React.JSX.Element {
  return <span className="text-[1.75rem] leading-none font-bold tracking-[-0.05em]">odds</span>
}
