import { useState } from "react"
import { XIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { useExtensionPresent } from "@/lib/extension-connect"

const SEEN = "odds:extension-notice-seen"
const seen = (): boolean => {
  try {
    return window.localStorage.getItem(SEEN) === "1"
  } catch {
    return false
  }
}

/** Shown once the Chrome extension is found: what it does now, in one line. The X puts it away for good. */
export function ExtensionNotice({ onJobs }: { onJobs: () => void }): React.JSX.Element | null {
  const present = useExtensionPresent()
  const [hidden, setHidden] = useState<boolean>(seen)
  if (present !== "yes" || hidden) return null

  return (
    <section aria-label="Chrome is connected" className="phone-prompt-pop relative flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border-[1.5px] bg-card p-4 pr-12 sm:p-5 sm:pr-14">
      <div className="min-w-0">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Chrome is connected</h2>
        <p className="text-muted-foreground">Apply with Odds fills the form in the same tab. You check it and send it.</p>
      </div>
      <Button type="button" onClick={onJobs} className="h-10 cursor-pointer rounded-lg px-4">
        See jobs
      </Button>
      <button
        type="button"
        aria-label="Hide"
        onClick={() => {
          try {
            window.localStorage.setItem(SEEN, "1")
          } catch {
            // Blocked storage: it shows again next visit, which is fine.
          }
          setHidden(true)
        }}
        className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>
    </section>
  )
}
