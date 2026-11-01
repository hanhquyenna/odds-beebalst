# `${NAME}` header ref on `defineMcp` deploys fine but every run fails with a config error

## Repro
```ts
defineMcp({ name: "odds-browser", url: "https://…", headers: { "x-odds-drive-key": "${ODDS_DRIVE_SECRET}" } })
```
(as the `McpDefinitionConfig.headers` doc comment suggests). `broods deploy` succeeds; each run's stream ends immediately with:
```
{"type":"error","error":"config.mcp.s5726wzj… header x-odds-drive-key still carries a ${NAME} ref; set it in the agent config so it resolves at sync"}
```

## Expected
Either resolve `${NAME}` refs on the MCP row too, or reject them at `deploy`/`diff` with that same message. Today the docs on `McpDefinitionConfig.headers` say credential headers "must reference an account env var by name", which leads straight into this.

## Workaround
Put the header on the agent's MCP entry: `mcp: { [id]: { enabled: true, headers: { "x-odds-drive-key": "${ODDS_DRIVE_SECRET}" } } }`.
Note the knock-on: Broods lists tools at sync without that header, so the server must allow unauthenticated `server/discover`/`tools/list`.

_Environment:_ broods CLI v0.50.0.
