import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "@/App"
import { DataProvider } from "@/lib/data"
import { startPush } from "@/lib/push"
import { trace } from "@/lib/trace"
import "@/index.css"

startPush()
trace("open", { link: new URLSearchParams(location.search).has("link"), notify: new URLSearchParams(location.search).has("notify"), install: new URLSearchParams(location.search).has("install") })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DataProvider>
      <App />
    </DataProvider>
  </StrictMode>,
)
