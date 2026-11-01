# `browser: { enabled: true }` with a non-Lambda/obscura sandbox deploys, then fails every run

## Repro
```ts
const web = defineSandbox({ name: "apply-web", provider: "sandbox" /* or no image */, persistent: true })
defineAgent({ /* … */ sandboxes: [web], browser: { enabled: true } })
```
`broods deploy` succeeds. Every run errors at once:
```
config.browser needs the agent's first sandbox on provider lambda with image: "obscura", or a machine sandbox with obscura installed
```

## Expected
`broods diff/deploy` rejects the combination with the same message, so a deploy never breaks a working production agent.

_Environment:_ broods CLI v0.50.0, Production (the live agent was broken until reverted).
