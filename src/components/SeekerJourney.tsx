import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Landing } from "@/components/Landing"
import { SeekerQuestions } from "@/components/SeekerQuestions"
import { Button } from "@/components/ui/button"
import { beginShooSignIn, redirectWatch, rememberShooNext, storageAvailable } from "@/lib/shoo"
import { describeChanges } from "@/lib/changes"
import { useData } from "@/lib/data"
import { saveDraft } from "@/lib/draft"
import { shrink } from "@/lib/image"
import { importLinkedIn, mergeLinkedIn, toLinkedInUrl } from "@/lib/linkedin"
import {
  COUNTED_STEPS,
  STEPS,
  describeAbroad,
  describeBirth,
  firstStep,
  nextLabel,
  toFormState,
  toProfile,
  type FormState,
  type Step,
} from "@/lib/journey"
import { clearDraft } from "@/lib/session"
import { isGuestEmail } from "@/lib/auth"
import type { StaticPage } from "@/lib/pages"

interface SeekerJourneyProps {
  /**
   * "signup" asks one question per screen, which is what gets a stranger
   * through it. "edit" puts every question on one page, because someone
   * changing their permit should not walk the whole form again.
   */
  mode: "edit" | "signup"
  /** Leaves the settings page. Only used in "edit". */
  onBack?: () => void
  onSaved: () => void
  onSignIn: () => void
  /** Told whether the front page is showing, so the page around it can widen. */
  onWelcome?: (showing: boolean) => void
  onOpenPage?: (page: StaticPage) => void
  /** Open on the front page even when a draft would resume further in. Set by the wordmark. */
  atWelcome?: boolean
  /** Starts from the short explanation when a public job sends someone here. */
  atIntro?: boolean
}

