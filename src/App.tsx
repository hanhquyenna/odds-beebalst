import { Suspense, lazy, useEffect, useState } from "react"
import logoUrl from "@/logo.svg"
import { Account } from "@/components/Account"
import { JobListSkeleton } from "@/components/Skeleton"
import { ProfilePage } from "@/components/ProfilePage"
import { Footer } from "@/components/Footer"
import { JobDetail } from "@/components/JobDetail"
import { InstallGuide } from "@/components/InstallGuide"
import { NewJobsBell } from "@/components/NewPlacesBell"
import { NotifyPrompt } from "@/components/NotifyPrompt"
import { StaticPageView } from "@/components/StaticPages"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { OfferGate } from "@/components/OfferGate"
import { StatusColorsDialog } from "@/components/StatusColorsDialog"
import { ShooCallback } from "@/components/ShooCallback"
import { Toaster } from "@/components/ui/sonner"
import { useData } from "@/lib/data"
import { pageFromPath, pathForPage, type StaticPage } from "@/lib/pages"
import { clearSeenRooms, saveSeenRooms } from "@/lib/seen"
import { isGuestEmail } from "@/lib/auth"
import { openInstallGuide, useInstallGuide } from "@/lib/push"
import { clearDraft } from "@/lib/session"
import { isShooCallback } from "@/lib/shoo"

// Lazy because they carry the form schema. Someone coming back to their
// account needs neither.
const SeekerJourney = lazy(() => import("@/components/SeekerJourney").then((module) => ({ default: module.SeekerJourney })))
const SignIn = lazy(() => import("@/components/SignIn").then((module) => ({ default: module.SignIn })))

type View = "account" | "answers" | "journey" | "jobs" | "signin"

function jobIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/job\/([^/]+)\/?$/)

  return match ? decodeURIComponent(match[1]) : null
}

