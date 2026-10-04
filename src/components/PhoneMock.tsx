import { BatteryIcon, BellIcon, BookOpenIcon, ChevronLeftIcon, CopyIcon, DotsThreeIcon, DotsThreeVerticalIcon, LockIcon, PlusIcon, PlusSquareIcon, SearchIcon, ShareIcon, SignalIcon, StarIcon, WifiIcon, XIcon } from "@/components/icons"
import { cn } from "cn"

/**
 * Drawings of a phone for the "Add odds to your Home Screen" steps: the iPhone (Safari) and Android (Chrome) screens a
 * person will see, with odds itself on them. What to tap carries an orange ring.
 */

export type IosScreen = "safari" | "menu" | "share" | "add" | "home" | "allow" | "lock"
export type AndroidScreen = "chrome" | "menu" | "install" | "home" | "allow" | "lock"

const BLUE = "#0A84FF"

/** The address shown in the drawings: the site the person is on, so the steps match their screen. */
const HOST = typeof window !== "undefined" && !/^(localhost|127\.|\[::1\])/.test(window.location.hostname) ? window.location.hostname : "odds"

/** The orange ring around what to tap, with a soft pulse. */
function Tap({ className, round = false, inside = false }: { className?: string; round?: boolean; inside?: boolean }): React.JSX.Element {
  return (
    <span aria-hidden="true" className={cn("pointer-events-none absolute z-20", inside ? "inset-0.5" : "-inset-1", round ? "rounded-full" : "rounded-xl", className)}>
      {inside ? null : <span className={cn("absolute inset-0 animate-ping border-[3px] border-brand opacity-60", round ? "rounded-full" : "rounded-xl")} />}
      <span className={cn("absolute inset-0 border-[3px] border-brand", round ? "rounded-full" : "rounded-xl")} />
    </span>
  )
}

function OddsIcon({ className }: { className?: string }): React.JSX.Element {
  return <img src="/icons/apple-touch-icon.png" alt="" className={cn("rounded-[22%]", className)} />
}

function StatusBar({ light = false, android = false }: { light?: boolean; android?: boolean }): React.JSX.Element {
  return (
    <div className={cn("relative z-10 flex h-8 shrink-0 items-center justify-between text-[10px] font-semibold", android ? "px-3.5" : "px-6 pt-1", light ? "text-white" : "text-black")}>
      <span>{android ? "08:00" : "9:41"}</span>
      <span className="flex items-center gap-1">
        <SignalIcon className="size-3" />
        <WifiIcon className="size-3" />
        <BatteryIcon className="size-3.5" />
      </span>
    </div>
  )
}

/** The phone itself: frame, screen, and the island or the camera dot. */
function Frame({ android = false, children }: { android?: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className={cn("relative mx-auto h-[476px] w-[228px] shrink-0 bg-[#111] p-[7px] shadow-xl", android ? "rounded-[2rem]" : "rounded-[2.6rem]")}>
      <div className={cn("relative flex h-full w-full flex-col overflow-hidden bg-white", android ? "rounded-[1.6rem]" : "rounded-[2.2rem]")}>
        {android ? <span aria-hidden="true" className="absolute top-2.5 left-1/2 z-30 size-2.5 -translate-x-1/2 rounded-full bg-black" /> : <span aria-hidden="true" className="absolute top-2 left-1/2 z-30 h-[18px] w-[66px] -translate-x-1/2 rounded-full bg-black" />}
        {children}
      </div>
    </div>
  )
}

/** odds as it looks on a phone: a real screenshot of the page. */
function Page({ src = "/install/app-home.jpg" }: { src?: string }): React.JSX.Element {
  return <img src={src} alt="" className="min-h-0 w-full flex-1 object-cover object-top" />
}

function HomeIndicator({ light = false }: { light?: boolean }): React.JSX.Element {
  return <span aria-hidden="true" className={cn("absolute bottom-1.5 left-1/2 z-30 h-1 w-20 -translate-x-1/2 rounded-full", light ? "bg-white" : "bg-black")} />
}

