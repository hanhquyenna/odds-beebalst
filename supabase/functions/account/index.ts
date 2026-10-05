// Edge Function `account`: signing in.
//   POST /account/shoo   a Google sign-in through Shoo becomes a Supabase session (shoo.ts)
//   POST /account        { action }: guest accounts, QR and Home Screen links, device pairing, adopting a guest (link.ts)
// Deploy:  supabase functions deploy account --project-ref ukpmpyfcnbhngkgbnkxi --use-api   (config.toml: verify_jwt = false)
// Secret: SHOO_APP_ORIGINS (comma-separated site origins).
import { serveRoutes } from "../_shared/http.ts"
import { link } from "./link.ts"
import { shoo } from "./shoo.ts"

serveRoutes({ account: link, shoo: shoo })
