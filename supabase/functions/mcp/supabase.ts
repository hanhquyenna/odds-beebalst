import { live, runOf, serveMcp } from "./drive.ts"

// Broods' supabase MCP: the person who owns one live drive run, and nobody else.
//
//   Broods agent (odds-agent) ──MCP tools──▶ POST /mcp/supabase (this file, shared secret) ──run_id──▶ drive_runs.user_id ──▶ their own rows
//
// The run decides the person: the tools take run_id and never a user id, so a model (or a job page that talks it into something) cannot ask
// for anyone else. A finished, expired or unknown run reads nothing. Passwords and saved logins never come through here: the extension fills them.

// deno-lint-ignore no-explicit-any
type Json = any
type Env = { url: string; serviceKey?: string }

/** The person tools Broods may use: their profile, documents and standard answers, and saving an answer they gave. */
export const SUPABASE_TOOLS = ["my_profile", "my_documents", "read_document", "my_application_answers", "save_application_answers"]

/** Serves POST /mcp/supabase; `callFor` runs one of the person's own tools (server.ts callMe) for the run's owner. */
export function handleSupabaseMcp(req: Request, env: Env, tools: Json[], callFor: (userId: string, name: string, args: Json) => Promise<Json>): Promise<Response> {
  const listed = tools
    .filter((t) => SUPABASE_TOOLS.includes(t.name))
    .map(({ write: _write, ...t }) => ({ ...t, inputSchema: { ...t.inputSchema, properties: { run_id: { type: "string" }, ...t.inputSchema.properties }, required: ["run_id", ...(t.inputSchema.required ?? [])] } }))

  return serveMcp(req, {
    name: "supabase",
    instructions: "The person's own profile, documents and standard answers for one Odds application run: always pass run_id.",
    tools: listed,
    call: async (name, raw) => {
      if (!SUPABASE_TOOLS.includes(name)) return refused(`Unknown tool ${name}.`)
      const { run_id: runId, ...args } = raw ?? {}
      const run = await runOf(env, String(runId ?? ""))
      if (!live(run)) return refused("This run is not running: there is no person to read.")

      return callFor(String(run.user_id), name, args)
    },
  })
}

function refused(message: string): Json {
  return { content: [{ type: "text", text: message }], isError: true }
}
