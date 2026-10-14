import { embedded, extensionParent } from "@/lib/embedded"
import { sourcesOf } from "@/components/SourceChips"
import type { Posting } from "@/lib/types"

/**
 * In the odds extension's panel: the job opened in the person's own tab with its application filled in by odds (LinkedIn's Easy Apply, or the
 * employer's own form; extension/apply.js and apply-any.js). The person checks it and sends it themselves. Outside the panel there is no browser
 * to fill it in, so nothing shows. Its own file, so the landing page does not load it.
 */
export function OddsApply({ post }: { post: Posting }): React.JSX.Element | null {
  const main = sourcesOf(post).find((s) => s.url)
  const parent = extensionParent()
  if (!embedded || !parent || !main?.url) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => window.parent.postMessage({ source: "odds-site", type: "apply", url: main.url }, parent)}
      title="Opens the job in your tab and fills its application in. You check it and send it."
      className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-[1.5px] border-brand bg-[oklch(0.97_0.025_50)] text-sm font-semibold text-brand transition-colors duration-150 outline-none hover:bg-[oklch(0.94_0.04_50)] focus-visible:ring-3 focus-visible:ring-brand/40 active:translate-y-px"
    >
      odds apply
      <span className="font-normal text-muted-foreground">· fills in the form for you</span>
    </button>
  )
}
