import { describe, expect, it, vi } from "vitest";
import { foodMatchesQuery, searchGenericFoods, searchOpenFoodFacts } from "./nutritionCatalog";

describe("nutrition catalog suggestions", () => {
  it("returns local suggestions from the first typed character", () => {
    expect(searchGenericFoods("s").length).toBeGreaterThan(0);
  });

  it("covers common synonyms and staple products locally", () => {
    expect(searchGenericFoods("filet").some((food) => food.name.toLocaleLowerCase().includes("filet"))).toBe(true);
    expect(searchGenericFoods("sky").some((food) => food.name.toLocaleLowerCase().includes("skyr"))).toBe(true);
    expect(searchGenericFoods("kurczak").length).toBeGreaterThan(0);
  });

  it("matches Polish names without requiring diacritics", () => {
    expect(searchGenericFoods("sal").some((food) => food.name.toLocaleLowerCase().includes("sa"))).toBe(true);
  });

  it("matches previously fetched products by name or brand", () => {
    const food = { name: "Jogurt islandzkiego Skyr z truskawką", brand: "Frutiva" } as const;

    expect(foodMatchesQuery(food, "sky")).toBe(true);
    expect(foodMatchesQuery(food, "fru")).toBe(true);
    expect(foodMatchesQuery(food, "czekolada")).toBe(false);
  });

  it("keeps multiple Polish branded Open Food Facts results for filet", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({
        products: [
          {
            id: "off-5900000000001",
            barcode: "5900000000001",
            name: "Filet gotowany",
            brand: "Olewnik",
            source: "openfoodfacts",
            defaultAmount: 100,
            unit: "g",
            per100g: { calories: 120, protein: 19, carbs: 2, fat: 3 },
          },
          {
            id: "off-5900000000002",
            barcode: "5900000000002",
            name: "Filet de moureau",
            brand: "Lisner",
            source: "openfoodfacts",
            defaultAmount: 100,
            unit: "g",
            per100g: { calories: 98, protein: 17, carbs: 0, fat: 3 },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const results = await searchOpenFoodFacts("filet", undefined, "access-token");
      const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://rootine.test");
      const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);

      expect(requestUrl.searchParams.get("q")).toBe('countries_tags:"en:poland" filet');
      expect(requestHeaders.get("authorization")).toBe("Bearer access-token");
      expect(results.map((food) => food.brand)).toEqual(["Lisner", "Olewnik"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
