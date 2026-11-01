/**
 * Asks the app to open sign-in from anywhere (a job drawer, a card deep in a page) without threading a callback through every
 * component in between. App listens and shows the sign-in view.
 */
const EVENT = "odds:sign-in"

export function requestSignIn(): void {
  window.dispatchEvent(new Event(EVENT))
}

export function onSignInRequest(run: () => void): () => void {
  window.addEventListener(EVENT, run)

  return () => window.removeEventListener(EVENT, run)
}
