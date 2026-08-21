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

const MAX_UPSTREAM_JSON_BYTES = 512 * 1024;
const UPSTREAM_TIMEOUT_MS = 8_000;

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

export async function fetchOpenFoodFacts(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  if (init.signal?.aborted) {
    controller.abort();
  } else {
    init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function readOpenFoodFactsJson(response: Response): Promise<unknown | null> {
  const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPSTREAM_JSON_BYTES) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_UPSTREAM_JSON_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
  } catch {
    return null;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
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
  const calories = numberValue(nutriments["energy-kcal_100g"])
    ?? numberValue(nutriments["energy-kcal_value"])
    ?? (() => {
      const kilojoules = numberValue(nutriments.energy_100g) ?? numberValue(nutriments.energy_value);
      return kilojoules === undefined ? undefined : kilojoules / 4.184;
    })();
  const name = textValue(value.product_name_pl) || textValue(value.product_name) || textValue(value.product_name_en);
  const barcodeValue = typeof value.code === "number" ? String(value.code) : textValue(value.code);
  const barcode = barcodeValue.replace(/\s+/g, "");
  if (calories === undefined || !Number.isFinite(calories) || calories < 0 || !name || !/^\d{8,14}$/.test(barcode)) return null;
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
      protein: Math.max(0, numberValue(nutriments.proteins_100g) ?? numberValue(nutriments.proteins_value) ?? 0),
      carbs: Math.max(0, numberValue(nutriments.carbohydrates_100g) ?? numberValue(nutriments.carbohydrates_value) ?? 0),
      fat: Math.max(0, numberValue(nutriments.fat_100g) ?? numberValue(nutriments.fat_value) ?? 0),
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
