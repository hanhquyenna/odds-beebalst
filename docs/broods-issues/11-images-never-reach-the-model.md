# Images never reach the model (MCP tool results and user-message events), on a `custom` OpenAI-compatible provider

## Summary

An agent on a `custom` provider (OpenAI-compatible, here 9router) never receives images, by either path Broods offers:

1. **MCP tool results with an `image` content part**: the model answers as if no image was there.
2. **`run` with `events` whose user content holds an image part**: same. Every part shape tried comes back "I can't see the screenshot", and `image_url` is rejected outright.

The same model reads the same image when called directly on the provider's `/v1/chat/completions` with an `image_url` part. So the image is dropped (or turned into something the model can't use) between Broods and the provider.

Nothing in the logs says so: no warning or error. The agent just behaves as if blind, which made the odds Apply agent look "stupid" for days. Its prompt told it to look at screenshots and click at pixel positions.

## Environment

- broods CLI / SDK `0.50.0`, project `odds-apply`, stage `production`
- Provider: `custom` (`apiKey: env("NINE_ROUTER_API_KEY")`, `baseURL: env("NINE_ROUTER_BASE_URL")`), models `cx/gpt-6.1-sol` and `cx/gpt-6-luna`
- MCP server: odds-browser (Streamable HTTP, stateless JSON); `read_page` returns `content: [{ type: "image", data: <base64 jpeg>, mimeType: "image/jpeg" }, { type: "text", ... }]`

## Repro

Test image: a PNG with a red button labelled **"Volgende 7392"** and a box showing **"Option B"**.

**A. Directly against the provider (works):**

```
POST {NINE_ROUTER_BASE_URL}/chat/completions
{ "model": "cx/gpt-6-luna", "messages": [{ "role": "user", "content": [
  { "type": "text", "text": "What number is on the red button, and what does the dropdown show?" },
  { "type": "image_url", "image_url": { "url": "data:image/png;base64,<...>" } } ] }] }
```
→ `7392; Option B` (sol: `7392; the dropdown shows Option B.`)

**B. Through Broods, user-message event (fails):**

```ts
const client = new BroodsClient({ apiKey, userToken: await signUserToken({ userId: "t", ttlMs: 600_000, secret }) })
await client.run({ agentId: "<agent with no tools on the custom provider>", conversationKey: `t-${Date.now()}`,
  events: [{ role: "user", content: [{ type: "text", text: "What number is on the red button?" }, PART] }] })
```

| `PART` | Answer |
| --- | --- |
| `{ type: "image", image: "<base64>", mediaType: "image/png" }` | "No screenshot is visible." |
| `{ type: "image", image: "data:image/png;base64,<...>" }` | "I can't see the screenshot, so I can't tell what number is on the red button." |
| `{ type: "image", image: "data:…", mediaType: "image/png" }` | "I can't see the screenshot." |
| `{ type: "file", data: "<base64>", mediaType: "image/png" }` | "I can't see a screenshot attached. Please upload it." |
| `{ type: "file", data: "data:…", mediaType: "image/png" }` | "I can't see the screenshot." |
| `{ type: "image_url", image_url: { url: "data:…" } }` | `400 Invalid direct event: Invalid input` |

**C. Through Broods, MCP tool result with an image part (fails):** the drive agent calls `read_page`; the tool returns the image part above. Asked about the page, the model never refers to anything only visible in the picture. A direct provider call that puts the image inside a `role: "tool"` message gives the same blindness, so that path may also be a provider limit. B shows Broods drops images even where the provider accepts them.

## Expected

- B: the image reaches the provider as an `image_url` part (OpenAI-compatible providers accept `data:` URLs), and the model reads it.
- C: for providers that can't take images inside tool messages, Broods either forwards the image as a follow-up user message (a common workaround), or logs a WARN once per run: "image content in a tool result was dropped: provider X does not accept images in tool messages".
- In both cases, never drop an image silently.

## Actual

No image reaches the model, and nothing in `broods logs` (WARN or INFO) mentions it.

## Suggested fix

1. Map user `image` / `file` (image/*) parts to `{ type: "image_url", image_url: { url: "data:<mediaType>;base64,<data>" } }` for `custom` and other OpenAI-compatible providers.
2. For MCP tool results with image parts: forward them as a user message right after the tool message when the provider can't take images in tool messages, behind an agent option such as `mcp.toolImages: "forward" | "drop" | "native"`, and log which was used.
3. Log a WARN whenever an image part is dropped, with the provider and the reason.

## Workaround in odds

The drive server sends the screenshot to 9router itself as an ordinary image message, and puts a short text description ("sight") beside the field list (`supabase/functions/_shared/drive-sight.ts`, commit d4f9feb).