export default function App(): React.JSX.Element {
  const data = useData()
  const onboarded = data.profile.onboarded
  const installGuide = useInstallGuide()
  // With answers already given the account is coming, so the welcome screen
  // must not flash first.
  const [view, setView] = useState<View>(() => (onboarded ? "account" : "journey"))
  // Bumped when the jobs are opened, so the bell recounts against the mark
  // that visit just left.
  const [visits, setVisits] = useState<number>(0)
  // Bumped by the wordmark, so the form remounts on the front page.
  const [homeVisits, setHomeVisits] = useState<number>(0)
  const [formEntry, setFormEntry] = useState<"welcome" | "intro">("welcome")
  const scrolled = useScrolled()
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
  const wide = view === "account" || view === "jobs" || (view === "answers" && onboarded)
  const column = page
  ? "max-w-sm sm:max-w-2xl lg:max-w-5xl"
  : sharedJobId
    ? "max-w-sm sm:max-w-2xl lg:max-w-5xl"
    : view === "journey" && landing
      ? "max-w-sm sm:max-w-2xl lg:max-w-6xl"
      : wide
        ? "max-w-sm sm:max-w-2xl lg:max-w-6xl"
        : "max-w-sm md:max-w-lg"

  // The front page, the sign-up questions and the long-read pages carry the serif; the app itself does not.
  const serif = Boolean(page) || (!sharedJobId && !((view === "account" || view === "jobs" || view === "answers") && onboarded))

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
    if (data.status !== "ready") {
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
  }, [data.status])

  function handleSaved(): void {
    // Straight to the jobs. Someone who has just answered wants those, not
    // their own answers read back at them.
    showJobs()
  }

  function handleSignOut(): void {
    // The next person on this browser gets a blank form, not the last one's answers.
    clearDraft()
    clearSeenRooms()
    data.signOut()
    setView("journey")
    setHomeVisits((count) => count + 1)
    setFormEntry("welcome")
  }

  // Back from Google: the callback URL has done its job, the page is home again.
  const shooReturn = isShooCallback(location.pathname)

  function handleShooDone(next: "account" | "jobs" | "signin"): void {
    history.replaceState({}, "", "/")
    if (next === "jobs") {
      // A fresh sign-up: the answers are saved, the draft has done its job.
      clearDraft()
      showJobs()
    } else {
      setView(next)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <Toaster position="top-center" closeButton />
      <StatusColorsDialog />
      <OfferGate />

      {/* Stays at the top. Clear over the front page's glow; once the page has
          scrolled a little it takes a translucent paper background and a rule,
          so the wordmark stays legible over whatever passes under it. */}
      <header className={`sticky top-0 z-20 transition-colors duration-300 ${scrolled ? "border-b-[1.5px] bg-background" : "border-b-[1.5px] border-transparent"}`}>
        <div className={`mx-auto flex w-full ${column} flex-nowrap items-center justify-between gap-2.5 px-4 py-3 sm:gap-2 sm:px-6 sm:py-4`}>
          {/* The wordmark is the way home: the account for someone with answers
              saved, the front page for everyone else. */}
          <button
            type="button"
            onClick={() => (page ? closePage() : onboarded ? setView("account") : goHome())}
            className="roomie-wordmark shrink-0 cursor-pointer text-xl font-semibold tracking-tight text-primary"
          >
            <Wordmark />
          </button>
          <nav aria-label="odds information" className="flex min-w-0 flex-1 items-center justify-end gap-2.5 text-xs sm:gap-4 sm:pl-4 md:gap-5 md:pl-6 md:text-sm">
            {(["how-it-works", "about", "research"] as const).map((nextPage) => (
              <button
                key={nextPage}
                type="button"
                onClick={() => openPage(nextPage)}
                className="shrink-0 cursor-pointer whitespace-nowrap py-2 text-muted-foreground transition-colors hover:text-foreground focus:text-foreground"
              >
                {nextPage === "how-it-works" ? "How it works" : nextPage === "about" ? "About" : "Research"}
              </button>
            ))}
          </nav>
          {onboarded ? (
            <div className="flex shrink-0 items-center gap-1.5 sm:ml-2 sm:gap-2">
              <NewJobsBell refresh={visits} onOpen={showJobs} />
              <AccountMenu email={isGuestEmail(data.session?.user.email) ? null : (data.session?.user.email ?? null)} avatar={data.profile.avatar} name={data.profile.name} onDashboard={onboarded ? () => setView("account") : undefined} onAnswers={() => setView("answers")} onSignIn={() => leaveSharedJob("signin")} onSignOut={handleSignOut} />
            </div>
          ) : !page && view === "journey" ? (
            <Button type="button" variant="ghost" onClick={() => leaveSharedJob("signin")} className="h-9 shrink-0 cursor-pointer px-1.5 text-xs font-medium sm:px-3 sm:text-sm">
              Sign in
            </Button>
          ) : null}
        </div>
      </header>

      <main className={`mx-auto flex w-full ${page ? "max-w-5xl" : column} flex-1 flex-col px-5 pt-8 pb-7 sm:px-6 ${serif ? "font-display-headings" : ""}`}>
        {data.status === "loading" ? (
          <JobListSkeleton />
        ) : data.status === "error" ? (
          <p className="py-20 text-center text-destructive">Could not load the jobs: {data.error}</p>
        ) : sharedJobId ? (
          <PublicJobRoute
            id={sharedJobId}
            onBack={closeSharedJob}
            onUnlock={() => {
              setFormEntry("intro")
              leaveSharedJob("journey")
            }}
          />
        ) : page ? (
          <StaticPageView page={page} onBack={closePage} onOpenPage={openPage} />
        ) : shooReturn ? (
          <ShooCallback onDone={handleShooDone} />
        ) : (
          <Suspense fallback={null}>
            {view === "signin" ? <SignIn onCancel={() => setView(onboarded ? "account" : "journey")} onSignedIn={() => setView("account")} /> : null}

            {(view === "account" || view === "jobs") && onboarded ? (
              <Account looking={view === "jobs"} onEdit={() => setView("answers")} onStartLooking={showJobs} onStopLooking={() => setView("account")} />
            ) : null}

            {view === "answers" && onboarded ? <ProfilePage onBack={() => setView("account")} /> : null}

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

        {view !== "signin" || page ? <Footer onOpenPage={openPage} /> : null}
      </main>
      {installGuide ? <InstallGuide session={data.session} onClose={() => openInstallGuide(false)} /> : null}
      <NotifyPrompt session={data.session} />
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
  avatar: string
  name: string
  onDashboard?: () => void
  onAnswers: () => void
  onSignIn: () => void
  onSignOut: () => void
}

/** The circle in the header: your initial, and the way to your answers and out. */
function AccountMenu({ email, avatar, name, onDashboard, onAnswers, onSignIn, onSignOut }: AccountMenuProps): React.JSX.Element {
  // Controlled so choosing an item closes it; left open it covered the page it opened.
  const [open, setOpen] = useState<boolean>(false)

  function choose(action: () => void): void {
    setOpen(false)
    action()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label="Account menu" className="flex size-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border-[1.5px] bg-accent font-semibold text-primary">
        {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : (name || email || "Me").trim().charAt(0).toUpperCase()}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-60 flex-col p-0">
        <div className="border-b-[1.5px] px-4 py-3">
          <div className="font-medium">{name || email || "Your profile"}</div>
          <div className="text-sm text-muted-foreground">{email ? "Saved to your account" : "Saved on this device only"}</div>
        </div>
        {onDashboard ? (
          <Button variant="ghost" onClick={() => choose(onDashboard)} className="cursor-pointer justify-start">
            Dashboard
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => choose(onAnswers)} className="cursor-pointer justify-start">
          Profile and settings
        </Button>
        {email ? null : (
          <Button variant="ghost" onClick={() => choose(onSignIn)} className="cursor-pointer justify-start">
            Sign in to keep it
          </Button>
        )}
        <Button variant="ghost" onClick={() => choose(onSignOut)} className="cursor-pointer justify-start text-destructive">
          {email ? "Sign out" : "Clear this device"}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** True once the page has moved more than a few pixels down. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState<boolean>(false)

  useEffect(() => {
    const read = (): void => setScrolled(window.scrollY > 8)
    read()
    window.addEventListener("scroll", read, { passive: true })

    return () => window.removeEventListener("scroll", read)
  }, [])

  return scrolled
}

/** The mark and the name, as the brand draws them. Same mark as the favicon. */
function Wordmark(): React.JSX.Element {
  return (
    <span className="flex items-center gap-2">
      <img src={logoUrl} alt="" className="size-9" />
      <span className="text-[1.75rem] leading-none font-bold tracking-[-0.05em]">
        <span className="text-brand">o</span>dds
      </span>
    </span>
  )
}
