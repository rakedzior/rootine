# Rootine dashboard

A calm, graphite-first personal operating system with routed workspaces for today, tasks, calendar, nutrition, sport, work, goals, affairs, notes, and travel.

The canonical navigation contains `Praca` and `Sprawy`; the retired `Biuro` and `Finanse` tabs are not exposed in the app shell. Existing bookmarks remain safe through compatibility redirects: `/biuro` → `/praca` and `/finanse` → `/sprawy?widok=budget`.

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
