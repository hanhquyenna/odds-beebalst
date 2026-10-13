// The entry the extension's copy of the job-site rules is built from (scripts/build-extension.sh): the same file the server uses, on globalThis.oddsSites.
import * as sites from "../supabase/functions/_shared/job-sites"

;(globalThis as unknown as { oddsSites: typeof sites }).oddsSites = sites
