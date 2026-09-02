# Register device Edge Function

`register-device` is an optional stable HTTP boundary for B09 deployments that
do not yet have B03's `mobile-sync` router. It accepts the authenticated
caller’s bearer token and delegates to `rootine_register_device` using that
same token, so the database still derives ownership from `auth.uid()`.

The function returns registration metadata only. The APNs token is passed to
the server-side RPC and is never returned or logged. B03 can route its
`registerDevice` operation to the same RPC or replace this boundary with
`mobile-sync` without changing the table contract.

Deploy with:

```text
supabase functions deploy register-device
```

The function needs only the platform-provided `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`). It must not be
given `SUPABASE_SERVICE_ROLE_KEY`.
