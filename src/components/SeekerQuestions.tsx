import { CvUpload } from "@/components/CvUpload"
import { describeFilled, fillFromCv } from "@/lib/cv-parse"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/data"
import { parseCsv } from "@/lib/csv"
import { DUTCH_OPTIONS, ORIGIN_OPTIONS, PERMIT_OPTIONS, STUDYING_OPTIONS, asks, type FormState, type Step } from "@/lib/journey"

interface SeekerQuestionsProps {
  error: string | null
  form: FormState
  onChange: (next: FormState) => void
  /** Every question at once when editing, one at a time when signing up. */
  review: boolean
  step: Step
  /** The account step. Signing up asks for it; settings do not. */
  account?: { email: string; password: string; onEmail: (v: string) => void; onPassword: (v: string) => void } | null
}

interface QuestionLabelProps {
  children: React.ReactNode
  htmlFor?: string
  review: boolean
  /** What the settings page calls it. Signing up asks the full question. */
  short: string
}

/**
 * The questions we ask. Which of them are on screen is the flow's business,
 * not theirs, so they take `step` and `review` and draw whatever those allow.
 * In review they read as account settings: short labels, two columns on a wide screen.
 */
export function SeekerQuestions({ error, form, onChange, review, step, account }: SeekerQuestionsProps): React.JSX.Element {
  const space = review ? "mt-2" : "mt-6"
  const wide = review ? "md:col-span-2" : undefined

  const permit = asks("permit", step, review) ? (
    <Field key="permit">
      <QuestionLabel review={review} short="Permit">
        What is your work permit situation?
      </QuestionLabel>
      <div className={`${space} flex flex-col gap-2`}>
        {PERMIT_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={form.permit === option.value ? "default" : "outline"}
            onClick={() => onChange({ ...form, permit: option.value })}
            className="h-auto cursor-pointer justify-start whitespace-normal py-2.5 text-left"
          >
            {option.label}
          </Button>
        ))}
      </div>
      {review ? null : <p className="mt-3 text-sm text-muted-foreground">It decides which salary a job has to reach for you to be allowed to take it.</p>}
    </Field>
  ) : null

  const origin = asks("origin", step, review) ? (
    <Field key="origin">
      <QuestionLabel review={review} short="Where you grew up">
        Where did you grow up?
      </QuestionLabel>
      <div className={`${space} flex flex-col gap-2`}>
        {ORIGIN_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={form.origin === option.value ? "default" : "outline"}
            onClick={() => onChange({ ...form, origin: option.value })}
            className="h-auto cursor-pointer justify-start whitespace-normal py-2.5 text-left"
          >
            {option.label}
          </Button>
        ))}
      </div>
      {review ? null : (
        <p className="mt-3 text-sm text-muted-foreground">
          Dutch field experiments found that employers answer applicants from abroad less often. We use that to set your estimate honestly. You can skip it.
        </p>
      )}
    </Field>
  ) : null

  const birth = asks("birth", step, review) ? (
    <Field key="birth" data-invalid={error && step === "birth" ? true : undefined}>
      <QuestionLabel htmlFor="birth" review={review} short="Birth year">
        What year were you born?
      </QuestionLabel>
      <Input
        id="birth"
        autoFocus={!review}
        inputMode="numeric"
        placeholder="1999"
        className={`${space} ${review ? "" : "text-3xl font-semibold tracking-tight"}`}
        value={form.birth}
        onChange={(event) => onChange({ ...form, birth: event.target.value.replace(/\D/g, "").slice(0, 4) })}
      />
      {error && step === "birth" ? <FieldError className="mt-3">{error}</FieldError> : null}
      {review ? null : <p className="mt-3 text-sm text-muted-foreground">At 30 the salary threshold for a highly skilled migrant rises by 36%, so the year matters.</p>}
    </Field>
  ) : null

  const abroad = asks("abroad", step, review) ? (
    <Field key="abroad" data-invalid={error && step === "abroad" ? true : undefined}>
      <QuestionLabel htmlFor="abroad" review={review} short="Months abroad">
        In the 24 months before your first job in the Netherlands, how many months did you live abroad (more than 150 km from the Netherlands)?
      </QuestionLabel>
      <Input
        id="abroad"
        autoFocus={!review}
        inputMode="numeric"
        placeholder="0"
        className={`${space} ${review ? "" : "text-3xl font-semibold tracking-tight"}`}
        value={form.abroad}
        onChange={(event) => onChange({ ...form, abroad: event.target.value.replace(/\D/g, "").slice(0, 2) })}
      />
      {error && step === "abroad" ? <FieldError className="mt-3">{error}</FieldError> : null}
      {review ? null : (
        <p className="mt-3 text-sm text-muted-foreground">
          The 30% tax ruling needs 16 of those 24 months. A master&apos;s degree here usually means you do not qualify.
        </p>
      )}
    </Field>
  ) : null

  const dutch = asks("dutch", step, review) ? (
    <Field key="dutch">
      <QuestionLabel review={review} short="Dutch level">
        How well do you speak Dutch?
      </QuestionLabel>
      <div className={`${space} flex flex-col gap-2`}>
        {DUTCH_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={form.dutch === option.value ? "default" : "outline"}
            onClick={() => onChange({ ...form, dutch: option.value })}
            className="h-auto cursor-pointer justify-start py-2.5"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </Field>
  ) : null

  const studying = asks("studying", step, review) ? (
    <Field key="studying">
      <QuestionLabel review={review} short="Studying now">
        Are you studying now?
      </QuestionLabel>
      <div className={`${space} flex flex-col gap-2`}>
        {STUDYING_OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={form.studying === option.value ? "default" : "outline"}
            onClick={() => onChange({ ...form, studying: form.studying === option.value ? "" : option.value })}
            className="h-auto cursor-pointer justify-start py-2.5"
          >
            {option.label}
          </Button>
        ))}
      </div>
      {review ? null : <p className="mt-3 text-sm text-muted-foreground">Most internships in the Netherlands need you to be a student, with an agreement from your school. We use this to tell you which ones you can take.</p>}
    </Field>
  ) : null

  const imported = asks("import", step, review) ? <ImportQuestion key="import" review={review} space={space} wide={wide} /> : null

  const contact =
    !review && account && asks("contact", step, review) ? (
      <Field key="contact" data-invalid={error ? true : undefined}>
        <FieldLabel className="text-2xl font-semibold tracking-tight">Keep it in an account?</FieldLabel>
        <p className="mt-3 text-sm text-muted-foreground">An account keeps your profile, kept jobs and applications on every device. You can skip it and keep everything on this one.</p>
        <div className="mt-6 flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={account.email} onChange={(event) => account.onEmail(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" value={account.password} onChange={(event) => account.onPassword(event.target.value)} />
          </Field>
        </div>
        {error ? <FieldError className="mt-3">{error}</FieldError> : null}
      </Field>
    ) : null

  return <>{review ? [permit, origin, birth, abroad, dutch, studying, imported] : [permit, origin, birth, abroad, dutch, studying, imported, contact]}</>
}

