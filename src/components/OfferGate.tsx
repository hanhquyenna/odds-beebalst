import { useEffect, useMemo, useRef, useState } from "react"
import { moveJob } from "@/components/PipelineBoard"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { point, standing } from "@/lib/engine"
import type { Posting } from "@/lib/types"

export const OFFER_EVENT = "odds:confirm-offer"

interface Pending {
  post: Posting
  fit: string
}

/** Asks for the offer to be confirmed, then celebrates it and offers to share it. */
export function askAboutOffer(post: Posting, fit: string): void {
  window.dispatchEvent(new CustomEvent<Pending>(OFFER_EVENT, { detail: { post, fit } }))
}

/** The card people can post: what they got and the chance they beat. Drawn here, nothing is uploaded. */
function drawCard(post: Posting, chance: string | null): Promise<Blob | null> {
  const canvas = document.createElement("canvas")
  canvas.width = 1200
  canvas.height = 627
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return Promise.resolve(null)
  }
  const css = getComputedStyle(document.documentElement)
  const ink = css.getPropertyValue("--band").trim() || "#1c1a19"
  const accent = css.getPropertyValue("--brand").trim() || "#e8832a"
  ctx.fillStyle = ink
  ctx.fillRect(0, 0, 1200, 627)
  ctx.fillStyle = accent
  ctx.fillRect(72, 88, 96, 10)
  ctx.fillStyle = "#ffffff"
  ctx.font = "600 88px Geist, system-ui, sans-serif"
  ctx.fillText("I beat the odds.", 72, 230)
  ctx.font = "500 44px Geist, system-ui, sans-serif"
  const lines = [post.title.length > 46 ? `${post.title.slice(0, 44)}…` : post.title, `at ${post.employer_display}`]
  lines.forEach((l, i) => ctx.fillText(l, 72, 330 + i * 60))
  ctx.font = "400 34px Geist, system-ui, sans-serif"
  ctx.fillStyle = "rgba(255,255,255,0.75)"
  if (chance) {
    ctx.fillText(`Estimated chance of an interview: ${chance}`, 72, 500)
  }
  ctx.fillText("odds", 72, 565)

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"))
}

export function OfferGate(): React.JSX.Element | null {
  const data = useData()
  const [pending, setPending] = useState<Pending | null>(null)
  const [done, setDone] = useState<boolean>(false)
  const [busy, setBusy] = useState<boolean>(false)
  const yes = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const open = (e: Event): void => {
      setPending((e as CustomEvent<Pending>).detail)
      setDone(false)
    }
    window.addEventListener(OFFER_EVENT, open)

    return () => window.removeEventListener(OFFER_EVENT, open)
  }, [])
  useEffect(() => {
    if (pending) yes.current?.focus()
  }, [pending, done])

  const chance = useMemo(() => {
    if (!pending || !data.reference || !data.shares) return null
    const st = standing(pending.post, data.profile, data.reference, data.shares, undefined, data.referrals.has(pending.post.id))

    return st.rate && !st.rate.thin ? point(st.rate.mid) : null
  }, [pending, data.reference, data.shares, data.profile, data.referrals])

  if (!pending) {
    return null
  }
  const { post } = pending
  const employer = post.employer_display.replace(/\.$/, "")
  const text = `I got an offer: ${post.title} at ${employer}.${chance ? ` The estimated chance of an interview for a job like this was ${chance}.` : ""} Found it with odds.`
  const close = (): void => setPending(null)

  async function confirm(): Promise<void> {
    setBusy(true)
    await moveJob(data, post, "offer", pending!.fit, true).catch(() => undefined)
    setBusy(false)
    setDone(true)
  }
  async function picture(): Promise<void> {
    const blob = await drawCard(post, chance)
    if (!blob) return
    const file = new File([blob], "i-beat-the-odds.png", { type: "image/png" })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text }).catch(() => undefined)

      return
    }
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "i-beat-the-odds.png"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={done ? "Congratulations" : "Confirm your offer"} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={close}>
      <div className="w-full max-w-md rounded-2xl border-[1.5px] bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {!done ? (
          <>
            <h2 className="font-heading text-xl font-medium tracking-tight">Did you get an offer?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {post.title} at {post.employer_display}. Only say yes if it is real: it counts in your results.
            </p>
            <div className="mt-5 flex gap-2">
              <Button ref={yes} onClick={() => void confirm()} disabled={busy} className="cursor-pointer">
                Yes, I got it
              </Button>
              <Button variant="ghost" onClick={close} className="cursor-pointer">
                Not yet
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-heading text-2xl font-medium tracking-tight">You beat the odds.</h2>
            <p className="mt-2 text-sm">
              Congratulations on {post.title} at {post.employer_display.replace(/\.$/, "")}.
              {chance ? ` We put your chance of an interview for a job like this at about ${chance}.` : ""}
            </p>
            <p className="mt-3 rounded-lg bg-secondary p-3 text-sm text-muted-foreground">{text}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button ref={yes} onClick={() => window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`, "_blank", "noopener")} className="cursor-pointer">
                Share on LinkedIn
              </Button>
              <Button variant="outline" onClick={() => void picture()} className="cursor-pointer">
                Get the picture
              </Button>
              <Button variant="ghost" onClick={close} className="cursor-pointer">
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
