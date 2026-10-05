import { IconContext } from "@phosphor-icons/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "@/App"
import { ICON_STYLE } from "@/components/icons"
import { DataProvider } from "@/lib/data"
import { takePairFromUrl } from "@/lib/pairing"
import { startPush } from "@/lib/push"
import "@/index.css"

startPush()
// A browser opened by a Home Screen app to sign in (?pair=…): keep the pair across the Google round trip.
takePairFromUrl()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IconContext.Provider value={ICON_STYLE}>
      <DataProvider>
        <App />
      </DataProvider>
    </IconContext.Provider>
  </StrictMode>,
)
