#!/usr/bin/env bun
/**
 * Perf budget guard: the drift check for bundle growth. Reads dist/assets
 * (so run it after `bun run build`, or as `bun run perf` in CI), prints raw
 * and gzip sizes, and FAILS when the entry or any single chunk is over
 * budget. The pdf worker (*.mjs, ~1.2 MB raw) is not a chunk: it loads only
 * when a PDF is chosen, so it is outside this budget on purpose.
 */
import { readdirSync, readFileSync } from "node:fs"
import { gzipSync } from "node:zlib"

// Entry is ~527 kB gzip today; the cap leaves headroom for dependency
// updates. Re-baselined 4 Oct 2026 on a WORKING build: earlier caps (270)
// were measured on a bundle built without .env.local, whose top-level throw
// made Rolldown drop the whole app, so the "passing" bundle crashed on load.
// Never lower this below a build made with real env values.
const MAX_ENTRY_GZIP_KB = 600
const MAX_CHUNK_GZIP_KB = 600

const dir = new URL("../dist/assets/", import.meta.url)
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
for (const r of rows) {
  if (r.gzip > MAX_CHUNK_GZIP_KB) fail(`chunk ${r.file} is ${r.gzip.toFixed(1)} kB gzip, budget is ${MAX_CHUNK_GZIP_KB} kB.`)
}

if (failed) process.exit(1)
console.log(`perf: ok: entry <= ${MAX_ENTRY_GZIP_KB} kB gzip, every chunk <= ${MAX_CHUNK_GZIP_KB} kB gzip.`)
