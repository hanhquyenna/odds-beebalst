// Compare the latest golden-set score with the recorded baseline.
// This check never deploys. A lower pass count exits 1 so a deploy script can stop.
import { readFileSync } from "node:fs"

type Report = { passed: number; total: number }

function read(path: string): Report {
  return JSON.parse(readFileSync(path, "utf8")) as Report
}

const latest = read(new URL("../fixtures/apply-live/latest.json", import.meta.url))
const baseline = read(new URL("../fixtures/apply-live/baseline.json", import.meta.url))
if (latest.passed < baseline.passed || latest.total < baseline.total) {
  console.error(`Apply score dropped: ${latest.passed}/${latest.total} versus baseline ${baseline.passed}/${baseline.total}. Deploy blocked. Nothing was deployed.`)
  process.exit(1)
}
console.log(`Apply score held: ${latest.passed}/${latest.total} versus baseline ${baseline.passed}/${baseline.total}.`)
