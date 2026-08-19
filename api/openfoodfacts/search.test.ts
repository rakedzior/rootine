// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleOpenFoodFactsSearch, resetProxyRateLimitForTests } from "./search";

const authorize = vi.fn(async () => ({ ok: true, userId: "user-123" } as const));

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://rootine.example${path}`, {
    headers: { "x-forwarded-for": "203.0.113.8", ...init.headers },
    ...init,
  });
}

function handler(candidate: Request) {
  return handleOpenFoodFactsSearch(candidate, { authorize });
}

describe("Open Food Facts proxy", () => {
  beforeEach(() => {
    resetProxyRateLimitForTests();
    authorize.mockClear();
    vi.unstubAllEnvs();
  });

  it("rejects unsupported methods without contacting the upstream service", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler(request("/api/openfoodfacts/search?q=apple", { method: "POST" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["", "a", "x".repeat(181)])("rejects an invalid query: %s", async (query) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler(request(`/api/openfoodfacts/search?q=${encodeURIComponent(query)}`));

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards only supported parameters, clamps page size, and identifies the application", async () => {
    vi.stubEnv("OPEN_FOOD_FACTS_CONTACT", "maintainer@example.test");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({
        hits: [{
          code: "5901234123457",
          product_name: "Green tea",
          nutriments: { "energy-kcal_100g": 1 },
        }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler(request(
      "/api/openfoodfacts/search?q=%20green%20tea%20&page_size=999&page=2&langs=pl&fields=code&callback=ignored",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("7");
    expect(await response.json()).toEqual({
      products: [expect.objectContaining({
        id: "off-5901234123457",
        barcode: "5901234123457",
        name: "Green tea",
      })],
    });

    const [url, init] = fetchMock.mock.calls[0];
    const upstream = new URL(String(url));
    const headers = new Headers(init?.headers);
    expect(upstream.origin).toBe("https://search.openfoodfacts.org");
    expect(upstream.searchParams.get("q")).toBe("green tea");
    expect(upstream.searchParams.get("page_size")).toBe("20");
    expect(upstream.searchParams.get("callback")).toBeNull();
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("user-agent")).toBe("Rootine/1.0 (maintainer@example.test)");
  });

  it("uses a non-identifying fallback when no contact is configured", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ hits: [] }),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await handler(request("/api/openfoodfacts/search?q=apple"));

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("user-agent")).toBe("Rootine/1.0");
  });

  it("accepts Cloudflare runtime options without exposing them to the client", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ hits: [] }),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleOpenFoodFactsSearch(
      request("/api/openfoodfacts/search?q=apple"),
      {
        contact: "pages-maintainer@example.test",
        clientIp: "198.51.100.24",
        authorize,
      },
    );

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(response.status).toBe(200);
    expect(headers.get("user-agent")).toBe("Rootine/1.0 (pages-maintainer@example.test)");
    expect(await response.json()).toEqual({ products: [] });
  });

  it("preserves an upstream error and prevents it from being cached", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: "unavailable" }),
      { status: 503, headers: { "content-type": "application/json" } },
    )));

    const response = await handler(request("/api/openfoodfacts/search?q=apple"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "unavailable" });
  });

  it("returns a non-cacheable gateway error when the upstream request fails", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network unavailable")));

    const response = await handler(request("/api/openfoodfacts/search?q=apple"));

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Open Food Facts is temporarily unavailable",
    });
  });

  it("throttles repeated searches per client IP and supplies Retry-After", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response(
      JSON.stringify({ hits: [] }),
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const responses: Response[] = [];
    for (let index = 0; index < 9; index += 1) {
      responses.push(await handler(request(`/api/openfoodfacts/search?q=apple${index}`)));
    }

    expect(responses.slice(0, 8).every((response) => response.ok)).toBe(true);
    expect(responses[8].status).toBe(429);
    expect(Number(responses[8].headers.get("retry-after"))).toBeGreaterThan(0);
    expect(responses[8].headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});
