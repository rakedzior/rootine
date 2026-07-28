const LOCAL_DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dateParts(value: string) {
  const match = LOCAL_DATE_KEY.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return { year, month, day };
}

export function toLocalDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function todayLocalDateKey() {
  return toLocalDateKey(new Date());
}

export function parseLocalDateKey(value: string): Date | null {
  const parts = dateParts(value);
  if (!parts) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day, 12);
  if (
    date.getFullYear() !== parts.year
    || date.getMonth() !== parts.month - 1
    || date.getDate() !== parts.day
  ) return null;
  return date;
}

export function isLocalDateKey(value: unknown): value is string {
  return typeof value === "string" && parseLocalDateKey(value) !== null;
}

export function shiftLocalDateKey(value: string, days: number) {
  const date = parseLocalDateKey(value);
  if (!date || !Number.isInteger(days)) return value;
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

export function calendarDaysBetween(start: string, end: string) {
  const startParts = dateParts(start);
  const endParts = dateParts(end);
  if (!startParts || !endParts || !isLocalDateKey(start) || !isLocalDateKey(end)) return null;
  const startUtc = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
  const endUtc = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function formatLocalDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
  locale = "pl-PL",
) {
  const date = parseLocalDateKey(value);
  return date ? new Intl.DateTimeFormat(locale, options).format(date) : value;
}
