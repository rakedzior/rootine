// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleOpenFoodFactsBarcode, resetBarcodeRateLimitForTests } from "./barcode";

const authorize = vi.fn(async () => ({ ok: true, userId: "user-123" } as const));

function request(code: string, init: RequestInit = {}) {
  return new Request(`https://rootine.example/api/openfoodfacts/barcode?code=${encodeURIComponent(code)}`, {
    headers: { authorization: "Bearer test-token", "x-forwarded-for": "203.0.113.9", ...init.headers },
    ...init,
  });
}

function handler(code: string, init?: RequestInit) {
  return handleOpenFoodFactsBarcode(request(code, init), { authorize, contact: "maintainer@example.test" });
}

describe("Open Food Facts barcode proxy", () => {
  beforeEach(() => {
    resetBarcodeRateLimitForTests();
    authorize.mockClear();
    vi.unstubAllGlobals();
  });

  it("rejects malformed scan results before contacting the catalog", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler("https://example.test/not-a-barcode");

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a normalized product for a supported barcode", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      status: 1,
      product: {
        code: "5901234123457",
        product_name_pl: "Skyr naturalny",
        brands: "Rootine Test",
        quantity: "150 g",
        product_quantity: 150,
        product_quantity_unit: "g",
        nutriments: {
          "energy-kcal_100g": 64,
          proteins_100g: 12,
          carbohydrates_100g: 4,
          fat_100g: 0.2,
        },
      },
    })));

    const response = await handler("5901234123457");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      product: expect.objectContaining({
        id: "off-5901234123457",
        barcode: "5901234123457",
        name: "Skyr naturalny",
        defaultAmount: 150,
        unit: "g",
      }),
    });
    expect(response.headers.get("cache-control")).toBe("private, max-age=86400");
  });

  it("uses a clear not-found response for an unknown product", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 0 })));

    const response = await handler("5901234123457");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Product not found" });
  });

  it("rejects malformed upstream JSON instead of treating it as a missing product", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json", { status: 200 })));

    const response = await handler("5901234123457");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Open Food Facts is temporarily unavailable" });
  });

  it("enforces the lookup window per client and resets it deterministically", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ status: 0 })));

    for (let index = 0; index < 20; index += 1) {
      const response = await handler("5901234123457");
      expect(response.status).toBe(404);
    }
    const limited = await handler("5901234123457");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");

    const otherClient = await handler("5901234123457", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });
    expect(otherClient.status).toBe(404);

    now.mockReturnValue(61_001);
    const afterReset = await handler("5901234123457");
    expect(afterReset.status).toBe(404);
    now.mockRestore();
  });
});