export function SeekerJourney({ mode, onBack, onSaved, onSignIn, onWelcome, onOpenPage, atWelcome = false, atIntro = false }: SeekerJourneyProps): React.JSX.Element {
  const data = useData()
  const existing = data.profile.onboarded ? data.profile : null
  const [step, setStep] = useState<Step>(() => (atIntro && !existing ? "intro" : atWelcome && !existing ? "welcome" : firstStep(existing)))
  const [form, setForm] = useState<FormState>(() => toFormState(data.profile))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<boolean>(false)
  const [link, setLink] = useState<string>("")

  useEffect(() => {
    onWelcome?.(step === "welcome")
  }, [step, onWelcome])

  const review = mode === "edit"
  const stepIndex = COUNTED_STEPS.indexOf(step)
  // Settings save only what moved, so they compare against the saved profile.
  const baseline = useMemo<FormState | null>(() => (review ? toFormState(data.profile) : null), [data.profile, review])
  const changes = baseline ? describeChanges(baseline, form) : []

  // Keeps an unfinished journey on this device, so closing the tab halfway
  // through does not cost someone their answers. Cleared once they are saved.
  useEffect(() => {
    if (review) {
      return
    }
    saveDraft({ step, form })
  }, [form, review, step])

  function goBack(): void {
    setError(null)
    setStep(step === "contact" ? "linkedin" : step === "linkedin" ? "welcome" : STEPS[Math.max(0, STEPS.indexOf(step) - 1)])
  }

  function goNext(): void {
    setError(null)
    // Signing up has one question, so the front page and the intro both lead straight to it.
    setStep(step === "welcome" || step === "intro" ? "linkedin" : STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)])
  }

  /** The LinkedIn link is the whole sign-up: the backend reads the profile, the rest keeps its defaults, and the jobs open. */
  async function connectLinkedIn(): Promise<void> {
    const url = toLinkedInUrl(link)
    if (!url) {
      setError("Paste the link to your profile, like linkedin.com/in/your-name")

      return
    }
    setError(null)
    setSaving(true)
    try {
      const li = await importLinkedIn(url, data.session?.access_token ?? null)
      const picture = li.photo ? await shrink(li.photo).catch(() => "") : ""
      data.setProfile({ ...mergeLinkedIn(toProfile(form, data.profile), li), avatar: picture, linkedin: url })
      clearDraft()
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that profile.")
      setSaving(false)
    }
  }

  /** The answers become the profile; with an account they also go to the database. */
  function finish(): void {
    data.setProfile(toProfile(form, data.profile))
    clearDraft()
    onSaved()
  }

  async function handleAdvance(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    if (review || step === "birth") {
      const problem = describeBirth(form.birth)
      if (problem) {
        setError(problem)
        if (!review) {
          return
        }
      }
    }
    if (review || step === "abroad") {
      const problem = describeAbroad(form.abroad)
      if (problem) {
        setError(problem)

        return
      }
    }
    if (review && describeBirth(form.birth)) {
      return
    }

    if (!review && step !== "contact") {
      goNext()

      return
    }

    if (review) {
      setSaving(true)
      data.setProfile(toProfile(form, data.profile))
      toast.success("Saved.")
      setSaving(false)

      return
    }

    // The account step: SSO makes one; leaving it empty skips it.
    finish()

    return
  }

  // Google instead of a password: the answers ride along in the profile, and
  // the way back knows this trip started at sign-up.
  async function googleSignup(): Promise<void> {
    if (!storageAvailable()) {
      setError("Sign-in needs site data to remember you. Allow cookies for this site, then try again.")

      return
    }
    setSaving(true)
    setError(null)
    const cancel = redirectWatch(() => {
      setSaving(false)
      setError("Still here? Your browser may have blocked the Google redirect. Try again.")
    })
    try {
      data.setProfile(toProfile(form, data.profile))
      rememberShooNext("jobs")
      if ((await beginShooSignIn()) === "browser") {
        // A Home Screen app: the sign-in goes on in the browser and this app waits for it.
        cancel()
        setSaving(false)
      }
    } catch (caught) {
      cancel()
      setError(caught instanceof Error ? caught.message : "Could not continue with Google.")
      setSaving(false)
    }
  }

  if (step === "welcome") {
    return <Landing onStart={goNext} onSignIn={onSignIn} onOpenPage={onOpenPage} />
  }

  if (step === "intro") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-12 sm:py-20">
        <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-2 self-start text-sm font-semibold text-primary">
          <span aria-hidden="true">←</span> Back
        </button>
        <div className="space-y-5">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">We help you see which jobs you can really take.</h1>
          <p className="text-lg leading-8 text-muted-foreground">
            Paste your LinkedIn link. We read your roles, degrees and skills from it, check every job against the rules that apply to you, and show
            what it pays and what you would keep.
          </p>
        </div>
        <Button size="lg" onClick={goNext} className="h-12 w-full cursor-pointer text-base">
          Start
        </Button>
      </div>
    )
  }

  if (!review && step === "linkedin") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void connectLinkedIn()
        }}
        noValidate
        className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 py-12 md:max-w-lg sm:py-20"
      >
        <button type="button" onClick={goBack} className="inline-flex cursor-pointer items-center gap-2 self-start text-sm font-semibold text-primary">
          <span aria-hidden="true">←</span> Back
        </button>
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">What is your LinkedIn?</h1>
          <p className="text-muted-foreground">Paste the link to your profile. We read your roles, degrees, skills and languages, then open your jobs. Only a public profile can be read, and you can change everything after.</p>
        </div>
        <div className="space-y-2">
          <input
            aria-label="Your LinkedIn link"
            className="h-12 w-full rounded-lg border-[1.5px] bg-background px-4 text-base focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/40"
            placeholder="https://www.linkedin.com/in/your-name"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            inputMode="url"
            autoComplete="off"
            autoFocus
          />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" disabled={saving} className="h-12 w-full cursor-pointer text-base disabled:cursor-not-allowed">
            {saving ? "Reading your profile…" : "Show me jobs"}
          </Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={finish} className="w-full cursor-pointer text-muted-foreground">
            Continue without LinkedIn
          </Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={() => setStep("contact")} className="w-full cursor-pointer text-muted-foreground">
            Continue with Google to keep it on every device
          </Button>
          <SignInLink onSignIn={onSignIn} />
        </div>
      </form>
    )
  }

  if (review) {
    return (
      <form onSubmit={handleAdvance} noValidate className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-6 md:max-w-3xl">
        <div className="flex flex-col gap-3">
          {onBack ? (
            <button type="button" onClick={onBack} className="cursor-pointer self-start text-sm font-medium text-primary">
              &larr; Back
            </button>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
          {data.session ? <p className="text-sm text-muted-foreground">{isGuestEmail(data.session.user.email) ? "Guest on this device. Continue with Google to keep it on every device." : `Signed in as ${data.session.user.email}. Changes are saved to your account.`}</p> : <p className="text-sm text-muted-foreground">Saved on this device. Sign in to keep it on every device.</p>}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <SeekerQuestions error={error} form={form} review={review} step={step} onChange={setForm} />
        </div>
        {changes.length > 0 ? (
          <SaveBar
            changes={changes}
            saving={saving}
            onDiscard={() => {
              setError(null)
              setForm(baseline ?? form)
            }}
          />
        ) : null}
      </form>
    )
  }

  return (
    <form
      onSubmit={handleAdvance}
      noValidate
      // On a phone the question fills the screen and the buttons sit under the
      // thumb. On a laptop it becomes one card, centred, with the buttons right
      // under the question.
      className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 md:my-auto md:max-w-lg md:flex-none md:border-[1.5px] md:bg-card md:p-10"
    >
      {step === "contact" ? null : <StepProgress current={stepIndex} total={COUNTED_STEPS.length} onSelect={(index) => setStep(COUNTED_STEPS[index])} />}

      <div key={step} className="my-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
        <SeekerQuestions
          error={error}
          form={form}
          review={review}
          step={step}
          onChange={setForm}
          account={step === "contact" ? { onGoogle: googleSignup, disabled: saving } : null}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={goBack} className="cursor-pointer">
            &larr; Back
          </Button>
          <Button type="submit" size="lg" disabled={saving} className="flex-1 cursor-pointer disabled:cursor-not-allowed">
            {saving ? "Saving" : step === "contact" ? "Keep it on this device" : nextLabel(step, form)}
          </Button>
        </div>
        <SignInLink onSignIn={onSignIn} />
      </div>
    </form>
  )
}

interface SaveBarProps {
  changes: ReadonlyArray<string>
  onDiscard: () => void
  saving: boolean
}

interface StepProgressProps {
  current: number
  onSelect: (index: number) => void
  total: number
}

/**
 * Appears only once something changed, so an untouched settings page has no
 * button asking to be pressed. Sticks to the bottom of the screen, next to
 * whatever field was just edited on a phone.
 */
function SaveBar({ changes, onDiscard, saving }: SaveBarProps): React.JSX.Element {
  const summary = changes.length === 1 ? `1 change · ${changes[0]}` : `${changes.length} changes`

  return (
    <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-lg border-[1.5px] bg-card px-4 py-3 shadow-md">
      <span className="truncate text-sm text-muted-foreground">{summary}</span>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="ghost" onClick={onDiscard} className="cursor-pointer">
          Discard
        </Button>
        <Button type="submit" disabled={saving} className="cursor-pointer disabled:cursor-not-allowed">
          {saving ? "Saving" : "Save"}
        </Button>
      </div>
    </div>
  )
}

/** The way back in, shown only where it is the alternative to what is on screen. */
function SignInLink({ onSignIn }: { onSignIn: () => void }): React.JSX.Element {
  return (
    <Button type="button" variant="ghost" onClick={onSignIn} className="w-full cursor-pointer text-muted-foreground">
      Already with us? Sign in
    </Button>
  )
}

/**
 * A quiet segmented line, no percentage, because a number to chase is pressure.
 * Each answered segment is also the way back to that question, with a tap area
 * far taller than the line it draws.
 */
function StepProgress({ current, onSelect, total }: StepProgressProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_unused, index) => (
        <button
          key={index}
          type="button"
          disabled={index > current}
          aria-label={`Question ${index + 1}`}
          onClick={() => onSelect(index)}
          className="flex h-9 flex-1 items-center enabled:cursor-pointer disabled:cursor-not-allowed"
        >
          <span className={`h-0.5 w-full rounded-full ${index <= current ? "bg-primary" : "bg-border"}`} />
        </button>
      ))}
    </div>
  )
}
