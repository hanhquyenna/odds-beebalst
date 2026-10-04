import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { signInWithPassword } from "@/lib/auth"
import { useData } from "@/lib/data"

interface SignInProps {
  onCancel: () => void
  onSignedIn: () => void
}

/** The way back into an account: email and password, then the saved profile comes down with it. */
export function SignIn({ onCancel, onSignedIn }: SignInProps): React.JSX.Element {
  const data = useData()
  const [email, setEmail] = useState<string>("")
  const [password, setPassword] = useState<string>("")
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      data.setSession(await signInWithPassword(email.trim(), password))
      onSignedIn()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 py-8 md:my-auto md:flex-none md:border-[1.5px] md:bg-card md:p-10">
      <button type="button" onClick={onCancel} className="cursor-pointer self-start text-sm font-medium text-primary">
        &larr; Back
      </button>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome back.</h1>
      <div className="flex flex-col gap-4">
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="signin-email">Email</FieldLabel>
          <Input id="signin-email" type="email" required autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="signin-password">Password</FieldLabel>
          <Input id="signin-password" type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          {error ? <FieldError className="mt-2">{error}</FieldError> : null}
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" disabled={busy} className="w-full cursor-pointer disabled:cursor-not-allowed">
          {busy ? "Signing in" : "Sign in"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="w-full cursor-pointer text-muted-foreground">
          No account yet? Start
        </Button>
      </div>
    </form>
  )
}
