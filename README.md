# Routine dashboard

A calm, graphite-first personal operating system with routed workspaces for today, tasks, calendar, nutrition, sport, work, goals, affairs, notes, and travel.

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

Nutrition search calls the same-origin `/api/openfoodfacts/search` endpoint. The repository includes a Vercel-compatible Edge Function at `api/openfoodfacts/search.ts`; it validates requests, limits page size, and adds cache headers.

On another host, deploy an equivalent proxy and set `VITE_OPEN_FOOD_FACTS_PROXY_URL` at build time. See `.env.example`. Do not place Open Food Facts credentials in the browser bundle.
