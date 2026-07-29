import {
  readLocalWorkspace,
  writeLocalWorkspace,
} from "./localRepository";

export const SUMMARY_NOTES_STORAGE_KEY = "rootine.task-summary-notes.v1";
const SUMMARY_NOTES_VERSION = 1 as const;

/**
 * Free-form commentary attached to the weekly Podsumowanie, keyed by ISO week.
 *
 * Stored as a sanitised HTML fragment because the editor is rich text: the toolbar toggles
 * bold, italic, headings and so on, and there is no plain-text form that survives a round
 * trip. Everything written here is authored locally by the user; it is still sanitised on
 * the way in and out, so a corrupted or hand-edited store cannot inject script or markup
 * the editor never produces.
 */
export type SummaryNotes = {
  version: typeof SUMMARY_NOTES_VERSION;
  updatedAt: string;
  /** ISO week key (`2026-W31`) → sanitised HTML fragment. */
  weeks: Record<string, string>;
};

/** Tags the toolbar can produce. Anything else is unwrapped to its text content. */
const ALLOWED_TAGS = new Set([
  "P", "BR", "DIV",
  "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "DEL",
  "H1", "H2", "H3",
  "UL", "OL", "LI",
  "BLOCKQUOTE", "CODE", "PRE",
  "A",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createDefaultSummaryNotes(): SummaryNotes {
  return { version: SUMMARY_NOTES_VERSION, updatedAt: new Date().toISOString(), weeks: {} };
}

/**
 * Strips everything the editor cannot produce: unknown elements, every attribute except a
 * safe `href`, and any `javascript:`/`data:` URL.
 */
export function sanitizeSummaryHtml(html: string): string {
  if (typeof window === "undefined" || !html) return "";
  const template = window.document.createElement("template");
  template.innerHTML = html;

  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      walk(child);
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attribute of [...child.attributes]) {
        const keepHref = child.tagName === "A" && attribute.name === "href";
        if (!keepHref) {
          child.removeAttribute(attribute.name);
          continue;
        }
        const url = attribute.value.trim().toLowerCase();
        if (url.startsWith("javascript:") || url.startsWith("data:") || url.startsWith("vbscript:")) {
          child.removeAttribute("href");
        }
      }
      if (child.tagName === "A") {
        child.setAttribute("rel", "noreferrer");
        child.setAttribute("target", "_blank");
      }
    }
  };

  walk(template.content as unknown as Element);
  return template.innerHTML;
}

function normalizeSummaryNotes(value: SummaryNotes): SummaryNotes {
  const weeks: Record<string, string> = {};
  for (const [week, html] of Object.entries(value.weeks ?? {})) {
    if (typeof html !== "string") continue;
    const clean = sanitizeSummaryHtml(html);
    if (clean.trim()) weeks[week] = clean;
  }
  return { version: SUMMARY_NOTES_VERSION, updatedAt: value.updatedAt, weeks };
}

function isCurrentSummaryNotes(value: unknown): value is SummaryNotes {
  return isRecord(value)
    && value.version === SUMMARY_NOTES_VERSION
    && typeof value.updatedAt === "string"
    && isRecord(value.weeks);
}

function migrateSummaryNotes(value: unknown): SummaryNotes | null {
  if (!isRecord(value) || !isRecord(value.weeks)) return null;
  return normalizeSummaryNotes({
    version: SUMMARY_NOTES_VERSION,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    weeks: value.weeks as Record<string, string>,
  });
}

export function loadSummaryNotes(): SummaryNotes {
  return readLocalWorkspace({
    key: SUMMARY_NOTES_STORAGE_KEY,
    fallback: createDefaultSummaryNotes,
    validate: isCurrentSummaryNotes,
    migrate: migrateSummaryNotes,
  }).workspace;
}

export function saveSummaryNote(weekKey: string, html: string): boolean {
  const current = loadSummaryNotes();
  const clean = sanitizeSummaryHtml(html);
  const weeks = { ...current.weeks };
  if (clean.trim()) weeks[weekKey] = clean;
  else delete weeks[weekKey];

  return writeLocalWorkspace(SUMMARY_NOTES_STORAGE_KEY, {
    version: SUMMARY_NOTES_VERSION,
    updatedAt: new Date().toISOString(),
    weeks,
  } satisfies SummaryNotes);
}

/** ISO-8601 week key, e.g. `2026-W31`. Weeks start on Monday. */
export function isoWeekKey(date = new Date()): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Thursday of the current week decides the ISO year.
  const dayIndex = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayIndex + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayIndex = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayIndex + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}
