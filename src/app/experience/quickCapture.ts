export type QuickCaptureKind = "task" | "habit" | "meal" | "water" | "weight" | "workout" | "activity" | "note" | "goal" | "affair" | "work" | "expense" | "payment";
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

type KindSignal = {
  kind: QuickCaptureKind;
  pattern: RegExp;
  score: number;
};

// Signals are intentionally broader than the labels shown in the UI. A specific phrase
// scores higher than a generic verb, so "zapisz trening" still resolves to a workout.
const KIND_SIGNALS: readonly KindSignal[] = [
  { kind: "habit", pattern: /\b(nawyk\w*|rutyn\w*|zwyczaj\w*|powtarzal\w*|regular\w*|streak|seria)\b/, score: 6 },
  { kind: "habit", pattern: /\b(codzien\w*|co rano|co wieczor|co tydzien|kazdego dnia)\b/, score: 4 },

  { kind: "water", pattern: /\b(wod\w*|nawodn\w*|napic\w*|szklank\w*|butelk\w*|mililit\w*|plyn\w*|hydrac\w*|pragn\w*)\b/, score: 5 },
  { kind: "water", pattern: /\b(ml|ly[ck]\w*|uzupeln\w* plyny)\b/, score: 4 },

  { kind: "weight", pattern: /\b(wag\w*|wazen\w*|zwazy\w*|kilogram\w*|masa cial\w*|pomiar mas\w*|kilo\w*)\b/, score: 5 },
  { kind: "weight", pattern: /\b(kg|wejsc na wage|sprawdzic mase)\b/, score: 6 },

  { kind: "workout", pattern: /\b(trening\w*|cwicz\w*|silown\w*|biegan\w*|bieg\w*|rower\w*|basen\w*|jog\w*|fitness|cardio|interwal\w*)\b/, score: 5 },
  { kind: "workout", pattern: /\b(sztang\w*|przysiad\w*|martwy ciag|rozgrzewk\w*|stretch\w*|serie|powtorzen\w*)\b/, score: 4 },

  { kind: "activity", pattern: /\b(aktywn\w*|spacer\w*|marsz\w*|krok\w*|ruch\w*|wycieczk\w*|wedrow\w*|hiking|trekking)\b/, score: 5 },
  { kind: "activity", pattern: /\b(poza planem|na dwor\w*|swiezym powietrz\w*)\b/, score: 4 },

  { kind: "meal", pattern: /\b(posilek\w*|sniadani\w*|obiad\w*|kolacj\w*|lunch|przekask\w*|jedz\w*|zjesc|dani\w*|porcj\w*)\b/, score: 5 },
  { kind: "meal", pattern: /\b(kanapk\w*|owsiank\w*|kalor\w*|makro|bialk\w*|weglowodan\w*|tluszcz\w*|menu)\b/, score: 4 },

  { kind: "payment", pattern: /\b(platn\w*|oplac\w*|zaplac\w*|rachunk\w*|faktur\w*|abonament\w*|czynsz\w*|przelew\w*|skladk\w*|podatek|zus|subskrypc\w*)\b/, score: 5 },
  { kind: "payment", pattern: /\b(termin platnosci|do zaplaty|stala oplata)\b/, score: 6 },

  { kind: "expense", pattern: /\b(wydatek\w*|kup\w*|zakup\w*|koszt\w*|paragon\w*|cen\w*|transakcj\w*|wydalem|wydac)\b/, score: 5 },
  { kind: "expense", pattern: /\b(lista zakupow|budzet zakupow|ile kosztowal)\b/, score: 6 },

  { kind: "note", pattern: /\b(notatk\w*|zapis\w*|pomysl\w*|ide\w*|mysl\w*|uwag\w*|lista\w*|spisac\w*|brainstorm|draft|refleks\w*)\b/, score: 4 },
  { kind: "note", pattern: /\b(do zapamietania|luzna mysl|szybki zapis)\b/, score: 6 },

  { kind: "goal", pattern: /\b(cel\w*|osiagn\w*|milestone|kamien milow\w*|target|wynik\w*|schud\w*|nauczyc\w*|zbudow\w*|przebiec\w*|oszczedz\w*)\b/, score: 5 },
  { kind: "goal", pattern: /\b(rozwinac sie|dlugotermin\w*|do konca roku|plan na rok)\b/, score: 6 },

  { kind: "affair", pattern: /\b(spraw\w*|urzad\w*|dokument\w*|formal\w*|wniosek\w*|dowod osob\w*|paszport\w*|wiz\w*|ubezpiec\w*|polis\w*|rejestr\w*|przeglad\w*|umow\w*|notariusz|pismo\w*|kancelari\w*)\b/, score: 5 },
  { kind: "affair", pattern: /\b(do zalatwienia|formalnosci|odbior dokument\w*|waznosc dokument\w*)\b/, score: 6 },

  { kind: "work", pattern: /\b(prac\w*|projekt\w*|klient\w*|firm\w*|sluzb\w*|zawod\w*|meeting|deadline|team|zespol\w*|raport\w*|prezentac\w*)\b/, score: 5 },
  { kind: "work", pattern: /\b(mail do klient\w*|spotkanie projekt\w*|zadanie zawod\w*|na biurko)\b/, score: 6 },

  { kind: "task", pattern: /\b(zadani\w*|todo|to do|do zrob\w*|przypomnij\w*|pamietaj\w*|zrob\w*|zalatw\w*|oddzwon\w*|wysl\w*|sprawdz\w*|odbier\w*|umow\w*|telefon\w*|spotkan\w*|email|mail|wiadomosc\w*)\b/, score: 3 },
];

function inferKind(normalized: string): QuickCaptureKind {
  const scores = new Map<QuickCaptureKind, number>();
  for (const signal of KIND_SIGNALS) {
    if (signal.pattern.test(normalized)) scores.set(signal.kind, (scores.get(signal.kind) ?? 0) + signal.score);
  }

  let winner: QuickCaptureKind = "task";
  let winningScore = 0;
  for (const signal of KIND_SIGNALS) {
    const score = scores.get(signal.kind) ?? 0;
    if (score > winningScore) {
      winner = signal.kind;
      winningScore = score;
    }
  }
  return winner;
}

export const deterministicQuickCaptureParser: QuickCaptureParser = {
  parse(source, now = new Date()) {
    const normalized = source
      .trim()
      .toLocaleLowerCase("pl-PL")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      // Polish ł is not decomposed by Unicode NFD, so handle it explicitly.
      .replace(/ł/g, "l");
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
