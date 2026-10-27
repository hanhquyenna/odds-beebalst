// Edge Function `profile`: the person's own profile.
//   POST /profile/import   read a LinkedIn profile into the odds profile (import.ts)
//   POST /profile/read     read the saved profile into structured facts (read.ts)
// Deploy:  supabase functions deploy profile --project-ref ukpmpyfcnbhngkgbnkxi --use-api   (config.toml: verify_jwt = true)
// Secrets: APIFY_TOKEN, DAILY_LIMIT, ANON_LIMIT, GLOBAL_LIMIT (import); TYPESAFE_API_KEY (read). Never in a file.
import { serveRoutes } from "../_shared/http.ts"
import { importProfile } from "./import.ts"
import { readProfile } from "./read.ts"

serveRoutes({ import: importProfile, read: readProfile })
