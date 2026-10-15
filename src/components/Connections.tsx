import { useState } from "react"
import { DriveCard } from "@/components/Documents"
import { EnvelopeIcon } from "@/components/icons"
import { Section } from "@/components/Section"
import { useExtensionPresent } from "@/lib/extension-connect"

/** What one-click applying runs on: Drive for files, Gmail for outreach, and the Chrome extension that fills the forms. */
export function Connections({ onSignIn }: { onSignIn: () => void }): React.JSX.Element {
  const extension = useExtensionPresent()
  const [problem, setProblem] = useState<string | null>(null)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Connect</h1>
      <p className="text-sm text-muted-foreground">Hook these up once so applying and outreach can run in one click.</p>

      <Section title="Google Drive">
        <DriveCard onProblem={setProblem} onSignIn={onSignIn} />
        {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
      </Section>

      <Section title="Gmail">
        <div className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] bg-card p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <EnvelopeIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-bold">Gmail</p>
              <p className="text-sm text-muted-foreground">Send follow-ups and outreach from your own inbox</p>
            </div>
          </div>
          <span className="shrink-0 rounded-md border-[1.5px] border-dashed px-2.5 py-1 text-sm font-medium text-muted-foreground">Soon</span>
        </div>
      </Section>

      <Section id="autofill-chrome" title="Browser extension">
        <div className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] bg-card p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-lg font-bold">Odds for Chrome</p>
            <p className="text-sm text-muted-foreground">Fills application forms on job sites</p>
          </div>
          <span className={`shrink-0 rounded-md px-2.5 py-1 text-sm font-medium ${extension === "yes" ? "bg-good text-good-foreground" : "border-[1.5px] border-dashed text-muted-foreground"}`}>{extension === "yes" ? "Connected" : extension === "looking" ? "Checking" : "Not connected"}</span>
        </div>
      </Section>
    </div>
  )
}
