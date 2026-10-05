import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "@/App"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { DataProvider } from "@/lib/data"
import { takePairFromUrl } from "@/lib/pairing"
import { startPush } from "@/lib/push"
import "@/index.css"

startPush()
// A browser opened by a Home Screen app to sign in (?pair=…): keep the pair across the Google round trip.
takePairFromUrl()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <DataProvider>
        <App />
      </DataProvider>
    </ErrorBoundary>
  </StrictMode>,
)
