# odds browser extension

On a LinkedIn job, a button "Add to odds" keeps the job in odds and shows your interview chance for it. It sends odds the address of the page
only when the button is pressed (backend: `supabase/functions/mcp/server.ts`, routes `/mcp/ext/me` and `/mcp/ext/add`; the key is its own, from
`supabase/migrations/20261013140000_extension_keys.sql`).

Try it now (Chrome): `chrome://extensions` → Developer mode → Load unpacked → pick this folder. Click the odds icon → Connect odds.

Tests: `bun run e2e` (e2e/extension.spec.ts loads it into Chromium) and, against the real backend with a throwaway account,
`LIVE_MCP=1 bun test scripts/check-mcp.live.test.ts`.

Chrome Web Store: zip this folder's contents (not the folder), upload at https://chrome.google.com/webstore/devconsole (a 5 USD developer account of
the owner is needed). The store asks for a privacy policy: it can say the extension sends the address of the LinkedIn job page to odds when the button is
pressed, and stores one key in the browser.
