// Builds the extension people download from the site: every script and style minified on its own (classic scripts keep their top-level
// names, so files that share globals still find each other), the manifest checked against the files it names, zipped at maximum
// compression into public/odds-for-chrome.zip, with public/extension-version.json saying which version that is (the extension reads it to
// offer an update). `bun run build` runs this first, so the site always ships the zip of the extension in the same commit.
//   bun scripts/build-extension.ts [out-dir]        out-dir: where the unzipped build is kept (default: a temporary folder)
import { transform } from "esbuild"
import { zipSync, type Zippable } from "fflate"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"

const ROOT = join(import.meta.dirname, "..")
const SOURCE = join(ROOT, "extension")
const PUBLIC = join(ROOT, "public")
const SKIP = /(^|\/)(README\.md|\.DS_Store)$|~$/

interface Manifest {
  version: string
  background?: { service_worker?: string }
  action?: { default_popup?: string; default_icon?: Record<string, string> }
  side_panel?: { default_path?: string }
  icons?: Record<string, string>
  content_scripts?: Array<{ js?: string[]; css?: string[] }>
  web_accessible_resources?: Array<{ resources?: string[] }>
}

const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), "odds-extension-"))
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
let before = 0
for (const file of filesOf(SOURCE)) {
  const rel = relative(SOURCE, file)
  if (SKIP.test(rel)) continue
  before += statSync(file).size
  const target = join(out, rel)
  mkdirSync(dirname(target), { recursive: true })
  if (rel.endsWith(".js") || rel.endsWith(".css")) {
    const minified = await transform(readFileSync(file, "utf8"), { loader: rel.endsWith(".css") ? "css" : "js", minify: true, target: "chrome120", legalComments: "none" })
    writeFileSync(target, minified.code)
  } else if (rel.endsWith(".json")) writeFileSync(target, JSON.stringify(JSON.parse(readFileSync(file, "utf8"))))
  else cpSync(file, target)
}
const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as Manifest
const missing = named(manifest).filter((path) => !path.includes("*") && !existsSync(join(out, path)))
if (missing.length) throw new Error(`manifest names files the build does not have: ${missing.join(", ")}`)
const zip = join(PUBLIC, "odds-for-chrome.zip")
// Fixed dates, so the same source always gives the same zip.
const entries: Zippable = Object.fromEntries(filesOf(out).map((file) => [relative(out, file), [readFileSync(file), { mtime: new Date("2026-01-01") }]]))
writeFileSync(zip, zipSync(entries, { level: 9 }))
writeFileSync(join(PUBLIC, "extension-version.json"), `${JSON.stringify({ version: manifest.version })}\n`)
console.log(`odds extension ${manifest.version}: ${kb(before)} source, ${kb(size(out))} built, ${kb(statSync(zip).size)} zipped -> public/odds-for-chrome.zip`)
if (!process.argv[2]) rmSync(out, { recursive: true, force: true })

function filesOf(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesOf(join(dir, entry.name)) : [join(dir, entry.name)]))
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`
}

/** Every file the manifest points at. */
function named(m: Manifest): string[] {
  return [
    m.background?.service_worker,
    m.action?.default_popup,
    m.side_panel?.default_path,
    ...Object.values(m.icons ?? {}),
    ...Object.values(m.action?.default_icon ?? {}),
    ...(m.content_scripts ?? []).flatMap((c) => [...(c.js ?? []), ...(c.css ?? [])]),
    ...(m.web_accessible_resources ?? []).flatMap((w) => w.resources ?? []),
  ].filter((path): path is string => typeof path === "string")
}

function size(dir: string): number {
  return filesOf(dir).reduce((sum, file) => sum + statSync(file).size, 0)
}
