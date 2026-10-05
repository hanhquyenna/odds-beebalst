#!/usr/bin/env bun
/**
 * Perf budget guard: the drift check for bundle growth. Reads dist/ (so run it after `bun run build`, or as
 * `bun run perf` in CI), prints raw and gzip sizes, and FAILS when the entry, the first load or any single chunk is
 * over budget. The first load is what dist/index.html fetches before anything renders: the entry script, every
 * modulepreload and the stylesheet. The pdf worker (*.mjs, ~1.2 MB raw) is not a chunk: it loads only when a PDF is
 * chosen, so it is outside this budget on purpose.
 */
import { readdirSync, readFileSync } from "node:fs"
import { gzipSync } from "node:zlib"

// Measured 5 Oct 2026 on a build with real env values: entry 129.8 kB gzip, first load 211.7 kB, largest chunk
// 133.9 kB (what-improves-callbacks, lazy). Caps are those plus about 10%. A build without .env.local once let
// Rolldown drop the whole app, so never re-baseline on one: check that it still renders.
const MAX_ENTRY_GZIP_KB = 143
const MAX_FIRST_LOAD_GZIP_KB = 233
const MAX_CHUNK_GZIP_KB = 148

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

const entry = rows.find((r) => /^index-[^.]+\.js$/.test(r.file))
if (!entry) {
  fail("no entry chunk dist/assets/index-*.js; run `bun run build` first.")
} else if (entry.gzip > MAX_ENTRY_GZIP_KB) {
  fail(`entry ${entry.file} is ${entry.gzip.toFixed(1)} kB gzip, budget is ${MAX_ENTRY_GZIP_KB} kB.`)
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
console.log(`perf: ok: entry <= ${MAX_ENTRY_GZIP_KB} kB, first load <= ${MAX_FIRST_LOAD_GZIP_KB} kB, every chunk <= ${MAX_CHUNK_GZIP_KB} kB gzip.`)
