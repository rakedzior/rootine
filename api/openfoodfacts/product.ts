export interface NormalizedNutritionProduct {
  id: string;
  barcode: string;
  name: string;
  brand?: string;
  source: "openfoodfacts";
  defaultAmount: number;
  unit: "g" | "ml";
  packageLabel?: string;
  per100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export const OPEN_FOOD_FACTS_FIELDS = [
  "code",
  "product_name",
  "product_name_pl",
  "product_name_en",
  "brands",
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "nutriments",
].join(",");

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

function normalizePackageAmount(value: unknown, unitValue: unknown, quantityLabel: string) {
  let amount = numberValue(value);
  let unit = textValue(unitValue).toLocaleLowerCase();
  if (!amount && quantityLabel) {
    const match = quantityLabel
      .replace(",", ".")
      .match(/(\d+(?:\.\d+)?)\s*(kilograms?|kilogramy?|kg|grams?|gramy?|g|millilit(?:er|re)s?|mililitry?|ml|centilit(?:er|re)s?|cl|lit(?:er|re)s?|litry?|l)\b/i);
    if (match) {
      amount = Number(match[1]);
      unit = match[2].toLocaleLowerCase();
    }
  }
  if (!amount || amount <= 0) return { amount: 100, unit: "g" as const };
  if (/^(kilograms?|kilogramy?|kg)$/.test(unit) && amount * 1000 <= 20_000) return { amount: amount * 1000, unit: "g" as const };
  if (/^(lit(?:er|re)s?|litry?|l)$/.test(unit) && amount * 1000 <= 20_000) return { amount: amount * 1000, unit: "ml" as const };
  if (/^(centilit(?:er|re)s?|cl)$/.test(unit) && amount * 10 <= 20_000) return { amount: amount * 10, unit: "ml" as const };
  if (/^(millilit(?:er|re)s?|mililitry?|ml)$/.test(unit) && amount <= 20_000) return { amount, unit: "ml" as const };
  if (/^(grams?|gramy?|g)$/.test(unit) && amount <= 20_000) return { amount, unit: "g" as const };
  return { amount: 100, unit: "g" as const };
}

export function normalizeOpenFoodFactsProduct(value: unknown): NormalizedNutritionProduct | null {
  if (!isRecord(value)) return null;
  const nutriments = isRecord(value.nutriments) ? value.nutriments : {};
  const calories = numberValue(nutriments["energy-kcal_100g"]);
  const name = textValue(value.product_name_pl) || textValue(value.product_name) || textValue(value.product_name_en);
  const barcode = textValue(value.code);
  if (calories === undefined || calories < 0 || !name || !/^\d{8,14}$/.test(barcode)) return null;
  const brand = textValue(value.brands) || undefined;
  const packageLabel = textValue(value.quantity) || undefined;
  const packageAmount = normalizePackageAmount(value.product_quantity, value.product_quantity_unit, packageLabel ?? "");
  return {
    id: `off-${barcode}`,
    barcode,
    name,
    brand,
    source: "openfoodfacts",
    defaultAmount: packageAmount.amount,
    unit: packageAmount.unit,
    packageLabel,
    per100g: {
      calories,
      protein: Math.max(0, numberValue(nutriments.proteins_100g) ?? 0),
      carbs: Math.max(0, numberValue(nutriments.carbohydrates_100g) ?? 0),
      fat: Math.max(0, numberValue(nutriments.fat_100g) ?? 0),
    },
  };
}

export function openFoodFactsUserAgent(contact?: string) {
  const normalized = contact
    ?.replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return normalized ? `Rootine/1.0 (${normalized})` : "Rootine/1.0";
}
