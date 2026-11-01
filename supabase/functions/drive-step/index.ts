// Edge Function `drive-step`: the two calls the Odds extension makes on every browser step, /ext/drive-next and /ext/drive-result, in a
// function small enough to start in ~0.1 s. Supabase starts a fresh worker for almost every request, and a fresh `mcp` takes ~0.7 s, which
// every step paid twice. A plain step (a queued command to take, a result to write) is answered here; everything else (a page that just
// loaded, the person filling in, a run to pick up again, nothing queued yet) goes on to `mcp`, which owns the whole drive flow.
// Deploy: supabase functions deploy drive-step --project-ref gdavxkaioqlfvfunmtxd --use-api   (config.toml: verify_jwt = false)
import { keyRow, live, postResult, pushFor, runOf, takeStep, touchRun, type StepEnv } from "../_shared/drive-step.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/** Answers one step call, or hands it to `mcp` unchanged. */
export async function handleStep(req: Request, env: StepEnv): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  const route = new URL(req.url).pathname.replace(/^.*\/ext\//, "")
  const text = await req.text()
  if (req.method !== "POST" || !["drive-next", "drive-result"].includes(route)) return reply(404, { error: "Not found." })
  // deno-lint-ignore no-explicit-any
  const body: any = (() => { try { return JSON.parse(text) } catch { return null } })()
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  const [who, run] = await Promise.all([keyRow(env, key).catch(() => null), runOf(env, String(body?.run_id ?? "")).catch(() => null)])
  if (!who) return reply(401, { error: "Connect the odds extension again." })
  if (!run || run.user_id !== who.user_id) return reply(404, { error: "No such run." })
  if (route === "drive-result") {
    const answer = await postResult(env, run, body)
    return reply(answer.status, answer.body)
  }
  if (body?.hold !== true && body?.fresh !== true && !run.resume_pending && live(run)) {
    const step = await takeStep(env, run, body)
    if (step) {
      touchRun(env, run, body)
      return reply(200, { ...step, push: pushFor(env, who.user_id) })
    }
  }

  return toMcp(env, route, req, text)
}

/** The same call made to `mcp`, answered as it answers. */
async function toMcp(env: StepEnv, route: string, req: Request, text: string): Promise<Response> {
  const res = await fetch(`${env.url}/functions/v1/mcp/ext/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: req.headers.get("authorization") ?? "" },
    body: text,
  })

  return new Response(res.body, { status: res.status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } })
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status: status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } })
}

if (import.meta.main) {
  Deno.serve((req: Request) => handleStep(req, {
    url: Deno.env.get("SUPABASE_URL")!,
    anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  }))
}
