/**
 * Moving between the app's pages from inside a page: a tracker card opens its job on the Jobs page, a person's Message button opens the People
 * page with the message written. The App listens for the event and switches the view; the page it lands on takes what was left for it.
 */
export type WebView = "jobs" | "people" | "tracker" | "documents" | "autofill" | "account"

let job: string | null = null
let person: string | null = null

export function goTo(view: WebView, what: { job?: string; person?: string } = {}): void {
  job = what.job ?? null
  person = what.person ?? null
  window.dispatchEvent(new CustomEvent<WebView>("odds:goto", { detail: view }))
}

/** The job another page asked the Jobs page to open, once. */
export function takeJob(): string | null {
  const taken = job
  job = null

  return taken
}

/** The person another page asked the People page to write to, once. */
export function takePerson(): string | null {
  const taken = person
  person = null

  return taken
}
