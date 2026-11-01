import { useEffect, useState } from "react"
import { HomeScreenGraphic, PromoSheet } from "@/components/PromoSheet"
import { isInstalled, openInstallGuide, platformOf, promptInstall, usePush } from "@/lib/push"

const HIDDEN_UNTIL = "odds:phone-prompt-until"
/** "Not now" keeps it away for three days, then it asks once more. */
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

function snoozed(): boolean {
  try {
    return Number(window.localStorage.getItem(HIDDEN_UNTIL) ?? 0) > Date.now()
  } catch {
    return false
  }
}

function snooze(): void {
  try {
    window.localStorage.setItem(HIDDEN_UNTIL, String(Date.now() + SNOOZE_MS))
  } catch {
    // Blocked storage: it asks again next visit, which is fine.
  }
}

/**
 * Panel one of two, on a phone in the browser, the first time someone is signed in: odds is now an app, and here is how to put it on
 * the Home Screen (the steps open in one tap, from InstallGuide). Never in the Home Screen app itself: there the second panel,
 * notifications (NotifyPrompt), takes over.
 */
export function AddToPhonePrompt({ active }: { active: boolean }): React.JSX.Element | null {
  const platform = platformOf()
  const push = usePush()
  const [open, setOpen] = useState<boolean>(false)

  useEffect(() => {
    if (!active || platform === "desktop" || isInstalled() || snoozed()) return
    // A moment after the app shows, so it lands on the jobs rather than on a blank page.
    const id = window.setTimeout(() => setOpen(true), 900)

    return () => window.clearTimeout(id)
  }, [active, platform])

  if (!open) return null

  function close(): void {
    snooze()
    setOpen(false)
  }

  async function add(): Promise<void> {
    setOpen(false)
    snooze()
    // Android Chrome can install in one tap; everywhere else the drawn steps show the way.
    if (platform === "android" && push.canPrompt && (await promptInstall())) return
    openInstallGuide()
  }

  return (
    <PromoSheet
      titleId="phone-prompt-title"
      graphic={<HomeScreenGraphic platform={platform} />}
      title="odds is now an app"
      body="Add it to your Home Screen and it opens in one tap, full screen, like any other app."
      points={["Opens in one tap, full screen", "Free, no App Store needed", "Then new jobs can reach you every morning"]}
      action="Show me how"
      onAction={() => void add()}
      onClose={close}
    />
  )
}
