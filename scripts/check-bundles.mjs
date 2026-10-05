#!/usr/bin/env bun
/** Bundle budget: fails when the first load (index.html's entry, preloads and CSS) or any chunk grows past its cap. Run after `bun run build`. */
import { readdirSync, readFileSync } from "node:fs"
import { gzipSync } from "node:zlib"

// Measured 5 Oct 2026 (213 kB first load, 134 kB largest chunk) + about 5%. Re-baseline only on a build that renders (an env-less build drops the app).
const MAX_FIRST_LOAD_GZIP_KB = 224
const MAX_CHUNK_GZIP_KB = 141
const dist = new URL("../dist/", import.meta.url)
const dir = new URL("assets/", dist)
let files
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".js") || f.endsWith(".css")).sort()
} catch {
  console.error("perf: dist/assets is missing; run `bun run build` first.")
  process.exit(1)
}

const kb = (n) => n / 1024
const rows = files.map((file) => {
  const buf = readFileSync(new URL(file, dir))

  return { file, raw: kb(buf.length), gzip: kb(gzipSync(buf).length) }
})

for (const r of [...rows].sort((a, b) => b.gzip - a.gzip)) {
  console.log(`${r.file}  ${r.raw.toFixed(1)} kB raw, ${r.gzip.toFixed(1)} kB gzip`)
}

let failed = false
const fail = (msg) => {
  console.error(`perf: FAIL: ${msg}`)
  failed = true
}

const html = readFileSync(new URL("index.html", dist), "utf8")
const eager = new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g)].map((m) => m[1]))
const firstLoad = rows.filter((r) => eager.has(r.file)).reduce((sum, r) => sum + r.gzip, 0)
console.log(`first load: ${eager.size} files, ${firstLoad.toFixed(1)} kB gzip`)
if (firstLoad > MAX_FIRST_LOAD_GZIP_KB) {
  fail(`first load is ${firstLoad.toFixed(1)} kB gzip, budget is ${MAX_FIRST_LOAD_GZIP_KB} kB.`)
}

for (const r of rows) {
  if (r.gzip > MAX_CHUNK_GZIP_KB) fail(`chunk ${r.file} is ${r.gzip.toFixed(1)} kB gzip, budget is ${MAX_CHUNK_GZIP_KB} kB.`)
}

if (failed) process.exit(1)
console.log(`perf: ok: first load <= ${MAX_FIRST_LOAD_GZIP_KB} kB, every chunk <= ${MAX_CHUNK_GZIP_KB} kB gzip.`)
