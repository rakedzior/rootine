import { authorizeRootineRequest, type RootineAuthorizer } from "../_shared/auth";
import {
  OPEN_FOOD_FACTS_FIELDS,
  normalizeOpenFoodFactsProduct,
  openFoodFactsUserAgent,
} from "./product";

export const config = { runtime: "edge" };

const UPSTREAM = "https://world.openfoodfacts.org/api/v2/product";
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

export interface OpenFoodFactsBarcodeOptions {
  contact?: string;
  clientIp?: string;
  authorize?: RootineAuthorizer;
}

function jsonResponse(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
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
  return override?.trim()
    || request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function consumeRateLimit(request: Request, clientIp?: string, now = Date.now()) {
  const ip = requestIp(request, clientIp);
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

export function resetBarcodeRateLimitForTests() {
  rateWindows.clear();
}

export async function handleOpenFoodFactsBarcode(
  request: Request,
  options: OpenFoodFactsBarcodeOptions = {},
) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, { allow: "GET" });
  }

  const authorization = await (options.authorize ?? authorizeRootineRequest)(request);
  if (!authorization.ok) return authorization.response;

  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!/^\d{8,14}$/.test(code)) {
    return jsonResponse({ error: "Barcode must contain 8–14 digits" }, 400);
  }

  const rateLimit = consumeRateLimit(request, options.clientIp);
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "Too many barcode lookups. Try again later." },
      429,
      {
        "retry-after": String(rateLimit.retryAfter),
        "x-ratelimit-limit": String(RATE_LIMIT),
        "x-ratelimit-remaining": "0",
      },
    );
  }

  try {
    const upstream = new URL(`${UPSTREAM}/${encodeURIComponent(code)}`);
    upstream.searchParams.set("fields", OPEN_FOOD_FACTS_FIELDS);
    const response = await fetch(upstream, {
      headers: {
        accept: "application/json",
        "user-agent": openFoodFactsUserAgent(options.contact ?? runtimeContact()),
      },
    });
    if (!response.ok) {
      return jsonResponse({ error: "Open Food Facts is temporarily unavailable" }, 502);
    }

    const payload = await response.json() as { status?: unknown; product?: unknown };
    const product = payload.status === 1 ? normalizeOpenFoodFactsProduct(payload.product) : null;
    if (!product) {
      return jsonResponse({ error: "Product not found" }, 404, {
        "x-ratelimit-limit": String(RATE_LIMIT),
        "x-ratelimit-remaining": String(rateLimit.remaining),
      });
    }

    return jsonResponse(
      { product },
      200,
      {
        "cache-control": "private, max-age=86400",
        "x-ratelimit-limit": String(RATE_LIMIT),
        "x-ratelimit-remaining": String(rateLimit.remaining),
      },
    );
  } catch {
    return jsonResponse({ error: "Open Food Facts is temporarily unavailable" }, 502);
  }
}

export default function handler(request: Request) {
  return handleOpenFoodFactsBarcode(request);
}