/** Safari's bar at the bottom (iOS 26): back, the address, and ··· . */
function SafariBar({ tapDots = false }: { tapDots?: boolean }): React.JSX.Element {
  return (
    <div className="absolute inset-x-2 bottom-5 z-10 flex items-center gap-1.5">
      <span className="flex size-8 items-center justify-center rounded-full bg-white/90 shadow-md ring-1 ring-black/5">
        <ChevronLeftIcon className="size-3.5 text-black" />
      </span>
      <span className="flex h-8 flex-1 items-center justify-center gap-1 rounded-full bg-white/90 text-[11px] text-black shadow-md ring-1 ring-black/5">
        <LockIcon className="size-2.5 text-neutral-500" />
        {HOST}
      </span>
      <span className="relative flex size-8 items-center justify-center rounded-full bg-white/90 shadow-md ring-1 ring-black/5">
        <DotsThreeIcon className="size-4 text-black" />
        {tapDots ? <Tap round /> : null}
      </span>
    </div>
  )
}

function Row({ icon, label, tap = false, last = false }: { icon: React.ReactNode; label: string; tap?: boolean; last?: boolean }): React.JSX.Element {
  return (
    <div className={cn("relative flex items-center justify-between px-3 py-2 text-[11px] text-black", !last && "border-b border-black/10")}>
      <span>{label}</span>
      <span className="text-black">{icon}</span>
      {tap ? <Tap inside /> : null}
    </div>
  )
}

/** The Home Screen with odds on it, iPhone or Android. */
function HomeScreen({ android = false, tap = true }: { android?: boolean; tap?: boolean }): React.JSX.Element {
  const others = ["#34C759", "#FF9500", "#5856D6", "#FF2D55", "#0A84FF", "#8E8E93", "#30B0C7", "#AF52DE", "#FFCC00", "#64D2FF", "#A2845E"]

  return (
    <div className="relative flex h-full flex-col bg-[linear-gradient(160deg,#2b2a28,#7a4a22_55%,#f0872a)]">
      <StatusBar light android={android} />
      <div className="grid grid-cols-4 gap-x-3 gap-y-3 px-4 pt-4">
        {others.map((c) => (
          <span key={c} className="flex flex-col items-center gap-1">
            <span className={cn("size-10", android ? "rounded-full" : "rounded-[22%]")} style={{ background: c, opacity: 0.9 }} />
            <span aria-hidden="true" className="h-1 w-7 rounded-full bg-white/50" />
          </span>
        ))}
        <span className="relative flex flex-col items-center gap-1">
          <span className="relative">
            <OddsIcon className={cn("size-10", android && "rounded-full")} />
            {tap ? <Tap /> : null}
          </span>
          <span className="text-[9px] font-medium text-white">odds</span>
        </span>
      </div>
      {!android ? (
        <div className="absolute inset-x-3 bottom-4 flex justify-around rounded-[1.4rem] bg-white/25 px-3 py-2.5 backdrop-blur">
          {["#34C759", "#0A84FF", "#FF9500", "#FF2D55"].map((c) => (
            <span key={c} className="size-10 rounded-[22%]" style={{ background: c }} />
          ))}
        </div>
      ) : null}
      <HomeIndicator light />
    </div>
  )
}

/** The lock screen with the morning message. */
function LockScreen({ android = false }: { android?: boolean }): React.JSX.Element {
  return (
    <div className="relative flex h-full flex-col bg-[linear-gradient(160deg,#2b2a28,#7a4a22_55%,#f0872a)] text-white">
      <StatusBar light android={android} />
      <div className="mt-6 text-center">
        <p className="text-[11px] font-medium opacity-90">Monday 5 October</p>
        <p className="text-5xl font-semibold tracking-tight">8:00</p>
      </div>
      <div className="relative mx-2.5 mt-auto mb-16 flex items-start gap-2 rounded-2xl bg-white/90 p-2.5 text-black shadow-lg">
        <OddsIcon className="size-8 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex justify-between text-[10px] font-semibold">
            odds<span className="font-normal text-neutral-500">now</span>
          </span>
          <span className="block text-[11px] leading-snug font-semibold">5 new jobs fit you</span>
          <span className="block text-[10px] leading-snug text-neutral-600">Marketing Intern at Picnic and 4 more</span>
        </span>
        <Tap className="-inset-0.5" />
      </div>
      <HomeIndicator light />
    </div>
  )
}

