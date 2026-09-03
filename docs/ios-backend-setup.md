# Rootine iOS — backend setup

This is the operational checklist for connecting the native app to the same Supabase project as the web app. Secrets are deliberately not stored in this repository.

## Environments and required deployment

The app has explicit `Development`, `Staging`, and `Production` build
configurations, each bound to its matching xcconfig. Use only the
publishable/anon Supabase key in iOS. The environment and feature
flag values are visible configuration, not secrets; server-side account flag
evaluation remains authoritative.

The shared `Rootine` scheme uses `Development` for local run/test and
`Production` for archive. CI invokes all three named configurations with
`xcodebuild -configuration`; use the same mapping for local staging smoke
tests. `Debug`/`Release` remain compatibility aliases for development and
production respectively.

1. Apply the migrations in chronological order:
   - `20260806120000_rootine_workspace_snapshots.sql`
   - `20260819090000_rootine_workspace_sync_v2.sql`
   - `20260820100000_rootine_relational_schema_rls.sql`
   - `20260902080000_rootine_feature_flags.sql`
   - `20260902090000_rootine_mobile_sync.sql`
   - `20260902100000_rootine_dual_write_bridge.sql`
   - `20260902120000_rootine_backfill_materializer.sql`
   - `20260902120100_rootine_devices.sql`
   - `20260902120200_rootine_server_notifications.sql`
   - `20260902130000_rootine_mobile_sync_v3_register_device.sql`
   - `20260902140000_rootine_database_hardening.sql`
   - `20260903150000_rootine_device_rpc_ambiguity_fix.sql`
   - `20260903151000_rootine_device_rpc_variable_conflict_fix.sql`

   B04, B09 and B11 use unique migration versions and are applied in this
   order because B04 extends the shared B02 tables, B09 extends the device
   registry, and B11 consumes both.
2. Deploy the `delete-account` Edge Function.
3. Optionally deploy `register-device` until B03's `mobile-sync` router is
   available; both boundaries delegate to `rootine_register_device`.
4. Deploy the web backend with these server variables:
   - `OPEN_FOOD_FACTS_CONTACT`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY` or the legacy `SUPABASE_ANON_KEY`
5. Keep `SUPABASE_SERVICE_ROLE_KEY` only in Supabase-managed Edge Function secrets.

For sync-v3 staging, deploy the feature-flag migration and `mobile-sync` Edge
Function to the isolated project. Keep all three normalized/notification flags
`false` until the staging smoke checks pass, then enable only the test account
override described in `docs/staging-runbook.md`.

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

APNs device registration is enabled by the `rootine_devices` migration. The
iOS client sends only an installation identifier, app version, permission
state and (when authorized) the APNs token to the server-side RPC. The RPC
returns metadata and never returns the token. Debug builds use `sandbox`;
TestFlight/App Store builds must set `ROOTINE_APNS_ENVIRONMENT = production` in
private CI configuration. Notification denial is recorded as metadata and does
not block bootstrap or workspace synchronization.

Keep Apple provider credentials only in Supabase Edge Function secrets or the
CI secret store used for deployment. See [`apns-credentials.md`](apns-credentials.md)
for the credential checklist. No `.p8` key, APNs JWT, access token or user
token belongs in this repository.

## B03/B07 integration contract

This ticket is intentionally usable before B03 and B07 are merged. The iOS
client calls `POST /rest/v1/rpc/rootine_register_device` and
`POST /rest/v1/rpc/rootine_revoke_device` with the current Supabase bearer
token. B03's `mobile-sync` router may expose the same operations by delegating
to these RPCs; it must preserve the parameter names, ownership derived from
`auth.uid()`, metadata-only response, and `401`/validation error semantics.
B07's lifecycle coordinator should call the existing
`registerDeviceForCurrentSession()` hook after sign-in/refresh/foreground and
stop callbacks after sign-out. APNs token callbacks are delivered through
`RootinePushRegistry`; no permission prompt is triggered by B09.

The legal URLs are required for self-registration. Missing URLs disable only the
registration action and explain why; existing users can still sign in.

## Smoke checks after deployment

- A signed-out request to either Open Food Facts endpoint returns `401`.
- A signed-in search returns only normalized products.
- A valid EAN/UPC lookup returns `{ "product": ... }`; an unknown barcode returns `404`.
- Snapshot creation starts at expected revision `0` and returns revision `1`.
- A stale expected revision returns `applied = false` without overwriting either payload.
- Deleting a test account removes its `auth.users` record and cascades its workspace snapshots.
