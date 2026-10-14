import { useEffect, useState } from "react"
import { embedded, extensionParent } from "@/lib/embedded"
import { sourcesOf } from "@/components/SourceChips"
import { SparkleIcon } from "@/components/icons"
import type { Posting } from "@/lib/types"

/**
 * In the odds extension's panel: the job opened in the person's own tab with its application filled in by odds (LinkedIn's Easy Apply, or the
 * employer's own form; extension/apply.js and apply-any.js). The person checks it and sends it themselves. Outside the panel there is no browser
 * to fill it in, so nothing shows. Its own file, so the landing page does not load it.
 */
export function OddsApply({ post }: { post: Posting }): React.JSX.Element | null {
  const [sent, setSent] = useState(false)
  useEffect(() => {
    if (!sent) {
      return
    }
    const t = window.setTimeout(() => setSent(false), 4000)
    return () => window.clearTimeout(t)
  }, [sent])
  const main = sourcesOf(post).find((s) => s.url)
  const parent = extensionParent()
  if (!embedded || !parent || !main?.url) {
    return null
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={sent}
        onClick={() => {
          window.parent.postMessage({ source: "odds-site", type: "apply", url: main.url }, parent)
          setSent(true)
        }}
        className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-ink text-sm font-semibold text-white transition-[filter,transform] duration-150 outline-none hover:brightness-110 focus-visible:ring-3 focus-visible:ring-brand/40 active:translate-y-px disabled:cursor-default disabled:opacity-80"
      >
        <SparkleIcon weight="fill" className="size-4" aria-hidden="true" />
        {sent ? "Filling it in, in your tab…" : "odds apply"}
      </button>
      <p className="text-center text-xs text-muted-foreground">Fills in the application in your tab. You check it and send it.</p>
    </div>
  )
}
