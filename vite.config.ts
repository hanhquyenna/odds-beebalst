import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Lets a temporary cloudflared link reach the dev server, for testing on a real phone (iPhones need https).
  server: { allowedHosts: [".trycloudflare.com"] },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
