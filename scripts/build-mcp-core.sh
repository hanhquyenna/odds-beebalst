#!/bin/sh
# Bundles the app's job rules (src/lib: filters, interview chance, tailored list, hear-back tag) for the mcp edge function, so an AI
# connected over MCP gets the same answers as the app. Run after changing any of them, then deploy mcp.
set -e
cd "$(dirname "$0")/.."
bun build supabase/functions/mcp/core.src.ts --target=browser --format=esm --outfile supabase/functions/mcp/core.js
