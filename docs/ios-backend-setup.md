# Rootine iOS — backend setup

This is the operational checklist for connecting the native app to the same Supabase project as the web app. Secrets are deliberately not stored in this repository.

## Required deployment

1. Apply the migrations in chronological order:
   - `20260806120000_rootine_workspace_snapshots.sql`
   - `20260819090000_rootine_workspace_sync_v2.sql`
2. Deploy the `delete-account` Edge Function.
3. Deploy the web backend with these server variables:
   - `OPEN_FOOD_FACTS_CONTACT`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY` or the legacy `SUPABASE_ANON_KEY`
4. Keep `SUPABASE_SERVICE_ROLE_KEY` only in Supabase-managed Edge Function secrets.

The product search and barcode endpoints now require `Authorization: Bearer <access_token>` and validate the token against the configured Supabase project.

## Supabase Auth

Enable email/password, Google, and Apple in the Supabase dashboard. Register both callback families:

- Web callback currently used by the production web origin.
- Native callback/deep-link: `rootine://auth-callback`.

Use the same native callback for Google OAuth, registration confirmation, and
password recovery. Add the URL to the Supabase redirect allowlist before testing
these flows. The iOS target registers the `rootine` URL scheme in `Info.plist`.

Google needs an OAuth client configured for the production callback. Sign in with Apple needs an Apple Developer App ID with the capability enabled, a Services ID, and a signing key registered in Supabase. Final values depend on the production domain, Team ID, and bundle identifier, so they cannot be safely committed as guesses.

Copy `ios/Rootine/Config/Secrets.xcconfig.example` to `Secrets.xcconfig` and set:

- the Supabase URL and publishable/anon key;
- the deployed Rootine backend URL;
- the Apple Team ID and final bundle identifier;
- real public URLs for the Terms and Privacy Policy.

The legal URLs are required for self-registration. Missing URLs disable only the
registration action and explain why; existing users can still sign in.

## Smoke checks after deployment

- A signed-out request to either Open Food Facts endpoint returns `401`.
- A signed-in search returns only normalized products.
- A valid EAN/UPC lookup returns `{ "product": ... }`; an unknown barcode returns `404`.
- Snapshot creation starts at expected revision `0` and returns revision `1`.
- A stale expected revision returns `applied = false` without overwriting either payload.
- Deleting a test account removes its `auth.users` record and cascades its workspace snapshots.
