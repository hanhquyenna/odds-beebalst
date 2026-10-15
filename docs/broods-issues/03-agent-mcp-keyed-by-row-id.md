# `defineAgent({ mcp })` must be keyed by the MCP row id; keyed by name it is silently not attached

## Repro
```ts
export const oddsBrowser = defineMcp({ name: "odds-browser", url: "https://…/mcp/drive" })
export const agent = defineAgent({ name: "odds-apply", /* … */ mcp: { "odds-browser": { enabled: true } } })
```
`broods deploy` succeeds. Runs have 0 tools; the agent says its tools are unavailable. No warning at deploy.

## Working form
```ts
import { ids } from "./_generated/ids"
mcp: { [ids.mcp["odds-browser"]]: { enabled: true } }
```
which only works after a first deploy has generated `ids.mcp`.

## Expected
Same ergonomics as `sandboxes: [applyWeb]`: accept `mcp: [oddsBrowser]` (the `McpResource`) or the resource name, resolve it at sync, and fail `deploy` on an unknown key.

## Suggested fix
- Accept `McpResource | string(name) | id` in `defineAgent({ mcp })`.
- `broods diff/deploy`: error on an `mcp` key that matches no MCP row.

_Environment:_ broods CLI v0.50.0.