/** LinkedIn export files and CV text: what the profile is read from. */
function ImportQuestion({ review, space, wide }: { review: boolean; space: string; wide: string | undefined }): React.JSX.Element {
  const data = useData()
  const { profile } = data
  const [names, setNames] = useState<string[]>([])
  const [cvNote, setCvNote] = useState<string | null>(null)

  function upload(files: FileList | null): void {
    if (!files) {
      return
    }
    const reads = [...files].map(
      (file) =>
        new Promise<Partial<typeof profile>>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            const rows = parseCsv(String(reader.result))
            const name = file.name.toLowerCase()
            resolve(name.includes("position") ? { positions: rows } : name.includes("education") ? { education: rows } : name.includes("skill") ? { skills: rows } : name.includes("language") ? { languages: rows } : {})
          }
          reader.readAsText(file)
        }),
    )
    Promise.all(reads).then((patches) => {
      data.setProfile({ ...profile, ...Object.assign({}, ...patches) })
      setNames([...files].map((f) => f.name))
    })
  }

  return (
    <Field className={wide}>
      <QuestionLabel review={review} short="Your experience">
        Add your experience
      </QuestionLabel>
      {review ? null : <p className="mt-3 text-sm text-muted-foreground">So we can check each job&apos;s requirements against what you have. Both are optional, and both stay in your browser until you make an account.</p>}
      <div className={`${space} flex flex-col gap-3`}>
        <div>
          <FieldLabel htmlFor="linkedin-files">LinkedIn data export (Positions, Education, Skills, Languages as .csv)</FieldLabel>
          <input id="linkedin-files" type="file" multiple accept=".csv" onChange={(event) => upload(event.target.files)} className="sr-only" />
          <label htmlFor="linkedin-files" className="mt-1 inline-flex h-9 cursor-pointer items-center rounded-lg border-[1.5px] px-3 text-sm font-medium transition-colors hover:bg-accent focus-within:ring-3">
            {names.length ? "Choose other files" : "Choose files"}
          </label>
          <p className="mt-1 text-xs text-muted-foreground">
            {names.length ? `Read: ${names.join(", ")}.` : "On LinkedIn: Settings, Data privacy, Get a copy of your data."}
          </p>
        </div>
        <div>
          <FieldLabel htmlFor="cv-upload">Your CV</FieldLabel>
          <div className="mt-1">
            <CvUpload
              text={profile.cv}
              name={profile.cvName}
              note={cvNote}
              onChange={(cv, cvName, uploaded) => {
                const f = uploaded ? fillFromCv(profile, cv) : null
                data.setProfile({ ...profile, cv, cvName, ...(f?.patch ?? {}) })
                setCvNote(f ? describeFilled(f.filled, profile.positions.length + profile.education.length + profile.skills.length > 0, "later") : null)
              }}
            />
          </div>
        </div>
      </div>
    </Field>
  )
}

function QuestionLabel({ children, htmlFor, review, short }: QuestionLabelProps): React.JSX.Element {
  return (
    <FieldLabel htmlFor={htmlFor} className={review ? "text-muted-foreground" : "text-2xl font-semibold tracking-tight"}>
      {review ? short : children}
    </FieldLabel>
  )
}
