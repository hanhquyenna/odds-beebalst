# Images never reach the model on a `custom` (OpenAI-compatible) provider: MCP tool results and run events are dropped silently

**Broods 0.50.0 · provider `custom` (9router, `cx/gpt-6.1-sol`, `cx/gpt-6-luna`) · MCP server over Streamable HTTP**

## What happens

An agent can't see any image Broods is given:

1. **MCP tool result** with `{ type: "image", data, mimeType: "image/jpeg" }`: the model acts as if there's no picture.
2. **`run` / `runAsync` user event** with an image part (`image` or `file`, raw base64 or a `data:` URL): the model replies "I can't see the screenshot". `image_url` gets `400 Invalid direct event`.

There's no warning or error anywhere in `broods logs`. The agent just behaves as if it were blind.

The same image works when sent **directly** to the provider's `/chat/completions` as `image_url`. Both models read it correctly (test image: a red button labelled "Volgende 7392").

## Proof (captured at the provider, shapes only)

| Sent through Broods | Arrives at provider | Model answer |
| --- | --- | --- |
| event, image as base64 bytes | `user: [text, text]`, **no image** | "I can't see the screenshot" |
| event, image as **URL** | `user: [text, image_url, text]` | "7392" ✅ |

## Root cause (`apps/core/src/harness`)

- **Events:** `sanitizeUserMessage` drops media that carries its own bytes, and the turn is rebuilt from stored rows (`createTurnContext` → `loadTurnHistory`), so the image never reaches the model, not even on the turn it arrived. Only channel attachments get uploaded as sealed links first.
- **MCP results:** `imageContentOutput` produces `image-data`, but `storableToolResultOutput` returns `false` for it, and the next step is rebuilt from stored rows, so it's dropped there.
- **Provider:** `@ai-sdk/openai-compatible` JSON-stringifies a tool result's image into the tool message (`supportsMultiPartToolContent` is off), where chat endpoints don't read it anyway.
- `resource_link` with an `image/*` mimeType becomes plain text, so a tool can't hand over an image as a link either.

## Expected

- An image in an event or a tool result reaches the model as `image_url`. For providers that don't take images in tool messages, move it into a user message right after the tool messages.
- Never drop an image silently: log a WARN with the provider and the reason.

## Fix (patch ready, tested)

`docs/broods-issues/11-fix.patch` against `dev` @ `b544c6f`, 4 files, +223 / −1:

- `provider.ts`: `toolImagesAsUserMessageMiddleware` on the `custom` chain moves tool-result images into one user message after the tool messages.
- `session.ts`: `restoreTurnMedia` in `createTurnContext` puts this turn's byte-backed media back on its user messages for the model (stored rows untouched).
- Tests: 7 new, plus the existing `provider-middleware` tests: 25/25. No new failures in the session, provider, media, ingress or mcp suites.

## Our workaround meanwhile

The screenshot is uploaded to a private bucket and sent into the conversation as a **signed URL image** (`runAsync`, `mode: "steer"`), because Broods downloads URL images on every step. Older screenshots are overwritten with a tiny grey image to cap tokens. Deleting a stored image instead breaks the run with `AI_DownloadError`. It works, but it costs a storage round trip, and the links have to outlive the run.
