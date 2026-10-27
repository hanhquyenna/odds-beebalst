// Edge Function `mcp`: the odds MCP server (server.ts). Add it to Claude as a custom connector with the URL
//   https://gdavxkaioqlfvfunmtxd.supabase.co/functions/v1/mcp
// Deploy:  ./scripts/build-mcp-core.sh && supabase functions deploy mcp --project-ref gdavxkaioqlfvfunmtxd --use-api   (config.toml: verify_jwt = false)
// Check after a deploy (makes a throwaway account, runs every tool against it, deletes it):
//   LIVE_MCP=1 MCP_URL=https://gdavxkaioqlfvfunmtxd.supabase.co/functions/v1/mcp bun test --timeout 90000 scripts/check-mcp.live.test.ts
// Secrets: Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
// Optional cloud apply agent: APPLY_AGENT_WEBHOOK_URL (+ APPLY_AGENT_WEBHOOK_SECRET, APPLY_AGENT_BACKEND=webhook|none).
import { handle } from "./server.ts"

Deno.serve((req: Request) => handle(req, {
  url: Deno.env.get("SUPABASE_URL")!,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  applyAgentWebhookUrl: Deno.env.get("APPLY_AGENT_WEBHOOK_URL") ?? undefined,
  applyAgentWebhookSecret: Deno.env.get("APPLY_AGENT_WEBHOOK_SECRET") ?? undefined,
  applyAgentBackend: Deno.env.get("APPLY_AGENT_BACKEND") === "none" ? "none" : Deno.env.get("APPLY_AGENT_WEBHOOK_URL") ? "webhook" : "none",
}))
