const POLISH_LOCALE = "pl-PL";
export const POLISH_TIME_ZONE = "Europe/Warsaw";
const EMPTY_VALUE = "—";
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateInput = Date | string | number;
export type PolishPluralForms = readonly [one: string, few: string, many: string];

const dateFormatter = new Intl.DateTimeFormat(POLISH_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: POLISH_TIME_ZONE,
});
const shortDateFormatter = new Intl.DateTimeFormat(POLISH_LOCALE, {
  day: "numeric",
  month: "short",
  timeZone: POLISH_TIME_ZONE,
});
const longDateFormatter = new Intl.DateTimeFormat(POLISH_LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: POLISH_TIME_ZONE,
});
const timeFormatter = new Intl.DateTimeFormat(POLISH_LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: POLISH_TIME_ZONE,
});
const pluralRules = new Intl.PluralRules(POLISH_LOCALE);

function dateOnlyAsSafeInstant(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const instant = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    instant.getUTCFullYear() !== year
    || instant.getUTCMonth() !== month - 1
    || instant.getUTCDate() !== day
  ) {
    return null;
  }

  return instant;
}

function parseDateInput(value: DateInput): Date | null {
  if (typeof value === "string" && DATE_ONLY_PATTERN.test(value)) {
    return dateOnlyAsSafeInstant(value);
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDecimal(
  value: number,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat(POLISH_LOCALE, {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: true,
  }).format(value);
}

/**
 * Standard compact date used in data-heavy views, for example "29 lip 2026".
 * A YYYY-MM-DD value is treated as a calendar date and never shifted by a timezone.
 */
export function formatDate(value: DateInput): string {
  const date = parseDateInput(value);
  return date ? dateFormatter.format(date) : EMPTY_VALUE;
}

/** Compact date without a year, for example "29 lip". */
export function formatShortDate(value: DateInput): string {
  const date = parseDateInput(value);
  return date ? shortDateFormatter.format(date) : EMPTY_VALUE;
}

/** Date with the full Polish month name, for example "29 lipca 2026". */
export function formatLongDate(value: DateInput): string {
  const date = parseDateInput(value);
  return date ? longDateFormatter.format(date) : EMPTY_VALUE;
}

/** Time in Europe/Warsaw, including daylight-saving transitions. */
export function formatTime(value: DateInput): string {
  const date = parseDateInput(value);
  return date ? timeFormatter.format(date) : EMPTY_VALUE;
}

/**
 * Currency with Polish grouping and decimal separators.
 * Whole amounts omit ",00"; amounts containing grosze always show two digits.
 */
export function formatCurrency(value: number, currency = "PLN"): string {
  if (!Number.isFinite(value)) return EMPTY_VALUE;

  const currencyCode = currency.trim().toUpperCase() || "PLN";
  const roundedCents = Math.round((Math.abs(value) + Number.EPSILON) * 100);
  const hasMinorUnits = roundedCents % 100 !== 0;

  try {
    return new Intl.NumberFormat(POLISH_LOCALE, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: hasMinorUnits ? 2 : 0,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(value);
  } catch {
    return `${formatDecimal(value, hasMinorUnits ? 2 : 0, 2)} ${currencyCode}`;
  }
}

/** Percentage points, for example formatPercent(12.5) returns "12,5%". */
export function formatPercent(value: number): string {
  const formatted = formatDecimal(value, 0, 1);
  return formatted === EMPTY_VALUE ? formatted : `${formatted}%`;
}

/** Weight in kilograms, with at most one decimal place. */
export function formatWeight(value: number): string {
  const formatted = formatDecimal(value, 0, 1);
  return formatted === EMPTY_VALUE ? formatted : `${formatted}\u00a0kg`;
}

/** Calories rounded to a whole kcal and grouped for larger values. */
export function formatCalories(value: number): string {
  const formatted = formatDecimal(value, 0, 0);
  return formatted === EMPTY_VALUE ? formatted : `${formatted}\u00a0kcal`;
}

export function pluralize(count: number, forms: PolishPluralForms): string;
export function pluralize(count: number, one: string, few: string, many: string): string;
export function pluralize(
  count: number,
  formsOrOne: PolishPluralForms | string,
  few?: string,
  many?: string,
): string {
  const forms: PolishPluralForms = typeof formsOrOne === "string"
    ? [formsOrOne, few ?? formsOrOne, many ?? few ?? formsOrOne]
    : formsOrOne;
  const category = Number.isFinite(count) ? pluralRules.select(count) : "many";
  const form = category === "one" ? forms[0] : category === "few" ? forms[1] : forms[2];
  return `${formatDecimal(count, 0, 3)} ${form}`;
}
