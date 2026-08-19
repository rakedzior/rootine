import { CURATED_FOODS } from "./nutritionCatalogCurated";

export interface NutritionValues {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodSuggestion {
  id: string;
  name: string;
  brand?: string;
  source: "usda" | "openfoodfacts";
  defaultAmount: number;
  unit: "g" | "ml";
  packageLabel?: string;
  per100g: NutritionValues;
  keywords?: string[];
}

interface SearchPayload {
  products?: unknown[];
}

export class OpenFoodFactsSearchError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(status: number, retryAfterSeconds?: number) {
    super(`Open Food Facts: ${status}`);
    this.name = "OpenFoodFactsSearchError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const SEARCH_ENDPOINT = (import.meta.env.VITE_OPEN_FOOD_FACTS_PROXY_URL as string | undefined)?.trim()
  || "/api/openfoodfacts/search";
const onlineSearchCache = new Map<string, FoodSuggestion[]>();

export const GENERIC_FOODS: FoodSuggestion[] = [
  { id: "usda-2346401", name: "Ziemniaki surowe, bez skórki", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 83.4, protein: 2.27, carbs: 17.8, fat: 0.36 }, keywords: ["ziemniak", "kartofle"] },
  { id: "usda-2346388", name: "Sałata lodowa", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 17.1, protein: 0.74, carbs: 3.37, fat: 0.07 }, keywords: ["salata", "lodowa"] },
  { id: "usda-1999632", name: "Szpinak baby", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 26.6, protein: 2.85, carbs: 2.41, fat: 0.62 } },
  { id: "usda-2346406", name: "Ogórek ze skórką", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 15.9, protein: 0.62, carbs: 2.95, fat: 0.18 }, keywords: ["ogorek"] },
  { id: "usda-1999634", name: "Pomidor", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 22, protein: 0.7, carbs: 3.84, fat: 0.42 } },
  { id: "usda-2258586", name: "Marchew surowa", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 48, protein: 0.94, carbs: 10.3, fat: 0.35 }, keywords: ["marchewka"] },
  { id: "usda-747447", name: "Brokuły surowe", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 31, protein: 2.57, carbs: 6.27, fat: 0.34 }, keywords: ["brokuly"] },
  { id: "usda-2685573", name: "Kalafior surowy", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 27.6, protein: 1.64, carbs: 4.72, fat: 0.24 } },
  { id: "usda-2685568", name: "Cukinia ze skórką", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 19, protein: 0.98, carbs: 3.27, fat: 0.2 } },
  { id: "usda-790646", name: "Cebula żółta", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 38, protein: 0.83, carbs: 8.61, fat: 0.05 }, keywords: ["cebula zolta"] },
  { id: "usda-2346407", name: "Kapusta biała surowa", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 31.4, protein: 0.96, carbs: 6.38, fat: 0.23 } },
  { id: "usda-1750341", name: "Jabłko ze skórką", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 61, protein: 0.13, carbs: 14.8, fat: 0.15 }, keywords: ["jablko"] },
  { id: "usda-1105314", name: "Banan", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 97, protein: 0.74, carbs: 23, fat: 0.29 } },
  { id: "usda-2346411", name: "Borówki", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 63.9, protein: 0.7, carbs: 14.6, fat: 0.31 }, keywords: ["borowki", "jagody"] },
  { id: "usda-2346409", name: "Truskawki", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 36.4, protein: 0.64, carbs: 7.96, fat: 0.22 } },
  { id: "usda-746771", name: "Pomarańcza", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 47, protein: 0.91, carbs: 11.8, fat: 0.15 }, keywords: ["pomarancza"] },
  { id: "usda-2710824", name: "Awokado Hass", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 223, protein: 1.81, carbs: 8.32, fat: 20.3 } },
  { id: "usda-2646170", name: "Pierś z kurczaka, surowa", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 106, protein: 22.5, carbs: 0, fat: 1.93 }, keywords: ["kurczak", "piers", "filet", "filety", "drób", "drobiowy"] },
  { id: "usda-748967", name: "Jajko kurze, całe", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 148, protein: 12.4, carbs: 0.96, fat: 9.96 }, keywords: ["jajka"] },
  { id: "usda-2684441", name: "Łosoś atlantycki, surowy", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 197, protein: 20.3, carbs: 0, fat: 13.1 }, keywords: ["losos"] },
  { id: "usda-2684444", name: "Dorsz atlantycki, surowy", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 66, protein: 16.1, carbs: 0, fat: 0.67 } },
  { id: "usda-2514743", name: "Wołowina mielona 90/10, surowa", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 185, protein: 18.2, carbs: 0, fat: 12.8 }, keywords: ["wolowina", "mieso mielone"] },
  { id: "usda-2646168", name: "Schab wieprzowy bez kości, surowy", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 168, protein: 21.1, carbs: 0, fat: 9.47 }, keywords: ["wieprzowina"] },
  { id: "usda-2512381", name: "Ryż biały długoziarnisty, suchy", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 359, protein: 7.04, carbs: 80.3, fat: 1.03 }, keywords: ["ryz"] },
  { id: "usda-2512380", name: "Ryż brązowy długoziarnisty, suchy", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 366, protein: 7.25, carbs: 76.7, fat: 3.31 }, keywords: ["ryz brazowy"] },
  { id: "usda-2346396", name: "Płatki owsiane", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 382, protein: 13.5, carbs: 68.7, fat: 5.89 }, keywords: ["platki", "owsianka"] },
  { id: "usda-2644283", name: "Soczewica sucha", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 360, protein: 23.6, carbs: 62.2, fat: 1.92 } },
  { id: "usda-2644288", name: "Ciecierzyca konserwowa, odsączona", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 137, protein: 7.02, carbs: 20.3, fat: 3.1 } },
  { id: "usda-746782", name: "Mleko pełne 3,25%", source: "usda", defaultAmount: 100, unit: "ml", per100g: { calories: 60, protein: 3.27, carbs: 4.63, fat: 3.2 } },
  { id: "usda-330137", name: "Jogurt grecki naturalny 0%", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 61, protein: 10.3, carbs: 3.64, fat: 0.37 } },
  { id: "usda-2346384", name: "Serek wiejski pełnotłusty", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 103, protein: 11.6, carbs: 4.6, fat: 4.22 } },
  { id: "usda-328637", name: "Ser cheddar", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 408, protein: 23.3, carbs: 2.44, fat: 34 } },
  { id: "usda-2346393", name: "Migdały surowe", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 626, protein: 21.5, carbs: 20, fat: 51.1 }, keywords: ["migdaly"] },
  { id: "usda-2346394", name: "Orzechy włoskie", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 730, protein: 14.6, carbs: 10.9, fat: 69.7 }, keywords: ["orzechy wloskie"] },
  { id: "usda-746784", name: "Cukier biały", source: "usda", defaultAmount: 100, unit: "g", per100g: { calories: 385, protein: 0, carbs: 99.6, fat: 0.32 } },
  ...CURATED_FOODS,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(", ").trim();
  return "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pl-PL");
}

