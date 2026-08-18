import { calendarDaysBetween, todayLocalDateKey, toLocalDateKey } from "../data/localDate";
import type { NoteColor } from "../data/notesWorkspace";
import { POLISH_TIME_ZONE, formatDate, formatTime } from "../formatters";

export const NOTE_COLOR_OPTIONS: Array<{ value: NoteColor; label: string }> = [
  { value: "graphite", label: "Grafitowa" },
  { value: "blue", label: "Niebieska" },
  { value: "green", label: "Zielona" },
  { value: "amber", label: "Bursztynowa" },
  { value: "violet", label: "Fioletowa" },
  { value: "coral", label: "Koralowa" },
];

export function formatNoteUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nieznana data";
  const dayDiff = calendarDaysBetween(toLocalDateKey(date), todayLocalDateKey()) ?? 0;
  if (dayDiff === 0) return `Dziś, ${formatTime(date)}`;
  if (dayDiff === 1) return "Wczoraj";
  if (dayDiff < 7) {
    return new Intl.DateTimeFormat("pl-PL", {
      weekday: "long",
      timeZone: POLISH_TIME_ZONE,
    }).format(date);
  }
  return formatDate(date);
}

export function normalizeNoteTags(value: string): string[] {
  return Array.from(new Set(
    value
      .split(",")
      .map((tagName) => tagName.trim().replace(/^#/, "").toLocaleLowerCase("pl-PL"))
      .filter(Boolean),
  ));
}

export function noteTextPreviewLines(body: string): Array<{ text: string; bullet: boolean }> {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      text: line.replace(/^(?:•|-)\s*/, ""),
      bullet: /^(?:•|-)\s+/.test(line),
    }));
}
