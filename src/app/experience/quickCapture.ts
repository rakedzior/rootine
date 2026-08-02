export type QuickCaptureKind = "task" | "habit" | "meal" | "workout" | "note" | "goal" | "affair" | "expense" | "payment";
export type QuickCapturePriority = "low" | "medium" | "high";

export type QuickCaptureResult = {
  source: string;
  title: string;
  kind: QuickCaptureKind;
  date?: string;
  time?: string;
  priority?: QuickCapturePriority;
  matched: string[];
};

export interface QuickCaptureParser {
  parse(source: string, now?: Date): QuickCaptureResult;
}

const WEEKDAYS = [
  ["niedziela", "niedziele"],
  ["poniedzialek"],
  ["wtorek"],
  ["sroda", "srode"],
  ["czwartek"],
  ["piatek"],
  ["sobota", "sobote"],
] as const;

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(result.getDate() + amount);
  return result;
}

function inferKind(normalized: string): QuickCaptureKind {
  if (/\b(nawyk|codziennie|rutyna)\b/.test(normalized)) return "habit";
  if (/\b(trening|bieg|silownia|siłownia|rower|basen)\b/.test(normalized)) return "workout";
  if (/\b(posilek|posiłek|sniadanie|śniadanie|obiad|kolacja|przekaska|przekąska)\b/.test(normalized)) return "meal";
  if (/\b(platnosc|płatność|oplacic|opłacić|rachunek)\b/.test(normalized)) return "payment";
  if (/\b(wydatek|kupic|kupić|zakup)\b/.test(normalized)) return "expense";
  if (/\b(notatka|zapisz|pomysl|pomysł)\b/.test(normalized)) return "note";
  if (/\b(cel|milestone|kamien milowy|kamień milowy)\b/.test(normalized)) return "goal";
  if (/\b(sprawa|urzad|urząd|dokument)\b/.test(normalized)) return "affair";
  return "task";
}

export const deterministicQuickCaptureParser: QuickCaptureParser = {
  parse(source, now = new Date()) {
    const normalized = source
      .trim()
      .toLocaleLowerCase("pl-PL")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    const matched: string[] = [];
    let date: string | undefined;
    let time: string | undefined;
    let priority: QuickCapturePriority | undefined;

    if (/\bpojutrze\b/.test(normalized)) {
      date = dateKey(addDays(now, 2));
      matched.push("pojutrze");
    } else if (/\bjutro\b/.test(normalized)) {
      date = dateKey(addDays(now, 1));
      matched.push("jutro");
    } else if (/\bdzisiaj\b|\bdziś\b|\bdzis\b/.test(normalized)) {
      date = dateKey(now);
      matched.push("dzisiaj");
    } else {
      for (let weekday = 0; weekday < WEEKDAYS.length; weekday += 1) {
        const alias = WEEKDAYS[weekday].find((candidate) => normalized.includes(candidate));
        if (!alias) continue;
        let delta = (weekday - now.getDay() + 7) % 7;
        if (delta === 0) delta = 7;
        date = dateKey(addDays(now, delta));
        matched.push(alias);
        break;
      }
    }

    const timeMatch = normalized.match(/\bo\s*([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\b|\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
    if (timeMatch) {
      const hour = timeMatch[1] ?? timeMatch[3];
      const minutes = timeMatch[2] ?? timeMatch[4] ?? "00";
      time = `${hour.padStart(2, "0")}:${minutes}`;
      matched.push(timeMatch[0].trim());
    }

    if (/\b(pilne|pilny|wysoki priorytet|priorytet wysoki)\b|!{2,}/.test(normalized)) {
      priority = "high";
      matched.push("wysoki priorytet");
    } else if (/\b(niski priorytet|priorytet niski|kiedys|kiedyś)\b/.test(normalized)) {
      priority = "low";
      matched.push("niski priorytet");
    } else if (/\b(wazne|ważne|sredni priorytet|średni priorytet)\b/.test(normalized)) {
      priority = "medium";
      matched.push("średni priorytet");
    }

    return {
      source,
      title: source.trim(),
      kind: inferKind(normalized),
      date,
      time,
      priority,
      matched,
    };
  },
};
