import { IconContext, type IconProps } from "@phosphor-icons/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "@/App"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { DataProvider } from "@/lib/data"
import { takePairFromUrl } from "@/lib/pairing"
import { startPush } from "@/lib/push"
import "@/index.css"

const RELOADED_AT_KEY = "odds:reloaded-at"

/** Every icon's look, given once to IconContext below: the bold weight, sized and coloured by the text around it. A prop on one icon still wins. */
const ICON_STYLE: IconProps = { color: "currentColor", size: "1em", weight: "bold", mirrored: false }

startPush()
// An open tab after a deploy asks for chunks that no longer exist: reload onto the new build once. A chunk that keeps failing falls through to the ErrorBoundary.
window.addEventListener("vite:preloadError", () => {
  try {
    if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0) < 60_000) {
      return
    }
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()))
  } catch {
    return
  }
  window.location.reload()
})
// A browser opened by a Home Screen app to sign in (?pair=…): keep the pair across the Google round trip.
takePairFromUrl()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <IconContext.Provider value={ICON_STYLE}>
        <DataProvider>
          <App />
        </DataProvider>
      </IconContext.Provider>
    </ErrorBoundary>
  </StrictMode>,
)
