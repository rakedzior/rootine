import { authorizeRootineRequest, type RootineAuthorizer } from "../_shared/auth";
import {
  fetchOpenFoodFacts,
  normalizeOpenFoodFactsProduct,
  openFoodFactsUserAgent,
  OPEN_FOOD_FACTS_FIELDS,
  readOpenFoodFactsJson,
  type NormalizedNutritionProduct,
} from "./product";

export const config = { runtime: "edge" };

const UPSTREAMS = [
  "https://search.openfoodfacts.org/search",
  "https://world.openfoodfacts.org/api/v2/search",
] as const;
const FORWARDED_PARAMS = new Set(["q", "langs", "page", "page_size", "index_id", "fields"]);
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60_000;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

export interface OpenFoodFactsHandlerOptions {
  contact?: string;
  clientIp?: string;
  authorize?: RootineAuthorizer;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function runtimeContact() {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.OPEN_FOOD_FACTS_CONTACT?.trim();
}

function requestIp(request: Request, override?: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return override?.trim()
    || request.headers.get("cf-connecting-ip")?.trim()
    || forwarded
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function consumeRateLimit(
  request: Request,
  clientIp?: string,
  now = Date.now(),
) {
  const ip = requestIp(request, clientIp);
  if (rateWindows.size >= 1_000 && !rateWindows.has(ip)) {
    rateWindows.forEach((window, candidateIp) => {
      if (window.resetAt <= now) rateWindows.delete(candidateIp);
    });
    if (rateWindows.size >= 1_000) {
      const oldestIp = rateWindows.keys().next().value as string | undefined;
      if (oldestIp) rateWindows.delete(oldestIp);
    }
  }

  const current = rateWindows.get(ip);
  const window = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + RATE_WINDOW_MS }
    : current;
  window.count += 1;
  rateWindows.set(ip, window);

  return {
    allowed: window.count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - window.count),
    retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1_000)),
  };
}

function searchHits(value: unknown): unknown[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as { hits?: unknown; products?: unknown };
  if (Array.isArray(payload.hits)) return payload.hits;
  if (Array.isArray(payload.products)) return payload.products;
  return null;
}

function upstreamUrl(base: string, incoming: URL, query: string, pageSize: number) {
  const upstream = new URL(base);
  incoming.searchParams.forEach((value, key) => {
    if (FORWARDED_PARAMS.has(key) && key !== "fields") upstream.searchParams.set(key, value);
  });
  upstream.searchParams.set("q", query);
  upstream.searchParams.set("page_size", String(pageSize));
  upstream.searchParams.set("fields", OPEN_FOOD_FACTS_FIELDS);
  if (base.includes("/api/v2/search")) {
    const langs = incoming.searchParams.get("langs");
    if (langs) upstream.searchParams.set("languages", langs);
    upstream.searchParams.delete("langs");
    upstream.searchParams.delete("index_id");
  }
  return upstream;
}

export function resetProxyRateLimitForTests() {
  rateWindows.clear();
}

export async function handleOpenFoodFactsSearch(
  request: Request,
  options: OpenFoodFactsHandlerOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, { allow: "GET" });
  }

  const authorization = await (options.authorize ?? authorizeRootineRequest)(request);
  if (!authorization.ok) return authorization.response;

  const incoming = new URL(request.url);
  const query = incoming.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 180) {
    return jsonResponse({ error: "Query must contain 2–180 characters" }, 400);
  }

  const rateLimit = consumeRateLimit(request, options.clientIp);
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "Too many catalog searches. Try again later." },
      429,
      {
        "retry-after": String(rateLimit.retryAfter),
        "x-ratelimit-limit": String(RATE_LIMIT),
        "x-ratelimit-remaining": "0",
      },
    );
  }

  const requestedPageSize = Number.parseInt(incoming.searchParams.get("page_size") ?? "", 10);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.max(1, Math.min(20, requestedPageSize))
    : 18;

  try {
    let products: NormalizedNutritionProduct[] | null = null;
    let lastUpstreamStatus: number | null = null;
    for (const base of UPSTREAMS) {
      const response = await fetchOpenFoodFacts(upstreamUrl(base, incoming, query, pageSize), {
        headers: {
          accept: "application/json",
          "user-agent": openFoodFactsUserAgent(options.contact ?? runtimeContact()),
        },
      });
      lastUpstreamStatus = response.status;
      if (!response.ok) continue;
      const payload = await readOpenFoodFactsJson(response);
      const hits = searchHits(payload);
      if (!hits) continue;
      products = hits
        .map(normalizeOpenFoodFactsProduct)
      .filter((product): product is NormalizedNutritionProduct => Boolean(product));
      break;
    }
    if (!products) {
      return jsonResponse({ error: "Open Food Facts is temporarily unavailable" }, 502, {
        "x-ratelimit-limit": String(RATE_LIMIT),
        "x-ratelimit-remaining": String(rateLimit.remaining),
        ...(lastUpstreamStatus === 429 ? { "retry-after": "60" } : {}),
      });
    }
    const uniqueProducts = new Map<string, NormalizedNutritionProduct>();
    products.forEach((product) => {
      if (!uniqueProducts.has(product.barcode)) uniqueProducts.set(product.barcode, product);
    });
    return jsonResponse(
      { products: [...uniqueProducts.values()].slice(0, 20) },
      200,
      {
        "cache-control": "private, max-age=300",
        "x-ratelimit-limit": String(RATE_LIMIT),
        "x-ratelimit-remaining": String(rateLimit.remaining),
      },
    );
  } catch {
    return jsonResponse({ error: "Open Food Facts is temporarily unavailable" }, 502, {
      "x-ratelimit-limit": String(RATE_LIMIT),
      "x-ratelimit-remaining": String(rateLimit.remaining),
    });
  }
}

export default function handler(request: Request): Promise<Response> {
  return handleOpenFoodFactsSearch(request);
}
