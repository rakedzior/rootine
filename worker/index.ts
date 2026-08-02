import { handleOpenFoodFactsSearch } from "../api/openfoodfacts/search";
import {
  handleRealtimeSession,
  type AssistantRuntimeEnv,
} from "../api/_shared/realtime-session";

interface Env extends AssistantRuntimeEnv {
  ASSETS: Fetcher;
  OPEN_FOOD_FACTS_CONTACT?: string;
}

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/openfoodfacts/search") {
      return handleOpenFoodFactsSearch(request, {
        contact: env.OPEN_FOOD_FACTS_CONTACT,
        clientIp: request.headers.get("CF-Connecting-IP") ?? undefined,
      });
    }

    if (url.pathname === "/api/assistant/realtime-session") {
      return handleRealtimeSession(request, {
        env,
        clientIp: request.headers.get("CF-Connecting-IP") ?? undefined,
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
