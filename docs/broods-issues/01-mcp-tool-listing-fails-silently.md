# MCP tool listing failure is silent: the agent runs with 0 tools and the run "succeeds"

**Severity:** high — an agent that depends on MCP tools quietly does nothing, and nothing in the run result says why.

## Repro
1. `defineMcp({ name: "odds-browser", url: "https://<host>/mcp/drive" })` where the server answers `tools/list` with a result Broods' client rejects (e.g. missing `resultType` / `ttlMs` / `cacheScope` under protocol 2026-07-28 — see #02).
2. Attach it to an agent (`mcp: { [ids.mcp["odds-browser"]]: { enabled: true } }`), `broods deploy`.
3. Start a run on that agent.

## Expected
The run fails (or at least the stream carries an `error`/`warning` event) saying the MCP server's tools could not be loaded, with the validation error.

## Actual
- The SSE stream is a normal successful run: `start → reasoning → text → structured-output → finish`. No error event.
- The model, given zero tools, answers e.g. *"The odds-browser tools are unavailable in this session…"*.
- The only trace is a WARN in `broods logs`:
  ```
  WARN MCP server tool listing failed; skipping its tools {'error': "Invalid result for tools/list: missing required resultType — servers implementing protocol revision 2026-07-28 MUST include it …"}
  INFO Agent loop started: openai/gpt-6.1-sol with 1 message(s), 0 tool(s) {'enabledTools': []}
  ```
- `broods agent get <agent>` shows `Tools: none` with no MCP section, so you cannot see the attachment or its health.

## Suggested fix
- Emit a stream event (`{"type":"warning"|"error", "source":"mcp", "server":"odds-browser", "error":"…"}`) when an attached MCP server's listing fails; optionally a per-agent setting `mcp.<id>.required: true` that fails the run instead.
- Validate the listing at `broods deploy` / `broods diff` time and print the error there.
- Show attached MCP servers (name, url, last listing status, tool count) in `broods agent get`.

_Environment:_ broods CLI v0.50.0, stage Production, agent model openai/gpt-6.1-sol. Found 2026-10-16 while building Odds Apply.
