# APNs credentials checklist

This repository contains the device registry contract, not Apple credentials.
Do not commit a `.p8` private key, APNs JWT, provider token, Supabase service
role key or user access token.

For each deployed environment, provision the following values in the secret
store used by the APNs worker (B11):

- `APNS_TEAM_ID` — Apple Developer Team ID;
- `APNS_KEY_ID` — key identifier for the APNs Auth Key;
- `APNS_BUNDLE_ID` — the signed iOS bundle identifier;
- `APNS_PRIVATE_KEY` — the complete `.p8` private-key value, stored as a
  secret;
- APNs environment is stored per device in `rootine_devices.apns_environment`;
  `sandbox` is used for development builds and `production` for TestFlight/App
  Store builds.

The app maps the server names to Apple’s entitlement names: `sandbox` uses the
Apple `aps-environment = development` entitlement, while `production` uses
`aps-environment = production`. Keep both `ROOTINE_APNS_ENVIRONMENT` and
`ROOTINE_APNS_ENTITLEMENT_ENVIRONMENT` aligned in the private build config.

Supabase Edge Functions must read these values with `Deno.env.get` (or the
platform secret API) and must never echo them in logs or responses. CI may
hold deployment credentials only in encrypted repository/environment secrets;
the build should inject `ROOTINE_APNS_ENVIRONMENT` without writing a secret
file to the checkout. Rotate the Apple key by provisioning the replacement,
deploying the worker, verifying a test delivery, then revoking the old key in
Apple Developer.

The iOS app does not need `APNS_PRIVATE_KEY`, `APNS_KEY_ID`, or a service-role
key.
It sends its APNs device token to `rootine_register_device`, which stores it in
the server-only `rootine_devices.push_token` column. Authenticated clients
cannot select that table or the `rootine_active_devices` worker view.

Device identity compatibility: new iOS installations use the B01/B03 v3 form
`ios_<lowercase UUIDv4>`. An older installation may still have a bare lowercase
UUIDv4 in Keychain; the app retains that value and B09 accepts it as a migration
exception so refreshes continue to update the existing `(user_id, device_id)`
row instead of creating a duplicate. Newly created Keychain values always use
the prefixed form.

## Deployment verification

1. Apply migrations through `20260902120000_rootine_devices.sql`.
2. Confirm the authenticated role can execute registration/revoke RPCs but
   cannot select `rootine_devices` or `rootine_active_devices`.
3. Register one debug installation and verify `apns_environment = sandbox`.
4. Register one release installation and verify `apns_environment = production`.
5. Re-register after APNs token rotation and verify one `(user_id, device_id)`
   row with the new token.
6. Revoke on sign-out and confirm the worker view no longer returns the row.
