# Delete account Edge Function

Authenticated clients call this function with `POST`, their Supabase access token, and:

```json
{ "confirmation": "DELETE" }
```

The function validates the caller before using the server-only service-role key to delete exactly that user. The foreign key on `rootine_workspace_snapshots.user_id` removes synchronized snapshots through `ON DELETE CASCADE`.

Deploy from a trusted terminal with the Supabase CLI:

```text
supabase functions deploy delete-account
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in the web app, iOS app, repository, or CI logs.

The exported `handleDeleteAccount` is the stable HTTP boundary used by the B12
Edge contract gate. `index.test.ts` covers method/auth/confirmation/configuration
contracts without calling Supabase Admin or deleting a real account. Keep the
deployment entry point (`Deno.serve(handleDeleteAccount)`) unchanged when the
function is extended.
