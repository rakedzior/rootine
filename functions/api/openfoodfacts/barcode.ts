import { authorizeRootineRequest } from "../../../api/_shared/auth";
import { handleOpenFoodFactsBarcode } from "../../../api/openfoodfacts/barcode";

interface Env {
  OPEN_FOOD_FACTS_CONTACT?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => {
  return handleOpenFoodFactsBarcode(request, {
    contact: env.OPEN_FOOD_FACTS_CONTACT,
    clientIp: request.headers.get("CF-Connecting-IP") ?? undefined,
    authorize: (candidate) => authorizeRootineRequest(candidate, {
      supabaseUrl: env.SUPABASE_URL,
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY,
    }),
  });
};
