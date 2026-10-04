import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "@/App"
import { DataProvider } from "@/lib/data"
import { startPush } from "@/lib/push"
import "@/index.css"

startPush()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DataProvider>
      <App />
    </DataProvider>
  </StrictMode>,
)
