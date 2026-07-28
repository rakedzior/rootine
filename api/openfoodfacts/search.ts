export const config = { runtime: "edge" };

const UPSTREAM = "https://search.openfoodfacts.org/search";
const FORWARDED_PARAMS = new Set(["q", "langs", "page", "page_size", "index_id", "fields"]);
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60_000;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

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

function runtimeEnv(name: string) {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[name]?.trim();
}

function userAgent() {
  const contact = runtimeEnv("OPEN_FOOD_FACTS_CONTACT")
    ?.replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 160);
  return contact ? `Routine/1.0 (${contact})` : "Routine/1.0";
}

function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function consumeRateLimit(request: Request, now = Date.now()) {
  const ip = requestIp(request);
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

export function resetProxyRateLimitForTests() {
  rateWindows.clear();
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, { allow: "GET" });
  }

  const incoming = new URL(request.url);
  const query = incoming.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 180) {
    return jsonResponse({ error: "Query must contain 2–180 characters" }, 400);
  }

  const rateLimit = consumeRateLimit(request);
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

  const upstream = new URL(UPSTREAM);
  incoming.searchParams.forEach((value, key) => {
    if (FORWARDED_PARAMS.has(key)) upstream.searchParams.set(key, value);
  });
  upstream.searchParams.set("q", query);
  const requestedPageSize = Number.parseInt(upstream.searchParams.get("page_size") ?? "", 10);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.max(1, Math.min(20, requestedPageSize))
    : 18;
  upstream.searchParams.set("page_size", String(pageSize));

  try {
    const response = await fetch(upstream, {
      headers: {
        accept: "application/json",
        "user-agent": userAgent(),
      },
    });
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
        "cache-control": response.ok
          ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
          : "no-store",
        "x-ratelimit-limit": String(RATE_LIMIT),
        "x-ratelimit-remaining": String(rateLimit.remaining),
      },
    });
  } catch {
    return jsonResponse({ error: "Open Food Facts is temporarily unavailable" }, 502, {
      "x-ratelimit-limit": String(RATE_LIMIT),
      "x-ratelimit-remaining": String(rateLimit.remaining),
    });
  }
}
