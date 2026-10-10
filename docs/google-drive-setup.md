# Google Drive for documents: setup

What it does: a person presses **Connect Google Drive** on Documents. odds makes a folder `odds` with `CVs` and
`Cover letters` in their Drive and moves every file there. New uploads (and letters Claude saves) go there by themselves.
A file edited in Drive is read again, so the chance follows it. Deleting in odds puts the file in the Drive bin (30 days).
Disconnecting brings the files back into odds; copies stay in their Drive.

The text of each document stays in the database (`documents.body`): the chance and Claude work from it. Only the original
files move to Drive.

Code: `supabase/functions/drive/`, `supabase/functions/_shared/drive.ts`, `src/lib/drive.ts`,
`supabase/migrations/20261010150000_google_drive.sql`.

## 1. Google Cloud (you, once)

1. https://console.cloud.google.com → new project `odds`.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **Google Auth Platform → Branding**: app name `odds`, support email, logo, home page, privacy policy and terms URLs.
4. **Audience**: External. While testing, add your own Google accounts as test users.
5. **Data access → Add scopes**: `.../auth/drive.file`, `openid`, `email`. Only these. `drive.file` is a non-sensitive
   scope: Google checks the branding, not a security audit.
6. **Clients → Create client** → Web application.
   - Authorised redirect URI: `https://ukpmpyfcnbhngkgbnkxi.supabase.co/functions/v1/drive/callback`
7. Copy the client ID and secret.
8. When it works: **Audience → Publish app**, so anyone can connect (not only test users).

## 2. Supabase (secrets, migration, function)

Set the two secrets yourself (never paste them in chat or commit them):

```bash
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... --project-ref ukpmpyfcnbhngkgbnkxi
```

`SHOO_APP_ORIGINS` is already set; it also decides which sites Google may send people back to (plus localhost).

```bash
supabase db push
supabase functions deploy drive --project-ref ukpmpyfcnbhngkgbnkxi --use-api
supabase functions deploy mcp --project-ref ukpmpyfcnbhngkgbnkxi --use-api
```

Until the secrets are set, Connect answers "Google Drive is not switched on yet." Nothing else changes.

## Limits worth knowing

- Only files odds made can be seen (drive.file). A file the person drags into the odds folder themselves is not seen.
- A file deleted or moved out of the folder in Drive shows "Not in your Drive any more" in odds; its text still works.
- If someone removes odds' access in their Google account, the link is dropped on the next call and Documents shows
  Connect again. Files already in their Drive stay there; downloads of those from odds stop until they reconnect.