/** odds open from the Home Screen: no browser bars, the bell at the top with its box open. */
function AppWithBell(): React.JSX.Element {
  return (
    <>
      <StatusBar />
      <div className="flex items-center justify-between border-b border-black/10 px-3 pb-1.5">
        <span className="flex items-center gap-1 text-[13px] font-bold">
          <OddsIcon className="size-4 rounded-full" />
          odds
        </span>
        <span className="relative">
          <BellIcon weight="fill" className="size-5 text-brand" />
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-brand ring-2 ring-white" />
        </span>
      </div>
      <div className="relative min-h-0 flex-1">
        <img src="/install/app-jobs.jpg" alt="" className="h-full w-full object-cover object-[0_-40px]" />
        <div className="absolute top-1 right-2 w-[150px] rounded-xl border-[1.5px] border-black/20 bg-white p-2.5 shadow-lg">
          <p className="text-[10px] font-semibold text-black">Turn on notifications</p>
          <p className="mt-0.5 text-[9px] leading-snug text-neutral-600">Get the new jobs that fit you at 8 every morning.</p>
          <span className="relative mt-1.5 block rounded-md bg-[#1c1a19] py-1 text-center text-[9px] font-medium text-white">Turn on notifications</span>
        </div>
      </div>
    </>
  )
}

export function IosPhone({ screen }: { screen: IosScreen }): React.JSX.Element {
  if (screen === "home") {
    return (
      <Frame>
        <HomeScreen />
      </Frame>
    )
  }
  if (screen === "lock") {
    return (
      <Frame>
        <LockScreen />
      </Frame>
    )
  }
  if (screen === "allow") {
    return (
      <Frame>
        <AppWithBell />
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 px-5">
          <div className="w-full overflow-hidden rounded-2xl bg-white/95 text-center text-black shadow-xl">
            <p className="px-3 pt-3 text-[11px] leading-snug font-semibold">“odds” Would Like to Send You Notifications</p>
            <p className="px-3 pt-1 pb-3 text-[9px] leading-snug text-neutral-600">Notifications may include alerts, sounds and icon badges. These can be configured in Settings.</p>
            <div className="grid grid-cols-2 border-t border-black/10 text-[11px]">
              <span className="border-r border-black/10 py-2" style={{ color: BLUE }}>
                Don’t Allow
              </span>
              <span className="relative py-2 font-semibold" style={{ color: BLUE }}>
                Allow
                <Tap inside />
              </span>
            </div>
          </div>
        </div>
        <HomeIndicator />
      </Frame>
    )
  }

  return (
    <Frame>
      <StatusBar />
      <Page />
      {screen === "safari" || screen === "menu" ? <SafariBar tapDots={screen === "safari"} /> : null}
      {screen === "menu" ? (
        <div className="absolute right-2 bottom-16 z-20 w-40 overflow-hidden rounded-2xl bg-white/95 shadow-2xl ring-1 ring-black/10">
          <Row icon={<ShareIcon className="size-3.5" />} label="Share" tap />
          <Row icon={<BookOpenIcon className="size-3.5" />} label="Add to Bookmarks" />
          <Row icon={<StarIcon className="size-3.5" />} label="Add to Favourites" />
          <Row icon={<PlusIcon className="size-3.5" />} label="New Tab" last />
        </div>
      ) : null}
      {screen === "share" ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex h-[78%] flex-col rounded-t-2xl bg-[#f2f2f7] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2.5">
            <OddsIcon className="size-7" />
            <span className="min-w-0 flex-1 text-[10px] leading-tight text-black">
              <span className="block truncate font-semibold">odds · Jobs in the Netherlands</span>
              <span className="text-neutral-500">{HOST}</span>
            </span>
            <span className="flex size-5 items-center justify-center rounded-full bg-black/10">
              <XIcon className="size-2.5 text-neutral-600" />
            </span>
          </div>
          <div className="flex justify-around px-2 py-2.5">
            {[
              ["#0A84FF", "AirDrop"],
              ["#34C759", "Messages"],
              ["#0A84FF", "Mail"],
              ["#FFCC00", "Notes"],
            ].map(([c, name]) => (
              <span key={name} className="flex flex-col items-center gap-1 text-[8px] text-black">
                <span className="size-9 rounded-[22%]" style={{ background: c }} />
                {name}
              </span>
            ))}
          </div>
          <div className="mx-2.5 overflow-hidden rounded-xl bg-white">
            <Row icon={<CopyIcon className="size-3.5" />} label="Copy" />
            <Row icon={<BookOpenIcon className="size-3.5" />} label="Add Bookmark" />
            <Row icon={<StarIcon className="size-3.5" />} label="Add to Favourites" />
            <Row icon={<SearchIcon className="size-3.5" />} label="Find on Page" />
            <Row icon={<PlusSquareIcon className="size-3.5" />} label="Add to Home Screen" tap last />
          </div>
        </div>
      ) : null}
      {screen === "add" ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex h-[86%] flex-col rounded-t-2xl bg-[#f2f2f7] shadow-2xl">
          <div className="flex items-center justify-between px-3 py-3 text-[11px]">
            <span style={{ color: BLUE }}>Cancel</span>
            <span className="font-semibold text-black">Add to Home Screen</span>
            <span className="relative font-semibold" style={{ color: BLUE }}>
              Add
              <Tap />
            </span>
          </div>
          <div className="mx-2.5 flex items-center gap-2.5 rounded-xl bg-white p-2.5">
            <OddsIcon className="size-11" />
            <span className="flex-1 text-[11px] text-black">
              <span className="block border-b border-black/10 pb-1">odds</span>
              <span className="block pt-1 text-neutral-500">{HOST}</span>
            </span>
          </div>
          <div className="relative mx-2.5 mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-[11px] text-black">
            Open as Web App
            <span className="relative flex h-4 w-7 items-center justify-end rounded-full bg-[#34C759] px-0.5">
              <span className="size-3 rounded-full bg-white" />
            </span>
          </div>
        </div>
      ) : null}
      <HomeIndicator />
    </Frame>
  )
}

