import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { XIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { COLOR_CHOICES, DEFAULT_PERSON_COLORS, DEFAULT_STATUS_COLORS, PERSON_STAGES, STATUS_KEYS, inkOn, isHex, personColors, personKey, statusColors } from "@/lib/status-colors"

/**
 * Where a person changes the colour of each status: a straight colour per status, from a row of choices or any colour of their own. The change shows at once on every job,
 * and is kept with their profile. Opened from "Edit colors" at the bottom of a status menu; mounted once, near the top of the app.
 */
export function StatusColorsDialog(): React.JSX.Element | null {
  const data = useData()
  const [open, setOpen] = useState<boolean>(false)
  const colors = statusColors(data.profile.statusColors)
  const pcolors = personColors(data.profile.statusColors)
  // Two sets of rows: the statuses of a job and the stages of an outreach. Each is kept under its own key, so they never mix.
  const sections: Array<{ title: string; rows: Array<{ store: string; label: string; hex: string }> }> = [
    { title: "Your jobs", rows: STATUS_KEYS.map(({ key, label }) => ({ store: key, label, hex: colors[key] })) },
    { title: "People you write to", rows: PERSON_STAGES.map((stage) => ({ store: personKey(stage), label: stage, hex: pcolors[stage] })) },
  ]

  useEffect(() => {
    const show = (): void => setOpen(true)
    window.addEventListener("odds:edit-status-colors", show)

    return () => window.removeEventListener("odds:edit-status-colors", show)
  }, [])
  useEffect(() => {
    if (!open) {
      return
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (!open) {
    return null
  }

  const choose = (key: string, hex: string): void => {
    if (isHex(hex)) {
      data.setProfile({ ...data.profile, statusColors: { ...data.profile.statusColors, [key]: hex } })
    }
  }
  const reset = (): void => data.setProfile({ ...data.profile, statusColors: {} })
  const changed = STATUS_KEYS.some(({ key }) => colors[key].toLowerCase() !== DEFAULT_STATUS_COLORS[key].toLowerCase()) || PERSON_STAGES.some((stage) => pcolors[stage].toLowerCase() !== DEFAULT_PERSON_COLORS[stage].toLowerCase())

  const swatch = "size-6 shrink-0 cursor-pointer rounded-full transition-transform duration-150 hover:scale-125"

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-black/45" />
      <div role="dialog" aria-modal="true" aria-label="Edit status colors" className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-line bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b-2 border-line px-6 py-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Edit colors</h2>
            <p className="text-sm text-muted-foreground">One colour per status. It changes everywhere at once.</p>
          </div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-line text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground">
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 pb-2">
          {sections.map((section) => (
            <section key={section.title} aria-label={section.title} className="pt-5">
              <h3 className="mb-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">{section.title}</h3>
              <ul className="divide-y-[1.5px] divide-line">
                {section.rows.map(({ store, label, hex }) => {
                  const known = COLOR_CHOICES.some((c) => c.hex.toLowerCase() === hex.toLowerCase())

                  return (
                    <li key={store} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
                      <span style={{ backgroundColor: hex, color: inkOn(hex) }} className="inline-flex h-9 w-36 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold">
                        <span aria-hidden="true" style={{ backgroundColor: inkOn(hex) }} className="size-2 shrink-0 rounded-full" />
                        {label}
                      </span>
                      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={`Colour for ${label}`}>
                        {COLOR_CHOICES.map((c) => {
                          const on = hex.toLowerCase() === c.hex.toLowerCase()

                          return (
                            <button
                              key={c.hex}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              aria-label={`${label}: ${c.name}`}
                              title={c.name}
                              onClick={() => choose(store, c.hex)}
                              style={{ backgroundColor: c.hex }}
                              className={`${swatch} ${on ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""}`}
                            />
                          )
                        })}
                        <label
                          title="Your own colour"
                          style={known ? { background: "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)" } : { backgroundColor: hex }}
                          className={`${swatch} relative ${known ? "" : "ring-2 ring-foreground ring-offset-2 ring-offset-card"}`}
                        >
                          <input type="color" aria-label={`Your own colour for ${label}`} value={hex} onChange={(e) => choose(store, e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
                        </label>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t-2 border-line px-6 py-3">
          <Button type="button" variant="ghost" disabled={!changed} onClick={reset} className="cursor-pointer">
            Back to the starting colors
          </Button>
          <Button type="button" onClick={() => setOpen(false)} className="cursor-pointer">
            Done
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
