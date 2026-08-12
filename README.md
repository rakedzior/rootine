# Rootine dashboard

A calm, graphite-first personal operating system with routed workspaces for today, tasks, calendar, nutrition, sport, work, goals, affairs, notes, and travel.

The canonical navigation contains nine modules: `Dzisiaj`, `Zadania`, `Odżywianie`, `Sport`, `Praca`, `Cele`, `Podróże`, `Pozostałe`, and `Notatki`. Calendar and Habits live under Tasks. Travel is a standalone module: `/podroze` is its canonical entry, while existing detail links under `/travel/...` belong to the same module. The retired `Biuro`, `Finanse`, and `JDG` tabs are not exposed in the app shell. Existing bookmarks remain safe through compatibility redirects: `/biuro` → `/praca`, `/finanse` → `/sprawy?widok=finances`, and `/jdg` → `/sprawy?widok=jdg`.

## Run locally

```bash
npm install
npm run dev
```

Create and verify a production build with:

```bash
npm run check
npm run build
```

## Open Food Facts in production

Nutrition search calls the same-origin `/api/openfoodfacts/search` endpoint only after the user chooses **Szukaj online**. The repository includes a Vercel-compatible Edge Function at `api/openfoodfacts/search.ts`; it validates the method and query, limits result size, applies a per-IP request allowance, forwards upstream failures safely, and sets explicit success/error cache headers.

For Vercel:

1. Import the repository and keep the detected Vite framework settings. `vercel.json` pins the build/output contract and rewrites browser routes without rewriting `/api`.
2. Set `OPEN_FOOD_FACTS_CONTACT` for Preview and Production to a real, monitored maintainer email address or project URL. It is server-only and becomes the contact portion of the Open Food Facts `User-Agent`; it is not a credential and must not use a fabricated identity.
3. Deploy, then verify a browser route and the function:

   ```sh
   npm run smoke:production -- https://your-deployment.example
   ```

   The smoke test checks SPA routing plus successful, invalid-query, and invalid-method proxy responses. Successful responses are cacheable; validation, throttling, and upstream errors are `no-store`. Repeated valid requests from one IP return `429` with `Retry-After`.

Before deployment, run `npm run check`, `npm run test:api`, and `npm run test:e2e`. The in-memory allowance protects a warm function instance and keeps normal UI traffic below the public search allowance; a high-traffic public deployment should also configure a durable edge/WAF rate limit because serverless instances do not share memory.

On another host, deploy an equivalent same-origin proxy and set `VITE_OPEN_FOOD_FACTS_PROXY_URL` at build time. See `.env.example`. Do not put the server contact variable or any secrets in a `VITE_` variable.

## Supabase persistence

Supabase is optional for local development. Configure the browser-safe project URL and publishable key in `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The legacy `VITE_SUPABASE_ANON_KEY` name is also supported. Never put a secret or service-role key in a `VITE_` variable.

The database migration in `supabase/migrations/20260806120000_rootine_workspace_snapshots.sql` creates the per-user JSON workspace table and its RLS policies. After signing in from the profile panel, Rootine uploads the existing local workspaces to the account and continues syncing later local changes. Without a session, the app keeps using local browser storage.

### Google sign-in

Google OAuth also requires provider configuration outside the frontend:

1. Create a Google OAuth client of type **Web application**. Add every application origin, for example `http://127.0.0.1:5173`, under **Authorized JavaScript origins**.
2. Add `https://<project-ref>.supabase.co/auth/v1/callback` under the Google client's **Authorized redirect URIs**.
3. In Supabase, open **Authentication → Providers → Google**, enable the provider, and enter the Google Client ID and Client Secret.
4. In **Authentication → URL Configuration**, set the production Site URL and allow the exact post-login URLs used by Rootine, including `http://127.0.0.1:5173/dzisiaj` locally and `https://<production-origin>/dzisiaj` in production.

The Google Client Secret belongs only in Google/Supabase configuration. Never store it in a `VITE_` variable or commit it to this repository. The callback registered in Google and the application redirect allowlisted in Supabase are different URLs.
