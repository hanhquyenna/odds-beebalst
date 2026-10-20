import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface AccountMenuProps {
  email: string | null
  guest: boolean
  profileAvatar: string
  sessionAvatar: string
  name: string
  onDashboard?: () => void
  onAnswers: () => void
  onConnect?: () => void
  onClaude?: () => void
  onSignIn: () => void
  onSignOut: () => void
}

/** The circle in the header: your photo once signed in, and the way to your answers and out. */
export function AccountMenu({ email, guest, profileAvatar, sessionAvatar, name, onDashboard, onAnswers, onConnect, onClaude, onSignIn, onSignOut }: AccountMenuProps): React.JSX.Element {
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
      <PopoverTrigger aria-label="Account menu" className="flex size-10 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-brand font-extrabold text-foreground">
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
        {onConnect ? (
          <Button variant="ghost" onClick={() => choose(onConnect)} className="cursor-pointer justify-start">
            Connect
          </Button>
        ) : null}
        {onClaude ? (
          <Button variant="ghost" onClick={() => choose(onClaude)} className="cursor-pointer justify-start">
            Claude
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
