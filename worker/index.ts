import { authorizeRootineRequest } from "../api/_shared/auth";
import { handleOpenFoodFactsBarcode } from "../api/openfoodfacts/barcode";
import { handleOpenFoodFactsSearch } from "../api/openfoodfacts/search";

interface Env {
  ASSETS: Fetcher;
  OPEN_FOOD_FACTS_CONTACT?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/openfoodfacts/search") {
      return handleOpenFoodFactsSearch(request, {
        contact: env.OPEN_FOOD_FACTS_CONTACT,
        clientIp: request.headers.get("CF-Connecting-IP") ?? undefined,
        authorize: (candidate) => authorizeRootineRequest(candidate, {
          supabaseUrl: env.SUPABASE_URL,
          publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY,
        }),
      });
    }

    if (url.pathname === "/api/openfoodfacts/barcode") {
      return handleOpenFoodFactsBarcode(request, {
        contact: env.OPEN_FOOD_FACTS_CONTACT,
        clientIp: request.headers.get("CF-Connecting-IP") ?? undefined,
        authorize: (candidate) => authorizeRootineRequest(candidate, {
          supabaseUrl: env.SUPABASE_URL,
          publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY,
        }),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { error: "Not found" },
        {
          status: 404,
          headers: { "cache-control": "no-store" },
        },
      );
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