export function foodMatchesQuery(food: Pick<FoodSuggestion, "name" | "brand" | "keywords">, query: string) {
  const queryTerms = normalizedText(query.trim()).split(/\s+/).filter(Boolean);
  if (!queryTerms.length) return false;
  const searchable = normalizedText([food.name, food.brand ?? "", ...(food.keywords ?? [])].join(" "));
  return queryTerms.every((term) => searchable.includes(term));
}

function escapeLuceneText(value: string) {
  return value
    .replace(/&&/g, "\\&&")
    .replace(/\|\|/g, "\\||")
    .replace(/([+\-!(){}[\]^"~*?:\\/])/g, "\\$1");
}

function mapOpenFoodFactsHit(value: unknown): FoodSuggestion | null {
  if (!isRecord(value)) return null;
  const per100g = isRecord(value.per100g) ? value.per100g : {};
  const calories = numberValue(per100g.calories);
  if (value.source !== "openfoodfacts" || calories === undefined || calories < 0) return null;
  const name = textValue(value.name);
  const id = textValue(value.id);
  if (!name || !id) return null;
  const brand = textValue(value.brand) || undefined;
  const packageLabel = textValue(value.packageLabel) || undefined;
  const defaultAmount = numberValue(value.defaultAmount);
  const unit = value.unit === "ml" ? "ml" as const : "g" as const;
  return {
    id,
    name,
    brand,
    source: "openfoodfacts",
    defaultAmount: defaultAmount && defaultAmount > 0 ? defaultAmount : 100,
    unit,
    packageLabel,
    per100g: {
      calories,
      protein: numberValue(per100g.protein) ?? 0,
      carbs: numberValue(per100g.carbs) ?? 0,
      fat: numberValue(per100g.fat) ?? 0,
    },
  };
}

export function searchGenericFoods(query: string, limit = 8) {
  const normalizedQuery = normalizedText(query.trim());
  if (!normalizedQuery.length) return [];
  return GENERIC_FOODS
    .map((food) => {
      const name = normalizedText(food.name);
      const keywords = normalizedText((food.keywords ?? []).join(" "));
      const nameStartsWith = name.startsWith(normalizedQuery) || name.split(/\s+/).some((part) => part.startsWith(normalizedQuery));
      const keywordStartsWith = keywords.split(/\s+/).some((part) => part.startsWith(normalizedQuery));
      const includes = name.includes(normalizedQuery) || keywords.includes(normalizedQuery);
      const score = nameStartsWith ? 0 : keywordStartsWith ? 1 : includes ? 2 : 3;
      return { food, score };
    })
    .filter((candidate) => candidate.score < (normalizedQuery.length === 1 ? 2 : 3))
    .sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name, "pl"))
    .slice(0, limit)
    .map((candidate) => candidate.food);
}

export async function searchOpenFoodFacts(query: string, signal?: AbortSignal, accessToken?: string) {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return [];
  const cacheKey = normalizedText(normalizedQuery);
  const cached = onlineSearchCache.get(cacheKey);
  if (cached) return cached;
  const params = new URLSearchParams({
    q: `countries_tags:"en:poland" ${escapeLuceneText(normalizedQuery)}`,
    langs: "pl,en",
    page: "1",
    page_size: "18",
    index_id: "off",
    fields: [
      "code",
      "product_name",
      "product_name_pl",
      "product_name_en",
      "brands",
      "quantity",
      "product_quantity",
      "product_quantity_unit",
      "countries_tags",
      "nutriments",
    ].join(","),
  });
  const response = await fetch(`${SEARCH_ENDPOINT}?${params}`, {
    signal,
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const seconds = retryAfter && /^\d+$/.test(retryAfter)
      ? Number.parseInt(retryAfter, 10)
      : undefined;
    throw new OpenFoodFactsSearchError(response.status, seconds);
  }
  const payload = await response.json() as SearchPayload;
  const queryTerms = normalizedText(normalizedQuery).split(/\s+/).filter(Boolean);
  const mapped = (payload.products ?? [])
    .map(mapOpenFoodFactsHit)
    .filter((item): item is FoodSuggestion => Boolean(item))
    .filter((item) => queryTerms.every((term) => normalizedText([item.name, item.brand ?? ""].join(" ")).includes(term)));
  const unique = new Map<string, FoodSuggestion>();
  mapped.forEach((item) => {
    const key = `${normalizedText(item.name)}|${normalizedText(item.brand ?? "")}`;
    if (!unique.has(key)) unique.set(key, item);
  });
  const results = Array.from(unique.values())
    .sort((a, b) => Number(Boolean(a.brand)) - Number(Boolean(b.brand)) || a.name.localeCompare(b.name, "pl"))
    .slice(0, 10);
  onlineSearchCache.set(cacheKey, results);
  return results;
}

export function scaleNutrition(per100g: NutritionValues, amount: number) {
  const factor = Math.max(0, amount) / 100;
  const round = (value: number) => Math.round(value * factor * 10) / 10;
  return {
    calories: round(per100g.calories),
    protein: round(per100g.protein),
    carbs: round(per100g.carbs),
    fat: round(per100g.fat),
  };
}
