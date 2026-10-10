import type { ReactNode } from "react"
import type { StaticPage } from "@/lib/pages"
import { prefetchOn } from "@/lib/prefetch"
import { NotificationsRow } from "@/components/NotifyPrompt"
import type { Session } from "@/lib/auth"
import { BriefcaseIcon, ChevronRightIcon, FileTextIcon, HomeIcon, SignOutIcon, MessageIcon, UserCircleIcon } from "@/components/icons"

/** The places someone with an account lives. Anything else (a research page, a shared job) leaves none of them lit. */
export type ShellTab = "account" | "jobs" | "documents" | "claude" | "answers"

interface ShellNav {
  active: ShellTab | null
  onNavigate: (tab: ShellTab) => void
}

const TABS: ReadonlyArray<{ tab: ShellTab; label: string; icon: typeof HomeIcon }> = [
  { tab: "account", label: "Home", icon: HomeIcon },
  { tab: "jobs", label: "Jobs", icon: BriefcaseIcon },
  { tab: "documents", label: "Documents", icon: FileTextIcon },
  { tab: "claude", label: "Claude", icon: MessageIcon },
  { tab: "answers", label: "Profile", icon: UserCircleIcon },
]

const PAGES: ReadonlyArray<{ page: StaticPage; label: string }> = [
  { page: "how-it-works", label: "How it works" },
  { page: "about", label: "About" },
  { page: "research", label: "Research" },
]

/**
 * Laptop and iPad: the app's own menu down the left edge, in place of the
 * website header. The account and the bell sit at its foot.
 */
export function AppSidebar({ active, onNavigate, onOpenPage, onHome, wordmark, bell, account, loadPages }: ShellNav & { onOpenPage: (page: StaticPage) => void; onHome: () => void; wordmark: ReactNode; bell: ReactNode; account: ReactNode; loadPages: () => Promise<unknown> }): React.JSX.Element {
  return (
    <aside aria-label="odds" className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r-[1.5px] border-foreground/15 bg-brand text-foreground md:flex">
      <button type="button" onClick={onHome} className="odds-wordmark cursor-pointer px-6 pt-7 pb-6 text-left text-xl font-semibold tracking-tight">
        {wordmark}
      </button>
      <nav aria-label="Your account" className="flex flex-col gap-1 px-3">
        {TABS.map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => onNavigate(tab)}
            aria-current={active === tab ? "page" : undefined}
            className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.95rem] font-semibold transition-colors ${active === tab ? "bg-foreground text-background" : "hover:bg-foreground/10"}`}
          >
            <Icon weight={active === tab ? "fill" : "regular"} className="size-5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>
      <nav aria-label="odds information" className="mt-6 flex flex-col gap-0.5 px-3 text-sm">
        {PAGES.map(({ page, label }) => (
          <button key={page} type="button" onClick={() => onOpenPage(page)} {...prefetchOn(loadPages)} className="cursor-pointer rounded-lg px-3 py-2 text-left text-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground">
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2 border-t-[1.5px] border-foreground/15 px-4 py-4">
        {account}
        {bell}
      </div>
    </aside>
  )
}

/** Phone: no website header. The name and the bell sit on the page like an app's title row, and scroll away with it. */
export function AppTopBar({ onHome, wordmark, bell }: { onHome: () => void; wordmark: ReactNode; bell: ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 bg-background px-5 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-1 md:hidden">
      <button type="button" onClick={onHome} className="odds-wordmark cursor-pointer">
        {wordmark}
      </button>
      {bell}
    </div>
  )
}

/** Phone: what the account menu holds on a wider screen, as a settings list at the foot of the profile. */
export function PhoneMore({ onOpenPage, onSignIn, onSignOut, signedIn, session }: { onOpenPage: (page: StaticPage) => void; onSignIn?: () => void; onSignOut: () => void; signedIn: boolean; session: Session | null }): React.JSX.Element {
  const row = "flex w-full cursor-pointer items-center justify-between px-4 py-3.5 text-left text-[0.95rem] font-medium active:bg-accent"

  return (
    <div className="flex flex-col gap-6 md:hidden">
      <NotificationsRow session={session} />
      <section aria-label="About odds" className="flex flex-col gap-2">
        <p className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">About odds</p>
        <ul className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card">
          {PAGES.map(({ page, label }) => (
            <li key={page} className="border-b-[1.5px] border-line last:border-b-0">
              <button type="button" onClick={() => onOpenPage(page)} className={row}>
                {label}
                <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <ul className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card">
        {onSignIn ? (
          <li className="border-b-[1.5px] border-line">
            <button type="button" onClick={onSignIn} className={row}>
              Continue with Google to keep it
              <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ) : null}
        <li>
          <button type="button" onClick={onSignOut} className={`${row} text-destructive`}>
            {signedIn ? "Sign out" : "Clear this device"}
            <SignOutIcon className="size-4" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>
  )
}

/** Phone: the tab bar every app has, pinned to the bottom and clear of the home indicator. */
export function BottomNav({ active, onNavigate }: ShellNav): React.JSX.Element {
  return (
    <nav aria-label="Your account" className="fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-foreground/15 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ tab, label, icon: Icon }) => (
          <li key={tab} className="flex-1">
            <button
              type="button"
              onClick={() => onNavigate(tab)}
              aria-current={active === tab ? "page" : undefined}
              className={`flex w-full cursor-pointer flex-col items-center gap-0.5 pt-2 pb-1.5 text-[0.7rem] font-semibold transition-colors ${active === tab ? "text-brand-ink" : "text-muted-foreground"}`}
            >
              <Icon weight={active === tab ? "fill" : "regular"} className="size-6" aria-hidden="true" />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
