// Edge Function `mcp`: the odds MCP server (server.ts). Add it to Claude as a custom connector with the URL
//   https://ukpmpyfcnbhngkgbnkxi.supabase.co/functions/v1/mcp
// Deploy:  ./scripts/build-mcp-core.sh && supabase functions deploy mcp --project-ref ukpmpyfcnbhngkgbnkxi --use-api   (config.toml: verify_jwt = false)
// Secrets: none of its own. Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY (public reads) and SUPABASE_SERVICE_ROLE_KEY (a person's
// private link: their own rows only, see server.ts).
import { handle } from "./server.ts"

Deno.serve((req: Request) => handle(req, { url: Deno.env.get("SUPABASE_URL")!, anonKey: Deno.env.get("SUPABASE_ANON_KEY")!, serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") }))
