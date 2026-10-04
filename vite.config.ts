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
  build: {
    // Kept at the default on purpose: the real budget is scripts/check-bundles.mjs (`bun run perf`), which fails
    // CI on gzip growth. A vendor manualChunks split was tried and skipped: it reshuffles bytes between files but
    // the entry plus vendor still load together, so initial load does not shrink. The pdf chunk already splits
    // itself through dynamic import() in src/lib/cv-file.ts.
    chunkSizeWarningLimit: 500,
  },
})
