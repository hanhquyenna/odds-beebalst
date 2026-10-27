import { signUserToken } from "broods"

const agentId = "js74p8xs10efctdq5ynrkm6fmn8gagn5"
const envText = await Bun.file(".env.local").text()
const key = [...envText.matchAll(/^BROODS_API_KEY=["']?([^"'\n]+)/gm)].at(-1)?.[1]
const secret = [...envText.matchAll(/^BROODS_USER_TOKEN_SECRET=["']?([^"'\n]+)/gm)].at(-1)?.[1]
if (!key) throw new Error("missing BROODS_API_KEY")
console.log("key", key.slice(0, 10), "len", key.length, "sec", secret?.slice(0, 10))

async function tryRun(label: string, headers: Record<string, string>, url = "https://gateway.broods.app/v1/runs") {
  const start = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      agentId,
      eventId: `smoke-${crypto.randomUUID()}`,
      conversationKey: `smoke-${Date.now()}`,
      background: true,
      events: [{ role: "user", content: [{ type: "text", text: JSON.stringify({ kind: "suggest-action", buttons: ["Next", "Submit application", "Review"], status: "stuck_loop" }) }] }],
    }),
  })
  const t = await start.text()
  console.log(label, start.status, t.slice(0, 350))
  return { status: start.status, t }
}

await tryRun("no-user", { Authorization: `Bearer ${key}` })
if (!secret) throw new Error("missing BROODS_USER_TOKEN_SECRET")
const token = await signUserToken({ userId: "odds-edge", ttlMs: 600_000, secret })
console.log("token", token.slice(0, 24))
const withUser = await tryRun("with-user", { Authorization: `Bearer ${key}`, "X-Broods-User-Token": token })
await tryRun(
  "scoped",
  { Authorization: `Bearer ${key}`, "X-Broods-User-Token": token },
  "https://gateway.broods.app/v1/projects/odds-apply/stages/development/agents/apply-stuck",
)

if (withUser.status === 202 || withUser.status === 200) {
  const body = JSON.parse(withUser.t) as { statusUrl?: string }
  if (body.statusUrl) {
    for (let i = 0; i < 20; i++) {
      await Bun.sleep(500)
      const st = await fetch(body.statusUrl, {
        headers: { Authorization: `Bearer ${key}`, "X-Broods-User-Token": token },
      })
      const j = await st.json() as { status?: string; result?: unknown; response?: unknown; error?: unknown }
      console.log("poll", j.status)
      if (["completed", "failed", "expired"].includes(String(j.status))) {
        console.log(JSON.stringify(j.result || j.response || j.error || j).slice(0, 1000))
        break
      }
    }
  }
}
