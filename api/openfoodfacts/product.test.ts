// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  normalizeOpenFoodFactsProduct,
  readOpenFoodFactsJson,
} from "./product";

describe("Open Food Facts product normalization", () => {
  it("supports numeric barcodes, kilojoules, package units, and safe macro fallbacks", () => {
    const product = normalizeOpenFoodFactsProduct({
      code: 5901234123457,
      product_name: "Produkt testowy",
      quantity: "1,5 kg",
      nutriments: {
        energy_100g: 418.4,
        proteins_value: -2,
        carbohydrates_value: "12,5",
        fat_value: 3,
      },
    });
    expect(product).toMatchObject({
      barcode: "5901234123457",
      defaultAmount: 1500,
      unit: "g",
      per100g: { protein: 0, carbs: 12.5, fat: 3 },
    });
    expect(product?.per100g.calories).toBeCloseTo(100, 8);
  });

  it("rejects products without a usable name, calorie value, or barcode", () => {
    expect(normalizeOpenFoodFactsProduct({
      code: "5901234",
      product_name: "Za krótki kod",
      nutriments: { "energy-kcal_100g": 100 },
    })).toBeNull();
    expect(normalizeOpenFoodFactsProduct({
      code: "5901234123457",
      product_name: "Brak kalorii",
      nutriments: {},
    })).toBeNull();
  });

  it("bounds upstream JSON before parsing it", async () => {
    const oversized = new Response("{}", {
      status: 200,
      headers: { "content-length": String(512 * 1024 + 1) },
    });

    await expect(readOpenFoodFactsJson(oversized)).resolves.toBeNull();
    await expect(readOpenFoodFactsJson(Response.json({ ok: true }))).resolves.toEqual({ ok: true });
  });
});