export function AndroidPhone({ screen }: { screen: AndroidScreen }): React.JSX.Element {
  if (screen === "home") {
    return (
      <Frame android>
        <HomeScreen android />
      </Frame>
    )
  }
  if (screen === "lock") {
    return (
      <Frame android>
        <LockScreen android />
      </Frame>
    )
  }
  if (screen === "allow") {
    return (
      <Frame android>
        <AppWithBell />
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full rounded-3xl bg-[#f3eef4] p-4 text-center text-black shadow-xl">
            <BellIcon className="mx-auto size-5 text-[#3c3c43]" />
            <p className="mt-2 text-[12px] leading-snug">
              Allow <b>odds</b> to send you notifications?
            </p>
            <span className="relative mt-3 block rounded-full bg-[#5b4b8a] py-2 text-[11px] font-medium text-white">
              Allow
              <Tap round />
            </span>
            <span className="mt-1.5 block rounded-full py-2 text-[11px] font-medium text-[#5b4b8a]">Don’t allow</span>
          </div>
        </div>
      </Frame>
    )
  }

  return (
    <Frame android>
      <StatusBar android />
      <div className="flex items-center gap-1.5 px-2 pb-1.5">
        <span className="flex h-7 flex-1 items-center gap-1 rounded-full bg-[#eef0f3] px-2.5 text-[11px] text-black">
          <LockIcon className="size-2.5 text-neutral-500" />
          {HOST}
        </span>
        <span className="flex size-6 items-center justify-center rounded-md border-[1.5px] border-black/60 text-[9px] font-semibold text-black">2</span>
        <span className="relative flex size-6 items-center justify-center">
          <DotsThreeVerticalIcon className="size-4 text-black" />
          {screen === "chrome" ? <Tap round /> : null}
        </span>
      </div>
      <Page />
      {screen === "menu" ? (
        <div className="absolute top-9 right-1.5 z-20 w-40 overflow-hidden rounded-xl bg-white py-1 text-[11px] text-black shadow-2xl ring-1 ring-black/10">
          {["New tab", "History", "Downloads", "Bookmarks", "Share…"].map((label) => (
            <span key={label} className="block px-3 py-1.5">
              {label}
            </span>
          ))}
          <span className="relative mx-1 block px-2 py-1.5 font-medium">
            Add to Home screen
            <Tap />
          </span>
        </div>
      ) : null}
      {screen === "install" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full rounded-3xl bg-white p-4 text-black shadow-xl">
            <p className="text-[13px] font-medium">Install app</p>
            <div className="mt-3 flex items-center gap-2.5">
              <OddsIcon className="size-9 rounded-full" />
              <span className="text-[11px] leading-tight">
                <span className="block font-semibold">odds</span>
                <span className="text-neutral-500">{HOST}</span>
              </span>
            </div>
            <div className="mt-4 flex justify-end gap-4 text-[11px] font-medium text-[#1a73e8]">
              <span className="py-1">Cancel</span>
              <span className="relative px-1 py-1">
                Install
                <Tap />
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </Frame>
  )
}
