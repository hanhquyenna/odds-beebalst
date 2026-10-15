# MCP client: no fallback for servers on earlier protocol revisions (server/discover → strict 2026-07-28 validation)

## Repro
An MCP server that implements the 2025-06-18 flow (`initialize`, `tools/list` → `{ tools }`), behind `defineMcp({ url })`.

## What happens (in order, from `broods logs`)
1. Broods opens with `server/discover` (no `initialize`). A 2025-era server answers `-32601 Method not found` → tools skipped silently (see #01).
2. If the server answers `server/discover` with `supportedVersions` not containing `2026-07-28` →
   `WARN MCP server tool listing failed; skipping its tools {'error': 'Unsupported protocol version: 2026-07-28'}`
3. If it lists `2026-07-28`, `tools/list` must carry `resultType`, `ttlMs` and `cacheScope`, else:
   `Invalid result for tools/list: missing required resultType …` / `ttlMs: expected number` / `cacheScope: expected "public" | "private"`.

## Expected
Per the MCP compat notes ("absent-means-complete bridge applies to earlier-revision servers"), a client should negotiate down: on `Method not found` for `server/discover`, or no common version, fall back to `initialize` + 2025-06-18 semantics. Most MCP servers in the wild are still 2025-era.

## Suggested fix
- Fall back to `initialize` when `server/discover` is not implemented, and negotiate the highest common version.
- Apply the earlier-revision bridge (default `resultType: "complete"`, no `ttlMs`/`cacheScope` requirement) when the negotiated version is < 2026-07-28.
- Document in the Broods MCP docs that external servers must speak 2026-07-28 until this lands, with a minimal example response for `server/discover` and `tools/list`.

Workaround we shipped: answer `server/discover` with `supportedVersions: ["2026-07-28", …]`, add `resultType: "complete"` to every result, and `ttlMs` + `cacheScope` to `tools/list`.

_Environment:_ broods CLI v0.50.0, Production.
