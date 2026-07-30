import { handleOpenFoodFactsSearch } from "../../../api/openfoodfacts/search";

interface Env {
  OPEN_FOOD_FACTS_CONTACT?: string;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) => {
  return handleOpenFoodFactsSearch(request, {
    contact: env.OPEN_FOOD_FACTS_CONTACT,
    clientIp: request.headers.get("CF-Connecting-IP") ?? undefined,
  });
};
