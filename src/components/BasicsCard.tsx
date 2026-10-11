import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { DUTCH_OPTIONS, ORIGIN_OPTIONS, PERMIT_OPTIONS } from "@/lib/journey"
import type { DutchLevel, Origin, Permit } from "@/lib/types"

/**
 * First visit to the jobs, right after signing up with a link or a CV (which asks nothing else): what we read, and the three things the
 * chance assumes about you until you say otherwise. Wrong ones move every number, so they are shown plainly and changed in one tap,
 * and the list below updates as they are. "Looks right" puts it away for good; the same answers stay in the profile.
 */

const chip = (on: boolean): string => `cursor-pointer rounded-full border-[1.5px] px-3 text-sm font-medium transition-colors duration-150 h-9 max-md:h-10 ${on ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent"}`

const ORIGIN_SHORT: Record<Origin, string> = { dutch: "The Netherlands", eu_non_native: "Another EU country", non_eu: "Outside the EU" }
const PERMIT_SHORT: Partial<Record<Permit, string>> = { other_non_eu: "Student permit", orientation_year: "Orientation year", hsm: "Highly skilled migrant" }

export function BasicsCard(): React.JSX.Element | null {
  const { profile, setProfile } = useData()
  // One line first, so the jobs stay on the screen; the choices open on "Change".
  const [open, setOpen] = useState<boolean>(false)
  if (!profile.onboarded || profile.basicsChecked) return null
  const read = [
    profile.positions.length ? `${profile.positions.length} ${profile.positions.length === 1 ? "role" : "roles"}` : null,
    profile.education.length ? `${profile.education.length} ${profile.education.length === 1 ? "degree" : "degrees"}` : null,
    profile.skills.length ? `${profile.skills.length} skills` : null,
  ].filter(Boolean)
  const setOrigin = (origin: Origin): void => {
    // Someone from the EU needs no permit; someone from outside it keeps theirs, or starts on the common one.
    const permit: Permit = origin === "non_eu" ? (profile.permit === "eu" ? "other_non_eu" : profile.permit) : "eu"
    setProfile({ ...profile, origin, permit })
  }
  const permits = PERMIT_OPTIONS.filter((o) => o.value !== "eu")
  const assumed = [ORIGIN_SHORT[profile.origin], profile.origin === "non_eu" ? PERMIT_SHORT[profile.permit] : null, `${(DUTCH_OPTIONS.find((o) => o.value === profile.dutch)?.label ?? "").split(" (")[0].toLowerCase()} Dutch`].filter(Boolean).join(" · ")
  const done = (): void => setProfile({ ...profile, basicsChecked: true })

  if (!open) {
    return (
      <section aria-label="Check what your chances assume" className="flex flex-col gap-3 rounded-xl border-[1.5px] bg-card p-4">
        <div>
          <p className="font-semibold">Is this you?</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {read.length ? `We read ${read.join(", ")}. ` : ""}Your chances assume: <span className="font-medium text-foreground">{assumed}</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={done} className="cursor-pointer max-md:h-10">
            Looks right
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(true)} className="cursor-pointer max-md:h-10">
            Change
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Check what your chances assume" className="flex flex-col gap-4 rounded-xl border-[1.5px] bg-card p-4">
      <div>
        <p className="font-semibold">Is this you?</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {read.length ? `We read ${read.join(", ")}. ` : ""}The chance on each job uses what is below. If something is off, tap it: the list updates.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Where did you grow up?</legend>
        <div className="flex flex-wrap gap-2">
          {ORIGIN_OPTIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={profile.origin === o.value} onClick={() => setOrigin(o.value)} className={chip(profile.origin === o.value)}>
              {ORIGIN_SHORT[o.value]}
            </button>
          ))}
        </div>
      </fieldset>

      {profile.origin === "non_eu" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Your permit</legend>
          <div className="flex flex-wrap gap-2">
            {permits.map((o) => (
              <button key={o.value} type="button" aria-pressed={profile.permit === o.value} onClick={() => setProfile({ ...profile, permit: o.value })} className={chip(profile.permit === o.value)}>
                {PERMIT_SHORT[o.value]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{PERMIT_OPTIONS.find((o) => o.value === profile.permit)?.label}</p>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Your Dutch</legend>
        <div className="flex flex-wrap gap-2">
          {DUTCH_OPTIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={profile.dutch === o.value} onClick={() => setProfile({ ...profile, dutch: o.value as DutchLevel })} className={chip(profile.dutch === o.value)}>
              {o.label.split(" (")[0]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Jobs that need Dutch are never shown. This only changes your chance on the rest.</p>
      </fieldset>

      <Button type="button" onClick={done} className="w-fit cursor-pointer max-md:h-10">
        Done
      </Button>
    </section>
  )
}
